import { defaultContent, type GameContent } from '@village-survivor/content';
import { GameSimulation } from '@village-survivor/game-core';
import type {
  EnemyKind,
  GameEvent,
  GameSession,
  PlayerInput,
  PublicGameState,
  Vector2,
} from '@village-survivor/protocol';

export interface FrameScheduler {
  now(): number;
  request(callback: (timestamp: number) => void): number;
  cancel(handle: number): void;
}

export interface LocalSessionOptions {
  seed?: string;
  content?: GameContent;
  scheduler?: FrameScheduler;
  /**
   * Nombre de joueurs de la partie co-op (chaque joueur exécute sa propre
   * instance déterministe). Sert à renforcer les vagues d'ennemis. Par
   * défaut 1 (comportement solo inchangé). Clampé à [1, 10] par `GameSimulation`.
   */
  playerCount?: number;
}

export interface VillageSurvivorDebug {
  getState(): PublicGameState;
  getMetrics(): Readonly<{
    lastTickDurationMs: number;
    gameSpeed: number;
    paused: boolean;
  }>;
  setGameSpeed(multiplier: number): void;
  pause(): void;
  resume(): void;
  spawnEnemy(kind?: EnemyKind): string;
  damagePlayer(amount: number): void;
  giveExperience(amount: number): void;
  giveResources(amount: number): void;
  teleportPlayer(position: Vector2): void;
  defeatEnemy(enemyId: string): void;
  defeatAllAssailants(): void;
  skipToNight(): void;
  forceFinalWave(): void;
  advance(milliseconds: number): PublicGameState;
}

/**
 * Plafond du tampon d'événements. Il n'est atteignable qu'après une frame très
 * longue ou une avance de débogage : on conserve alors les plus récents, pour que
 * le rendu ne rejoue pas d'un coup plusieurs minutes d'effets.
 */
const MAX_PENDING_EVENTS = 240;

const browserScheduler: FrameScheduler = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

function idleInput(sequence = 0): PlayerInput {
  return { sequence, moveX: 0, moveY: 0 };
}

function persistentInput(input: PlayerInput): PlayerInput {
  return {
    sequence: input.sequence,
    moveX: input.moveX,
    moveY: input.moveY,
    ...(input.aimX === undefined ? {} : { aimX: input.aimX }),
    ...(input.aimY === undefined ? {} : { aimY: input.aimY }),
  };
}

export class LocalSession implements GameSession {
  private readonly content: GameContent;
  private readonly simulation: GameSimulation;
  private readonly scheduler: FrameScheduler;
  private readonly listeners = new Set<(state: PublicGameState) => void>();
  private currentInput: PlayerInput = idleInput();
  private running = false;
  private paused = false;
  private frameHandle: number | undefined;
  private lastTimestamp = 0;
  private accumulatorMs = 0;
  private gameSpeed = 1;
  private lastTickDurationMs = 0;
  private pendingEvents: GameEvent[] = [];

  public readonly debug: VillageSurvivorDebug;

  public constructor(options: LocalSessionOptions = {}) {
    this.content = options.content ?? defaultContent;
    this.scheduler = options.scheduler ?? browserScheduler;
    this.simulation = new GameSimulation(this.content, options.seed ?? 'm1-default', {
      playerCount: options.playerCount ?? 1,
    });
    this.debug = {
      getState: () => this.simulation.createSnapshot(),
      getMetrics: () => ({
        lastTickDurationMs: this.lastTickDurationMs,
        gameSpeed: this.gameSpeed,
        paused: this.paused,
      }),
      setGameSpeed: (multiplier) => {
        this.gameSpeed = Math.max(0.1, Math.min(30, multiplier));
      },
      pause: () => {
        this.paused = true;
      },
      resume: () => {
        this.paused = false;
        this.lastTimestamp = this.scheduler.now();
      },
      spawnEnemy: (kind = 'raider') => {
        const id = this.simulation.spawnEnemy(kind);
        this.publish();
        return id;
      },
      damagePlayer: (amount) => {
        this.simulation.damagePlayer(amount);
        this.publish();
      },
      giveExperience: (amount) => {
        this.simulation.giveExperience(amount);
        this.publish();
      },
      giveResources: (amount) => {
        this.simulation.giveResources(amount);
        this.publish();
      },
      teleportPlayer: (position) => {
        this.simulation.teleportPlayer(position);
        this.publish();
      },
      defeatEnemy: (enemyId) => {
        this.simulation.defeatEnemy(enemyId);
        this.publish();
      },
      defeatAllAssailants: () => {
        this.simulation.defeatAllAssailants();
        this.publish();
      },
      skipToNight: () => {
        this.simulation.skipToNight();
        this.publish();
      },
      forceFinalWave: () => {
        this.simulation.forceFinalWave();
        this.publish();
      },
      advance: (milliseconds) => this.advance(milliseconds),
    };
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.paused = false;
    this.simulation.start();
    this.lastTimestamp = this.scheduler.now();
    this.publish();
    this.frameHandle = this.scheduler.request(this.onFrame);
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.frameHandle !== undefined) {
      this.scheduler.cancel(this.frameHandle);
      this.frameHandle = undefined;
    }
    this.listeners.clear();
  }

  public sendInput(input: PlayerInput): void {
    const queuedUpgrade = input.selectUpgradeId ?? this.currentInput.selectUpgradeId;
    const queuedDepositSlot = input.depositSlot ?? this.currentInput.depositSlot;
    const queuedWithdrawSlot = input.withdrawSlot ?? this.currentInput.withdrawSlot;
    this.currentInput = {
      sequence: input.sequence,
      moveX: input.moveX,
      moveY: input.moveY,
      ...(input.aimX === undefined ? {} : { aimX: input.aimX }),
      ...(input.aimY === undefined ? {} : { aimY: input.aimY }),
      // `interact` reflète désormais un état continu (bouton maintenu) : on prend
      // toujours la valeur la plus récente, sans la conserver après consommation.
      ...(input.interact === true ? { interact: true } : {}),
      ...(input.buildDefense === true || this.currentInput.buildDefense === true
        ? { buildDefense: true }
        : {}),
      ...(input.activateSword === true || this.currentInput.activateSword === true
        ? { activateSword: true }
        : {}),
      ...(input.activateBarrier === true || this.currentInput.activateBarrier === true
        ? { activateBarrier: true }
        : {}),
      ...(input.activateHeal === true || this.currentInput.activateHeal === true
        ? { activateHeal: true }
        : {}),
      ...(queuedUpgrade === undefined ? {} : { selectUpgradeId: queuedUpgrade }),
      ...(queuedDepositSlot === undefined ? {} : { depositSlot: queuedDepositSlot }),
      ...(queuedWithdrawSlot === undefined ? {} : { withdrawSlot: queuedWithdrawSlot }),
      ...(input.depositAll === true || this.currentInput.depositAll === true
        ? { depositAll: true }
        : {}),
      ...(input.upgradeHeart === true || this.currentInput.upgradeHeart === true
        ? { upgradeHeart: true }
        : {}),
    };
  }

  /**
   * Fraction de progression (0..1) vers le prochain tick de simulation, dérivée
   * de l'accumulateur interne. Sert au rendu à interpoler les positions entre
   * deux ticks pour un déplacement fluide indépendant de la fréquence d'écran.
   */
  public getRenderAlpha(): number {
    return Math.max(0, Math.min(1, this.accumulatorMs / this.content.simulation.tickMs));
  }

  public subscribe(listener: (state: PublicGameState) => void): () => void {
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
    if (!this.paused) {
      this.accumulatorMs += rawDeltaMs * this.gameSpeed;
      let processedTicks = 0;
      while (this.accumulatorMs >= this.content.simulation.tickMs && processedTicks < 240) {
        const tickStartedAt = performance.now();
        this.simulation.step(this.currentInput);
        this.lastTickDurationMs = performance.now() - tickStartedAt;
        this.queueEvents();
        this.currentInput = persistentInput(this.currentInput);
        this.accumulatorMs -= this.content.simulation.tickMs;
        processedTicks += 1;
      }
      if (processedTicks > 0) {
        this.publish();
      }
    }
    this.frameHandle = this.scheduler.request(this.onFrame);
  };

  private advance(milliseconds: number): PublicGameState {
    const ticks = Math.max(0, Math.floor(milliseconds / this.content.simulation.tickMs));
    for (let index = 0; index < ticks; index += 1) {
      const tickStartedAt = performance.now();
      this.simulation.step(this.currentInput);
      this.lastTickDurationMs = performance.now() - tickStartedAt;
      this.queueEvents();
      this.currentInput = persistentInput(this.currentInput);
    }
    return this.publish();
  }

  /**
   * La simulation remplace ses événements à chaque tick alors que la session ne
   * publie qu'une fois par frame : sans cette collecte, une frame traitant
   * plusieurs ticks ne livrerait que les événements du dernier.
   */
  private queueEvents(): void {
    const events = this.simulation.getEvents();
    if (events.length === 0) {
      return;
    }
    this.pendingEvents.push(...events);
    const excess = this.pendingEvents.length - MAX_PENDING_EVENTS;
    if (excess > 0) {
      this.pendingEvents.splice(0, excess);
    }
  }

  private publish(): PublicGameState {
    const snapshot = this.simulation.createSnapshot();
    const state =
      this.pendingEvents.length === 0 ? snapshot : { ...snapshot, events: this.pendingEvents };
    this.pendingEvents = [];
    for (const listener of this.listeners) {
      listener(state);
    }
    return state;
  }
}
