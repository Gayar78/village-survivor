import { createTowerStateFingerprint, TowerSimulation } from '@village-survivor/game-core';
import type { TowerGameState, TowerInput, TowerSession } from '@village-survivor/protocol';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../account/supabaseClient.js';
import { HUB_CAPACITY } from '../hub/types.js';

/** Doit correspondre au tick fixe interne de TowerSimulation. */
export const TOWER_LOCKSTEP_TICK_MS = 50;
export const TOWER_INPUT_DELAY_TICKS = 4;
export const TOWER_INPUT_BATCH_TICKS = 12;
export const TOWER_MAX_INPUT_BATCH_TICKS = 16;
const MAX_FUTURE_INPUT_TICKS = 240;
const MAX_INPUT_PACKET_BYTES = 16_384;
const READY_HEARTBEAT_MS = 500;
const START_BARRIER_TIMEOUT_MS = 8_000;
const FINGERPRINT_INTERVAL_TICKS = 20;
const MAX_FINGERPRINT_LENGTH = 256;
const MAX_ACTION_ID_LENGTH = 128;
const MAX_ACTION_VALUE_LENGTH = 256;
const MAX_PENDING_ACTIONS = 32;
const MAX_REMEMBERED_ACTION_IDS = 256;
const MAX_AIM_COMPONENT = 1_000_000;
const MAX_STEPS_PER_FRAME = 240;

export const TOWER_LOCKSTEP_EVENTS = {
  ready: 'ready',
  inputBatch: 'input-batch',
  fingerprint: 'fingerprint',
} as const;

/** Session Tower + fraction d'interpolation pour le rendu (voir TowerScene). */
export interface TowerRenderableSession extends TowerSession {
  getRenderAlpha(): number;
  /** Rend les incidents de connexion exploitables sans coupler le netcode au DOM. */
  onConnectionIssue(listener: (message: string) => void): () => void;
}

export interface TowerCoopConfig {
  seed: string;
  code: string;
  /** Conservé pour le contrat lobby ; aucun pair n'est autoritaire pendant la partie. */
  hostId: string;
  me: string;
  roster: readonly { id: string; name: string }[];
}

export interface TowerReadyMessage {
  senderId: string;
}

export interface TowerInputFrame {
  tick: number;
  input: TowerInput;
}

export interface TowerInputBatchMessage {
  senderId: string;
  frames: readonly TowerInputFrame[];
}

export interface TowerFingerprintMessage {
  senderId: string;
  tick: number;
  fingerprint: string;
}

type TowerBroadcast = Readonly<{
  type: 'broadcast';
  event: (typeof TOWER_LOCKSTEP_EVENTS)[keyof typeof TOWER_LOCKSTEP_EVENTS];
  payload: TowerReadyMessage | TowerInputBatchMessage | TowerFingerprintMessage;
}>;

type DiscreteTowerAction = Readonly<{
  discreteActionId?: string;
  selectUpgradeId?: string;
  turretShop?: NonNullable<TowerInput['turretShop']>;
}>;

const TURRET_DIRECTIONS = new Set(['N', 'E', 'S', 'W']);

function idleInput(): TowerInput {
  return { sequence: 0, moveX: 0, moveY: 0, aimX: 1, aimY: 0 };
}

/** Retire les actions ponctuelles qui ne doivent appartenir qu'à une seule frame. */
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

function isBoundedNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
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

function isValidTowerInput(value: unknown): value is TowerInput {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const input = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(input.sequence) &&
    (input.sequence as number) >= 0 &&
    typeof input.moveX === 'number' &&
    Number.isFinite(input.moveX) &&
    input.moveX >= -1 &&
    input.moveX <= 1 &&
    typeof input.moveY === 'number' &&
    Number.isFinite(input.moveY) &&
    input.moveY >= -1 &&
    input.moveY <= 1 &&
    typeof input.aimX === 'number' &&
    Number.isFinite(input.aimX) &&
    Math.abs(input.aimX) <= MAX_AIM_COMPONENT &&
    typeof input.aimY === 'number' &&
    Number.isFinite(input.aimY) &&
    Math.abs(input.aimY) <= MAX_AIM_COMPONENT &&
    (input.fire === undefined || typeof input.fire === 'boolean') &&
    (input.selectUpgradeId === undefined ||
      isBoundedNonEmptyString(input.selectUpgradeId, MAX_ACTION_VALUE_LENGTH)) &&
    (input.turretShop === undefined || isTurretShopAction(input.turretShop)) &&
    (input.discreteActionId === undefined ||
      (hasDiscreteAction(input as TowerInput) &&
        isBoundedNonEmptyString(input.discreteActionId, MAX_ACTION_ID_LENGTH)))
  );
}

function serializedSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function towerReadyBroadcast(senderId: string): TowerBroadcast {
  return {
    type: 'broadcast',
    event: TOWER_LOCKSTEP_EVENTS.ready,
    payload: { senderId },
  };
}

export function towerInputBatchBroadcast(payload: TowerInputBatchMessage): TowerBroadcast {
  return { type: 'broadcast', event: TOWER_LOCKSTEP_EVENTS.inputBatch, payload };
}

export function towerFingerprintBroadcast(payload: TowerFingerprintMessage): TowerBroadcast {
  return { type: 'broadcast', event: TOWER_LOCKSTEP_EVENTS.fingerprint, payload };
}

/** Barrière pure : chaque id du roster doit s'être annoncé abonné et prêt. */
export class TowerReadyBarrier {
  private readonly rosterIds: ReadonlySet<string>;
  private readonly readyIds = new Set<string>();

  public constructor(rosterIds: ReadonlySet<string>) {
    this.rosterIds = rosterIds;
  }

  public markLocalReady(id: string): boolean {
    if (!this.rosterIds.has(id)) {
      return false;
    }
    this.readyIds.add(id);
    return true;
  }

  public accept(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const senderId = (value as { senderId?: unknown }).senderId;
    if (typeof senderId !== 'string' || !this.rosterIds.has(senderId)) {
      return false;
    }
    this.readyIds.add(senderId);
    return true;
  }

  public get complete(): boolean {
    return this.readyIds.size === this.rosterIds.size;
  }

  public get missingIds(): readonly string[] {
    return [...this.rosterIds].filter((id) => !this.readyIds.has(id));
  }
}

/** Valide entièrement un batch avant de rendre ses frames admissibles. */
export function parseTowerInputBatch(
  value: unknown,
  rosterIds: ReadonlySet<string>,
  minimumTick: number,
  maximumTick: number,
): TowerInputBatchMessage | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    serializedSize(value) > MAX_INPUT_PACKET_BYTES
  ) {
    return null;
  }
  const candidate = value as { senderId?: unknown; frames?: unknown };
  if (
    typeof candidate.senderId !== 'string' ||
    !rosterIds.has(candidate.senderId) ||
    !Array.isArray(candidate.frames) ||
    candidate.frames.length === 0 ||
    candidate.frames.length > TOWER_MAX_INPUT_BATCH_TICKS
  ) {
    return null;
  }
  const ticks = new Set<number>();
  for (const valueFrame of candidate.frames) {
    if (typeof valueFrame !== 'object' || valueFrame === null) {
      return null;
    }
    const frame = valueFrame as { tick?: unknown; input?: unknown };
    if (
      !Number.isSafeInteger(frame.tick) ||
      (frame.tick as number) < minimumTick ||
      (frame.tick as number) > maximumTick ||
      ticks.has(frame.tick as number) ||
      !isValidTowerInput(frame.input)
    ) {
      return null;
    }
    ticks.add(frame.tick as number);
  }
  return candidate as TowerInputBatchMessage;
}

/** Buffer P2P : premier exemplaire d'une frame joueur/tick gagne, puis consommation unique. */
export class TowerLockstepInputBuffer {
  private readonly rosterIds: ReadonlySet<string>;
  private readonly framesByTick = new Map<number, Map<string, TowerInput>>();
  private simulationTick = 0;

  public constructor(rosterIds: ReadonlySet<string>) {
    this.rosterIds = rosterIds;
  }

  public get nextTick(): number {
    return this.simulationTick;
  }

  public acceptBatch(value: unknown): number {
    const batch = parseTowerInputBatch(
      value,
      this.rosterIds,
      Math.max(0, this.simulationTick - TOWER_MAX_INPUT_BATCH_TICKS),
      this.simulationTick + MAX_FUTURE_INPUT_TICKS,
    );
    if (batch === null) {
      return 0;
    }
    let accepted = 0;
    for (const frame of batch.frames) {
      // Une fenêtre de retransmission contient normalement quelques ticks déjà joués.
      if (frame.tick < this.simulationTick) {
        continue;
      }
      let tickFrames = this.framesByTick.get(frame.tick);
      if (tickFrames === undefined) {
        tickFrames = new Map<string, TowerInput>();
        this.framesByTick.set(frame.tick, tickFrames);
      }
      if (!tickFrames.has(batch.senderId)) {
        tickFrames.set(batch.senderId, frame.input);
        accepted += 1;
      }
    }
    return accepted;
  }

  public takeNextTick(): Readonly<Record<string, TowerInput>> | null {
    const tickFrames = this.framesByTick.get(this.simulationTick);
    if (tickFrames === undefined || tickFrames.size !== this.rosterIds.size) {
      return null;
    }
    const result: Record<string, TowerInput> = {};
    for (const id of this.rosterIds) {
      const input = tickFrames.get(id);
      if (input === undefined) {
        return null;
      }
      result[id] = input;
    }
    this.framesByTick.delete(this.simulationTick);
    this.simulationTick += 1;
    return result;
  }
}

type FingerprintResult =
  | Readonly<{ status: 'ignored' | 'pending' | 'match' }>
  | Readonly<{ status: 'mismatch'; playerId: string; tick: number }>;

/** Compare les empreintes au même tick, même si le paquet distant arrive en avance. */
export class TowerFingerprintMonitor {
  private readonly rosterIds: ReadonlySet<string>;
  private readonly me: string;
  private readonly localByTick = new Map<number, string>();
  private readonly remoteByTick = new Map<number, Map<string, string>>();
  private latestLocalTick = 0;

  public constructor(rosterIds: ReadonlySet<string>, me: string) {
    this.rosterIds = rosterIds;
    this.me = me;
  }

  public recordLocal(tick: number, fingerprint: string): readonly FingerprintResult[] {
    if (!this.validFingerprint(tick, fingerprint)) {
      return [{ status: 'ignored' }];
    }
    this.latestLocalTick = Math.max(this.latestLocalTick, tick);
    this.localByTick.set(tick, fingerprint);
    const results = [...(this.remoteByTick.get(tick)?.entries() ?? [])].map(
      ([playerId, remoteFingerprint]): FingerprintResult =>
        remoteFingerprint === fingerprint
          ? { status: 'match' }
          : { status: 'mismatch', playerId, tick },
    );
    this.prune(tick);
    return results;
  }

  public accept(value: unknown): FingerprintResult {
    if (typeof value !== 'object' || value === null) {
      return { status: 'ignored' };
    }
    const message = value as {
      senderId?: unknown;
      tick?: unknown;
      fingerprint?: unknown;
    };
    if (
      typeof message.senderId !== 'string' ||
      message.senderId === this.me ||
      !this.rosterIds.has(message.senderId) ||
      typeof message.fingerprint !== 'string' ||
      !this.validFingerprint(message.tick, message.fingerprint) ||
      message.tick < this.latestLocalTick - FINGERPRINT_INTERVAL_TICKS * 4 ||
      message.tick > this.latestLocalTick + MAX_FUTURE_INPUT_TICKS
    ) {
      return { status: 'ignored' };
    }
    let remote = this.remoteByTick.get(message.tick);
    if (remote === undefined) {
      remote = new Map<string, string>();
      this.remoteByTick.set(message.tick, remote);
    }
    const prior = remote.get(message.senderId);
    if (prior !== undefined) {
      if (prior !== message.fingerprint) {
        return { status: 'mismatch', playerId: message.senderId, tick: message.tick };
      }
      return { status: 'ignored' };
    }
    remote.set(message.senderId, message.fingerprint);
    const local = this.localByTick.get(message.tick);
    if (local === undefined) {
      return { status: 'pending' };
    }
    return local === message.fingerprint
      ? { status: 'match' }
      : { status: 'mismatch', playerId: message.senderId, tick: message.tick };
  }

  private validFingerprint(tick: unknown, fingerprint: string): tick is number {
    return (
      Number.isSafeInteger(tick) &&
      (tick as number) >= 0 &&
      isBoundedNonEmptyString(fingerprint, MAX_FINGERPRINT_LENGTH)
    );
  }

  private prune(currentTick: number): void {
    const oldest = currentTick - FINGERPRINT_INTERVAL_TICKS * 4;
    for (const tick of this.localByTick.keys()) {
      if (tick < oldest) {
        this.localByTick.delete(tick);
        this.remoteByTick.delete(tick);
      }
    }
    for (const tick of this.remoteByTick.keys()) {
      if (tick < oldest || tick > currentTick + MAX_FUTURE_INPUT_TICKS) {
        this.remoteByTick.delete(tick);
      }
    }
  }
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

// ─── Solo (comportement inchangé) ────────────────────────────────────────────

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
    return Math.max(0, Math.min(1, this.accumulatorMs / TOWER_LOCKSTEP_TICK_MS));
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
    while (this.accumulatorMs >= TOWER_LOCKSTEP_TICK_MS && processed < MAX_STEPS_PER_FRAME) {
      this.simulation.step({ 'player-1': this.currentInput });
      this.currentInput = persistentInput(this.currentInput);
      this.accumulatorMs -= TOWER_LOCKSTEP_TICK_MS;
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

// ─── Co-op lockstep P2P ──────────────────────────────────────────────────────

class TowerLockstepSession implements TowerRenderableSession {
  private readonly simulation: TowerSimulation;
  private readonly channel: RealtimeChannel;
  private readonly me: string;
  private readonly roster: TowerCoopConfig['roster'];
  private readonly rosterIds: ReadonlySet<string>;
  private readonly barrier: TowerReadyBarrier;
  private readonly inputBuffer: TowerLockstepInputBuffer;
  private readonly fingerprintMonitor: TowerFingerprintMonitor;
  private readonly listeners = new Set<(state: TowerGameState) => void>();
  private readonly issueListeners = new Set<(message: string) => void>();
  private readonly localFrames = new Map<number, TowerInput>();
  private readonly pendingActions: DiscreteTowerAction[] = [];
  private readonly rememberedActionIds = new Set<string>();
  private latestInput: TowerInput = idleInput();
  private running = false;
  private channelReady = false;
  private simulationStarted = false;
  private frameHandle: number | undefined;
  private readyHandle: number | undefined;
  private inputHandle: number | undefined;
  private barrierTimeoutHandle: number | undefined;
  private lastTimestamp = 0;
  private accumulatorMs = 0;
  private nextLocalTick = 0;
  private connectionIssue: string | undefined;

  public constructor(config: TowerCoopConfig) {
    this.me = config.me;
    this.roster = config.roster;
    this.rosterIds = new Set(config.roster.map((entry) => entry.id));
    this.barrier = new TowerReadyBarrier(this.rosterIds);
    this.inputBuffer = new TowerLockstepInputBuffer(this.rosterIds);
    this.fingerprintMonitor = new TowerFingerprintMonitor(this.rosterIds, this.me);
    this.simulation = new TowerSimulation(config.seed, {
      playerIds: config.roster.map((entry) => entry.id),
    });
    this.channel = supabase.channel(`tower:${config.code}`, {
      config: { broadcast: { self: false } },
    });
    this.channel.on<TowerReadyMessage>(
      'broadcast',
      { event: TOWER_LOCKSTEP_EVENTS.ready },
      (message) => {
        if (this.barrier.accept(message.payload)) {
          this.tryStartSimulation();
        }
      },
    );
    this.channel.on<TowerInputBatchMessage>(
      'broadcast',
      { event: TOWER_LOCKSTEP_EVENTS.inputBatch },
      (message) => {
        this.inputBuffer.acceptBatch(message.payload);
      },
    );
    this.channel.on<TowerFingerprintMessage>(
      'broadcast',
      { event: TOWER_LOCKSTEP_EVENTS.fingerprint },
      (message) => {
        this.handleFingerprintResult(this.fingerprintMonitor.accept(message.payload));
      },
    );
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.channel.subscribe((status: string) => {
      if (!this.running) {
        return;
      }
      if (status === 'SUBSCRIBED') {
        this.channelReady = true;
        this.barrier.markLocalReady(this.me);
        this.broadcastReady();
        this.readyHandle = window.setInterval(() => this.broadcastReady(), READY_HEARTBEAT_MS);
        this.barrierTimeoutHandle = window.setTimeout(
          () => this.reportMissingReadyPlayers(),
          START_BARRIER_TIMEOUT_MS,
        );
        this.tryStartSimulation();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        this.channelReady = false;
        this.reportIssue(`Canal Tower indisponible (${status}). Revenez au hub puis réessayez.`);
      }
    });
  }

  public async stop(): Promise<void> {
    this.running = false;
    this.channelReady = false;
    if (this.frameHandle !== undefined) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = undefined;
    }
    if (this.readyHandle !== undefined) {
      clearInterval(this.readyHandle);
      this.readyHandle = undefined;
    }
    if (this.inputHandle !== undefined) {
      clearInterval(this.inputHandle);
      this.inputHandle = undefined;
    }
    if (this.barrierTimeoutHandle !== undefined) {
      clearTimeout(this.barrierTimeoutHandle);
      this.barrierTimeoutHandle = undefined;
    }
    this.listeners.clear();
    this.issueListeners.clear();
    try {
      await supabase.removeChannel(this.channel);
    } catch (error) {
      console.warn('[tower:lockstep] removeChannel', error);
    }
  }

  public sendInput(input: TowerInput): void {
    if (!isValidTowerInput(input)) {
      return;
    }
    this.latestInput = persistentInput(input);
    const action = discreteAction(input);
    if (action === null || this.pendingActions.length >= MAX_PENDING_ACTIONS) {
      return;
    }
    const actionId = action.discreteActionId;
    if (actionId !== undefined && this.rememberedActionIds.has(actionId)) {
      return;
    }
    this.pendingActions.push(action);
    if (actionId !== undefined) {
      this.rememberedActionIds.add(actionId);
      while (this.rememberedActionIds.size > MAX_REMEMBERED_ACTION_IDS) {
        const oldest = this.rememberedActionIds.values().next().value as string | undefined;
        if (oldest === undefined) {
          break;
        }
        this.rememberedActionIds.delete(oldest);
      }
    }
  }

  public getRenderAlpha(): number {
    if (!this.simulationStarted) {
      return 0;
    }
    return Math.max(0, Math.min(1, this.accumulatorMs / TOWER_LOCKSTEP_TICK_MS));
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
    listener(personalizeState(this.simulation.createSnapshot(), this.me));
    return () => {
      this.listeners.delete(listener);
    };
  }

  private tryStartSimulation(): void {
    if (!this.running || this.simulationStarted || !this.barrier.complete) {
      return;
    }
    this.simulationStarted = true;
    if (this.barrierTimeoutHandle !== undefined) {
      clearTimeout(this.barrierTimeoutHandle);
      this.barrierTimeoutHandle = undefined;
    }
    this.simulation.start();
    for (let tick = 0; tick < TOWER_INPUT_DELAY_TICKS; tick += 1) {
      this.addLocalFrame(tick, idleInput());
    }
    this.nextLocalTick = TOWER_INPUT_DELAY_TICKS;
    this.captureNextLocalFrame();
    this.inputHandle = window.setInterval(
      () => this.captureNextLocalFrame(),
      TOWER_LOCKSTEP_TICK_MS,
    );
    this.lastTimestamp = performance.now();
    this.frameHandle = requestAnimationFrame(this.onFrame);
  }

  private captureNextLocalFrame(): void {
    if (!this.running || !this.simulationStarted) {
      return;
    }
    if (this.nextLocalTick > this.inputBuffer.nextTick + MAX_FUTURE_INPUT_TICKS) {
      return;
    }
    const action = this.pendingActions.shift();
    const input =
      action === undefined ? this.latestInput : withDiscreteAction(this.latestInput, action);
    this.addLocalFrame(this.nextLocalTick, input);
    this.nextLocalTick += 1;
    this.broadcastRecentInputs();
  }

  private addLocalFrame(tick: number, input: TowerInput): void {
    this.localFrames.set(tick, input);
    const payload: TowerInputBatchMessage = {
      senderId: this.me,
      frames: [{ tick, input }],
    };
    this.inputBuffer.acceptBatch(payload);
  }

  private broadcastRecentInputs(): void {
    if (!this.channelReady || this.localFrames.size === 0) {
      return;
    }
    const oldestTick = Math.max(0, this.nextLocalTick - TOWER_INPUT_BATCH_TICKS);
    const frames: TowerInputFrame[] = [];
    for (const [tick, input] of this.localFrames) {
      if (tick >= oldestTick) {
        frames.push({ tick, input });
      } else if (tick < this.inputBuffer.nextTick) {
        this.localFrames.delete(tick);
      }
    }
    frames.sort((a, b) => a.tick - b.tick);
    if (frames.length > 0) {
      const payload: TowerInputBatchMessage = { senderId: this.me, frames };
      void this.channel.send(towerInputBatchBroadcast(payload));
    }
  }

  private broadcastReady(): void {
    if (this.running && this.channelReady) {
      void this.channel.send(towerReadyBroadcast(this.me));
    }
  }

  private readonly onFrame = (timestamp: number): void => {
    if (!this.running || !this.simulationStarted) {
      return;
    }
    const rawDeltaMs = Math.max(0, Math.min(250, timestamp - this.lastTimestamp));
    this.lastTimestamp = timestamp;
    this.accumulatorMs += rawDeltaMs;
    let processed = 0;
    while (this.accumulatorMs >= TOWER_LOCKSTEP_TICK_MS && processed < MAX_STEPS_PER_FRAME) {
      const inputs = this.inputBuffer.takeNextTick();
      if (inputs === null) {
        break;
      }
      this.simulation.step(inputs);
      this.accumulatorMs -= TOWER_LOCKSTEP_TICK_MS;
      processed += 1;
      const canonicalSnapshot = this.simulation.createSnapshot();
      if (canonicalSnapshot.tick % FINGERPRINT_INTERVAL_TICKS === 0) {
        this.publishFingerprint(canonicalSnapshot);
      }
      const snapshot = personalizeState(canonicalSnapshot, this.me);
      for (const listener of this.listeners) {
        listener(snapshot);
      }
    }
    this.frameHandle = requestAnimationFrame(this.onFrame);
  };

  private publishFingerprint(state: TowerGameState): void {
    const fingerprint = createTowerStateFingerprint(state);
    for (const result of this.fingerprintMonitor.recordLocal(state.tick, fingerprint)) {
      this.handleFingerprintResult(result);
    }
    if (this.channelReady) {
      const payload: TowerFingerprintMessage = { senderId: this.me, tick: state.tick, fingerprint };
      void this.channel.send(towerFingerprintBroadcast(payload));
    }
  }

  private handleFingerprintResult(result: FingerprintResult): void {
    if (result.status === 'mismatch') {
      this.reportIssue(
        `Désynchronisation Tower détectée au tick ${result.tick} avec ${result.playerId}. La partie ne peut pas être resynchronisée automatiquement.`,
      );
    }
  }

  private reportMissingReadyPlayers(): void {
    if (!this.running || this.simulationStarted) {
      return;
    }
    const names = this.barrier.missingIds.map(
      (id) => this.roster.find((entry) => entry.id === id)?.name ?? id,
    );
    this.reportIssue(
      `Démarrage Tower en attente après ${START_BARRIER_TIMEOUT_MS / 1_000} s : ${names.join(', ')} n'est pas prêt ou abonné.`,
    );
  }

  private reportIssue(message: string): void {
    if (this.connectionIssue === message) {
      return;
    }
    this.connectionIssue = message;
    console.error(`[tower:lockstep] ${message}`);
    for (const listener of this.issueListeners) {
      listener(message);
    }
  }
}

/** Crée une simulation locale identique sur chaque pair du roster. */
export function createTowerCoopSession(config: TowerCoopConfig): TowerRenderableSession {
  validateCoopConfig(config);
  console.info(
    `[tower] lockstep P2P · canal=tower:${config.code} · moi=${config.me} · hôte lobby=${config.hostId}`,
  );
  return new TowerLockstepSession(config);
}
