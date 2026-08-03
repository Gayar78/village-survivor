import { Room, ServerError } from 'colyseus';
import type { Client } from 'colyseus';
import type {
  TowerActionMessage,
  TowerCommandRejectedMessage,
  TowerControlMessage,
  TowerEventsMessage,
} from '@village-survivor/protocol';

import { InvalidJwtError, type AuthenticatedAccount } from '../auth/supabaseJwt.js';
import type { InternalTowerRoomOptions } from '../http/createRoom.js';
import type { RoomTelemetry, ServerTelemetry } from '../observability/serverTelemetry.js';
import type { GameRunFinalizer } from '../rewards/postgrestGameRun.js';
import { TowerRoomRuntime } from '../runtime/TowerRoomRuntime.js';
import { syncTowerState, TowerStateSchema } from '../state/towerState.js';
import type { TowerRoomCreationOptions } from './RoomReservationRegistry.js';

const SIMULATION_INTERVAL_MS = 50;
const TERMINAL_RETENTION_MS = 60_000;
const PERSISTENCE_RETRY_MS = 5_000;
const AUTHENTICATION_HOLD_MS = 5_000;

export interface TowerRoomDependencies {
  verifyToken(token: string): AuthenticatedAccount;
  consumeReservation(options: unknown): InternalTowerRoomOptions | undefined;
  gameRuns: GameRunFinalizer;
  telemetry: ServerTelemetry;
}

let dependencies: TowerRoomDependencies | undefined;

export function configureTowerRoom(configured: TowerRoomDependencies): void {
  dependencies = configured;
}

function requireDependencies(): TowerRoomDependencies {
  if (dependencies === undefined) throw new Error('TowerRoom n’est pas configurée.');
  return dependencies;
}

export class TowerRoom extends Room<{ state: TowerStateSchema }> {
  public override maxClients = 1;
  public override autoDispose = false;

  private runtime?: TowerRoomRuntime;
  private readonly userIdBySessionId = new Map<string, string>();
  private readonly authenticatingUserIdBySessionId = new Map<string, string>();
  private readonly authenticationTimerBySessionId = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private admissionTimer?: ReturnType<typeof setTimeout>;
  private expectedUserIds: readonly string[] = [];
  private expiresAtMs = 0;
  private runId = '';
  private terminalStarted = false;
  private persistenceComplete = false;
  private persistenceInFlight = false;
  private disposed = false;
  private persistenceExhaustedReported = false;
  private terminalTimer?: ReturnType<typeof setTimeout>;
  private persistenceRetryTimer?: ReturnType<typeof setTimeout>;
  private roomTelemetry?: RoomTelemetry;
  private lastTickAtMs = 0;

  public override onCreate(creationOptions: TowerRoomCreationOptions): void {
    const options = requireDependencies().consumeReservation(creationOptions);
    if (options === undefined) throw new ServerError(403, 'Création de room non autorisée.');
    this.expectedUserIds = [...options.expectedUserIds];
    this.expiresAtMs = options.expiresAtMs;
    this.runId = options.runId;
    this.roomTelemetry = requireDependencies().telemetry.room(
      options.mode,
      this.expectedUserIds.length,
      options.traceParent,
    );
    this.maxClients = this.expectedUserIds.length;
    this.runtime = new TowerRoomRuntime({
      seed: options.seed,
      expectedUserIds: this.expectedUserIds,
      metaBuildsByPlayerId: options.metaBuildsByPlayerId,
    });
    const state = new TowerStateSchema();
    syncTowerState(state, this.runtime.snapshot(), this.runtime.phase);
    this.setState(state);
    this.setPatchRate(SIMULATION_INTERVAL_MS);

    this.onMessage('control', (client, message: TowerControlMessage) => {
      const userId = this.userIdBySessionId.get(client.sessionId);
      if (userId === undefined || this.runtime === undefined) return;
      const result = this.runtime.submitControl(userId, message, Date.now());
      if (!result.accepted) {
        this.roomTelemetry?.commandRejected('control', result.code);
        const rejection: TowerCommandRejectedMessage = { command: 'control', code: result.code };
        client.send('command-rejected', rejection);
      }
    });
    this.onMessage('action', (client, message: TowerActionMessage) => {
      const userId = this.userIdBySessionId.get(client.sessionId);
      if (userId === undefined || this.runtime === undefined) return;
      const result = this.runtime.submitAction(userId, message, Date.now());
      if (!result.accepted) {
        this.roomTelemetry?.commandRejected('action', result.code);
        const rejection: TowerCommandRejectedMessage = { command: 'action', code: result.code };
        client.send('command-rejected', rejection);
      }
    });

    const delayMs = Math.max(0, this.expiresAtMs - Date.now());
    this.admissionTimer = setTimeout(() => {
      if (this.runtime?.phase !== 'waiting') return;
      this.runtime.abandon();
      syncTowerState(this.state, this.runtime.snapshot(), this.runtime.phase);
      void this.disconnect();
    }, delayMs);
  }

  public override onAuth(
    client: Client,
    _options: unknown,
    context: Readonly<{ token?: string }>,
  ): AuthenticatedAccount {
    try {
      if (Date.now() >= this.expiresAtMs || this.runtime?.phase !== 'waiting') {
        throw new ServerError(410, 'La réservation de cette room a expiré.');
      }
      if (typeof context.token !== 'string') throw new InvalidJwtError();
      const account = requireDependencies().verifyToken(context.token);
      if (!this.expectedUserIds.includes(account.userId)) {
        throw new ServerError(403, 'Cette identité n’appartient pas au roster réservé.');
      }
      if (
        [...this.authenticatingUserIdBySessionId.values()].includes(account.userId) ||
        [...this.userIdBySessionId.values()].includes(account.userId)
      ) {
        throw new ServerError(409, 'Cette identité est déjà connectée.');
      }
      this.authenticatingUserIdBySessionId.set(client.sessionId, account.userId);
      this.authenticationTimerBySessionId.set(
        client.sessionId,
        setTimeout(
          () => this.clearPendingAuthentication(client.sessionId),
          Math.min(AUTHENTICATION_HOLD_MS, Math.max(1, this.expiresAtMs - Date.now())),
        ),
      );
      return account;
    } catch (error) {
      if (error instanceof ServerError) throw error;
      throw new ServerError(401, 'Authentification invalide.');
    }
  }

  public override onJoin(client: Client, _options: unknown, auth: AuthenticatedAccount): void {
    this.clearPendingAuthentication(client.sessionId);
    if (this.runtime === undefined || !this.runtime.admit(auth.userId, Date.now())) {
      throw new ServerError(409, 'Admission refusée.');
    }
    this.userIdBySessionId.set(client.sessionId, auth.userId);
    this.roomTelemetry?.playerDelta(1);
    this.roomTelemetry?.child('game.room.admission');
    syncTowerState(this.state, this.runtime.snapshot(), this.runtime.phase);
    if (this.runtime.phase === 'running') {
      if (this.admissionTimer !== undefined) clearTimeout(this.admissionTimer);
      this.autoDispose = true;
      void this.lock();
      this.lastTickAtMs = Date.now();
      this.roomTelemetry?.child('game.room.start');
      this.setSimulationInterval(() => this.simulateTick(), SIMULATION_INTERVAL_MS);
    }
  }

  public override onDrop(client: Client): void {
    const userId = this.userIdBySessionId.get(client.sessionId);
    if (userId === undefined || this.runtime === undefined) return;
    if (this.runtime.phase === 'waiting') {
      this.runtime.abandon();
      syncTowerState(this.state, this.runtime.snapshot(), this.runtime.phase);
      void this.disconnect();
      return;
    }
    if (this.runtime.disconnect(userId, Date.now())) {
      this.roomTelemetry?.reconnect('drop');
      void this.allowReconnection(client, 30);
    }
  }

  public override onReconnect(client: Client): void {
    const userId = this.userIdBySessionId.get(client.sessionId);
    if (
      userId === undefined ||
      this.runtime === undefined ||
      !this.runtime.reconnect(userId, Date.now())
    ) {
      this.roomTelemetry?.reconnect('expired');
      client.leave(4100);
      return;
    }
    this.roomTelemetry?.reconnect('success');
    syncTowerState(this.state, this.runtime.snapshot(), this.runtime.phase);
  }

  public override onLeave(client: Client): void {
    this.clearPendingAuthentication(client.sessionId);
    const userId = this.userIdBySessionId.get(client.sessionId);
    this.userIdBySessionId.delete(client.sessionId);
    if (userId === undefined || this.runtime === undefined) return;
    if (this.runtime.phase === 'defeat') return;
    const wasDisconnected = this.runtime.isDisconnected(userId);
    const removed = wasDisconnected
      ? this.runtime.removeExpiredPlayer(userId, Date.now())
      : this.runtime.leaveVoluntarily(userId);
    if (removed && !wasDisconnected) this.roomTelemetry?.reconnect('voluntary');
    if (removed) this.roomTelemetry?.playerDelta(-1);
    syncTowerState(this.state, this.runtime.snapshot(), this.runtime.phase);
    if (this.runtime.phase === 'abandoned') this.finishRoom('abandoned');
  }

  public override onDispose(): void {
    this.disposed = true;
    if (this.admissionTimer !== undefined) clearTimeout(this.admissionTimer);
    if (this.terminalTimer !== undefined) clearTimeout(this.terminalTimer);
    if (this.persistenceRetryTimer !== undefined) clearTimeout(this.persistenceRetryTimer);
    for (const timer of this.authenticationTimerBySessionId.values()) clearTimeout(timer);
    this.authenticationTimerBySessionId.clear();
    this.authenticatingUserIdBySessionId.clear();
    if (
      this.runtime?.phase === 'defeat' &&
      !this.persistenceComplete &&
      !this.persistenceInFlight
    ) {
      this.reportPersistenceExhausted();
    }
    this.roomTelemetry?.dispose();
  }

  /** Mesure les octets réellement encodés par Colyseus, sans réencoder l'état. */
  public override broadcastPatch(): boolean {
    let largestPatchBytes = 0;
    const rawMethods = this.clients.map((client) => ({ client, raw: client.raw }));
    for (const { client, raw } of rawMethods) {
      client.raw = ((data, options, callback) => {
        largestPatchBytes = Math.max(largestPatchBytes, data.byteLength);
        raw.call(client, data, options, callback);
      }) as Client['raw'];
    }
    try {
      const changed = super.broadcastPatch();
      if (changed) this.roomTelemetry?.patch(largestPatchBytes);
      return changed;
    } finally {
      for (const { client, raw } of rawMethods) client.raw = raw;
    }
  }

  private simulateTick(): void {
    if (this.runtime === undefined) return;
    const nowMs = Date.now();
    const startedAt = performance.now();
    const result = this.runtime.step(nowMs);
    if (result.removedPlayerCount > 0) this.roomTelemetry?.playerDelta(-result.removedPlayerCount);
    syncTowerState(this.state, result.state, this.runtime.phase);
    if (result.events.length > 0) {
      const message: TowerEventsMessage = { events: result.events };
      this.broadcast('events', message);
    }
    this.roomTelemetry?.tick(
      performance.now() - startedAt,
      this.lastTickAtMs === 0 ? 0 : nowMs - this.lastTickAtMs - SIMULATION_INTERVAL_MS,
      result.state.scraps.length,
      result.state.monsters.length,
    );
    this.lastTickAtMs = nowMs;
    if (this.runtime.phase === 'defeat' || this.runtime.phase === 'abandoned') {
      this.finishRoom(this.runtime.phase);
    }
  }

  private finishRoom(phase: 'defeat' | 'abandoned'): void {
    if (this.terminalStarted) return;
    this.terminalStarted = true;
    this.autoDispose = false;
    this.setSimulationInterval();
    if (phase === 'defeat' && this.runtime !== undefined)
      this.roomTelemetry?.playerDelta(-this.runtime.admittedCount);
    this.roomTelemetry?.finish(phase);
    if (phase === 'defeat') void this.persistRewards();
    this.terminalTimer = setTimeout(() => void this.disconnect(), TERMINAL_RETENTION_MS);
  }

  private async persistRewards(): Promise<void> {
    if (
      this.persistenceComplete ||
      this.persistenceInFlight ||
      this.runtime === undefined ||
      this.runtime.phase !== 'defeat'
    )
      return;
    this.persistenceInFlight = true;
    this.roomTelemetry?.child('game.room.persistence', { 'game.attempt': 'started' });
    try {
      const rewards = this.runtime.rewards();
      await requireDependencies().gameRuns.finalize(this.runId, rewards);
      this.roomTelemetry?.goldCredited(rewards.reduce((total, reward) => total + reward.amount, 0));
      this.roomTelemetry?.child('game.room.persistence', { 'game.outcome': 'success' });
      this.persistenceComplete = true;
    } catch {
      this.roomTelemetry?.child(
        'game.room.persistence',
        { 'game.outcome': 'dependency-error' },
        true,
      );
      if (this.disposed) {
        this.reportPersistenceExhausted();
      } else {
        this.roomTelemetry?.log('warn', 'persistance des récompenses à retenter', {
          'game.retry_delay_ms': PERSISTENCE_RETRY_MS,
        });
        this.persistenceRetryTimer = setTimeout(
          () => void this.persistRewards(),
          PERSISTENCE_RETRY_MS,
        );
      }
    } finally {
      this.persistenceInFlight = false;
    }
  }

  private clearPendingAuthentication(sessionId: string): void {
    const timer = this.authenticationTimerBySessionId.get(sessionId);
    if (timer !== undefined) clearTimeout(timer);
    this.authenticationTimerBySessionId.delete(sessionId);
    this.authenticatingUserIdBySessionId.delete(sessionId);
  }

  private reportPersistenceExhausted(): void {
    if (this.persistenceExhaustedReported) return;
    this.persistenceExhaustedReported = true;
    this.roomTelemetry?.child(
      'game.room.persistence',
      { 'game.outcome': 'retention-exhausted' },
      true,
    );
    this.roomTelemetry?.log('error', 'persistance des récompenses abandonnée après rétention', {
      'game.retention_ms': TERMINAL_RETENTION_MS,
    });
  }
}
