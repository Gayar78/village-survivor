import {
  TOWER_GLOBAL_DEFENSE_OFFERS,
  TOWER_TURRET_MODULES,
  TOWER_TURRET_SUPER_MODULES,
  TOWER_TURRET_TARGET_PRIORITIES,
  TOWER_WEAPONS,
} from '@village-survivor/content';
import { TowerSimulation } from '@village-survivor/game-core';
import type {
  MetaBuildModifiers,
  TowerActionMessage,
  TowerCommandRejectionCode,
  TowerControlMessage,
  TowerEvent,
  TowerGameState,
  TowerInput,
  TowerRoomPhase,
} from '@village-survivor/protocol';

const CONTROL_LIMIT_PER_SECOND = 30;
const ACTION_LIMIT_PER_SECOND = 10;
const MAX_PENDING_ACTIONS = 16;
const MAX_REMEMBERED_ACTION_IDS = 256;
const MAX_ACTION_ID_LENGTH = 128;
const MAX_ACTION_VALUE_LENGTH = 256;
const MAX_AIM_COMPONENT = 1_000_000;
export const CONTROL_HOLD_MS = 250;

const VALID_WEAPONS = new Set<string>(TOWER_WEAPONS.map(({ id }) => id));
const VALID_MODULES = new Set<string>([
  ...TOWER_TURRET_MODULES.map(({ id }) => `module:${id}`),
  ...TOWER_TURRET_SUPER_MODULES.map(({ id }) => `module:${id}`),
]);
const VALID_PRIORITIES = new Set<string>(
  TOWER_TURRET_TARGET_PRIORITIES.map(({ id }) => `priority:${id}`),
);
const VALID_GLOBAL_OFFERS = new Set<string>(
  TOWER_GLOBAL_DEFENSE_OFFERS.map(({ id }) => `global:${id}`),
);
const VALID_SHOP_ACTIONS = new Set<string>([
  'repair',
  'dmg',
  'range',
  'rate',
  'hp',
  'energy',
  'maxenergy',
  ...VALID_MODULES,
  ...VALID_PRIORITIES,
  ...VALID_GLOBAL_OFFERS,
]);

export type CommandSubmission =
  Readonly<{ accepted: true }> | Readonly<{ accepted: false; code: TowerCommandRejectionCode }>;

interface PlayerCommands {
  lastSequence: number;
  lastControl?: TowerControlMessage;
  lastControlAtMs: number;
  controlTimesMs: number[];
  actionTimesMs: number[];
  actionQueue: TowerActionMessage[];
  rememberedActionIds: Set<string>;
  rememberedActionOrder: string[];
}

export interface TowerRoomRuntimeOptions {
  seed: string;
  expectedUserIds: readonly string[];
  metaBuildsByPlayerId: Readonly<Record<string, MetaBuildModifiers>>;
}

function isFiniteBounded(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

function pruneRateWindow(timestamps: number[], nowMs: number): void {
  while (timestamps[0] !== undefined && timestamps[0] <= nowMs - 1_000) timestamps.shift();
}

function validActionId(actionId: unknown): actionId is string {
  return (
    typeof actionId === 'string' && actionId.length > 0 && actionId.length <= MAX_ACTION_ID_LENGTH
  );
}

function hasOnlyKeys(value: object, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validAction(action: unknown): action is TowerActionMessage {
  if (
    typeof action !== 'object' ||
    action === null ||
    !('type' in action) ||
    !('actionId' in action)
  ) {
    return false;
  }
  const candidate = action as Partial<TowerActionMessage> & Record<string, unknown>;
  if (!validActionId(candidate.actionId)) return false;
  if (candidate.type === 'level') {
    return (
      hasOnlyKeys(action, new Set(['type', 'actionId', 'offerId'])) &&
      typeof candidate.offerId === 'string' &&
      candidate.offerId.length > 0 &&
      candidate.offerId.length <= MAX_ACTION_VALUE_LENGTH
    );
  }
  if (candidate.type === 'weapon') {
    return (
      hasOnlyKeys(action, new Set(['type', 'actionId', 'weaponId'])) &&
      typeof candidate.weaponId === 'string' &&
      VALID_WEAPONS.has(candidate.weaponId)
    );
  }
  return (
    candidate.type === 'shop' &&
    hasOnlyKeys(action, new Set(['type', 'actionId', 'turret', 'action'])) &&
    (candidate.turret === 'N' ||
      candidate.turret === 'E' ||
      candidate.turret === 'S' ||
      candidate.turret === 'W') &&
    typeof candidate.action === 'string' &&
    VALID_SHOP_ACTIONS.has(candidate.action)
  );
}

function actionToInput(action: TowerActionMessage): Partial<TowerInput> {
  if (action.type === 'level') {
    return { discreteActionId: action.actionId, selectUpgradeId: action.offerId };
  }
  if (action.type === 'weapon') {
    return { discreteActionId: action.actionId, selectUpgradeId: `weapon:${action.weaponId}` };
  }
  return {
    discreteActionId: action.actionId,
    turretShop: { turret: action.turret, action: action.action },
  };
}

/** Frontière d'autorité pure, testable sans socket ni horloge de room. */
export class TowerRoomRuntime {
  private readonly simulation: TowerSimulation;
  private readonly expectedUserIds: readonly string[];
  private readonly commandsByUserId = new Map<string, PlayerCommands>();
  private phaseValue: TowerRoomPhase = 'waiting';

  public constructor(options: TowerRoomRuntimeOptions) {
    if (
      options.expectedUserIds.length === 0 ||
      new Set(options.expectedUserIds).size !== options.expectedUserIds.length
    ) {
      throw new Error('Le roster réservé doit contenir des identités uniques.');
    }
    this.expectedUserIds = [...options.expectedUserIds];
    this.simulation = new TowerSimulation(options.seed, {
      playerIds: this.expectedUserIds,
      metaBuildsByPlayerId: options.metaBuildsByPlayerId,
    });
  }

  public get phase(): TowerRoomPhase {
    return this.phaseValue;
  }

  public get admittedCount(): number {
    return this.commandsByUserId.size;
  }

  public isExpected(userId: string): boolean {
    return this.expectedUserIds.includes(userId);
  }

  public isAdmitted(userId: string): boolean {
    return this.commandsByUserId.has(userId);
  }

  public admit(userId: string, nowMs: number): boolean {
    if (this.phaseValue !== 'waiting' || !this.isExpected(userId) || this.isAdmitted(userId)) {
      return false;
    }
    this.commandsByUserId.set(userId, {
      lastSequence: -1,
      lastControlAtMs: nowMs,
      controlTimesMs: [],
      actionTimesMs: [],
      actionQueue: [],
      rememberedActionIds: new Set<string>(),
      rememberedActionOrder: [],
    });
    if (this.commandsByUserId.size === this.expectedUserIds.length) {
      this.phaseValue = 'running';
      this.simulation.start();
    }
    return true;
  }

  public abandon(): void {
    if (this.phaseValue === 'waiting' || this.phaseValue === 'running')
      this.phaseValue = 'abandoned';
  }

  public submitControl(userId: string, message: unknown, nowMs: number): CommandSubmission {
    const commands = this.commandsByUserId.get(userId);
    if (commands === undefined) return { accepted: false, code: 'malformed' };
    if (
      typeof message !== 'object' ||
      message === null ||
      !('sequence' in message) ||
      !Number.isSafeInteger(message.sequence) ||
      !isFiniteBounded((message as Record<string, unknown>).moveX, -1, 1) ||
      !isFiniteBounded((message as Record<string, unknown>).moveY, -1, 1) ||
      !isFiniteBounded(
        (message as Record<string, unknown>).aimX,
        -MAX_AIM_COMPONENT,
        MAX_AIM_COMPONENT,
      ) ||
      !isFiniteBounded(
        (message as Record<string, unknown>).aimY,
        -MAX_AIM_COMPONENT,
        MAX_AIM_COMPONENT,
      ) ||
      ('fire' in message && typeof message.fire !== 'boolean') ||
      ('turretWorkshopOpen' in message && typeof message.turretWorkshopOpen !== 'boolean') ||
      !hasOnlyKeys(
        message,
        new Set(['sequence', 'moveX', 'moveY', 'aimX', 'aimY', 'fire', 'turretWorkshopOpen']),
      )
    ) {
      return { accepted: false, code: 'malformed' };
    }
    const control = message as TowerControlMessage;
    if (control.sequence <= commands.lastSequence) {
      return { accepted: false, code: 'stale-sequence' };
    }
    pruneRateWindow(commands.controlTimesMs, nowMs);
    if (commands.controlTimesMs.length >= CONTROL_LIMIT_PER_SECOND) {
      return { accepted: false, code: 'rate-limited' };
    }
    commands.controlTimesMs.push(nowMs);
    commands.lastSequence = control.sequence;
    commands.lastControl = control;
    commands.lastControlAtMs = nowMs;
    return { accepted: true };
  }

  public submitAction(userId: string, message: unknown, nowMs: number): CommandSubmission {
    const commands = this.commandsByUserId.get(userId);
    if (commands === undefined || !validAction(message)) {
      return { accepted: false, code: 'malformed' };
    }
    if (commands.rememberedActionIds.has(message.actionId)) {
      return { accepted: false, code: 'duplicate-action' };
    }
    pruneRateWindow(commands.actionTimesMs, nowMs);
    if (commands.actionTimesMs.length >= ACTION_LIMIT_PER_SECOND) {
      return { accepted: false, code: 'rate-limited' };
    }
    if (commands.actionQueue.length >= MAX_PENDING_ACTIONS) {
      return { accepted: false, code: 'queue-full' };
    }
    commands.actionTimesMs.push(nowMs);
    commands.actionQueue.push(message);
    commands.rememberedActionIds.add(message.actionId);
    commands.rememberedActionOrder.push(message.actionId);
    const forgotten =
      commands.rememberedActionOrder.length > MAX_REMEMBERED_ACTION_IDS
        ? commands.rememberedActionOrder.shift()
        : undefined;
    if (forgotten !== undefined) commands.rememberedActionIds.delete(forgotten);
    return { accepted: true };
  }

  public step(nowMs: number): Readonly<{ state: TowerGameState; events: readonly TowerEvent[] }> {
    if (this.phaseValue === 'running') {
      const inputs: Record<string, TowerInput> = {};
      for (const userId of this.expectedUserIds) {
        const commands = this.commandsByUserId.get(userId);
        if (commands === undefined) continue;
        const current =
          commands.lastControl !== undefined && nowMs - commands.lastControlAtMs <= CONTROL_HOLD_MS
            ? commands.lastControl
            : undefined;
        const action = commands.actionQueue.shift();
        inputs[userId] = {
          sequence: commands.lastSequence,
          moveX: current?.moveX ?? 0,
          moveY: current?.moveY ?? 0,
          aimX: current?.aimX ?? 0,
          aimY: current?.aimY ?? 0,
          ...(current?.fire === true ? { fire: true } : {}),
          ...(current?.turretWorkshopOpen === true ? { turretWorkshopOpen: true } : {}),
          ...(action === undefined ? {} : actionToInput(action)),
        };
      }
      this.simulation.step(inputs);
    }
    const state = this.simulation.createSnapshot();
    if (state.status === 'defeat') this.phaseValue = 'defeat';
    return { state, events: state.events };
  }

  public snapshot(): TowerGameState {
    return this.simulation.createSnapshot();
  }
}
