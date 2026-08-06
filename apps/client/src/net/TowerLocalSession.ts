import { TowerSimulation } from '@village-survivor/game-core';
import type {
  MetaBuildModifiers,
  MetaModifierKey,
  TowerGameState,
  TowerInput,
  Vector2,
} from '@village-survivor/protocol';

import type { TowerRenderableSession } from './TowerRenderableSession.js';

const TOWER_TICK_MS = 50;
const MAX_STEPS_PER_FRAME = 240;
const MAX_PENDING_ACTIONS = 16;
const MAX_REMEMBERED_ACTION_IDS = 256;

export const TOWER_SOLO_META_BUILD_KEY = 'vs-solo-meta-build';
export const TOWER_LOCAL_MODE_NOTICE = 'Mode local — progression non enregistrée';

const SOLO_META_BUILD_MIN = 0.5;
const SOLO_META_BUILD_MAX = 2;
const SOLO_META_BUILD_KEYS: readonly MetaModifierKey[] = [
  'damageMultiplier',
  'fireRateMultiplier',
  'moveSpeedMultiplier',
  'maxHealthMultiplier',
  'heartMaxHealthMultiplier',
  'pickupRadiusMultiplier',
];

type PendingTowerAction = Readonly<
  Pick<TowerInput, 'discreteActionId' | 'selectUpgradeId' | 'turretShop'>
>;
type MutableMetaBuild = { -readonly [Key in MetaModifierKey]?: number };

function idleInput(): TowerInput {
  return { sequence: 0, moveX: 0, moveY: 0, aimX: 1, aimY: 0 };
}

/** Retire les actions ponctuelles après leur premier tick, tout en conservant le contrôle continu. */
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

function isMetaModifierKey(key: string): key is MetaModifierKey {
  return SOLO_META_BUILD_KEYS.includes(key as MetaModifierKey);
}

/** Ferme les clés et applique les mêmes bornes que la simulation autoritaire. */
export function sanitizeSoloMetaBuild(value: unknown): Partial<MetaBuildModifiers> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const result: MutableMetaBuild = {};
  for (const [key, modifier] of Object.entries(value)) {
    if (!isMetaModifierKey(key) || typeof modifier !== 'number' || !Number.isFinite(modifier)) {
      return undefined;
    }
    result[key] = Math.max(SOLO_META_BUILD_MIN, Math.min(SOLO_META_BUILD_MAX, modifier));
  }
  return result;
}

/**
 * Simulation solo autonome utilisée quand aucun serveur de jeu n'est déployé.
 *
 * Elle partage exactement TowerSimulation avec le serveur autoritaire. Seule la frontière
 * réseau disparaît : les entrées du joueur sont appliquées au prochain tick fixe de 50 ms.
 */
export class TowerLocalSession implements TowerRenderableSession {
  private readonly simulation: TowerSimulation;
  private readonly listeners = new Set<(state: TowerGameState) => void>();
  private readonly connectionListeners = new Set<(message: string, terminal?: boolean) => void>();
  private readonly pendingActions: PendingTowerAction[] = [];
  private readonly rememberedActionIds = new Set<string>();
  private readonly rememberedActionOrder: string[] = [];
  private currentInput: TowerInput = idleInput();
  private nextActionId = 0;
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
    if (this.running) return;
    this.running = true;
    this.simulation.start();
    this.lastTimestamp = performance.now();
    this.emitConnectionIssue(TOWER_LOCAL_MODE_NOTICE);
    this.frameHandle = requestAnimationFrame(this.onFrame);
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.frameHandle !== undefined) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = undefined;
    }
    this.listeners.clear();
    this.connectionListeners.clear();
    this.pendingActions.length = 0;
  }

  public sendInput(input: TowerInput): void {
    this.currentInput = persistentInput(input);
    this.queueDiscreteAction(input);
  }

  public getRenderAlpha(): number {
    return Math.max(0, Math.min(1, this.accumulatorMs / TOWER_TICK_MS));
  }

  public getLocalRenderPosition(): Vector2 | undefined {
    return undefined;
  }

  public onConnectionIssue(listener: (message: string, terminal?: boolean) => void): () => void {
    this.connectionListeners.add(listener);
    if (this.running) listener(TOWER_LOCAL_MODE_NOTICE);
    return () => this.connectionListeners.delete(listener);
  }

  public subscribe(listener: (state: TowerGameState) => void): () => void {
    this.listeners.add(listener);
    listener(this.simulation.createSnapshot());
    return () => this.listeners.delete(listener);
  }

  private readonly onFrame = (timestamp: number): void => {
    if (!this.running) return;
    const deltaMs = Math.max(0, Math.min(250, timestamp - this.lastTimestamp));
    this.lastTimestamp = timestamp;
    this.accumulatorMs += deltaMs;
    let processed = 0;
    while (this.accumulatorMs >= TOWER_TICK_MS && processed < MAX_STEPS_PER_FRAME) {
      const action = this.pendingActions.shift();
      this.simulation.step({
        'player-1': action === undefined ? this.currentInput : { ...this.currentInput, ...action },
      });
      this.accumulatorMs -= TOWER_TICK_MS;
      processed += 1;
    }
    if (processed > 0) {
      const snapshot = this.simulation.createSnapshot();
      for (const listener of this.listeners) listener(snapshot);
    }
    this.frameHandle = requestAnimationFrame(this.onFrame);
  };

  private queueDiscreteAction(input: TowerInput): void {
    if (input.selectUpgradeId === undefined && input.turretShop === undefined) return;
    const actionId = input.discreteActionId ?? this.createActionId();
    if (
      this.rememberedActionIds.has(actionId) ||
      this.pendingActions.length >= MAX_PENDING_ACTIONS
    ) {
      return;
    }
    this.rememberActionId(actionId);
    this.pendingActions.push({
      discreteActionId: actionId,
      ...(input.selectUpgradeId === undefined ? {} : { selectUpgradeId: input.selectUpgradeId }),
      ...(input.turretShop === undefined ? {} : { turretShop: input.turretShop }),
    });
  }

  private createActionId(): string {
    this.nextActionId += 1;
    return `local-action-${this.nextActionId}`;
  }

  private rememberActionId(actionId: string): void {
    this.rememberedActionIds.add(actionId);
    this.rememberedActionOrder.push(actionId);
    const forgotten =
      this.rememberedActionOrder.length > MAX_REMEMBERED_ACTION_IDS
        ? this.rememberedActionOrder.shift()
        : undefined;
    if (forgotten !== undefined) this.rememberedActionIds.delete(forgotten);
  }

  private emitConnectionIssue(message: string): void {
    for (const listener of this.connectionListeners) listener(message);
  }
}
