import { createTowerStateFingerprint, TowerSimulation } from '@village-survivor/game-core';
import type {
  MetaBuildModifiers,
  TowerGameState,
  TowerInput,
  TowerRosterEvent,
  TowerSession,
} from '@village-survivor/protocol';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../account/supabaseClient.js';
import { HUB_CAPACITY } from '../hub/types.js';

/** Doit correspondre au tick fixe interne de TowerSimulation. */
export const TOWER_LOCKSTEP_TICK_MS = 50;
export const TOWER_INPUT_DELAY_TICKS = 2;
export const TOWER_INPUT_BATCH_TICKS = 12;
export const TOWER_MAX_INPUT_BATCH_TICKS = 16;
const MAX_FUTURE_INPUT_TICKS = 240;
const MAX_INPUT_PACKET_BYTES = 16_384;
const MAX_CONTROL_PACKET_BYTES = 4_096;
const MAX_HISTORY_PACKET_BYTES = 16_384;
const MAX_HISTORY_CHUNK_TICKS = 24;
/**
 * Profondeur de l'historique d'entrées conservé pour une reconnexion, en ticks de 50 ms.
 *
 * Une reconnexion rejoue la partie depuis le tick 0 : c'est le seul mécanisme disponible, faute
 * d'instantané de l'état interne de la simulation. Passé ce plafond, les ticks les plus anciens
 * sont écartés et toute reconnexion devient définitivement impossible — le pair qui revient
 * reçoit `history-unavailable` et reste dehors.
 *
 * À 12 000 ticks, ce couperet tombait au bout de dix minutes, dans un jeu de survie sans fin
 * conçu pour durer : toute déconnexion un peu tardive était sans retour. La fenêtre passe à
 * vingt minutes.
 *
 * Trois coûts la bornent, et il faut les tenir ensemble :
 *
 * 1. **mémoire** — environ 620 octets par tick à quatre joueurs, soit à peu près 15 Mo retenus
 *    en fin de fenêtre, dans un onglet qui porte déjà le moteur de rendu ;
 * 2. **temps de rejeu** — le pair qui revient rejoue toute la fenêtre sur le fil principal,
 *    soit de l'ordre de 4 secondes ici ;
 * 3. **avance de réintégration** — ce rejeu doit tenir dans les `REJOIN_EVENT_LEAD_TICKS`
 *    (12 secondes) accordés avant l'entrée effective, sinon le revenant arrive en retard et
 *    diverge. C'est cette contrainte, et non la mémoire, qui interdit d'aller beaucoup plus loin.
 *
 * Le correctif de fond est ailleurs : des instantanés périodiques de l'état de simulation
 * rendraient le rejeu proportionnel au temps écoulé depuis le dernier point de reprise, et non
 * au début de la partie. Il est consigné comme dette dans la feuille de route.
 */
const MAX_HISTORY_TICKS = 24_000;
const ROSTER_EVENT_LEAD_TICKS = TOWER_INPUT_BATCH_TICKS + TOWER_INPUT_DELAY_TICKS;
const REJOIN_EVENT_LEAD_TICKS = MAX_FUTURE_INPUT_TICKS;
const PEER_TIMEOUT_MS = 5_000;
const PEER_HEARTBEAT_MS = 1_000;
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
  heartbeat: 'heartbeat',
  leaveRequest: 'leave-request',
  rosterControl: 'roster-control',
  historyRequest: 'history-request',
  historyChunk: 'history-chunk',
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
  /** Effets de méta-build résolus avant lancement, immuables pendant la partie. */
  metaBuildsByPlayerId?: Readonly<Record<string, Partial<MetaBuildModifiers>>>;
  /** Rejoue seed + historique lockstep avant de demander sa réintégration. */
  rejoin?: boolean;
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

export type TowerRosterAction = 'join' | 'leave';

/** Contrôle de roster ordonné ; il ne transporte aucun état de simulation. */
export interface TowerRosterControlEvent {
  eventId: string;
  sequence: number;
  tick: number;
  action: TowerRosterAction;
  playerId: string;
  coordinatorId: string;
  reason: 'requested' | 'peer-timeout' | 'coordinator-timeout' | 'rejoin';
}

export interface TowerRosterControlMessage {
  senderId: string;
  event: TowerRosterControlEvent;
}

export interface TowerHistoryTick {
  tick: number;
  inputs: Readonly<Record<string, TowerInput>>;
  rosterEvents: readonly TowerRosterControlEvent[];
}

export interface TowerHistoryRequestMessage {
  senderId: string;
  targetId: string;
  requestId: string;
  fromTick: number;
}

export interface TowerHistoryChunkMessage {
  senderId: string;
  targetId: string;
  requestId: string;
  chunkIndex: number;
  final: boolean;
  records: readonly TowerHistoryTick[];
  error?: 'history-unavailable';
}

type TowerBroadcast = Readonly<{
  type: 'broadcast';
  event: (typeof TOWER_LOCKSTEP_EVENTS)[keyof typeof TOWER_LOCKSTEP_EVENTS];
  payload:
    | TowerReadyMessage
    | TowerInputBatchMessage
    | TowerFingerprintMessage
    | TowerRosterControlMessage
    | TowerHistoryRequestMessage
    | TowerHistoryChunkMessage
    | Readonly<{ senderId: string; targetId?: string }>;
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
    ...(input.turretWorkshopOpen === true ? { turretWorkshopOpen: true } : {}),
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
    (input.turretWorkshopOpen === undefined || typeof input.turretWorkshopOpen === 'boolean') &&
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

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Élection stable, indépendante de l'ordre d'arrivée des paquets. */
export function electTowerCoordinator(activeIds: ReadonlySet<string>): string | null {
  let elected: string | null = null;
  for (const id of activeIds) {
    if (elected === null || compareIds(id, elected) < 0) {
      elected = id;
    }
  }
  return elected;
}

function isRosterControlEvent(value: unknown): value is TowerRosterControlEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const event = value as Record<string, unknown>;
  return (
    isBoundedNonEmptyString(event.eventId, MAX_ACTION_ID_LENGTH) &&
    Number.isSafeInteger(event.sequence) &&
    (event.sequence as number) > 0 &&
    Number.isSafeInteger(event.tick) &&
    (event.tick as number) >= 0 &&
    (event.action === 'join' || event.action === 'leave') &&
    isBoundedNonEmptyString(event.playerId, MAX_ACTION_ID_LENGTH) &&
    isBoundedNonEmptyString(event.coordinatorId, MAX_ACTION_ID_LENGTH) &&
    (event.reason === 'requested' ||
      event.reason === 'peer-timeout' ||
      event.reason === 'coordinator-timeout' ||
      event.reason === 'rejoin')
  );
}

export type TowerRosterControlResult =
  | Readonly<{ status: 'ignored' | 'pending' }>
  | Readonly<{ status: 'accepted'; events: readonly TowerRosterControlEvent[] }>;

/**
 * Valide l'auteur du contrôle et remet les séquences réseau dans l'ordre. Le
 * coordinateur courant traite les pairs ordinaires ; seul son successeur élu peut
 * prononcer sa sortie après timeout.
 */
export class TowerRosterController {
  private readonly knownIds: ReadonlySet<string>;
  private readonly activeIds: Set<string>;
  private readonly pendingBySequence = new Map<number, TowerRosterControlEvent>();
  private nextSequence = 1;

  public constructor(
    knownIds: ReadonlySet<string>,
    initiallyActive: ReadonlySet<string> = knownIds,
  ) {
    this.knownIds = new Set(knownIds);
    this.activeIds = new Set(initiallyActive);
  }

  public get coordinatorId(): string | null {
    return electTowerCoordinator(this.activeIds);
  }

  public get members(): ReadonlySet<string> {
    return new Set(this.activeIds);
  }

  public get sequence(): number {
    return this.nextSequence;
  }

  public accept(value: unknown, currentTick: number): TowerRosterControlResult {
    if (
      typeof value !== 'object' ||
      value === null ||
      serializedSize(value) > MAX_CONTROL_PACKET_BYTES
    ) {
      return { status: 'ignored' };
    }
    const message = value as { senderId?: unknown; event?: unknown };
    if (typeof message.senderId !== 'string' || !isRosterControlEvent(message.event)) {
      return { status: 'ignored' };
    }
    const event = message.event;
    if (
      message.senderId !== event.coordinatorId ||
      !this.knownIds.has(event.playerId) ||
      event.tick < currentTick ||
      event.tick > currentTick + MAX_FUTURE_INPUT_TICKS ||
      event.sequence < this.nextSequence
    ) {
      return { status: 'ignored' };
    }
    const coordinator = this.coordinatorId;
    const timeoutSuccessor =
      event.reason === 'coordinator-timeout' &&
      event.action === 'leave' &&
      event.playerId === coordinator
        ? electTowerCoordinator(
            new Set([...this.activeIds].filter((playerId) => playerId !== event.playerId)),
          )
        : null;
    if (
      event.coordinatorId !== coordinator &&
      (timeoutSuccessor === null || event.coordinatorId !== timeoutSuccessor)
    ) {
      return { status: 'ignored' };
    }
    const prior = this.pendingBySequence.get(event.sequence);
    if (prior !== undefined) {
      return JSON.stringify(prior) === JSON.stringify(event)
        ? { status: 'ignored' }
        : { status: 'ignored' };
    }
    this.pendingBySequence.set(event.sequence, event);
    const accepted: TowerRosterControlEvent[] = [];
    while (true) {
      const next = this.pendingBySequence.get(this.nextSequence);
      if (next === undefined) {
        break;
      }
      this.pendingBySequence.delete(this.nextSequence);
      accepted.push(next);
      this.nextSequence += 1;
    }
    return accepted.length === 0 ? { status: 'pending' } : { status: 'accepted', events: accepted };
  }

  /** Met à jour l'élection seulement à la frontière de tick certifiée. */
  public apply(event: TowerRosterControlEvent): boolean {
    if (event.action === 'join') {
      if (this.activeIds.has(event.playerId) || this.activeIds.size >= HUB_CAPACITY) {
        return false;
      }
      this.activeIds.add(event.playerId);
      return true;
    }
    if (!this.activeIds.has(event.playerId) || this.activeIds.size <= 1) {
      return false;
    }
    this.activeIds.delete(event.playerId);
    return true;
  }

  /** Restaure le compteur de contrôle pendant un replay depuis le seed. */
  public restoreHistorical(event: TowerRosterControlEvent): readonly TowerRosterControlEvent[] {
    if (event.sequence !== this.nextSequence) {
      return [];
    }
    this.apply(event);
    this.nextSequence += 1;
    const released: TowerRosterControlEvent[] = [];
    while (true) {
      const next = this.pendingBySequence.get(this.nextSequence);
      if (next === undefined) {
        break;
      }
      this.pendingBySequence.delete(this.nextSequence);
      released.push(next);
      this.nextSequence += 1;
    }
    return released;
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

export function towerRosterControlBroadcast(payload: TowerRosterControlMessage): TowerBroadcast {
  return { type: 'broadcast', event: TOWER_LOCKSTEP_EVENTS.rosterControl, payload };
}

export function towerHistoryRequestBroadcast(payload: TowerHistoryRequestMessage): TowerBroadcast {
  return { type: 'broadcast', event: TOWER_LOCKSTEP_EVENTS.historyRequest, payload };
}

export function towerHistoryChunkBroadcast(payload: TowerHistoryChunkMessage): TowerBroadcast {
  return { type: 'broadcast', event: TOWER_LOCKSTEP_EVENTS.historyChunk, payload };
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
  private readonly knownRosterIds: ReadonlySet<string>;
  private readonly activeRosterIds: Set<string>;
  private readonly framesByTick = new Map<number, Map<string, TowerInput>>();
  private readonly scheduledRosterEvents = new Map<number, TowerRosterControlEvent[]>();
  private readonly rememberedRosterEventIds = new Set<string>();
  private appliedRosterEvents: readonly TowerRosterControlEvent[] = [];
  private simulationTick = 0;

  public constructor(
    rosterIds: ReadonlySet<string>,
    initiallyActive: ReadonlySet<string> = rosterIds,
  ) {
    this.knownRosterIds = new Set(rosterIds);
    this.activeRosterIds = new Set(initiallyActive);
  }

  public get nextTick(): number {
    return this.simulationTick;
  }

  public get activeIds(): ReadonlySet<string> {
    return new Set(this.activeRosterIds);
  }

  /** Utilisé après un replay intégral depuis le tick zéro, jamais après un snapshot. */
  public advanceTo(tick: number): boolean {
    if (!Number.isSafeInteger(tick) || tick < this.simulationTick) {
      return false;
    }
    this.simulationTick = tick;
    for (const bufferedTick of this.framesByTick.keys()) {
      if (bufferedTick < tick) {
        this.framesByTick.delete(bufferedTick);
      }
    }
    return true;
  }

  public applyHistoricalRosterEvent(event: TowerRosterControlEvent): boolean {
    if (!this.knownRosterIds.has(event.playerId)) {
      return false;
    }
    if (event.action === 'join') {
      this.activeRosterIds.add(event.playerId);
    } else if (this.activeRosterIds.size > 1) {
      this.activeRosterIds.delete(event.playerId);
    }
    return true;
  }

  /**
   * Programme une mutation déjà authentifiée par le contrôleur. Une sortie
   * autorise des frames neutres jusqu'à sa frontière afin qu'un crash ne bloque pas
   * justement le tick auquel tous les pairs doivent retirer le joueur.
   */
  public scheduleRosterEvent(event: TowerRosterControlEvent): boolean {
    if (
      !this.knownRosterIds.has(event.playerId) ||
      event.tick < this.simulationTick ||
      this.rememberedRosterEventIds.has(event.eventId)
    ) {
      return false;
    }
    this.rememberedRosterEventIds.add(event.eventId);
    const events = this.scheduledRosterEvents.get(event.tick) ?? [];
    events.push(event);
    events.sort((a, b) => a.sequence - b.sequence || compareIds(a.eventId, b.eventId));
    this.scheduledRosterEvents.set(event.tick, events);
    if (event.action === 'leave' && this.activeRosterIds.has(event.playerId)) {
      for (let tick = this.simulationTick; tick < event.tick; tick += 1) {
        let frames = this.framesByTick.get(tick);
        if (frames === undefined) {
          frames = new Map<string, TowerInput>();
          this.framesByTick.set(tick, frames);
        }
        if (!frames.has(event.playerId)) {
          frames.set(event.playerId, idleInput());
        }
      }
    }
    return true;
  }

  public takeAppliedRosterEvents(): readonly TowerRosterControlEvent[] {
    const events = this.appliedRosterEvents;
    this.appliedRosterEvents = [];
    return events;
  }

  public acceptBatch(value: unknown): number {
    const batch = parseTowerInputBatch(
      value,
      this.knownRosterIds,
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
    this.applyScheduledRosterEvents();
    const tickFrames = this.framesByTick.get(this.simulationTick);
    if (tickFrames === undefined) {
      return null;
    }
    const result: Record<string, TowerInput> = {};
    for (const id of this.activeRosterIds) {
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

  private applyScheduledRosterEvents(): void {
    const events = this.scheduledRosterEvents.get(this.simulationTick) ?? [];
    if (events.length === 0) {
      return;
    }
    const applied: TowerRosterControlEvent[] = [];
    for (const event of events) {
      if (event.action === 'join') {
        if (!this.activeRosterIds.has(event.playerId)) {
          this.activeRosterIds.add(event.playerId);
          applied.push(event);
        }
      } else if (this.activeRosterIds.has(event.playerId) && this.activeRosterIds.size > 1) {
        this.activeRosterIds.delete(event.playerId);
        applied.push(event);
      }
    }
    this.scheduledRosterEvents.delete(this.simulationTick);
    this.appliedRosterEvents = applied;
  }
}

function isHistoryTick(
  value: unknown,
  expectedTick: number,
  knownIds: ReadonlySet<string>,
): value is TowerHistoryTick {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as { tick?: unknown; inputs?: unknown; rosterEvents?: unknown };
  if (
    record.tick !== expectedTick ||
    typeof record.inputs !== 'object' ||
    record.inputs === null ||
    Array.isArray(record.inputs) ||
    !Array.isArray(record.rosterEvents) ||
    record.rosterEvents.length > HUB_CAPACITY
  ) {
    return false;
  }
  for (const [playerId, input] of Object.entries(record.inputs)) {
    if (!knownIds.has(playerId) || !isValidTowerInput(input)) {
      return false;
    }
  }
  return record.rosterEvents.every(
    (event) =>
      isRosterControlEvent(event) && event.tick === expectedTick && knownIds.has(event.playerId),
  );
}

/** Historique borné seed-compatible : entrées et contrôles uniquement. */
export class TowerLockstepHistory {
  private readonly records: TowerHistoryTick[] = [];

  public append(record: TowerHistoryTick): boolean {
    const expectedTick = this.records.at(-1)?.tick;
    if (expectedTick !== undefined && record.tick !== expectedTick + 1) {
      return false;
    }
    this.records.push(record);
    if (this.records.length > MAX_HISTORY_TICKS) {
      this.records.shift();
    }
    return true;
  }

  public get oldestTick(): number {
    return this.records[0]?.tick ?? 0;
  }

  public get nextTick(): number {
    return (this.records.at(-1)?.tick ?? -1) + 1;
  }

  public chunksFor(
    request: TowerHistoryRequestMessage,
    senderId: string,
  ): TowerHistoryChunkMessage[] | null {
    if (
      request.fromTick < this.oldestTick ||
      request.fromTick > this.nextTick ||
      request.senderId !== request.targetId
    ) {
      return null;
    }
    const requested = this.records.filter((record) => record.tick >= request.fromTick);
    if (requested.length === 0) {
      return [
        {
          senderId,
          targetId: request.targetId,
          requestId: request.requestId,
          chunkIndex: 0,
          final: true,
          records: [],
        },
      ];
    }
    const chunks: TowerHistoryChunkMessage[] = [];
    let offset = 0;
    while (offset < requested.length) {
      let count = Math.min(MAX_HISTORY_CHUNK_TICKS, requested.length - offset);
      let chunk: TowerHistoryChunkMessage;
      do {
        chunk = {
          senderId,
          targetId: request.targetId,
          requestId: request.requestId,
          chunkIndex: chunks.length,
          final: offset + count === requested.length,
          records: requested.slice(offset, offset + count),
        };
        if (serializedSize(chunk) <= MAX_HISTORY_PACKET_BYTES) {
          break;
        }
        count -= 1;
      } while (count > 0);
      if (count === 0) {
        return null;
      }
      chunks.push(chunk);
      offset += count;
    }
    return chunks;
  }
}

export type TowerHistoryAcceptResult =
  | Readonly<{ status: 'ignored' | 'accepted' | 'unavailable' }>
  | Readonly<{ status: 'complete'; records: readonly TowerHistoryTick[] }>;

/** Assemble exclusivement les chunks destinés à cette tentative de rejoin. */
export class TowerRejoinHistoryReceiver {
  private readonly records: TowerHistoryTick[] = [];
  private validationActiveIds: Set<string>;
  private nextChunkIndex = 0;
  private nextTick: number;
  private nextControlSequence = 1;
  private complete = false;

  public constructor(
    private readonly targetId: string,
    private readonly requestId: string,
    private coordinatorId: string | null,
    private readonly knownIds: ReadonlySet<string>,
    fromTick = 0,
  ) {
    this.nextTick = fromTick;
    this.validationActiveIds = new Set(knownIds);
  }

  public accept(value: unknown): TowerHistoryAcceptResult {
    if (
      this.complete ||
      typeof value !== 'object' ||
      value === null ||
      serializedSize(value) > MAX_HISTORY_PACKET_BYTES
    ) {
      return { status: 'ignored' };
    }
    const chunk = value as Partial<TowerHistoryChunkMessage>;
    if (
      typeof chunk.senderId !== 'string' ||
      !this.knownIds.has(chunk.senderId) ||
      (this.coordinatorId !== null && chunk.senderId !== this.coordinatorId) ||
      chunk.targetId !== this.targetId ||
      chunk.requestId !== this.requestId ||
      chunk.chunkIndex !== this.nextChunkIndex ||
      typeof chunk.final !== 'boolean' ||
      !Array.isArray(chunk.records) ||
      chunk.records.length > MAX_HISTORY_CHUNK_TICKS ||
      (!chunk.final && chunk.records.length === 0)
    ) {
      return { status: 'ignored' };
    }
    if (chunk.error === 'history-unavailable') {
      this.complete = true;
      return { status: 'unavailable' };
    }
    if (chunk.error !== undefined) {
      return { status: 'ignored' };
    }
    const chunkCoordinator = this.coordinatorId ?? chunk.senderId;
    const validated: TowerHistoryTick[] = [];
    const activeIds = new Set(this.validationActiveIds);
    let controlSequence = this.nextControlSequence;
    for (const valueRecord of chunk.records) {
      if (!isHistoryTick(valueRecord, this.nextTick + validated.length, this.knownIds)) {
        return { status: 'ignored' };
      }
      for (const event of valueRecord.rosterEvents) {
        const coordinator = electTowerCoordinator(activeIds);
        const timeoutSuccessor =
          event.reason === 'coordinator-timeout' &&
          event.action === 'leave' &&
          event.playerId === coordinator
            ? electTowerCoordinator(
                new Set([...activeIds].filter((playerId) => playerId !== event.playerId)),
              )
            : null;
        if (
          event.sequence !== controlSequence ||
          (event.coordinatorId !== coordinator && event.coordinatorId !== timeoutSuccessor)
        ) {
          return { status: 'ignored' };
        }
        if (event.action === 'join') {
          if (activeIds.has(event.playerId) || activeIds.size >= HUB_CAPACITY) {
            return { status: 'ignored' };
          }
          activeIds.add(event.playerId);
        } else if (activeIds.has(event.playerId) && activeIds.size > 1) {
          activeIds.delete(event.playerId);
        } else {
          return { status: 'ignored' };
        }
        controlSequence += 1;
      }
      const inputIds = Object.keys(valueRecord.inputs).sort(compareIds);
      if (inputIds.join('\0') !== [...activeIds].sort(compareIds).join('\0')) {
        return { status: 'ignored' };
      }
      validated.push(valueRecord);
    }
    if (chunk.final && chunkCoordinator !== electTowerCoordinator(activeIds)) {
      return { status: 'ignored' };
    }
    this.coordinatorId = chunkCoordinator;
    this.validationActiveIds = activeIds;
    this.nextControlSequence = controlSequence;
    this.records.push(...validated);
    this.nextTick += validated.length;
    this.nextChunkIndex += 1;
    if (chunk.final) {
      this.complete = true;
      return { status: 'complete', records: [...this.records] };
    }
    return { status: 'accepted' };
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

  public constructor(options: { seed: string; metaBuild?: Partial<MetaBuildModifiers> }) {
    this.simulation = new TowerSimulation(options.seed, {
      playerIds: ['player-1'],
      ...(options.metaBuild === undefined
        ? {}
        : { metaBuildsByPlayerId: { 'player-1': options.metaBuild } }),
    });
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
  private readonly rejoin: boolean;
  private readonly barrier: TowerReadyBarrier;
  private readonly inputBuffer: TowerLockstepInputBuffer;
  private readonly rosterController: TowerRosterController;
  private readonly history = new TowerLockstepHistory();
  private readonly fingerprintMonitor: TowerFingerprintMonitor;
  private readonly listeners = new Set<(state: TowerGameState) => void>();
  private readonly issueListeners = new Set<(message: string) => void>();
  private readonly localFrames = new Map<number, TowerInput>();
  private readonly pendingActions: DiscreteTowerAction[] = [];
  private readonly rememberedActionIds = new Set<string>();
  private readonly lastSeenByPlayer = new Map<string, number>();
  private readonly scheduledDepartures = new Set<string>();
  private readonly scheduledJoins = new Set<string>();
  private readonly localControlPackets = new Map<string, TowerBroadcast>();
  private latestInput: TowerInput = idleInput();
  private running = false;
  private channelReady = false;
  private simulationStarted = false;
  private frameHandle: number | undefined;
  private readyHandle: number | undefined;
  private inputHandle: number | undefined;
  private barrierTimeoutHandle: number | undefined;
  private heartbeatHandle: number | undefined;
  private lastTimestamp = 0;
  private accumulatorMs = 0;
  private nextLocalTick = 0;
  private connectionIssue: string | undefined;
  private rejoinReceiver: TowerRejoinHistoryReceiver | undefined;
  private rejoinRequestId: string | undefined;

  public constructor(config: TowerCoopConfig) {
    this.me = config.me;
    this.roster = config.roster;
    this.rejoin = config.rejoin === true;
    this.rosterIds = new Set(config.roster.map((entry) => entry.id));
    this.barrier = new TowerReadyBarrier(this.rosterIds);
    this.inputBuffer = new TowerLockstepInputBuffer(this.rosterIds);
    this.rosterController = new TowerRosterController(this.rosterIds);
    this.fingerprintMonitor = new TowerFingerprintMonitor(this.rosterIds, this.me);
    this.simulation = new TowerSimulation(config.seed, {
      playerIds: config.roster.map((entry) => entry.id),
      ...(config.metaBuildsByPlayerId === undefined
        ? {}
        : { metaBuildsByPlayerId: config.metaBuildsByPlayerId }),
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
    this.channel.on<Readonly<{ senderId: string }>>(
      'broadcast',
      { event: TOWER_LOCKSTEP_EVENTS.heartbeat },
      (message) => {
        const senderId = message.payload?.senderId;
        if (typeof senderId === 'string' && this.rosterIds.has(senderId)) {
          this.lastSeenByPlayer.set(senderId, performance.now());
        }
      },
    );
    this.channel.on<Readonly<{ senderId: string; targetId: string }>>(
      'broadcast',
      { event: TOWER_LOCKSTEP_EVENTS.leaveRequest },
      (message) => this.handleLeaveRequest(message.payload),
    );
    this.channel.on<TowerRosterControlMessage>(
      'broadcast',
      { event: TOWER_LOCKSTEP_EVENTS.rosterControl },
      (message) => this.acceptRosterControl(message.payload),
    );
    this.channel.on<TowerHistoryRequestMessage>(
      'broadcast',
      { event: TOWER_LOCKSTEP_EVENTS.historyRequest },
      (message) => this.handleHistoryRequest(message.payload),
    );
    this.channel.on<TowerHistoryChunkMessage>(
      'broadcast',
      { event: TOWER_LOCKSTEP_EVENTS.historyChunk },
      (message) => this.handleHistoryChunk(message.payload),
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
        const now = performance.now();
        for (const id of this.rosterIds) {
          this.lastSeenByPlayer.set(id, now);
        }
        this.heartbeatHandle = window.setInterval(() => {
          this.broadcastHeartbeat();
          this.checkPeerTimeouts();
        }, PEER_HEARTBEAT_MS);
        this.broadcastHeartbeat();
        if (this.rejoin) {
          this.requestRejoinHistory();
          return;
        }
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
    if (this.running && this.channelReady && this.rosterController.members.has(this.me)) {
      await this.requestLocalLeave();
    }
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
    if (this.heartbeatHandle !== undefined) {
      clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = undefined;
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
      const rosterEvents = this.inputBuffer.takeAppliedRosterEvents();
      const historyTick = this.inputBuffer.nextTick - 1;
      for (const event of rosterEvents) {
        this.scheduledDepartures.delete(event.playerId);
        this.scheduledJoins.delete(event.playerId);
        this.localControlPackets.delete(event.eventId);
        this.rosterController.apply(event);
        const simulationEvent: TowerRosterEvent = {
          type: event.action,
          tick: event.tick,
          playerId: event.playerId,
        };
        if (!this.simulation.applyRosterEvent(simulationEvent)) {
          this.reportIssue(
            `Contrôle de roster Tower refusé au tick ${event.tick} pour ${event.playerId}.`,
          );
        }
      }
      this.history.append({ tick: historyTick, inputs, rosterEvents });
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

  private broadcastHeartbeat(): void {
    if (!this.running || !this.channelReady) {
      return;
    }
    void this.channel.send({
      type: 'broadcast',
      event: TOWER_LOCKSTEP_EVENTS.heartbeat,
      payload: { senderId: this.me },
    });
    for (const packet of this.localControlPackets.values()) {
      void this.channel.send(packet);
    }
  }

  private checkPeerTimeouts(): void {
    if (!this.running || !this.simulationStarted) {
      return;
    }
    const coordinator = this.rosterController.coordinatorId;
    if (coordinator === null) {
      return;
    }
    const now = performance.now();
    if (coordinator === this.me) {
      for (const playerId of this.rosterController.members) {
        if (
          playerId !== this.me &&
          !this.scheduledDepartures.has(playerId) &&
          now - (this.lastSeenByPlayer.get(playerId) ?? now) >= PEER_TIMEOUT_MS
        ) {
          this.scheduleAndBroadcastRosterEvent('leave', playerId, 'peer-timeout');
          break;
        }
      }
      return;
    }
    const successor = electTowerCoordinator(
      new Set([...this.rosterController.members].filter((id) => id !== coordinator)),
    );
    if (
      successor === this.me &&
      !this.scheduledDepartures.has(coordinator) &&
      now - (this.lastSeenByPlayer.get(coordinator) ?? now) >= PEER_TIMEOUT_MS
    ) {
      this.scheduleAndBroadcastRosterEvent('leave', coordinator, 'coordinator-timeout');
    }
  }

  private handleLeaveRequest(value: unknown): void {
    if (
      typeof value !== 'object' ||
      value === null ||
      serializedSize(value) > MAX_CONTROL_PACKET_BYTES ||
      this.rosterController.coordinatorId !== this.me
    ) {
      return;
    }
    const request = value as { senderId?: unknown; targetId?: unknown };
    if (
      typeof request.senderId !== 'string' ||
      request.senderId !== request.targetId ||
      !this.rosterController.members.has(request.senderId)
    ) {
      return;
    }
    this.scheduleAndBroadcastRosterEvent('leave', request.senderId, 'requested');
  }

  private async requestLocalLeave(): Promise<void> {
    const coordinator = this.rosterController.coordinatorId;
    if (coordinator === null) {
      return;
    }
    if (coordinator === this.me) {
      const packet = this.scheduleAndBroadcastRosterEvent(
        'leave',
        this.me,
        'requested',
        ROSTER_EVENT_LEAD_TICKS,
        false,
      );
      if (packet !== null) {
        await this.channel.send(packet);
      }
      return;
    }
    await this.channel.send({
      type: 'broadcast',
      event: TOWER_LOCKSTEP_EVENTS.leaveRequest,
      payload: { senderId: this.me, targetId: this.me },
    });
  }

  private scheduleAndBroadcastRosterEvent(
    action: TowerRosterAction,
    playerId: string,
    reason: TowerRosterControlEvent['reason'],
    leadTicks = ROSTER_EVENT_LEAD_TICKS,
    broadcast = true,
  ): TowerBroadcast | null {
    if (
      (action === 'leave' && this.scheduledDepartures.has(playerId)) ||
      (action === 'join' && this.scheduledJoins.has(playerId)) ||
      !this.rosterIds.has(playerId)
    ) {
      return null;
    }
    const sequence = this.rosterController.sequence;
    const event: TowerRosterControlEvent = {
      eventId: `${this.me}:${sequence}:${action}:${playerId}`,
      sequence,
      tick: this.inputBuffer.nextTick + leadTicks,
      action,
      playerId,
      coordinatorId: this.me,
      reason,
    };
    const packet = towerRosterControlBroadcast({ senderId: this.me, event });
    this.acceptRosterControl(packet.payload);
    this.localControlPackets.set(event.eventId, packet);
    if (action === 'leave') {
      this.scheduledDepartures.add(playerId);
    } else {
      this.scheduledJoins.add(playerId);
    }
    if (broadcast) {
      void this.channel.send(packet);
    }
    return packet;
  }

  private acceptRosterControl(value: unknown): void {
    let controlTick = this.inputBuffer.nextTick;
    if (this.rejoin && !this.simulationStarted && typeof value === 'object' && value !== null) {
      const tick = (value as { event?: { tick?: unknown } }).event?.tick;
      if (Number.isSafeInteger(tick)) {
        controlTick = tick as number;
      }
    }
    const result = this.rosterController.accept(value, controlTick);
    if (result.status !== 'accepted') {
      return;
    }
    for (const event of result.events) {
      this.inputBuffer.scheduleRosterEvent(event);
    }
  }

  private requestRejoinHistory(): void {
    const requestId = `${this.me}:rejoin:1`;
    this.rejoinRequestId = requestId;
    this.rejoinReceiver = new TowerRejoinHistoryReceiver(this.me, requestId, null, this.rosterIds);
    this.reportIssue("Reconnexion Tower : téléchargement de l'historique déterministe…");
    const payload: TowerHistoryRequestMessage = {
      senderId: this.me,
      targetId: this.me,
      requestId,
      fromTick: 0,
    };
    void this.channel.send(towerHistoryRequestBroadcast(payload));
  }

  private handleHistoryRequest(value: unknown): void {
    if (
      this.rosterController.coordinatorId !== this.me ||
      typeof value !== 'object' ||
      value === null ||
      serializedSize(value) > MAX_CONTROL_PACKET_BYTES
    ) {
      return;
    }
    const request = value as Partial<TowerHistoryRequestMessage>;
    if (
      typeof request.senderId !== 'string' ||
      request.senderId !== request.targetId ||
      !this.rosterIds.has(request.senderId) ||
      !isBoundedNonEmptyString(request.requestId, MAX_ACTION_ID_LENGTH) ||
      !Number.isSafeInteger(request.fromTick) ||
      (request.fromTick as number) < 0
    ) {
      return;
    }
    const validRequest = request as TowerHistoryRequestMessage;
    const chunks = this.history.chunksFor(validRequest, this.me);
    if (chunks === null) {
      const unavailable: TowerHistoryChunkMessage = {
        senderId: this.me,
        targetId: validRequest.targetId,
        requestId: validRequest.requestId,
        chunkIndex: 0,
        final: true,
        records: [],
        error: 'history-unavailable',
      };
      void this.channel.send(towerHistoryChunkBroadcast(unavailable));
      return;
    }
    for (const chunk of chunks) {
      void this.channel.send(towerHistoryChunkBroadcast(chunk));
    }
    if (!this.rosterController.members.has(validRequest.targetId)) {
      this.scheduleAndBroadcastRosterEvent(
        'join',
        validRequest.targetId,
        'rejoin',
        REJOIN_EVENT_LEAD_TICKS,
      );
    }
  }

  private handleHistoryChunk(value: unknown): void {
    if (!this.rejoin || this.rejoinReceiver === undefined || this.rejoinRequestId === undefined) {
      return;
    }
    const result = this.rejoinReceiver.accept(value);
    if (result.status === 'unavailable') {
      this.reportIssue(
        "Reconnexion Tower impossible : l'historique depuis le tick 0 a expiré. La partie des autres joueurs continue.",
      );
      return;
    }
    if (result.status !== 'complete') {
      return;
    }
    this.replayHistory(result.records);
  }

  private replayHistory(records: readonly TowerHistoryTick[]): void {
    if (this.simulationStarted) {
      return;
    }
    this.simulation.start();
    for (const record of records) {
      for (const event of record.rosterEvents) {
        const released = this.rosterController.restoreHistorical(event);
        this.inputBuffer.applyHistoricalRosterEvent(event);
        this.simulation.applyRosterEvent({
          type: event.action,
          tick: event.tick,
          playerId: event.playerId,
        });
        for (const futureEvent of released) {
          this.inputBuffer.scheduleRosterEvent(futureEvent);
        }
      }
      this.simulation.step(record.inputs);
    }
    const replayedUntil = records.at(-1)?.tick;
    this.inputBuffer.advanceTo(replayedUntil === undefined ? 0 : replayedUntil + 1);
    this.simulationStarted = true;
    this.nextLocalTick = this.inputBuffer.nextTick + TOWER_INPUT_DELAY_TICKS;
    this.captureNextLocalFrame();
    this.inputHandle = window.setInterval(
      () => this.captureNextLocalFrame(),
      TOWER_LOCKSTEP_TICK_MS,
    );
    this.lastTimestamp = performance.now();
    this.accumulatorMs = TOWER_LOCKSTEP_TICK_MS * MAX_STEPS_PER_FRAME;
    this.frameHandle = requestAnimationFrame(this.onFrame);
    this.reportIssue(
      `Reconnexion Tower : ${records.length} ticks rejoués, rattrapage accéléré en cours…`,
    );
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
