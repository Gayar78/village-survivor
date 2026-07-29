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
const ACTION_RETRY_INTERVAL_MS = 250;
const SYNC_REQUEST_INTERVAL_MS = 1_000;
const INITIAL_STATE_TIMEOUT_MS = 8_000;
export const MAX_PENDING_TOWER_ACTIONS = 32;
export const MAX_REMEMBERED_TOWER_ACTION_IDS = 256;
const MAX_ACTION_ID_LENGTH = 128;
const MAX_ACTION_VALUE_LENGTH = 256;

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
    Number.isSafeInteger((value as { tick?: unknown }).tick) &&
    (value as { tick: number }).tick >= 0 &&
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

export interface TowerActionAckMessage {
  senderId: string;
  recipientId: string;
  actionId: string;
}

type DiscreteTowerAction = Readonly<{
  discreteActionId?: string;
  selectUpgradeId?: string;
  turretShop?: NonNullable<TowerInput['turretShop']>;
}>;

const TURRET_DIRECTIONS = new Set(['N', 'E', 'S', 'W']);

function isBoundedNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

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
      !isBoundedNonEmptyString(input.selectUpgradeId, MAX_ACTION_VALUE_LENGTH)) ||
    (input.turretShop !== undefined && !isTurretShopAction(input.turretShop)) ||
    (input.discreteActionId !== undefined &&
      (!hasDiscreteAction(input as TowerInput) ||
        !isBoundedNonEmptyString(input.discreteActionId, MAX_ACTION_ID_LENGTH)))
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
    isBoundedNonEmptyString(action.action, MAX_ACTION_VALUE_LENGTH)
  );
}

function discreteAction(input: TowerInput): DiscreteTowerAction | null {
  if (!hasDiscreteAction(input)) {
    return null;
  }
  return {
    ...(input.discreteActionId === undefined ? {} : { discreteActionId: input.discreteActionId }),
    ...(input.selectUpgradeId === undefined ? {} : { selectUpgradeId: input.selectUpgradeId }),
    ...(input.turretShop === undefined ? {} : { turretShop: input.turretShop }),
  };
}

function withDiscreteAction(input: TowerInput, action: DiscreteTowerAction): TowerInput {
  return { ...persistentInput(input), ...action };
}

/** File invitée bornée, avec retransmission round-robin temporisée. */
export class TowerGuestActionQueue {
  private readonly actions: Array<DiscreteTowerAction & { discreteActionId: string }> = [];
  private readonly lastSentAtById = new Map<string, number>();
  private cursor = 0;

  public get size(): number {
    return this.actions.length;
  }

  public enqueue(input: TowerInput, createId: () => string): string | null {
    const action = discreteAction(input);
    if (action === null) {
      return null;
    }
    const suppliedId = action.discreteActionId;
    const actionId =
      suppliedId !== undefined && isBoundedNonEmptyString(suppliedId, MAX_ACTION_ID_LENGTH)
        ? suppliedId
        : createId();
    if (!isBoundedNonEmptyString(actionId, MAX_ACTION_ID_LENGTH)) {
      return null;
    }
    if (this.actions.some((pending) => pending.discreteActionId === actionId)) {
      return actionId;
    }
    if (this.actions.length >= MAX_PENDING_TOWER_ACTIONS) {
      return null;
    }
    this.actions.push({ ...action, discreteActionId: actionId });
    return actionId;
  }

  public acknowledge(actionId: string): boolean {
    const index = this.actions.findIndex((action) => action.discreteActionId === actionId);
    if (index < 0) {
      return false;
    }
    this.actions.splice(index, 1);
    this.lastSentAtById.delete(actionId);
    if (this.actions.length === 0) {
      this.cursor = 0;
    } else if (index < this.cursor || this.cursor >= this.actions.length) {
      this.cursor %= this.actions.length;
    }
    return true;
  }

  public nextForSend(now: number, preferredId?: string): DiscreteTowerAction | null {
    if (this.actions.length === 0) {
      return null;
    }
    const preferredIndex =
      preferredId === undefined
        ? -1
        : this.actions.findIndex((action) => action.discreteActionId === preferredId);
    for (let offset = 0; offset < this.actions.length; offset += 1) {
      const index =
        preferredIndex >= 0 ? preferredIndex : (this.cursor + offset) % this.actions.length;
      const action = this.actions[index];
      if (action === undefined) {
        return null;
      }
      const lastSentAt = this.lastSentAtById.get(action.discreteActionId);
      if (lastSentAt === undefined || now - lastSentAt >= ACTION_RETRY_INTERVAL_MS) {
        this.lastSentAtById.set(action.discreteActionId, now);
        this.cursor = (index + 1) % this.actions.length;
        return action;
      }
      if (preferredIndex >= 0) {
        return null;
      }
    }
    return null;
  }
}

export type TowerHostActionResult = Readonly<{
  ackActionId?: string;
  queued: boolean;
}>;

/** Registre hôte borné : une action identifiée est mise en file au plus une fois. */
export class TowerHostActionLedger {
  private readonly pendingByPlayer = new Map<string, DiscreteTowerAction[]>();
  private readonly rememberedByPlayer = new Map<string, Set<string>>();

  public receive(playerId: string, input: TowerInput): TowerHostActionResult {
    const action = discreteAction(input);
    if (action === null) {
      return { queued: false };
    }
    const actionId = action.discreteActionId;
    if (actionId !== undefined) {
      const remembered = this.rememberedByPlayer.get(playerId);
      if (remembered?.has(actionId) === true) {
        return { ackActionId: actionId, queued: false };
      }
    }
    const pending = this.pendingByPlayer.get(playerId) ?? [];
    if (pending.length >= MAX_PENDING_TOWER_ACTIONS) {
      return { queued: false };
    }
    pending.push(action);
    this.pendingByPlayer.set(playerId, pending);
    if (actionId === undefined) {
      return { queued: true };
    }
    let remembered = this.rememberedByPlayer.get(playerId);
    if (remembered === undefined) {
      remembered = new Set<string>();
      this.rememberedByPlayer.set(playerId, remembered);
    }
    remembered.add(actionId);
    while (remembered.size > MAX_REMEMBERED_TOWER_ACTION_IDS) {
      const oldest = remembered.values().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      remembered.delete(oldest);
    }
    return { ackActionId: actionId, queued: true };
  }

  public take(playerId: string): DiscreteTowerAction | null {
    const pending = this.pendingByPlayer.get(playerId);
    const action = pending?.shift() ?? null;
    if (pending?.length === 0) {
      this.pendingByPlayer.delete(playerId);
    }
    return action;
  }

  public pendingCount(playerId: string): number {
    return this.pendingByPlayer.get(playerId)?.length ?? 0;
  }

  public rememberedCount(playerId: string): number {
    return this.rememberedByPlayer.get(playerId)?.size ?? 0;
  }
}

export function parseTowerActionAck(value: unknown, me: string, hostId: string): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const ack = value as { senderId?: unknown; recipientId?: unknown; actionId?: unknown };
  return ack.senderId === hostId &&
    ack.recipientId === me &&
    isBoundedNonEmptyString(ack.actionId, MAX_ACTION_ID_LENGTH)
    ? ack.actionId
    : null;
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

export function parseTowerStateMessage(
  value: unknown,
  me: string,
  lastAcceptedTick: number,
): TowerGameState | null {
  let state: TowerGameState | null = null;
  if (isTowerGameState(value)) {
    state = value;
  } else if (typeof value === 'object' && value !== null) {
    const targeted = value as { recipientId?: unknown; state?: unknown };
    if (targeted.recipientId === me && isTowerGameState(targeted.state)) {
      state = targeted.state;
    }
  }
  return state !== null && state.tick >= lastAcceptedTick ? state : null;
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

  public onConnectionIssue(listener: (message: string) => void): () => void {
    void listener;
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
  private readonly actionLedger = new TowerHostActionLedger();
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
        this.inputsById[accepted.id] = persistentInput(accepted.input);
        const actionResult = this.actionLedger.receive(accepted.id, accepted.input);
        if (actionResult.ackActionId !== undefined) {
          const payload: TowerActionAckMessage = {
            senderId: this.me,
            recipientId: accepted.id,
            actionId: actionResult.ackActionId,
          };
          void this.channel.send({ type: 'broadcast', event: 'input-ack', payload });
        }
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

  public onConnectionIssue(listener: (message: string) => void): () => void {
    void listener;
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
      const stepInputs: Record<string, TowerInput> = {};
      for (const id of Object.keys(this.inputsById)) {
        const current = this.inputsById[id];
        if (current !== undefined) {
          const action = this.actionLedger.take(id);
          stepInputs[id] = action === null ? current : withDiscreteAction(current, action);
          this.inputsById[id] = persistentInput(current);
        }
      }
      this.simulation.step(stepInputs);
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
  private readonly hostId: string;
  private readonly listeners = new Set<(state: TowerGameState) => void>();
  private readonly issueListeners = new Set<(message: string) => void>();
  private readonly actionQueue = new TowerGuestActionQueue();
  private latestInput: TowerInput = idleInput();
  private lastState: TowerGameState | undefined;
  private lastStateAt = 0;
  private lastAcceptedStateTick = -1;
  private nextTransportSequence = Date.now();
  private actionIdCounter = 0;
  private running = false;
  private channelReady = false;
  private sendHandle: number | undefined;
  private syncHandle: number | undefined;
  private timeoutHandle: number | undefined;
  private receivedAuthoritativeState = false;
  private connectionIssue: string | undefined;

  public constructor(config: TowerCoopConfig) {
    this.me = config.me;
    this.hostId = config.hostId;
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
        const payload = parseTowerStateMessage(
          message.payload,
          this.me,
          this.lastAcceptedStateTick,
        );
        if (payload === null) {
          return;
        }
        const state = personalizeState(payload, this.me);
        this.lastAcceptedStateTick = state.tick;
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
    this.channel.on<TowerActionAckMessage>('broadcast', { event: 'input-ack' }, (message) => {
      const actionId = parseTowerActionAck(message.payload, this.me, this.hostId);
      if (actionId !== null) {
        this.actionQueue.acknowledge(actionId);
      }
    });
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        this.channelReady = true;
        this.sendHandle = window.setInterval(() => this.flushInput(), INPUT_INTERVAL_MS);
        this.flushInput();
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
        this.channelReady = false;
        this.reportIssue(`Canal Tower indisponible (${status}). Revenez au hub puis réessayez.`);
      }
    });
  }

  public async stop(): Promise<void> {
    this.running = false;
    this.channelReady = false;
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
    this.latestInput = persistentInput(input);
    // Les actions ponctuelles partent immédiatement puis restent en file jusqu'à l'ACK.
    if (hasDiscreteAction(input)) {
      const actionId = this.actionQueue.enqueue(input, () => this.createActionId());
      if (actionId !== null) {
        this.flushInput(actionId);
      }
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

  private flushInput(preferredActionId?: string): void {
    if (!this.running || !this.channelReady || !Number.isSafeInteger(this.nextTransportSequence)) {
      return;
    }
    const action = this.actionQueue.nextForSend(performance.now(), preferredActionId);
    const input =
      action === null
        ? persistentInput(this.latestInput)
        : withDiscreteAction(this.latestInput, action);
    const message: TowerInputMessage = {
      id: this.me,
      input: { ...input, sequence: this.nextTransportSequence },
    };
    this.nextTransportSequence += 1;
    void this.channel.send({ type: 'broadcast', event: 'input', payload: message });
  }

  private createActionId(): string {
    this.actionIdCounter += 1;
    const randomId = globalThis.crypto?.randomUUID?.();
    return randomId ?? `tower-${Date.now().toString(36)}-${this.actionIdCounter.toString(36)}`;
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
