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
import { TowerRoomRuntime } from '../runtime/TowerRoomRuntime.js';
import { syncTowerState, TowerStateSchema } from '../state/towerState.js';
import type { TowerRoomCreationOptions } from './RoomReservationRegistry.js';

const SIMULATION_INTERVAL_MS = 50;

export interface TowerRoomDependencies {
  verifyToken(token: string): AuthenticatedAccount;
  consumeReservation(options: unknown): InternalTowerRoomOptions | undefined;
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
  private readonly authenticatingUserIds = new Set<string>();
  private admissionTimer?: ReturnType<typeof setTimeout>;
  private expectedUserIds: readonly string[] = [];
  private expiresAtMs = 0;

  public override onCreate(creationOptions: TowerRoomCreationOptions): void {
    const options = requireDependencies().consumeReservation(creationOptions);
    if (options === undefined) throw new ServerError(403, 'Création de room non autorisée.');
    this.expectedUserIds = [...options.expectedUserIds];
    this.expiresAtMs = options.expiresAtMs;
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
        const rejection: TowerCommandRejectedMessage = { command: 'control', code: result.code };
        client.send('command-rejected', rejection);
      }
    });
    this.onMessage('action', (client, message: TowerActionMessage) => {
      const userId = this.userIdBySessionId.get(client.sessionId);
      if (userId === undefined || this.runtime === undefined) return;
      const result = this.runtime.submitAction(userId, message, Date.now());
      if (!result.accepted) {
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
    _client: Client,
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
        this.authenticatingUserIds.has(account.userId) ||
        [...this.userIdBySessionId.values()].includes(account.userId)
      ) {
        throw new ServerError(409, 'Cette identité est déjà connectée.');
      }
      this.authenticatingUserIds.add(account.userId);
      return account;
    } catch (error) {
      if (error instanceof ServerError) throw error;
      throw new ServerError(401, 'Authentification invalide.');
    }
  }

  public override onJoin(client: Client, _options: unknown, auth: AuthenticatedAccount): void {
    this.authenticatingUserIds.delete(auth.userId);
    if (this.runtime === undefined || !this.runtime.admit(auth.userId, Date.now())) {
      throw new ServerError(409, 'Admission refusée.');
    }
    this.userIdBySessionId.set(client.sessionId, auth.userId);
    syncTowerState(this.state, this.runtime.snapshot(), this.runtime.phase);
    if (this.runtime.phase === 'running') {
      if (this.admissionTimer !== undefined) clearTimeout(this.admissionTimer);
      this.autoDispose = true;
      void this.lock();
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
      client.leave(4100);
      return;
    }
    syncTowerState(this.state, this.runtime.snapshot(), this.runtime.phase);
  }

  public override onLeave(client: Client): void {
    const userId = this.userIdBySessionId.get(client.sessionId);
    this.userIdBySessionId.delete(client.sessionId);
    if (userId === undefined || this.runtime === undefined) return;
    if (this.runtime.isDisconnected(userId)) {
      this.runtime.removeExpiredPlayer(userId, Date.now());
    } else {
      this.runtime.leaveVoluntarily(userId);
    }
    syncTowerState(this.state, this.runtime.snapshot(), this.runtime.phase);
  }

  public override onDispose(): void {
    if (this.admissionTimer !== undefined) clearTimeout(this.admissionTimer);
  }

  private simulateTick(): void {
    if (this.runtime === undefined) return;
    const result = this.runtime.step(Date.now());
    syncTowerState(this.state, result.state, this.runtime.phase);
    if (result.events.length > 0) {
      const message: TowerEventsMessage = { events: result.events };
      this.broadcast('events', message);
    }
  }
}
