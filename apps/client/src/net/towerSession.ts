import { TowerSimulation } from '@village-survivor/game-core';
import type { TowerGameState, TowerInput, TowerSession } from '@village-survivor/protocol';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../account/supabaseClient.js';
import { HUB_CAPACITY } from '../hub/types.js';

// Netcode du NOUVEAU jeu (« Tower / arme à feu »), host-autoritaire — même principe
// que le co-op de l'ancien jeu (voir net/coopSession.ts), adapté au contrat Tower.
// L'état Tower ne contient aucune case de tableau vide (contrairement aux inventaires
// de l'ancien jeu), donc aucune normalisation `null → undefined` n'est nécessaire.

/** Doit correspondre au tickMs interne de TowerSimulation (tuning). */
const TOWER_TICK_MS = 50;
const STATE_BROADCAST_HZ = 20;
const INPUT_SEND_HZ = 30;
const STATE_INTERVAL_MS = 1_000 / STATE_BROADCAST_HZ;
const INPUT_INTERVAL_MS = 1_000 / INPUT_SEND_HZ;
const SYNC_REQUEST_INTERVAL_MS = 1_000;
const INITIAL_STATE_TIMEOUT_MS = 8_000;

/** Session Tower + fraction d'interpolation pour le rendu (voir TowerScene). */
export interface TowerRenderableSession extends TowerSession {
  getRenderAlpha(): number;
  /** Rend les incidents de connexion exploitables sans coupler le netcode au DOM. */
  onConnectionIssue(listener: (message: string) => void): () => void;
}

export interface TowerCoopConfig {
  seed: string;
  code: string;
  hostId: string;
  me: string;
  roster: readonly { id: string; name: string }[];
}

function idleInput(): TowerInput {
  return { sequence: 0, moveX: 0, moveY: 0, aimX: 1, aimY: 0 };
}

/** Part PERSISTANTE d'une commande (déplacement/visée/tir maintenu) — sans les actions
 * ponctuelles (choix d'amélioration, achat de tourelle) qui ne doivent pas se rejouer. */
function persistentInput(input: TowerInput): TowerInput {
  return {
    sequence: input.sequence,
    moveX: input.moveX,
    moveY: input.moveY,
    aimX: input.aimX,
    aimY: input.aimY,
    ...(input.fire === true ? { fire: true } : {}),
  };
}

function hasDiscreteAction(input: TowerInput): boolean {
  return input.selectUpgradeId !== undefined || input.turretShop !== undefined;
}

function isTowerGameState(value: unknown): value is TowerGameState {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { players?: unknown }).players)
  );
}

export interface TowerInputMessage {
  id: string;
  input: TowerInput;
}

interface SyncRequestMessage {
  id: string;
}

interface TargetedStateMessage {
  recipientId: string;
  state: TowerGameState;
}

const TURRET_DIRECTIONS = new Set(['N', 'E', 'S', 'W']);

/** Valide une commande distante et réserve sa séquence si elle est acceptée. */
export function acceptTowerInputMessage(
  value: unknown,
  rosterIds: ReadonlySet<string>,
  lastSequenceById: Map<string, number>,
  hostId: string,
): TowerInputMessage | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as { id?: unknown; input?: unknown };
  if (
    typeof candidate.id !== 'string' ||
    candidate.id === hostId ||
    !rosterIds.has(candidate.id) ||
    typeof candidate.input !== 'object' ||
    candidate.input === null
  ) {
    return null;
  }
  const input = candidate.input as Record<string, unknown>;
  const sequence = input.sequence;
  if (
    !Number.isSafeInteger(sequence) ||
    (sequence as number) < 0 ||
    (lastSequenceById.get(candidate.id) ?? -1) >= (sequence as number) ||
    typeof input.moveX !== 'number' ||
    !Number.isFinite(input.moveX) ||
    input.moveX < -1 ||
    input.moveX > 1 ||
    typeof input.moveY !== 'number' ||
    !Number.isFinite(input.moveY) ||
    input.moveY < -1 ||
    input.moveY > 1 ||
    typeof input.aimX !== 'number' ||
    !Number.isFinite(input.aimX) ||
    typeof input.aimY !== 'number' ||
    !Number.isFinite(input.aimY) ||
    (input.fire !== undefined && typeof input.fire !== 'boolean') ||
    (input.selectUpgradeId !== undefined &&
      (typeof input.selectUpgradeId !== 'string' || input.selectUpgradeId.length === 0)) ||
    (input.turretShop !== undefined && !isTurretShopAction(input.turretShop))
  ) {
    return null;
  }
  const accepted = candidate as TowerInputMessage;
  lastSequenceById.set(accepted.id, accepted.input.sequence);
  return accepted;
}

function isTurretShopAction(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const action = value as { turret?: unknown; action?: unknown };
  return (
    typeof action.turret === 'string' &&
    TURRET_DIRECTIONS.has(action.turret) &&
    typeof action.action === 'string' &&
    action.action.length > 0
  );
}

function validateCoopConfig(config: TowerCoopConfig): void {
  const ids = config.roster.map((entry) => entry.id);
  if (
    ids.length === 0 ||
    ids.length > HUB_CAPACITY ||
    new Set(ids).size !== ids.length ||
    !ids.includes(config.hostId) ||
    !ids.includes(config.me)
  ) {
    throw new Error(
      `Configuration Tower invalide (roster unique de 1 à ${HUB_CAPACITY} joueurs requis).`,
    );
  }
}

function personalizeState(state: TowerGameState, me: string): TowerGameState {
  const mine = state.players.find((player) => player.id === me);
  return mine === undefined ? state : { ...state, player: mine };
}

function parseStateMessage(value: unknown, me: string): TowerGameState | null {
  if (isTowerGameState(value)) {
    return value;
  }
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const targeted = value as { recipientId?: unknown; state?: unknown };
  return targeted.recipientId === me && isTowerGameState(targeted.state) ? targeted.state : null;
}

// ─── Solo ─────────────────────────────────────────────────────────────────────

export class TowerLocalSession implements TowerRenderableSession {
  private readonly simulation: TowerSimulation;
  private readonly listeners = new Set<(state: TowerGameState) => void>();
  private currentInput: TowerInput = idleInput();
  private running = false;
  private frameHandle: number | undefined;
  private lastTimestamp = 0;
  private accumulatorMs = 0;

  public constructor(options: { seed: string }) {
    this.simulation = new TowerSimulation(options.seed, { playerIds: ['player-1'] });
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.simulation.start();
    this.lastTimestamp = performance.now();
    this.frameHandle = requestAnimationFrame(this.onFrame);
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.frameHandle !== undefined) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = undefined;
    }
    this.listeners.clear();
  }

  public sendInput(input: TowerInput): void {
    this.currentInput = input;
  }

  public getRenderAlpha(): number {
    return Math.max(0, Math.min(1, this.accumulatorMs / TOWER_TICK_MS));
  }

  public onConnectionIssue(_listener: (message: string) => void): () => void {
    return () => undefined;
  }

  public subscribe(listener: (state: TowerGameState) => void): () => void {
    this.listeners.add(listener);
    listener(this.simulation.createSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private readonly onFrame = (timestamp: number): void => {
    if (!this.running) {
      return;
    }
    const rawDeltaMs = Math.max(0, Math.min(250, timestamp - this.lastTimestamp));
    this.lastTimestamp = timestamp;
    this.accumulatorMs += rawDeltaMs;
    let processed = 0;
    while (this.accumulatorMs >= TOWER_TICK_MS && processed < 240) {
      this.simulation.step({ 'player-1': this.currentInput });
      this.currentInput = persistentInput(this.currentInput);
      this.accumulatorMs -= TOWER_TICK_MS;
      processed += 1;
    }
    if (processed > 0) {
      const snapshot = this.simulation.createSnapshot();
      for (const listener of this.listeners) {
        listener(snapshot);
      }
    }
    this.frameHandle = requestAnimationFrame(this.onFrame);
  };
}

// ─── Hôte ───────────────────────────────────────────────────────────────────

class TowerHostSession implements TowerRenderableSession {
  private readonly simulation: TowerSimulation;
  private readonly channel: RealtimeChannel;
  private readonly me: string;
  private readonly listeners = new Set<(state: TowerGameState) => void>();
  private readonly inputsById: Record<string, TowerInput> = {};
  private readonly rosterIds: ReadonlySet<string>;
  private readonly lastSequenceById = new Map<string, number>();
  private running = false;
  private channelReady = false;
  private frameHandle: number | undefined;
  private lastTimestamp = 0;
  private accumulatorMs = 0;
  private lastBroadcastMs = 0;

  public constructor(config: TowerCoopConfig) {
    this.me = config.me;
    this.rosterIds = new Set(config.roster.map((entry) => entry.id));
    this.simulation = new TowerSimulation(config.seed, {
      playerIds: config.roster.map((entry) => entry.id),
    });
    this.channel = supabase.channel(`tower:${config.code}`, {
      config: { broadcast: { self: false } },
    });
    this.channel.on<TowerInputMessage>('broadcast', { event: 'input' }, (message) => {
      const accepted = acceptTowerInputMessage(
        message.payload,
        this.rosterIds,
        this.lastSequenceById,
        this.me,
      );
      if (accepted !== null) {
        this.inputsById[accepted.id] = accepted.input;
      }
    });
    this.channel.on<SyncRequestMessage>('broadcast', { event: 'sync-request' }, (message) => {
      const requesterId = message.payload?.id;
      if (
        !this.channelReady ||
        typeof requesterId !== 'string' ||
        !this.rosterIds.has(requesterId)
      ) {
        return;
      }
      const payload: TargetedStateMessage = {
        recipientId: requesterId,
        state: this.simulation.createSnapshot(),
      };
      void this.channel.send({ type: 'broadcast', event: 'state', payload });
    });
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.simulation.start();
    this.channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        this.channelReady = true;
      }
    });
    this.lastTimestamp = performance.now();
    this.frameHandle = requestAnimationFrame(this.onFrame);
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.frameHandle !== undefined) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = undefined;
    }
    this.listeners.clear();
    try {
      await supabase.removeChannel(this.channel);
    } catch (error) {
      console.warn('[tower:host] removeChannel', error);
    }
  }

  public sendInput(input: TowerInput): void {
    this.inputsById[this.me] = input;
  }

  public getRenderAlpha(): number {
    return Math.max(0, Math.min(1, this.accumulatorMs / TOWER_TICK_MS));
  }

  public onConnectionIssue(_listener: (message: string) => void): () => void {
    return () => undefined;
  }

  public subscribe(listener: (state: TowerGameState) => void): () => void {
    this.listeners.add(listener);
    listener(this.simulation.createSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private readonly onFrame = (timestamp: number): void => {
    if (!this.running) {
      return;
    }
    const rawDeltaMs = Math.max(0, Math.min(250, timestamp - this.lastTimestamp));
    this.lastTimestamp = timestamp;
    this.accumulatorMs += rawDeltaMs;
    let processed = 0;
    while (this.accumulatorMs >= TOWER_TICK_MS && processed < 240) {
      this.simulation.step(this.inputsById);
      for (const id of Object.keys(this.inputsById)) {
        const current = this.inputsById[id];
        if (current !== undefined) {
          this.inputsById[id] = persistentInput(current);
        }
      }
      this.accumulatorMs -= TOWER_TICK_MS;
      processed += 1;
    }
    if (processed > 0) {
      const snapshot = this.simulation.createSnapshot();
      for (const listener of this.listeners) {
        listener(snapshot);
      }
      if (this.channelReady && timestamp - this.lastBroadcastMs >= STATE_INTERVAL_MS) {
        this.lastBroadcastMs = timestamp;
        void this.channel.send({ type: 'broadcast', event: 'state', payload: snapshot });
      }
    }
    this.frameHandle = requestAnimationFrame(this.onFrame);
  };
}

// ─── Invité ─────────────────────────────────────────────────────────────────

class TowerGuestSession implements TowerRenderableSession {
  private readonly channel: RealtimeChannel;
  private readonly me: string;
  private readonly listeners = new Set<(state: TowerGameState) => void>();
  private readonly issueListeners = new Set<(message: string) => void>();
  private latestInput: TowerInput = idleInput();
  private lastState: TowerGameState | undefined;
  private lastStateAt = 0;
  private running = false;
  private sendHandle: number | undefined;
  private syncHandle: number | undefined;
  private timeoutHandle: number | undefined;
  private receivedAuthoritativeState = false;
  private connectionIssue: string | undefined;

  public constructor(config: TowerCoopConfig) {
    this.me = config.me;
    // Instantané visuel non autoritaire, jamais simulé côté invité : le rendu n'est
    // pas vide pendant que l'état courant est demandé à l'hôte.
    const bootstrap = new TowerSimulation(config.seed, {
      playerIds: config.roster.map((entry) => entry.id),
    });
    bootstrap.start();
    this.lastState = personalizeState(bootstrap.createSnapshot(), this.me);
    this.channel = supabase.channel(`tower:${config.code}`, {
      config: { broadcast: { self: false } },
    });
    this.channel.on<TowerGameState | TargetedStateMessage>(
      'broadcast',
      { event: 'state' },
      (message) => {
        const payload = parseStateMessage(message.payload, this.me);
        if (payload === null) {
          return;
        }
        const state = personalizeState(payload, this.me);
        this.lastState = state;
        this.lastStateAt = performance.now();
        if (!this.receivedAuthoritativeState) {
          this.receivedAuthoritativeState = true;
          this.clearSyncTimers();
        }
        for (const listener of this.listeners) {
          listener(state);
        }
      },
    );
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        this.sendHandle = window.setInterval(() => this.flushInput(), INPUT_INTERVAL_MS);
        this.requestSync();
        this.syncHandle = window.setInterval(() => this.requestSync(), SYNC_REQUEST_INTERVAL_MS);
        this.timeoutHandle = window.setTimeout(() => {
          if (!this.receivedAuthoritativeState) {
            this.reportIssue(
              `Synchronisation Tower impossible après ${INITIAL_STATE_TIMEOUT_MS / 1_000} s. Vérifiez que l'hôte est connecté et relancez la partie depuis le hub.`,
            );
          }
        }, INITIAL_STATE_TIMEOUT_MS);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        this.reportIssue(`Canal Tower indisponible (${status}). Revenez au hub puis réessayez.`);
      }
    });
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.sendHandle !== undefined) {
      clearInterval(this.sendHandle);
      this.sendHandle = undefined;
    }
    this.clearSyncTimers();
    this.listeners.clear();
    try {
      await supabase.removeChannel(this.channel);
    } catch (error) {
      console.warn('[tower:guest] removeChannel', error);
    }
  }

  public sendInput(input: TowerInput): void {
    this.latestInput = input;
    // Les actions ponctuelles (amélioration, achat) partent immédiatement.
    if (hasDiscreteAction(input)) {
      this.flushInput();
    }
  }

  public getRenderAlpha(): number {
    if (this.lastStateAt === 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, (performance.now() - this.lastStateAt) / STATE_INTERVAL_MS));
  }

  public onConnectionIssue(listener: (message: string) => void): () => void {
    this.issueListeners.add(listener);
    if (this.connectionIssue !== undefined) {
      listener(this.connectionIssue);
    }
    return () => this.issueListeners.delete(listener);
  }

  public subscribe(listener: (state: TowerGameState) => void): () => void {
    this.listeners.add(listener);
    if (this.lastState !== undefined) {
      listener(this.lastState);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  private flushInput(): void {
    const message: TowerInputMessage = { id: this.me, input: this.latestInput };
    void this.channel.send({ type: 'broadcast', event: 'input', payload: message });
  }

  private requestSync(): void {
    if (!this.running || this.receivedAuthoritativeState) {
      return;
    }
    const payload: SyncRequestMessage = { id: this.me };
    void this.channel.send({ type: 'broadcast', event: 'sync-request', payload });
  }

  private clearSyncTimers(): void {
    if (this.syncHandle !== undefined) {
      clearInterval(this.syncHandle);
      this.syncHandle = undefined;
    }
    if (this.timeoutHandle !== undefined) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = undefined;
    }
  }

  private reportIssue(message: string): void {
    this.connectionIssue = message;
    console.error(`[tower:guest] ${message}`);
    for (const listener of this.issueListeners) {
      listener(message);
    }
  }
}

/** Crée la session co-op Tower adaptée au rôle (hôte si `me === hostId`, sinon invité). */
export function createTowerCoopSession(config: TowerCoopConfig): TowerRenderableSession {
  validateCoopConfig(config);
  const isHost = config.me === config.hostId;
  console.info(
    `[tower] rôle=${isHost ? 'HÔTE' : 'INVITÉ'} · canal=tower:${config.code} · moi=${config.me}`,
  );
  return isHost ? new TowerHostSession(config) : new TowerGuestSession(config);
}
