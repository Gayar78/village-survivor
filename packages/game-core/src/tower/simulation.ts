// Moteur de simulation du NOUVEAU jeu Tower / twin-stick (Lot A), host-autoritaire.
//
// `TowerSimulation` fait tourner l'unique simulation : avatars (arme/build PERSONNELS),
// base partagée (Cœur, 4 tourelles, ferraille commune, vagues) et projette le tout dans
// le `TowerGameState` figé du protocole. Déterministe (SeededRandom) pour les tests.

import {
  TOWER_GLOBAL_DEFENSE_OFFERS,
  TOWER_GLOBAL_DEFENSE_ROTATIONS,
  TOWER_ENDGAME_ANNOUNCEMENT_TICKS,
  TOWER_ENDGAME_TIERS,
  TOWER_MERCHANT_ROTATIONS,
  TOWER_ACTIVE_MONSTERS,
  TOWER_NATURAL_MONSTERS,
  TOWER_SHARED_QUESTS,
  TOWER_TIMELANDS_BIOME,
  TOWER_TIMELANDS_MONSTERS,
  TOWER_TURRET_REPAIR_COST_PER_HP,
  TOWER_TURRET_MODULES,
  TOWER_TURRET_SUPER_MODULES,
  TOWER_TURRET_SHOP,
  TOWER_TURRET_TARGET_PRIORITIES,
  TOWER_WEAPONS,
  type TowerWeaponDefinition,
  type TowerMonsterCatalogEntry,
  type TowerMonsterSignature,
} from '@village-survivor/content';
import { TOWER_MAX_ACTIVE_PLAYERS } from '@village-survivor/protocol';
import type {
  HeartState,
  MetaBuildModifiers,
  ProjectileSource,
  TowerBiomeState,
  TowerEvent,
  TowerEventType,
  TowerGameState,
  TowerEndgameActiveTierState,
  TowerEndgameState,
  TowerEndgameTierId,
  TowerGlobalDefenseOfferId,
  TowerInput,
  TowerMonsterAffinity,
  TowerMonsterKind,
  TowerMonsterRarity,
  TowerMonsterState,
  TowerMonsterZoneState,
  TowerPlayerState,
  TowerProjectileState,
  TowerRosterEvent,
  TowerSharedQuestState,
  TowerStatus,
  TowerTemporalEffectState,
  TowerTimelandsArrivalState,
  TowerTimelandsState,
  TowerTimelandsWardenState,
  TowerSuperModuleId,
  TowerUpgradeCard,
  TowerWeaponId,
  TowerWeaponState,
  TurretDir,
  TurretState,
  ScrapPickupState,
  UpgradeRarity,
  Vector2,
} from '@village-survivor/protocol';

import { exactDirectionTo, exactLength, exactRotate, exactUnitFromAngle } from '../exact-math.js';
import { SeededRandom } from '../random.js';
import type {
  MutableHeart,
  MutableScrap,
  MutableTowerMonster,
  MutableTowerMonsterZone,
  MutableTowerPlayer,
  MutableTowerProjectile,
  MutableTurret,
} from './state.js';
import {
  AVATAR_START_SPACING,
  BIOME_DURATION_WAVES,
  BURN,
  CONTACT_COOLDOWN_MS,
  CRIT_SLOW,
  CONTACT_MARGIN,
  DOWNED_DURATION_MS,
  EXPLODE_ON_KILL,
  GOLD_PER_KILL_FACTOR,
  HEART,
  KAMIKAZE_EXPLOSION,
  MONSTER_PLAYER_AGGRO_RANGE,
  MONSTER_AFFINITY_TRAITS,
  MONSTER_RARITY_MODIFIERS,
  MONSTERS,
  minimumWaveForMonster,
  minimumDistinctMonsterKindsForWave,
  monsterPowerTier,
  monsterThreatBudgetScale,
  MULTISHOT_SPREAD_RAD,
  PLAYER,
  SCRAP_LIFETIME_TICKS,
  TICK_MS,
  TIMELANDS_START_WAVE,
  TOWER_BIOMES,
  TOWER_MONSTER_POWER_TIERS,
  TURRET,
  TURRET_ANGLES,
  TURRET_SHOP_EFFECTS,
  TURRET_SHOP_RANGE,
  UPGRADE_CHOICE_COUNT,
  UPGRADE_RARITY_WEIGHTS,
  WAVE,
  WAVE_BOSS_SCHEDULE,
  WAVE_MONSTER_COST,
  WAVE_RARITY_RULES,
  wavePowerMix,
  waveThreatLimit,
  type TowerMonsterPowerTier,
  type TowerWaveThreatBand,
  WORLD,
  XP_BASE,
  XP_GROWTH,
  XP_PER_KILL_FACTOR,
} from './tuning.js';
import { getUpgradeById, getUpgradesByRarity } from './upgrades.js';
import { monsterBehaviorProfile } from './monster-behaviors.js';

const NEUTRAL_INPUT: TowerInput = { sequence: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0 };

const TURRET_DIRS: readonly TurretDir[] = ['N', 'E', 'S', 'W'];

const MONSTER_CATALOG_BY_ID = new Map(
  TOWER_ACTIVE_MONSTERS.map((monster) => [monster.id, monster] as const),
);

const ORDINARY_MONSTER_KINDS: readonly TowerMonsterKind[] = TOWER_NATURAL_MONSTERS.filter(
  (monster) => monster.faction !== 'timelands',
).map((monster) => monster.id as TowerMonsterKind);
const TIMELANDS_MONSTER_KINDS = TOWER_TIMELANDS_MONSTERS.filter(
  (monster) => monster.spawnWeight > 0 && monster.id !== 'time-deer',
).map((monster) => monster.id);

const MAX_ACTIVE_MONSTERS_SOLO = 70;
const MAX_ACTIVE_MONSTERS_PER_EXTRA_PLAYER = 10;
export const HOSTILE_SLOW_DURATION_MS = 2_000;
const HOSTILE_SLOW_SPEED_SCALE = 0.55;
/** Les trois statistiques d'une fusion suivent la même limite relative. */
const MERGE_STAT_CAP_MULTIPLIER = 1.6;
const COPIED_PLAYER_BUFF_DURATION_MS = 3_200;

type TemporalHistoryFrame = Readonly<{
  tick: number;
  players: readonly Readonly<{
    id: string;
    position: Vector2;
    hp: number;
    downedRemainingMs: number;
  }>[];
  heartHp: number;
  turrets: readonly Readonly<{
    dir: TurretDir;
    hp: number;
    energy: number;
    alive: boolean;
  }>[];
  monsterPositions: readonly Readonly<{ id: string; position: Vector2 }>[];
}>;

const WEAPON_ACTION_PREFIX = 'weapon:';
const MODULE_ACTION_PREFIX = 'module:';
const PRIORITY_ACTION_PREFIX = 'priority:';
const GLOBAL_ACTION_PREFIX = 'global:';

const TURRET_MODULE_CATALOG = Object.freeze([
  ...TOWER_TURRET_MODULES,
  ...TOWER_TURRET_SUPER_MODULES,
]);

const NEUTRAL_META_BUILD: MetaBuildModifiers = {
  damageMultiplier: 1,
  fireRateMultiplier: 1,
  moveSpeedMultiplier: 1,
  maxHealthMultiplier: 1,
  heartMaxHealthMultiplier: 1,
  pickupRadiusMultiplier: 1,
};

export interface TowerSimulationOptions {
  playerIds?: readonly string[];
  /** Effets résolus et figés avant le lancement, indexés par id de joueur. */
  metaBuildsByPlayerId?: Readonly<Record<string, Partial<MetaBuildModifiers>>>;
}

function weaponDefinition(id: TowerWeaponId): TowerWeaponDefinition {
  const definition = TOWER_WEAPONS.find((candidate) => candidate.id === id);
  if (definition === undefined) {
    throw new Error(`Arme Tower inconnue : ${id}`);
  }
  return definition;
}

const UPGRADE_RARITIES: readonly UpgradeRarity[] = [
  'common',
  'rare',
  'epic',
  'legendary',
  'mythic',
  'divin',
];

function distance(a: Vector2, b: Vector2): number {
  return exactLength(a.x - b.x, a.y - b.y);
}

/**
 * Facteur de mouvement partagé par le pas autoritaire et la prédiction locale.
 * Le ralentissement hostile s'ajoute aux effets temporels, sans dupliquer la règle.
 */
export function playerMovementScale(temporalScale: number, hostileSlowRemainingMs: number): number {
  return temporalScale * (hostileSlowRemainingMs > 0 ? HOSTILE_SLOW_SPEED_SCALE : 1);
}

/**
 * Vecteurs unitaires exacts des quatre orientations de tourelle.
 *
 * Les angles cardinaux ont des cosinus et sinus entiers : les écrire directement évite tout
 * calcul, donc toute possibilité de divergence entre navigateurs.
 */
const TURRET_AXIS: Readonly<Record<TurretDir, Vector2>> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

/** Convertit des degrés en radians ; la constante est un littéral, donc lue à l'identique. */
function toRadians(degrees: number): number {
  return (degrees * 3.141592653589793) / 180;
}

/**
 * Fraction du segment `[from, to]` à laquelle il entre en contact avec le cercle décrit par
 * `centre` et `radius`, ou `undefined` s'il n'y a pas de contact.
 *
 * Ne tester que la position d'arrivée laisserait les projectiles rapides traverser leurs cibles :
 * à 950 unités par seconde et 20 ticks par seconde, une balle avance de 47,5 unités par tick,
 * soit bien plus que les 12 unités de contact d'un coureur. Le tir de précision ratait donc
 * régulièrement ce qu'il touchait visiblement.
 *
 * Résolution exacte de |from + t·(to − from) − centre|² = radius², puis conservation de la
 * première racine si elle tombe dans le segment. N'utilise que des opérations IEEE-754 exactes,
 * ce qui préserve la reproductibilité de la simulation autoritaire et de ses tests.
 */
function segmentCircleEntry(
  from: Vector2,
  to: Vector2,
  centre: Vector2,
  radius: number,
): number | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const fx = from.x - centre.x;
  const fy = from.y - centre.y;

  const startsInside = fx * fx + fy * fy <= radius * radius;
  if (startsInside) {
    return 0;
  }

  const a = dx * dx + dy * dy;
  if (a === 0) {
    return undefined;
  }
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return undefined;
  }
  const entry = (-b - Math.sqrt(discriminant)) / (2 * a);
  return entry >= 0 && entry <= 1 ? entry : undefined;
}

function distanceToSegment(point: Vector2, start: Vector2, end: Vector2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) return distance(point, start);
  const progress = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    0,
    1,
  );
  return distance(point, { x: start.x + dx * progress, y: start.y + dy * progress });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Règle de déplacement d'un avatar, pour une entrée et une durée.
 *
 * Elle est isolée ici parce qu'elle a **deux** appelants : le pas de simulation, qui fait
 * autorité, et `projectPlayerPosition`, qui projette la position de rendu de l'avatar local.
 * Les deux doivent produire exactement le même chemin, sinon la prédiction dériverait de l'état
 * qu'elle anticipe et l'avatar sauterait à chaque rattrapage. Une seule règle, un seul code.
 */
function movedPlayerPosition(
  position: Vector2,
  input: TowerInput,
  speed: number,
  deltaSeconds: number,
): Vector2 {
  let dx = input.moveX;
  let dy = input.moveY;
  const length = exactLength(dx, dy);
  if (length > 1) {
    dx /= length;
    dy /= length;
  }
  const next = {
    x: position.x + dx * speed * deltaSeconds,
    y: position.y + dy * speed * deltaSeconds,
  };
  return {
    x: clamp(next.x, -WORLD.bound, WORLD.bound),
    y: clamp(next.y, -WORLD.bound, WORLD.bound),
  };
}

function stableNumber(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function timelandsMonsterDefinition(kind: TowerMonsterKind) {
  return TOWER_TIMELANDS_MONSTERS.find((definition) => definition.id === kind);
}

function normalizeMetaBuild(value: Partial<MetaBuildModifiers> | undefined): MetaBuildModifiers {
  const result = { ...NEUTRAL_META_BUILD };
  for (const key of Object.keys(result) as Array<keyof MetaBuildModifiers>) {
    const modifier = value?.[key];
    if (typeof modifier === 'number' && Number.isFinite(modifier)) {
      result[key] = clamp(modifier, 0.5, 2);
    }
  }
  return result;
}

/**
 * Résout un biome uniquement depuis la seed et la vague, sans dépendre du nombre de
 * monstres tirés. Chaque nouveau cycle choisit l'un des trois autres biomes : une
 * transition visible est donc garantie à la frontière de cycle.
 */
function biomeForSeedAndWave(seed: string, wave: number): TowerBiomeState {
  const biomeCount = TOWER_BIOMES.length;
  if (biomeCount === 0) {
    throw new Error('Le catalogue Tower requiert au moins un biome.');
  }
  const cycle = Math.floor(Math.max(0, wave - 1) / BIOME_DURATION_WAVES);
  let biomeIndex = new SeededRandom(`${seed}:biome:0`).integer(0, biomeCount - 1);
  for (let index = 1; index <= cycle; index += 1) {
    const offset = new SeededRandom(`${seed}:biome:${index}`).integer(1, biomeCount - 1);
    biomeIndex = (biomeIndex + offset) % biomeCount;
  }
  const biome = TOWER_BIOMES[biomeIndex];
  if (biome === undefined) {
    throw new Error(`Biome Tower introuvable à l'index ${biomeIndex}.`);
  }
  return {
    ...biome,
    cycle,
    startsAtWave: cycle * BIOME_DURATION_WAVES + 1,
    durationWaves: BIOME_DURATION_WAVES,
  };
}

export class TowerSimulation {
  private readonly random: SeededRandom;
  private readonly upgradeRandom: SeededRandom;
  private readonly combatRandom: SeededRandom;
  /** Flux isolé pour raretés/affinités : aucun tir de loot ou de combat ne le décale. */
  private readonly worldRandom: SeededRandom;
  private readonly seed: string;

  private readonly players: MutableTowerPlayer[];
  private readonly playerIds: string[];
  private readonly metaBuildsByPlayerId: Readonly<Record<string, MetaBuildModifiers>>;
  private readonly heart: MutableHeart;
  private readonly turrets: MutableTurret[];
  private readonly monsters: MutableTowerMonster[] = [];
  private readonly monsterZones: MutableTowerMonsterZone[] = [];
  private readonly projectiles: MutableTowerProjectile[] = [];
  private readonly scraps: MutableScrap[] = [];
  private readonly globalDefenseUpgrades: Array<{
    id: TowerGlobalDefenseOfferId;
    level: number;
  }> = TOWER_GLOBAL_DEFENSE_OFFERS.map((offer) => ({ id: offer.id, level: 0 }));

  private status: TowerStatus = 'ready';
  private tick = 0;
  private elapsedMs = 0;
  private wave = 0;
  private scrapFund = 0;
  private sharedQuestProgress = 0;
  private sharedQuestCompletedCount = 0;
  /** Ids fiables déjà consommés, isolés par joueur pour éviter toute double dépense. */
  private readonly processedTurretShopActionIds = new Map<string, Set<string>>();

  private monsterCounter = 0;
  private monsterZoneCounter = 0;
  private projectileCounter = 0;
  private scrapCounter = 0;
  private offerCounter = 0;
  private eventCounter = 0;
  private temporalEffectCounter = 0;
  private events: TowerEvent[] = [];

  private timelandsArrival: TowerTimelandsArrivalState = { status: 'pending' };
  private timelandsWarden: TowerTimelandsWardenState = { status: 'not-spawned' };
  private temporalEffects: TowerTemporalEffectState[] = [];
  private endgameStartedAtTick: number | null = null;
  private endgameActiveTiers: TowerEndgameActiveTierState[] = [];
  private endgameAnnouncement: TowerEndgameState['announcement'] = null;
  private readonly temporalHistory: TemporalHistoryFrame[] = [];

  private waveTimerMs = 0;

  public constructor(seed: string, options?: TowerSimulationOptions) {
    this.seed = seed;
    this.random = new SeededRandom(seed);
    this.upgradeRandom = new SeededRandom(`${seed}:upgrades`);
    this.combatRandom = new SeededRandom(`${seed}:combat`);
    this.worldRandom = new SeededRandom(`${seed}:world`);
    this.playerIds = TowerSimulation.resolvePlayerIds(options);
    this.metaBuildsByPlayerId = TowerSimulation.resolveMetaBuilds(options, this.playerIds);
    this.players = this.playerIds.map((id, index) => this.createPlayer(id, index));
    const heartMultiplier = Math.max(
      ...this.playerIds.map((id) => this.metaBuildsByPlayerId[id]?.heartMaxHealthMultiplier ?? 1),
    );
    this.heart = {
      position: { x: 0, y: 0 },
      hp: Math.round(HEART.hp * heartMultiplier),
      maxHp: Math.round(HEART.hp * heartMultiplier),
      radius: HEART.radius,
    };
    this.turrets = TURRET_DIRS.map((dir) => this.createTurret(dir));
  }

  private static resolvePlayerIds(options?: TowerSimulationOptions): string[] {
    const requested = options?.playerIds;
    if (requested !== undefined && requested.length > 0) {
      const uniqueIds: string[] = [];
      for (const requestedId of requested) {
        const id = String(requestedId);
        if (id.length === 0 || uniqueIds.includes(id)) {
          continue;
        }
        uniqueIds.push(id);
        if (uniqueIds.length >= TOWER_MAX_ACTIVE_PLAYERS) {
          break;
        }
      }
      if (uniqueIds.length > 0) {
        return uniqueIds;
      }
    }
    return ['player-1'];
  }

  private static resolveMetaBuilds(
    options: TowerSimulationOptions | undefined,
    playerIds: readonly string[],
  ): Readonly<Record<string, MetaBuildModifiers>> {
    const builds: Record<string, MetaBuildModifiers> = {};
    for (const playerId of playerIds) {
      builds[playerId] = normalizeMetaBuild(options?.metaBuildsByPlayerId?.[playerId]);
    }
    return builds;
  }

  private createPlayer(id: string, index: number): MutableTowerPlayer {
    const offset = (index - (this.playerIds.length - 1) / 2) * AVATAR_START_SPACING;
    const meta = this.metaBuildsByPlayerId[id] ?? NEUTRAL_META_BUILD;
    const maxHp = Math.round(PLAYER.maxHp * meta.maxHealthMultiplier);
    return {
      id,
      position: { x: offset, y: HEART.radius + PLAYER.radius + 60 },
      aim: { x: 0, y: -1 },
      hp: maxHp,
      maxHp,
      level: 1,
      experience: 0,
      experienceToNext: xpForLevel(1),
      gold: 0,
      pendingUpgrades: 0,
      upgradeChoices: [],
      downedRemainingMs: 0,
      hostileSlowRemainingMs: 0,
      turretWorkshopOpen: false,
      activeWeaponId: 'rifle',
      weapons: TOWER_WEAPONS.map((weapon) => ({
        id: weapon.id,
        level: 1,
        damageMultiplier: 1,
        fireRateMultiplier: 1,
        spreadMultiplier: 1,
        pierceBonus: 0,
        fireCooldownRemaining: 0,
      })),
      speed: PLAYER.speed * meta.moveSpeedMultiplier,
      pickupRadius: PLAYER.pickupRadius * meta.pickupRadiusMultiplier,
      fireRate: PLAYER.fireRate / meta.fireRateMultiplier,
      fireCooldownRemaining: 0,
      bulletDamage: PLAYER.bulletDamage * meta.damageMultiplier,
      bulletSpeed: PLAYER.bulletSpeed,
      bulletRange: PLAYER.bulletRange,
      bulletRadius: PLAYER.bulletRadius,
      critChance: PLAYER.critChance,
      critMult: PLAYER.critMult,
      pierce: 0,
      bounce: 0,
      multishotChance: 0,
      burnStacks: 0,
      auraDps: 0,
      auraRadius: 0,
      lifestealPct: 0,
      bulletSpeedBonusApplied: false,
      explodeOnKill: false,
      growingBullet: 0,
      critSlowStacks: 0,
    };
  }

  private createTurret(dir: TurretDir): MutableTurret {
    const angle = TURRET_ANGLES[dir];
    const axis = TURRET_AXIS[dir];
    return {
      dir,
      position: { x: axis.x * TURRET.offset, y: axis.y * TURRET.offset },
      angle,
      hp: TURRET.hp,
      maxHp: TURRET.hp,
      energy: TURRET.maxEnergy,
      maxEnergy: TURRET.maxEnergy,
      energyRegen: TURRET.energyRegen,
      range: TURRET.range,
      bulletDamage: TURRET.bulletDamage,
      bulletSpeed: TURRET.bulletSpeed,
      bulletRange: TURRET.bulletRange,
      bulletRadius: TURRET.bulletRadius,
      halfArcDeg: TURRET.halfArcDeg,
      fireRate: TURRET.fireRate,
      fireCooldownRemaining: 0,
      alive: true,
      modules: [],
      targetPriority: 'nearest',
      pierce: 0,
    };
  }

  public start(): void {
    if (this.status === 'ready') {
      this.status = 'running';
    }
  }

  /**
   * Applique une mutation de roster à la frontière de tick courante.
   *
   * Le réseau choisit la frontière dans `event.tick`. Une transition dupliquée,
   * invalide, tardive ou anticipée est un no-op et renvoie `false`. Les arrivées
   * sont ajoutées en fin de roster ; aucun avatar existant n'est réordonné.
   */
  public applyRosterEvent(event: TowerRosterEvent): boolean {
    if (
      this.status === 'defeat' ||
      !Number.isSafeInteger(event.tick) ||
      event.tick < 0 ||
      event.tick !== this.tick ||
      event.playerId.length === 0
    ) {
      return false;
    }

    const existingIndex = this.playerIds.indexOf(event.playerId);
    if (event.type === 'join') {
      if (existingIndex >= 0 || this.players.length >= TOWER_MAX_ACTIVE_PLAYERS) {
        return false;
      }
      const player = this.createPlayer(event.playerId, this.players.length);
      this.playerIds.push(event.playerId);
      this.players.push(player);
      return true;
    }

    // TowerGameState.player reste toujours défini : une session conserve au moins
    // un avatar actif jusqu'à sa fermeture par la couche réseau.
    if (existingIndex < 0 || this.players.length <= 1) {
      return false;
    }
    this.playerIds.splice(existingIndex, 1);
    this.players.splice(existingIndex, 1);
    return true;
  }

  public step(inputsById: Readonly<Record<string, TowerInput>>): void {
    this.events = [];
    if (this.status !== 'running') {
      return;
    }

    const deltaMs = TICK_MS;
    const deltaSeconds = deltaMs / 1_000;
    this.tick += 1;
    this.elapsedMs += deltaMs;
    this.updateTemporalTimeline();

    const entries = this.players.map((player, index) => ({
      player,
      input: inputsById[this.playerIds[index] ?? ''] ?? NEUTRAL_INPUT,
    }));

    for (const { player, input } of entries) {
      // Entrée persistante : elle est remplacée à chaque tick autoritaire. La portée,
      // l'état du joueur et celui de la tourelle restent validés dynamiquement.
      player.turretWorkshopOpen = input.turretWorkshopOpen === true;
      this.updateDownedState(player, deltaMs);
      player.hostileSlowRemainingMs = Math.max(0, player.hostileSlowRemainingMs - deltaMs);
      if (player.downedRemainingMs > 0) {
        continue;
      }
      const temporalScale = this.temporalScaleForPlayer(player.id);
      if (temporalScale <= 0) {
        player.turretWorkshopOpen = false;
        continue;
      }
      this.updatePlayerMovement(
        player,
        input,
        deltaSeconds * playerMovementScale(temporalScale, player.hostileSlowRemainingMs),
      );
      this.updatePlayerAim(player, input);
      this.updatePlayerFiring(player, input, deltaSeconds * temporalScale);
      this.applyPlayerAura(player, deltaSeconds * temporalScale);
    }

    this.updateTurrets(deltaSeconds);
    this.updateProjectiles(deltaSeconds);
    this.updateMonsters(deltaMs, deltaSeconds);
    this.updateMonsterZones(deltaMs);
    this.updateScrapPickup();
    this.updateScrapExpiration();
    this.removeDeadMonsters();

    this.updateWaves(deltaMs);

    for (const { player, input } of entries) {
      if (this.temporalScaleForPlayer(player.id) <= 0) {
        continue;
      }
      this.handleWeaponSelection(player, input);
      this.handleTurretShop(player, input);
      this.handleUpgradeSelection(player, input);
    }

    this.checkDefeat();
    this.captureTemporalHistory();
  }

  /** Transition publique idempotente, aussi utilisee par la frontiere de vague canonique. */
  public enterTimelands(): void {
    if (this.timelandsArrival.status !== 'pending') {
      return;
    }
    const arrivedAtTick = this.tick;
    this.timelandsArrival = {
      status: 'announcing',
      arrivedAtTick,
      announcementEndsAtTick: arrivedAtTick + TOWER_TIMELANDS_BIOME.arrivalAnnouncementTicks,
    };
    this.endgameStartedAtTick = arrivedAtTick;
    for (const monster of this.monsters) {
      if (
        monster.hp > 0 &&
        (this.monsterCatalog(monster.kind)?.faction !== 'timelands' ||
          this.monsterCatalog(monster.kind) === undefined)
      ) {
        monster.temporal = { status: 'frozen' };
        monster.burnRemainingMs = 0;
        monster.burnStacks = 0;
      }
    }

    const angle = new SeededRandom(`${this.seed}:timelands:warden`).between(0, Math.PI * 2);
    const direction = exactUnitFromAngle(angle);
    const radius = WORLD.spawnZoneRadius * WAVE.ringMaxFactor;
    const wardenId = this.spawnMonsterWithPower(
      'time-warden',
      { x: stableNumber(direction.x * radius), y: stableNumber(direction.y * radius) },
      1,
      'boss',
      'time',
    );
    const mechanic = timelandsMonsterDefinition('time-warden')?.mechanic;
    if (mechanic?.kind !== 'warden-control') {
      throw new Error('Le catalogue Timelands requiert le controle du Warden.');
    }
    this.timelandsWarden = {
      status: 'active',
      monsterId: wardenId,
      nextReleaseAtTick: arrivedAtTick + mechanic.releaseIntervalTicks,
      releasedMonsterIds: [],
      lowHpRelocationUsed: false,
    };
    this.addEvent('timelands-arrived', {});
    this.activateEndgameTiers();
    this.captureTemporalHistory(true);
  }

  private updateTemporalTimeline(): void {
    this.temporalEffects = this.temporalEffects.filter(
      (effect) => effect.expiresAtTick > this.tick,
    );
    if (
      this.timelandsArrival.status === 'announcing' &&
      this.tick >= this.timelandsArrival.announcementEndsAtTick
    ) {
      this.timelandsArrival = {
        status: 'active',
        arrivedAtTick: this.timelandsArrival.arrivedAtTick,
      };
    }
    if (this.endgameAnnouncement !== null && this.tick >= this.endgameAnnouncement.endsAtTick) {
      this.endgameAnnouncement = null;
    }
    this.activateEndgameTiers();
    this.releaseWardenPrisoners();
  }

  private activateEndgameTiers(): void {
    if (this.endgameStartedAtTick === null) {
      return;
    }
    const elapsed = this.tick - this.endgameStartedAtTick;
    for (const tier of TOWER_ENDGAME_TIERS) {
      if (
        elapsed < tier.triggerOffsetTicks ||
        this.endgameActiveTiers.some((active) => active.id === tier.id)
      ) {
        continue;
      }
      this.endgameActiveTiers.push({ id: tier.id, activatedAtTick: this.tick });
      this.endgameAnnouncement = {
        tierId: tier.id,
        endsAtTick: this.tick + TOWER_ENDGAME_ANNOUNCEMENT_TICKS,
      };
      this.addEvent('endgame-tier-activated', { amount: tier.id });
    }
  }

  private releaseWardenPrisoners(): void {
    if (this.timelandsWarden.status !== 'active') {
      return;
    }
    const definition = timelandsMonsterDefinition('time-warden');
    if (definition?.mechanic.kind !== 'warden-control') {
      return;
    }
    while (this.tick >= this.timelandsWarden.nextReleaseAtTick) {
      const frozen = this.monsters.filter(
        (monster) => monster.hp > 0 && this.isFrozenMonster(monster),
      );
      const releasedIds: string[] = [...this.timelandsWarden.releasedMonsterIds];
      for (let index = 0; index < definition.mechanic.releaseCount; index += 1) {
        const monster = frozen[index];
        if (monster === undefined) {
          break;
        }
        const alteration =
          definition.mechanic.alterations[
            releasedIds.length % definition.mechanic.alterations.length
          ] ?? 'slow';
        monster.temporal = {
          status: 'warden-controlled',
          wardenMonsterId: this.timelandsWarden.monsterId,
          alteration,
        };
        if (alteration === 'blink') {
          monster.position = this.deterministicEscapePosition(monster.id, this.tick);
        }
        releasedIds.push(monster.id);
      }
      this.timelandsWarden = {
        ...this.timelandsWarden,
        nextReleaseAtTick:
          this.timelandsWarden.nextReleaseAtTick + definition.mechanic.releaseIntervalTicks,
        releasedMonsterIds: releasedIds,
      };
    }
  }

  private isFrozenMonster(monster: MutableTowerMonster): boolean {
    return monster.temporal?.status === 'frozen';
  }

  private temporalScaleForMonster(monster: MutableTowerMonster): number {
    let scale = 1;
    for (const effect of this.temporalEffects) {
      if (effect.scope === 'global') {
        scale *= effect.scale;
      }
    }
    if (monster.temporal?.status === 'warden-controlled') {
      if (monster.temporal.alteration === 'slow') {
        scale *= 0.5;
      } else if (monster.temporal.alteration === 'haste') {
        scale *= 1.5;
      }
    }
    return stableNumber(scale);
  }

  private temporalScaleForPlayer(playerId: string, atTick = this.tick): number {
    let scale = 1;
    for (const effect of this.temporalEffects) {
      if (
        effect.expiresAtTick > atTick &&
        effect.scope === 'player' &&
        effect.playerId === playerId
      ) {
        scale *= effect.scale;
      }
    }
    return stableNumber(scale);
  }

  private addTemporalEffect(
    kind: 'slow' | 'haste' | 'freeze',
    scale: number,
    durationTicks: number,
    sourceMonsterId: string | null,
    playerId?: string,
  ): void {
    this.temporalEffectCounter += 1;
    const common = {
      id: this.temporalEffectCounter,
      kind,
      scale,
      activatedAtTick: this.tick,
      expiresAtTick: this.tick + durationTicks,
      sourceMonsterId,
    } as const;
    this.temporalEffects.push(
      playerId === undefined
        ? { ...common, scope: 'global' }
        : { ...common, scope: 'player', playerId },
    );
  }

  private updateTimelandsMonsterBehavior(monster: MutableTowerMonster): void {
    const definition = timelandsMonsterDefinition(monster.kind);
    if (definition?.mechanic.kind !== 'deer-escape') {
      return;
    }
    const ordinal = Number(monster.id.split('-').at(-1)) || 0;
    if ((this.tick + ordinal) % definition.mechanic.teleportCooldownTicks !== 0) {
      return;
    }
    const danger = this.findNearestLivingPlayer(
      monster.position,
      definition.mechanic.minimumTeleportDistance,
    );
    if (danger !== undefined) {
      monster.position = this.deterministicEscapePosition(monster.id, this.tick);
    }
  }

  private deterministicEscapePosition(monsterId: string, tick: number): Vector2 {
    const random = new SeededRandom(`${this.seed}:temporal-position:${monsterId}:${tick}`);
    const angle = random.between(0, Math.PI * 2);
    const direction = exactUnitFromAngle(angle);
    const radius = random.between(WORLD.spawnZoneRadius * 0.7, WORLD.spawnZoneRadius * 0.95);
    return {
      x: stableNumber(direction.x * radius),
      y: stableNumber(direction.y * radius),
    };
  }

  private applyControllerStrike(monster: MutableTowerMonster, player: MutableTowerPlayer): void {
    const definition = timelandsMonsterDefinition('time-controller');
    if (definition?.mechanic.kind !== 'controller-strike') {
      return;
    }
    this.damagePlayer(player, monster.contactDamage);
    this.addTemporalEffect(
      'freeze',
      0,
      definition.mechanic.freezeDurationTicks,
      monster.id,
      player.id,
    );
    if (definition.mechanic.vanishAfterHit) {
      monster.hp = 0;
    }
  }

  private afterMonsterDamaged(monster: MutableTowerMonster, beforeHp: number): void {
    const definition = timelandsMonsterDefinition(monster.kind);
    if (definition?.mechanic.kind === 'controller-strike') {
      const ordinal = Number(monster.id.split('-').at(-1)) || 0;
      const canRollback = (this.tick + ordinal) % definition.mechanic.rollbackCooldownTicks === 0;
      const roll = new SeededRandom(
        `${this.seed}:controller-rollback:${monster.id}:${this.tick}`,
      ).next();
      if (canRollback && roll < definition.mechanic.rollbackChance) {
        const frame = this.historyFrameAtOrBefore(
          this.tick - definition.mechanic.rollbackCooldownTicks,
        );
        const previous = frame?.monsterPositions.find((entry) => entry.id === monster.id);
        if (previous !== undefined) {
          monster.position = { ...previous.position };
        }
      }
    }
    if (
      monster.kind !== 'time-warden' ||
      this.timelandsWarden.status !== 'active' ||
      this.timelandsWarden.lowHpRelocationUsed
    ) {
      return;
    }
    const mechanic = timelandsMonsterDefinition('time-warden')?.mechanic;
    if (
      mechanic?.kind === 'warden-control' &&
      beforeHp / monster.maxHp > mechanic.lowHpRelocationThreshold &&
      monster.hp / monster.maxHp <= mechanic.lowHpRelocationThreshold
    ) {
      monster.position = this.deterministicEscapePosition(monster.id, this.tick);
      this.timelandsWarden = { ...this.timelandsWarden, lowHpRelocationUsed: true };
    }
  }

  private captureTemporalHistory(force = false): void {
    if (
      this.timelandsArrival.status === 'pending' ||
      (!force && this.tick % TOWER_TIMELANDS_BIOME.historySampleIntervalTicks !== 0)
    ) {
      return;
    }
    this.temporalHistory.push({
      tick: this.tick,
      players: this.players.map((player) => ({
        id: player.id,
        position: { ...player.position },
        hp: player.hp,
        downedRemainingMs: player.downedRemainingMs,
      })),
      heartHp: this.heart.hp,
      turrets: this.turrets.map((turret) => ({
        dir: turret.dir,
        hp: turret.hp,
        energy: turret.energy,
        alive: turret.alive,
      })),
      monsterPositions: this.monsters.map((monster) => ({
        id: monster.id,
        position: { ...monster.position },
      })),
    });
    const oldestTick = this.tick - TOWER_TIMELANDS_BIOME.historyDepthTicks;
    while ((this.temporalHistory[0]?.tick ?? Infinity) < oldestTick) {
      this.temporalHistory.shift();
    }
  }

  private historyFrameAtOrBefore(targetTick: number): TemporalHistoryFrame | undefined {
    for (let index = this.temporalHistory.length - 1; index >= 0; index -= 1) {
      const frame = this.temporalHistory[index];
      if (frame !== undefined && frame.tick <= targetTick) {
        return frame;
      }
    }
    return undefined;
  }

  private rewindPersistentState(rewindTicks: number, sourceMonsterId: string): void {
    const frame = this.historyFrameAtOrBefore(this.tick - rewindTicks);
    if (frame === undefined) {
      return;
    }
    for (const player of this.players) {
      const previous = frame.players.find((candidate) => candidate.id === player.id);
      if (
        previous !== undefined &&
        player.hp > 0 &&
        player.downedRemainingMs <= 0 &&
        previous.hp > 0 &&
        previous.downedRemainingMs <= 0
      ) {
        player.position = { ...previous.position };
        player.hp = Math.min(player.maxHp, previous.hp);
      }
    }
    if (this.heart.hp > 0 && frame.heartHp > 0) {
      this.heart.hp = Math.min(this.heart.maxHp, frame.heartHp);
    }
    for (const turret of this.turrets) {
      const previous = frame.turrets.find((candidate) => candidate.dir === turret.dir);
      if (previous !== undefined && turret.alive && previous.alive) {
        turret.hp = Math.min(turret.maxHp, previous.hp);
        turret.energy = clamp(previous.energy, 0, turret.maxEnergy);
      }
    }
    const source = this.monsters.find((monster) => monster.id === sourceMonsterId);
    this.addEvent('time-rewound', {
      ...(source === undefined ? {} : { position: source.position }),
      amount: this.tick - frame.tick,
    });
  }

  // ── Joueur ────────────────────────────────────────────────────────────────

  private updateDownedState(player: MutableTowerPlayer, deltaMs: number): void {
    if (player.downedRemainingMs <= 0) {
      return;
    }
    player.downedRemainingMs = Math.max(0, player.downedRemainingMs - deltaMs);
    if (player.downedRemainingMs <= 0) {
      player.hp = player.maxHp;
      player.position = { x: this.heart.position.x, y: this.heart.position.y + HEART.radius + 40 };
    }
  }

  private updatePlayerMovement(
    player: MutableTowerPlayer,
    input: TowerInput,
    deltaSeconds: number,
  ): void {
    player.position = movedPlayerPosition(player.position, input, player.speed, deltaSeconds);
  }

  private updatePlayerAim(player: MutableTowerPlayer, input: TowerInput): void {
    const length = exactLength(input.aimX, input.aimY);
    if (length > 0) {
      player.aim = { x: input.aimX / length, y: input.aimY / length };
    }
  }

  private updatePlayerFiring(
    player: MutableTowerPlayer,
    input: TowerInput,
    deltaSeconds: number,
  ): void {
    const weapon = player.weapons.find((candidate) => candidate.id === player.activeWeaponId);
    if (weapon === undefined) {
      return;
    }
    weapon.fireCooldownRemaining = Math.max(0, weapon.fireCooldownRemaining - deltaSeconds);
    if (input.fire !== true || weapon.fireCooldownRemaining > 0) {
      return;
    }
    const aimLength = exactLength(player.aim.x, player.aim.y);
    if (aimLength <= 0) {
      return;
    }
    // Direction unitaire du tir. Le code passait par un angle absolu — `atan2` puis `cos` et
    // `sin` — pour retomber sur ce même vecteur : un détour plus coûteux, et surtout porteur de
    // deux fonctions approximées par l'implémentation.
    const aim = { x: player.aim.x / aimLength, y: player.aim.y / aimLength };
    const definition = weaponDefinition(weapon.id);
    const extraShots = this.rollMultishot(player.multishotChance);
    const totalShots = definition.projectileCount + extraShots;
    const spreadStep =
      definition.projectileCount > 1
        ? definition.spreadRad * weapon.spreadMultiplier
        : MULTISHOT_SPREAD_RAD;
    for (let index = 0; index < totalShots; index += 1) {
      const spread = (index - (totalShots - 1) / 2) * spreadStep;
      // Seul endroit de la simulation où un angle arbitraire doit réellement être appliqué :
      // la dispersion dépend d'une amélioration et ne peut donc pas être tabulée.
      const direction = spread === 0 ? aim : exactRotate(aim.x, aim.y, spread);
      this.spawnPlayerBullet(player, weapon, definition, direction);
    }
    weapon.fireCooldownRemaining = this.weaponFireRate(player, weapon, definition);
  }

  private rollMultishot(chance: number): number {
    if (chance <= 0) {
      return 0;
    }
    let extra = Math.floor(chance);
    const fraction = chance - extra;
    if (fraction > 0 && this.combatRandom.next() < fraction) {
      extra += 1;
    }
    return extra;
  }

  private spawnPlayerBullet(
    player: MutableTowerPlayer,
    weapon: MutableTowerPlayer['weapons'][number],
    definition: TowerWeaponDefinition,
    direction: Vector2,
  ): void {
    let damage = this.weaponDamage(player, weapon, definition);
    let critical = false;
    if (player.critChance > 0 && this.combatRandom.next() < player.critChance) {
      damage *= player.critMult;
      critical = true;
    }
    this.projectileCounter += 1;
    this.projectiles.push({
      id: `bullet-${this.projectileCounter}`,
      position: { x: player.position.x, y: player.position.y },
      velocityX: direction.x * this.weaponBulletSpeed(player, definition),
      velocityY: direction.y * this.weaponBulletSpeed(player, definition),
      radius: this.weaponBulletRadius(player, definition),
      damage,
      source: 'player',
      weaponId: weapon.id,
      remainingRange: this.weaponBulletRange(player, definition),
      pierce: definition.basePierce + player.pierce + weapon.pierceBonus,
      bounce: player.bounce,
      burnStacks: player.burnStacks,
      explodeOnKill: player.explodeOnKill,
      lifestealPct: player.lifestealPct,
      growingBullet: player.growingBullet,
      // « Fracture glaciale » n'agit que sur les coups critiques : un tir ordinaire ne
      // transporte aucune pile, même si le joueur possède l'amélioration.
      critSlowStacks: critical ? player.critSlowStacks : 0,
      ownerId: player.id,
      hitMonsterIds: new Set<string>(),
    });
  }

  private weaponDamage(
    player: MutableTowerPlayer,
    weapon: MutableTowerPlayer['weapons'][number],
    definition: TowerWeaponDefinition,
  ): number {
    return (
      definition.bulletDamage *
      (player.bulletDamage / PLAYER.bulletDamage) *
      weapon.damageMultiplier
    );
  }

  private weaponFireRate(
    player: MutableTowerPlayer,
    weapon: MutableTowerPlayer['weapons'][number],
    definition: TowerWeaponDefinition,
  ): number {
    return Math.max(
      TURRET_SHOP_EFFECTS.rateMinimum,
      definition.fireRate * (player.fireRate / PLAYER.fireRate) * weapon.fireRateMultiplier,
    );
  }

  private weaponBulletSpeed(player: MutableTowerPlayer, definition: TowerWeaponDefinition): number {
    return Math.max(1, definition.bulletSpeed + player.bulletSpeed - PLAYER.bulletSpeed);
  }

  private weaponBulletRange(player: MutableTowerPlayer, definition: TowerWeaponDefinition): number {
    return Math.max(1, definition.bulletRange + player.bulletRange - PLAYER.bulletRange);
  }

  private weaponBulletRadius(
    player: MutableTowerPlayer,
    definition: TowerWeaponDefinition,
  ): number {
    return Math.max(1, definition.bulletRadius + player.bulletRadius - PLAYER.bulletRadius);
  }

  private applyPlayerAura(player: MutableTowerPlayer, deltaSeconds: number): void {
    if (player.auraDps <= 0 || player.auraRadius <= 0) {
      return;
    }
    const amount = player.auraDps * deltaSeconds;
    for (const monster of this.monsters) {
      if (monster.hp <= 0 || this.isFrozenMonster(monster)) {
        continue;
      }
      if (distance(monster.position, player.position) <= player.auraRadius + monster.radius) {
        this.damageMonster(monster, amount, player);
      }
    }
  }

  // ── Tourelles ───────────────────────────────────────────────────────────────

  private updateTurrets(deltaSeconds: number): void {
    for (const turret of this.turrets) {
      if (!turret.alive) {
        continue;
      }
      turret.energy = Math.min(turret.maxEnergy, turret.energy + turret.energyRegen * deltaSeconds);
      const drainPerSecond = this.currentTurretEnergyDrainPerSecond();
      if (drainPerSecond > 0) {
        turret.energy = Math.max(0, stableNumber(turret.energy - drainPerSecond * deltaSeconds));
      }
      turret.fireCooldownRemaining = Math.max(0, turret.fireCooldownRemaining - deltaSeconds);
      if (turret.fireCooldownRemaining > 0 || turret.energy < TURRET.energyPerShot) {
        continue;
      }
      const target = this.findTurretTarget(turret);
      if (target === undefined) {
        continue;
      }
      this.spawnTurretBullet(turret, target);
      turret.energy -= TURRET.energyPerShot;
      turret.fireCooldownRemaining = turret.fireRate;
    }
  }

  private isEndgameTierActive(id: TowerEndgameTierId): boolean {
    return this.endgameActiveTiers.some((tier) => tier.id === id);
  }

  private currentTurretEnergyDrainPerSecond(): number {
    const active = this.endgameActiveTiers.find((tier) => tier.id === 3);
    const definition = TOWER_ENDGAME_TIERS.find((tier) => tier.id === 3);
    if (active === undefined || definition?.effect.kind !== 'turret-energy-drain') {
      return 0;
    }
    const minutes = ((this.tick - active.activatedAtTick) * TICK_MS) / 60_000;
    return stableNumber(
      definition.effect.basePerSecond + definition.effect.rampPerMinute * minutes,
    );
  }

  private currentMonsterAdaptation(): Readonly<{
    hp: number;
    damage: number;
    speed: number;
  }> {
    const active = this.endgameActiveTiers.find((tier) => tier.id === 4);
    const definition = TOWER_ENDGAME_TIERS.find((tier) => tier.id === 4);
    if (active === undefined || definition?.effect.kind !== 'monster-adaptation') {
      return { hp: 1, damage: 1, speed: 1 };
    }
    const minutes = ((this.tick - active.activatedAtTick) * TICK_MS) / 60_000;
    return {
      hp: stableNumber(1 + definition.effect.hpPerMinute * minutes),
      damage: stableNumber(1 + definition.effect.damagePerMinute * minutes),
      speed: stableNumber(1 + definition.effect.speedPerMinute * minutes),
    };
  }

  private findTurretTarget(turret: MutableTurret): MutableTowerMonster | undefined {
    let selected: MutableTowerMonster | undefined;
    let selectedScore = Infinity;
    const axis = TURRET_AXIS[turret.dir];
    // Le test d'arc se ramène à un produit scalaire : une cible est dans l'arc si le cosinus de
    // l'écart angulaire dépasse celui du demi-arc. On évite ainsi de calculer l'angle lui-même,
    // qui exigeait `atan2`. Le seuil est calculé une fois, hors de la boucle.
    const arcCosine = exactUnitFromAngle(toRadians(turret.halfArcDeg)).x;
    for (const monster of this.monsters) {
      if (monster.hp <= 0 || this.isFrozenMonster(monster)) {
        continue;
      }
      if (monster.camouflageRemainingMs > 0) {
        continue;
      }
      const gap = distance(monster.position, turret.position);
      if (gap > turret.range + monster.radius) {
        continue;
      }
      // Test d'arc sans normaliser ni allouer : comparer le produit scalaire au cosinus du
      // demi-arc mis à l'échelle de la distance revient au même, et cette boucle s'exécute pour
      // chaque monstre, chaque tourelle et chaque tick.
      const dx = monster.position.x - turret.position.x;
      const dy = monster.position.y - turret.position.y;
      if (dx * axis.x + dy * axis.y < arcCosine * gap) {
        continue;
      }
      const score = this.turretTargetScore(turret, monster, gap);
      // L'ordre d'apparition des monstres est le départage canonique en cas d'égalité.
      if (score < selectedScore) {
        selectedScore = score;
        selected = monster;
      }
    }
    return selected;
  }

  private turretTargetScore(
    turret: MutableTurret,
    monster: MutableTowerMonster,
    gap: number,
  ): number {
    switch (turret.targetPriority) {
      case 'nearest':
        return gap;
      case 'strongest':
        return -monster.hp;
      case 'heartward':
        return distance(monster.position, this.heart.position);
    }
  }

  private spawnTurretBullet(turret: MutableTurret, target: MutableTowerMonster): void {
    const direction = exactDirectionTo(
      turret.position.x,
      turret.position.y,
      target.position.x,
      target.position.y,
    );
    if (direction === undefined) {
      return;
    }
    this.projectileCounter += 1;
    this.projectiles.push({
      id: `bullet-${this.projectileCounter}`,
      position: { x: turret.position.x, y: turret.position.y },
      velocityX: direction.x * turret.bulletSpeed,
      velocityY: direction.y * turret.bulletSpeed,
      radius: turret.bulletRadius,
      damage: turret.bulletDamage,
      source: 'turret',
      weaponId: undefined,
      remainingRange: turret.bulletRange,
      pierce: turret.pierce,
      bounce: 0,
      burnStacks: 0,
      explodeOnKill: false,
      lifestealPct: 0,
      growingBullet: 0,
      // Les tourelles ne portent pas d'améliorations de joueur.
      critSlowStacks: 0,
      ownerId: undefined,
      hitMonsterIds: new Set<string>(),
    });
  }

  // ── Projectiles ─────────────────────────────────────────────────────────────

  private updateProjectiles(deltaSeconds: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const bullet = this.projectiles[index];
      if (bullet === undefined) {
        continue;
      }
      const step = exactLength(bullet.velocityX, bullet.velocityY) * deltaSeconds;
      // Le point de départ du tick est conservé : les collisions sont résolues sur le trajet
      // parcouru, pas sur la seule position d'arrivée.
      const sweepFrom = bullet.position;
      bullet.position = {
        x: bullet.position.x + bullet.velocityX * deltaSeconds,
        y: bullet.position.y + bullet.velocityY * deltaSeconds,
      };
      bullet.remainingRange -= step;
      if (bullet.growingBullet > 0) {
        bullet.radius += bullet.growingBullet * deltaSeconds;
      }
      const alive = this.resolveBulletCollisions(bullet, sweepFrom);
      const outOfRange = bullet.remainingRange <= 0;
      const outOfBounds =
        Math.abs(bullet.position.x) > WORLD.bound || Math.abs(bullet.position.y) > WORLD.bound;
      if (!alive || outOfRange || outOfBounds) {
        this.projectiles.splice(index, 1);
      }
    }
  }

  /**
   * Résout les impacts d'une balle sur ce tick. Renvoie `false` si la balle disparaît.
   *
   * `sweepFrom` est la position occupée au début du tick : les cibles sont cherchées sur tout le
   * trajet parcouru. Un rebond change la trajectoire en cours de tick et invalide ce segment,
   * d'où sa remise à `undefined` — les impacts suivants retombent alors sur la position courante.
   */
  private resolveBulletCollisions(bullet: MutableTowerProjectile, sweepFrom: Vector2): boolean {
    let sweptFrom: Vector2 | undefined = sweepFrom;
    // Jusqu'à quelques impacts par tick (perforation/rebond) ; borné pour éviter les boucles.
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const monster = this.findBulletHit(bullet, sweptFrom);
      if (monster === undefined) {
        return true;
      }
      bullet.hitMonsterIds.add(monster.id);
      const owner = bullet.ownerId === undefined ? undefined : this.findPlayerById(bullet.ownerId);
      this.applyBulletDamage(bullet, monster, owner);
      if (bullet.pierce > 0) {
        bullet.pierce -= 1;
        continue;
      }
      if (bullet.bounce > 0) {
        const next = this.findBounceTarget(bullet, monster.position);
        if (next !== undefined) {
          bullet.bounce -= 1;
          this.redirectBullet(bullet, next.position);
          sweptFrom = undefined;
          continue;
        }
      }
      return false;
    }
    return true;
  }

  /**
   * Premier monstre rencontré sur le trajet du tick, ou le plus proche de la position courante
   * lorsque le segment n'est plus exploitable (après un rebond).
   */
  private findBulletHit(
    bullet: MutableTowerProjectile,
    sweptFrom: Vector2 | undefined,
  ): MutableTowerMonster | undefined {
    let nearest: MutableTowerMonster | undefined;
    // Distance au point d'arrivée sans segment, fraction d'entrée sur le segment sinon. Les deux
    // sémantiques ne se mélangent jamais : `sweptFrom` est fixé pour toute la boucle.
    let nearestRank = Infinity;
    for (const monster of this.monsters) {
      if (
        monster.hp <= 0 ||
        this.isFrozenMonster(monster) ||
        bullet.hitMonsterIds.has(monster.id)
      ) {
        continue;
      }
      const reach = bullet.radius + monster.radius;
      if (sweptFrom === undefined) {
        const gap = distance(monster.position, bullet.position);
        if (gap <= reach && gap < nearestRank) {
          nearestRank = gap;
          nearest = monster;
        }
        continue;
      }
      const entry = segmentCircleEntry(sweptFrom, bullet.position, monster.position, reach);
      if (entry !== undefined && entry < nearestRank) {
        nearestRank = entry;
        nearest = monster;
      }
    }
    return nearest;
  }

  private findBounceTarget(
    bullet: MutableTowerProjectile,
    from: Vector2,
  ): MutableTowerMonster | undefined {
    let nearest: MutableTowerMonster | undefined;
    let nearestDistance = Infinity;
    for (const monster of this.monsters) {
      if (
        monster.hp <= 0 ||
        this.isFrozenMonster(monster) ||
        bullet.hitMonsterIds.has(monster.id)
      ) {
        continue;
      }
      const gap = distance(monster.position, from);
      if (gap < nearestDistance) {
        nearestDistance = gap;
        nearest = monster;
      }
    }
    return nearest;
  }

  private redirectBullet(bullet: MutableTowerProjectile, target: Vector2): void {
    const speed = exactLength(bullet.velocityX, bullet.velocityY);
    const direction = exactDirectionTo(bullet.position.x, bullet.position.y, target.x, target.y);
    if (direction === undefined) {
      return;
    }
    bullet.velocityX = direction.x * speed;
    bullet.velocityY = direction.y * speed;
  }

  private applyBulletDamage(
    bullet: MutableTowerProjectile,
    monster: MutableTowerMonster,
    owner: MutableTowerPlayer | undefined,
  ): void {
    if (bullet.burnStacks > 0) {
      monster.burnStacks += bullet.burnStacks;
      monster.burnRemainingMs = BURN.durationMs;
      monster.burnOwnerId = owner?.id;
    }
    if (bullet.critSlowStacks > 0) {
      monster.slowStacks = Math.min(
        CRIT_SLOW.maxStacks,
        monster.slowStacks + bullet.critSlowStacks,
      );
      monster.slowRemainingMs = CRIT_SLOW.durationMs;
    }
    const killed = this.damageMonster(monster, bullet.damage, owner);
    if (owner !== undefined && bullet.lifestealPct > 0) {
      owner.hp = Math.min(owner.maxHp, owner.hp + bullet.damage * bullet.lifestealPct);
    }
    if (killed && bullet.explodeOnKill) {
      this.explodeOnKill(monster.position, bullet.damage, owner);
    }
  }

  /** Détonation (build joueur) : dégâts de zone aux AUTRES monstres autour du kill. */
  private explodeOnKill(
    center: Vector2,
    damage: number,
    owner: MutableTowerPlayer | undefined,
  ): void {
    for (const monster of this.monsters) {
      if (monster.hp <= 0 || this.isFrozenMonster(monster)) {
        continue;
      }
      if (distance(monster.position, center) <= EXPLODE_ON_KILL.radius + monster.radius) {
        this.damageMonster(monster, damage, owner);
      }
    }
  }

  // ── Monstres ────────────────────────────────────────────────────────────────

  private updateMonsters(deltaMs: number, deltaSeconds: number): void {
    // Une invocation peut ajouter des enfants : ils ne jouent qu'au tick suivant.
    for (const monster of [...this.monsters]) {
      if (monster.hp <= 0 || this.isFrozenMonster(monster)) {
        continue;
      }
      const temporalScale = this.temporalScaleForMonster(monster);
      const scaledMs = deltaMs * temporalScale;
      const scaledSeconds = deltaSeconds * temporalScale;
      monster.contactCooldownRemaining = Math.max(0, monster.contactCooldownRemaining - scaledMs);
      monster.camouflageRemainingMs = Math.max(0, monster.camouflageRemainingMs - scaledMs);
      monster.supportBuffRemainingMs = Math.max(0, monster.supportBuffRemainingMs - scaledMs);
      monster.targetLockRemainingMs = Math.max(0, monster.targetLockRemainingMs - scaledMs);
      monster.retreatRemainingMs = Math.max(0, monster.retreatRemainingMs - scaledMs);
      monster.behaviorElapsedMs += scaledMs;
      this.applyBurn(monster, scaledMs, scaledSeconds);
      if (monster.hp <= 0) {
        continue;
      }
      this.applySlowDecay(monster, deltaMs);
      this.updateMonsterRegeneration(monster, scaledSeconds);
      if (monster.hp <= 0) continue;
      this.updateMonsterAbility(monster, scaledMs);
      this.updateTimelandsMonsterBehavior(monster);
      this.moveMonster(monster, scaledSeconds);
      this.resolveMonsterContacts(monster);
    }
    this.resolveMonsterMerges();
    // Separation is visual only. Running it at 5 Hz avoids a quadratic pass on every
    // simulation tick while remaining smooth with more than 160 active enemies.
    if (this.tick % 4 === 0) this.separateMonsters();
  }

  private applyBurn(monster: MutableTowerMonster, deltaMs: number, deltaSeconds: number): void {
    if (monster.burnRemainingMs <= 0 || monster.burnStacks <= 0) {
      return;
    }
    const owner =
      monster.burnOwnerId === undefined ? undefined : this.findPlayerById(monster.burnOwnerId);
    const amount = monster.burnStacks * BURN.dpsPerStack * deltaSeconds;
    monster.burnRemainingMs = Math.max(0, monster.burnRemainingMs - deltaMs);
    this.damageMonster(monster, amount, owner);
  }

  /**
   * Vitesse effective d'un monstre, ralentissement compris.
   *
   * Les piles sont plafonnées à l'application, donc le facteur reste strictement positif : un
   * monstre ralenti avance moins vite, il ne s'arrête jamais et ne recule jamais.
   */
  private monsterSpeed(monster: MutableTowerMonster): number {
    if (monster.slowRemainingMs <= 0 || monster.slowStacks <= 0) {
      return monster.speed;
    }
    return monster.speed * (1 - CRIT_SLOW.perStack * monster.slowStacks);
  }

  private applySlowDecay(monster: MutableTowerMonster, deltaMs: number): void {
    if (monster.slowRemainingMs <= 0) {
      return;
    }
    monster.slowRemainingMs = Math.max(0, monster.slowRemainingMs - deltaMs);
    if (monster.slowRemainingMs <= 0) {
      monster.slowStacks = 0;
    }
  }

  private updateMonsterRegeneration(monster: MutableTowerMonster, deltaSeconds: number): void {
    const definition = this.monsterCatalog(monster.kind);
    if (definition === undefined) return;
    const profile = monsterBehaviorProfile(definition.signature as TowerMonsterSignature);
    if (profile.growthPerSecond !== undefined) {
      const baseRadius = MONSTERS[monster.kind].radius;
      monster.radius = Math.min(
        baseRadius * 1.5,
        monster.radius + baseRadius * profile.growthPerSecond * deltaSeconds,
      );
    }
    if (
      profile.volatileLifetimeMs !== undefined &&
      monster.behaviorElapsedMs >= profile.volatileLifetimeMs
    ) {
      this.killMonster(monster, this.findNearestLivingPlayer(monster.position, Infinity));
      return;
    }
    if (
      profile.regenerationPerSecond === undefined ||
      this.tick - monster.lastDamagedTick < Math.ceil(2_000 / TICK_MS)
    ) {
      return;
    }
    monster.hp = Math.min(
      monster.maxHp,
      monster.hp + monster.maxHp * profile.regenerationPerSecond * deltaSeconds,
    );
  }

  private resolveMonsterMerges(): void {
    for (let leftIndex = 0; leftIndex < this.monsters.length; leftIndex += 1) {
      const left = this.monsters[leftIndex];
      if (left === undefined || left.hp <= 0 || left.behaviorElapsedMs < 900) continue;
      const definition = this.monsterCatalog(left.kind);
      if (
        definition === undefined ||
        monsterBehaviorProfile(definition.signature as TowerMonsterSignature).mergeWithOwnKind !==
          true
      ) {
        continue;
      }
      for (let rightIndex = leftIndex + 1; rightIndex < this.monsters.length; rightIndex += 1) {
        const right = this.monsters[rightIndex];
        if (
          right === undefined ||
          right.hp <= 0 ||
          right.kind !== left.kind ||
          right.behaviorElapsedMs < 900 ||
          distance(left.position, right.position) > (left.radius + right.radius) * 0.9
        ) {
          continue;
        }
        const baseStats = MONSTERS[left.kind];
        left.maxHp = Math.min(
          Math.round(baseStats.hp * MERGE_STAT_CAP_MULTIPLIER),
          left.maxHp + Math.round(right.maxHp * 0.42),
        );
        left.hp = Math.min(left.maxHp, left.hp + right.hp * 0.55);
        left.radius = Math.min(
          baseStats.radius * MERGE_STAT_CAP_MULTIPLIER,
          left.radius + right.radius * 0.16,
        );
        left.contactDamage = Math.min(
          Math.round(baseStats.contactDamage * MERGE_STAT_CAP_MULTIPLIER),
          Math.round(left.contactDamage * 1.12),
        );
        left.reward += right.reward;
        right.hp = 0;
        break;
      }
    }
  }

  private updateMonsterAbility(monster: MutableTowerMonster, deltaMs: number): void {
    const definition = this.monsterCatalog(monster.kind);
    if (definition === undefined) return;
    const signature = definition.signature as TowerMonsterSignature;
    const ability = monsterBehaviorProfile(signature).ability;
    if (ability === undefined) return;

    if (monster.abilityTelegraphRemainingMs > 0) {
      monster.abilityTelegraphRemainingMs = Math.max(
        0,
        monster.abilityTelegraphRemainingMs - deltaMs,
      );
      if (monster.abilityTelegraphRemainingMs === 0) {
        this.executeMonsterAbility(monster, ability);
        monster.abilityUses += 1;
        monster.abilityCooldownRemainingMs = ability.cooldownMs;
        monster.abilityTargetPosition = undefined;
      }
      return;
    }

    const cooldownScale =
      monster.kind === 'ancient-guardian' && monster.hp < monster.maxHp * 0.5 ? 1.4 : 1;
    monster.abilityCooldownRemainingMs = Math.max(
      0,
      monster.abilityCooldownRemainingMs - deltaMs * cooldownScale,
    );
    if (
      monster.abilityCooldownRemainingMs > 0 ||
      (ability.maxUses !== undefined && monster.abilityUses >= ability.maxUses)
    ) {
      return;
    }
    const target = this.monsterAbilityTarget(monster, ability.kind);
    if (target === undefined) {
      monster.abilityCooldownRemainingMs = 500;
      return;
    }
    if (
      ability.kind !== 'heal' &&
      (ability.kind !== 'bolster' || signature === 'copy-buff') &&
      ability.kind !== 'summon' &&
      ability.kind !== 'slam' &&
      distance(monster.position, target) > ability.range
    ) {
      monster.abilityCooldownRemainingMs = 250;
      return;
    }
    monster.abilityTargetPosition = { ...target };
    monster.abilityTelegraphTotalMs = ability.telegraphMs;
    monster.abilityTelegraphRemainingMs = ability.telegraphMs;
  }

  private monsterAbilityTarget(
    monster: MutableTowerMonster,
    kind: NonNullable<ReturnType<typeof monsterBehaviorProfile>['ability']>['kind'],
  ): Vector2 | undefined {
    if (kind === 'bolster' && this.monsterCatalog(monster.kind)?.signature === 'copy-buff') {
      return this.findNearestLivingPlayer(monster.position, Infinity, true)?.position;
    }
    if (kind === 'heal' || kind === 'bolster' || kind === 'summon' || kind === 'slam') {
      return monster.position;
    }
    if (kind === 'disable') {
      return this.findNearestLivingTurret(monster.position)?.position;
    }
    return this.findNearestLivingPlayer(monster.position, Infinity, true)?.position;
  }

  private executeMonsterAbility(
    monster: MutableTowerMonster,
    ability: NonNullable<ReturnType<typeof monsterBehaviorProfile>['ability']>,
  ): void {
    const targetPosition = monster.abilityTargetPosition ?? monster.position;
    const signature = this.monsterCatalog(monster.kind)?.signature;
    if (ability.kind === 'ranged') {
      const player = this.findNearestLivingPlayer(
        targetPosition,
        ability.radius + PLAYER.radius,
        true,
      );
      if (player !== undefined) {
        this.damagePlayer(player, monster.contactDamage * ability.power);
      }
      if (signature === 'poison-projectile') {
        this.spawnMonsterZone('poison', targetPosition, 78, 3_600, {
          damagePerPulse: monster.contactDamage * 0.18,
          control: 'none',
        });
      } else if (signature === 'grenade-barrage') {
        this.spawnMonsterZone('fire', targetPosition, ability.radius, 2_400, {
          damagePerPulse: monster.contactDamage * 0.2,
          control: 'none',
        });
      }
      return;
    }
    if (signature === 'copy-buff') {
      const player = this.findNearestLivingPlayer(targetPosition, ability.range, true);
      if (player !== undefined && this.playerHasPositiveEffect(player)) {
        // Le Truand observe le joueur ciblé : il n'examine jamais les bonus d'un allié monstre.
        // Le moteur n'expose pas encore de jetons de buff temporaires côté joueur ; sa copie
        // temporaire se traduit donc par le même état d'empowerment visible que les soutiens.
        monster.supportBuffRemainingMs = Math.max(
          monster.supportBuffRemainingMs,
          COPIED_PLAYER_BUFF_DURATION_MS,
        );
      }
      return;
    }
    if (ability.kind === 'heal' || ability.kind === 'bolster') {
      for (const ally of this.monsters) {
        if (
          ally.hp <= 0 ||
          distance(ally.position, monster.position) > ability.radius + ally.radius
        ) {
          continue;
        }
        const fraction = ability.kind === 'heal' ? ability.power : ability.power * 0.5;
        ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * fraction);
        if (ability.kind === 'bolster') {
          ally.contactCooldownRemaining = Math.max(0, ally.contactCooldownRemaining - 350);
          ally.abilityCooldownRemainingMs = Math.max(0, ally.abilityCooldownRemainingMs - 500);
          if (signature === 'ally-shield') {
            ally.shieldHp = Math.max(ally.shieldHp, ally.maxHp * 0.18);
          }
          if (signature === 'ally-camouflage') {
            ally.camouflageRemainingMs = Math.max(ally.camouflageRemainingMs, 2_400);
          }
          if (
            signature === 'ally-buff' ||
            signature === 'battle-orders' ||
            signature === 'battle-cry' ||
            signature === 'slow-resist-aura'
          ) {
            ally.supportBuffRemainingMs = Math.max(ally.supportBuffRemainingMs, 3_200);
          }
          if (signature === 'herd-allies' && ally !== monster) {
            const dx = monster.position.x - ally.position.x;
            const dy = monster.position.y - ally.position.y;
            const gap = exactLength(dx, dy);
            if (gap > 0) {
              ally.position = {
                x: ally.position.x + (dx / gap) * Math.min(42, gap),
                y: ally.position.y + (dy / gap) * Math.min(42, gap),
              };
            }
          }
        }
      }
      if (signature === 'revive-burning-aura') {
        this.spawnMonsterZone('fire', monster.position, ability.radius, 2_200, {
          damagePerPulse: monster.contactDamage * 0.14,
          control: 'none',
        });
      }
      return;
    }
    if (ability.kind === 'summon' && ability.childKind !== undefined) {
      this.spawnMonsterChildren(monster, ability.childKind, ability.childCount ?? 1, 0.58);
      return;
    }
    if (ability.kind === 'disable') {
      const turret = this.findNearestLivingTurret(targetPosition);
      if (turret !== undefined && distance(monster.position, turret.position) <= ability.range) {
        turret.energy = 0;
        turret.fireCooldownRemaining = Math.max(
          turret.fireCooldownRemaining,
          (ability.disableDurationMs ?? 0) / 1_000,
        );
      }
      monster.retreatRemainingMs = ability.retreatDurationMs ?? 0;
      return;
    }

    const center = ability.kind === 'slam' ? monster.position : targetPosition;
    for (const player of this.players) {
      if (
        player.hp <= 0 ||
        player.downedRemainingMs > 0 ||
        this.isTurretWorkshopProtected(player) ||
        distance(player.position, center) > ability.radius + PLAYER.radius
      ) {
        continue;
      }
      this.damagePlayer(player, monster.contactDamage * ability.power);
      if (ability.kind === 'control') {
        this.displacePlayerToward(player, this.heart.position, 42);
      }
    }
    if (ability.kind === 'control') {
      const kind =
        signature?.includes('web') === true
          ? 'web'
          : signature?.includes('sand') === true
            ? 'sand'
            : signature?.includes('freeze') === true
              ? 'ice'
              : signature?.includes('time') === true || signature === 'temporal-control'
                ? 'time'
                : 'ray';
      this.spawnMonsterZone(kind, center, ability.radius, kind === 'ray' ? 900 : 3_800, {
        damagePerPulse: monster.contactDamage * 0.12,
        control: 'slow',
        ...(kind === 'ray' ? { endPosition: monster.position } : {}),
      });
    }
    if (ability.kind === 'slam') {
      for (const turret of this.turrets) {
        if (
          turret.alive &&
          distance(turret.position, center) <= ability.radius + TURRET.bodyRadius
        ) {
          this.damageTurret(turret, monster.contactDamage * ability.power);
        }
      }
      if (distance(this.heart.position, center) <= ability.radius + this.heart.radius) {
        this.damageHeartInternal(monster.contactDamage * ability.power);
      }
    }
  }

  /**
   * Les améliorations de joueur sont des effets positifs permanents du build courant. Le protocole
   * ne porte pas encore de jeton de buff temporaire : le Truand ne peut donc copier qu'un effet
   * réellement constaté dans ces statistiques, jamais l'état d'un allié monstre.
   */
  private playerHasPositiveEffect(player: MutableTowerPlayer): boolean {
    return (
      player.maxHp > PLAYER.maxHp ||
      player.speed > PLAYER.speed ||
      player.pickupRadius > PLAYER.pickupRadius ||
      player.fireRate < PLAYER.fireRate ||
      player.bulletDamage > PLAYER.bulletDamage ||
      player.bulletSpeed > PLAYER.bulletSpeed ||
      player.bulletRange > PLAYER.bulletRange ||
      player.bulletRadius > PLAYER.bulletRadius ||
      player.critChance > PLAYER.critChance ||
      player.critMult > PLAYER.critMult ||
      player.pierce > 0 ||
      player.bounce > 0 ||
      player.multishotChance > 0 ||
      player.burnStacks > 0 ||
      player.auraDps > 0 ||
      player.lifestealPct > 0 ||
      player.bulletSpeedBonusApplied ||
      player.explodeOnKill ||
      player.growingBullet > 0 ||
      player.critSlowStacks > 0 ||
      player.weapons.some(
        (weapon) =>
          weapon.level > 1 ||
          weapon.damageMultiplier > 1 ||
          weapon.fireRateMultiplier < 1 ||
          weapon.spreadMultiplier < 1 ||
          weapon.pierceBonus > 0,
      )
    );
  }

  private spawnMonsterZone(
    kind: MutableTowerMonsterZone['kind'],
    position: Vector2,
    radius: number,
    durationMs: number,
    options: Readonly<{
      damagePerPulse: number;
      control: MutableTowerMonsterZone['control'];
      endPosition?: Vector2;
    }>,
  ): void {
    if (this.monsterZones.length >= 48) this.monsterZones.shift();
    this.monsterZoneCounter += 1;
    this.monsterZones.push({
      id: `monster-zone-${this.monsterZoneCounter}`,
      kind,
      position: { ...position },
      radius,
      remainingMs: durationMs,
      durationMs,
      pulseCooldownRemainingMs: 0,
      damagePerPulse: options.damagePerPulse,
      control: options.control,
      endPosition: options.endPosition === undefined ? undefined : { ...options.endPosition },
    });
  }

  private updateMonsterZones(deltaMs: number): void {
    for (let index = this.monsterZones.length - 1; index >= 0; index -= 1) {
      const zone = this.monsterZones[index];
      if (zone === undefined) continue;
      zone.remainingMs = Math.max(0, zone.remainingMs - deltaMs);
      zone.pulseCooldownRemainingMs = Math.max(0, zone.pulseCooldownRemainingMs - deltaMs);
      if (zone.pulseCooldownRemainingMs === 0) {
        zone.pulseCooldownRemainingMs = 500;
        for (const player of this.players) {
          if (
            player.hp <= 0 ||
            player.downedRemainingMs > 0 ||
            this.isTurretWorkshopProtected(player)
          ) {
            continue;
          }
          const inside =
            zone.endPosition === undefined
              ? distance(player.position, zone.position) <= zone.radius + PLAYER.radius
              : distanceToSegment(player.position, zone.position, zone.endPosition) <=
                zone.radius + PLAYER.radius;
          if (!inside) continue;
          if (zone.damagePerPulse > 0) {
            this.damagePlayer(player, zone.damagePerPulse);
          }
          if (zone.control === 'slow') {
            player.hostileSlowRemainingMs = Math.max(player.hostileSlowRemainingMs, 700);
          }
        }
      }
      if (zone.remainingMs <= 0) this.monsterZones.splice(index, 1);
    }
  }

  private displacePlayerToward(player: MutableTowerPlayer, target: Vector2, amount: number): void {
    const dx = target.x - player.position.x;
    const dy = target.y - player.position.y;
    const length = exactLength(dx, dy);
    if (length <= 0) return;
    player.position = {
      x: clamp(
        player.position.x + (dx / length) * amount,
        -WORLD.bound + PLAYER.radius,
        WORLD.bound - PLAYER.radius,
      ),
      y: clamp(
        player.position.y + (dy / length) * amount,
        -WORLD.bound + PLAYER.radius,
        WORLD.bound - PLAYER.radius,
      ),
    };
  }

  private moveMonster(monster: MutableTowerMonster, deltaSeconds: number): void {
    const definition = this.monsterCatalog(monster.kind);
    const profile = monsterBehaviorProfile(
      (definition?.signature ?? 'bone-strike') as TowerMonsterSignature,
    );
    const target = this.movementTarget(
      monster,
      monster.retreatRemainingMs > 0
        ? this.retreatTarget(monster)
        : this.findMonsterTarget(monster),
      profile.movement,
    );
    const dx = target.x - monster.position.x;
    const dy = target.y - monster.position.y;
    const length = exactLength(dx, dy);
    if (length <= 0) {
      return;
    }
    const phase = monster.behaviorElapsedMs;
    const speedScale =
      profile.movement === 'pounce'
        ? phase % 2_400 > 1_850
          ? 2.25
          : 0.72
        : profile.movement === 'dash'
          ? phase % 2_800 > 2_200
            ? 2.6
            : 0.68
          : profile.movement === 'burrow'
            ? phase % 3_200 < 700
              ? 2.1
              : 0.72
            : profile.movement === 'blink'
              ? phase % 2_500 < 320
                ? 3.5
                : 0.42
              : profile.movement === 'swarm'
                ? 1.2
                : 1;
    const supportScale = monster.supportBuffRemainingMs > 0 ? 1.18 : 1;
    const enrageScale =
      monster.kind === 'ancient-guardian' && monster.hp < monster.maxHp * 0.5 ? 1.35 : 1;
    const stepDistance = Math.min(
      length,
      this.monsterSpeed(monster) * speedScale * supportScale * enrageScale * deltaSeconds,
    );
    monster.position = {
      x: monster.position.x + (dx / length) * stepDistance,
      y: monster.position.y + (dy / length) * stepDistance,
    };
  }

  private retreatTarget(monster: MutableTowerMonster): Vector2 {
    const threat = this.findNearestLivingTurret(monster.position)?.position ?? this.heart.position;
    const dx = monster.position.x - threat.x;
    const dy = monster.position.y - threat.y;
    const length = exactLength(dx, dy);
    const distanceFromThreat = 420;
    const direction = length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
    return {
      x: clamp(
        monster.position.x + direction.x * distanceFromThreat,
        -WORLD.bound + monster.radius,
        WORLD.bound - monster.radius,
      ),
      y: clamp(
        monster.position.y + direction.y * distanceFromThreat,
        -WORLD.bound + monster.radius,
        WORLD.bound - monster.radius,
      ),
    };
  }

  private movementTarget(
    monster: MutableTowerMonster,
    target: Vector2,
    pattern: ReturnType<typeof monsterBehaviorProfile>['movement'],
  ): Vector2 {
    const dx = target.x - monster.position.x;
    const dy = target.y - monster.position.y;
    const length = Math.max(1, exactLength(dx, dy));
    if (pattern === 'zigzag' || pattern === 'swarm') {
      const amplitude = pattern === 'swarm' ? 34 : 76;
      const period = pattern === 'swarm' ? 720 : 1_280;
      const wavePhase = (monster.behaviorElapsedMs % period) / period;
      const wave = wavePhase < 0.5 ? wavePhase * 4 - 1 : 3 - wavePhase * 4;
      return {
        x: target.x + (-dy / length) * amplitude * wave,
        y: target.y + (dx / length) * amplitude * wave,
      };
    }
    const nearestPlayer = this.findNearestLivingPlayer(monster.position, Infinity, true);
    if (pattern === 'avoid-player' && nearestPlayer !== undefined) {
      const playerGap = distance(monster.position, nearestPlayer.position);
      if (playerGap < 190) {
        return {
          x: monster.position.x + (monster.position.x - nearestPlayer.position.x),
          y: monster.position.y + (monster.position.y - nearestPlayer.position.y),
        };
      }
    }
    if (pattern === 'skirmish' && nearestPlayer !== undefined) {
      const playerGap = distance(monster.position, nearestPlayer.position);
      if (playerGap < 215) {
        return {
          x: monster.position.x + (monster.position.x - nearestPlayer.position.x),
          y: monster.position.y + (monster.position.y - nearestPlayer.position.y),
        };
      }
      if (playerGap < 330) {
        return {
          x: monster.position.x - (nearestPlayer.position.y - monster.position.y),
          y: monster.position.y + (nearestPlayer.position.x - monster.position.x),
        };
      }
    }
    if (pattern === 'orbit-ally') {
      const anchor = this.findNearestSupportAnchor(monster);
      if (anchor !== undefined) {
        const anchorGap = distance(monster.position, anchor.position);
        if (anchorGap > 145) return anchor.position;
        return {
          x: monster.position.x - (anchor.position.y - monster.position.y),
          y: monster.position.y + (anchor.position.x - monster.position.x),
        };
      }
    }
    return target;
  }

  /** Séparation souple : les silhouettes restent lisibles sans altérer leurs hitbox. */
  private separateMonsters(): void {
    for (let leftIndex = 0; leftIndex < this.monsters.length; leftIndex += 1) {
      const left = this.monsters[leftIndex];
      if (left === undefined || left.hp <= 0 || this.isFrozenMonster(left)) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < this.monsters.length; rightIndex += 1) {
        const right = this.monsters[rightIndex];
        if (right === undefined || right.hp <= 0 || this.isFrozenMonster(right)) continue;
        const dx = right.position.x - left.position.x;
        const dy = right.position.y - left.position.y;
        const gap = exactLength(dx, dy);
        const desired = (left.radius + right.radius) * 0.72;
        if (gap >= desired) continue;
        // L'id fournit un axe stable lorsque deux invocations naissent au même point.
        const nx = gap > 0 ? dx / gap : left.id < right.id ? 1 : -1;
        const ny = gap > 0 ? dy / gap : 0;
        const push = Math.min(2.5, (desired - gap) * 0.18);
        left.position = {
          x: clamp(
            left.position.x - nx * push,
            -WORLD.bound + left.radius,
            WORLD.bound - left.radius,
          ),
          y: clamp(
            left.position.y - ny * push,
            -WORLD.bound + left.radius,
            WORLD.bound - left.radius,
          ),
        };
        right.position = {
          x: clamp(
            right.position.x + nx * push,
            -WORLD.bound + right.radius,
            WORLD.bound - right.radius,
          ),
          y: clamp(
            right.position.y + ny * push,
            -WORLD.bound + right.radius,
            WORLD.bound - right.radius,
          ),
        };
      }
    }
  }

  private findMonsterTarget(monster: MutableTowerMonster): Vector2 {
    const definition = this.monsterCatalog(monster.kind);
    if (definition?.signature === 'wounded-structure-raid') {
      return this.findMostWoundedLivingStructure()?.position ?? this.heart.position;
    }
    if (definition?.targeting === 'heart') {
      return this.heart.position;
    }
    if (definition?.targeting === 'turret') {
      return this.findNearestLivingTurret(monster.position)?.position ?? this.heart.position;
    }
    if (definition?.targeting === 'support') {
      return this.findNearestSupportAnchor(monster)?.position ?? this.heart.position;
    }
    if (definition?.targeting === 'isolated-player') {
      return (
        this.lockedPlayerTarget(monster, () => this.findMostIsolatedLivingPlayer())?.position ??
        this.heart.position
      );
    }
    const range = definition?.targeting === 'player' ? Infinity : MONSTER_PLAYER_AGGRO_RANGE;
    const player = this.lockedPlayerTarget(monster, () =>
      this.findNearestLivingPlayer(monster.position, range, true),
    );
    return player?.position ?? this.heart.position;
  }

  private lockedPlayerTarget(
    monster: MutableTowerMonster,
    choose: () => MutableTowerPlayer | undefined,
  ): MutableTowerPlayer | undefined {
    if (monster.targetLockRemainingMs > 0 && monster.targetPlayerId !== undefined) {
      const locked = this.findPlayerById(monster.targetPlayerId);
      if (
        locked !== undefined &&
        locked.hp > 0 &&
        locked.downedRemainingMs <= 0 &&
        !this.isTurretWorkshopProtected(locked)
      ) {
        return locked;
      }
    }
    const selected = choose();
    monster.targetPlayerId = selected?.id;
    monster.targetLockRemainingMs = selected === undefined ? 0 : 1_800;
    return selected;
  }

  private resolveMonsterContacts(monster: MutableTowerMonster): void {
    /* Remote legacy-kamikaze branch retained below for history; Torri signatures supersede it.
    if (monster.kind === 'kamikaze') {
      if (this.kamikazeTouchesTarget(monster)) {
        // La détonation appartient désormais à `killMonster` : le kamikaze explose de la même
        // façon qu'il meure au contact ou sous les tirs.
        this.killMonster(monster, this.findNearestLivingPlayer(monster.position, Infinity));
*/
    const definition = this.monsterCatalog(monster.kind);
    if (
      definition?.signature === 'turret-explosion' ||
      definition?.signature === 'player-explosion' ||
      definition?.signature === 'explosive-merge'
    ) {
      if (this.explosiveMonsterTouchesTarget(monster, definition)) {
        this.killMonster(monster, this.findNearestLivingPlayer(monster.position, Infinity));
      }
      return;
    }
    if (monster.contactCooldownRemaining > 0) {
      return;
    }
    const order =
      definition?.targeting === 'turret'
        ? (['turret', 'heart'] as const)
        : definition?.targeting === 'heart'
          ? (['heart', 'turret'] as const)
          : (['player', 'turret', 'heart'] as const);
    for (const target of order) {
      if (target === 'player') {
        const player = this.findContactedPlayer(monster);
        if (player === undefined) continue;
        if (monster.kind === 'time-controller') {
          this.applyControllerStrike(monster, player);
          return;
        }
        this.damagePlayer(player, monster.contactDamage);
        this.applyMonsterContactEffect(monster, player);
      } else if (target === 'turret') {
        const turret = this.findContactedTurret(monster);
        if (turret === undefined) continue;
        this.damageTurret(turret, monster.contactDamage);
      } else {
        if (!this.touchesHeart(monster)) continue;
        this.damageHeartInternal(monster.contactDamage);
      }
      monster.contactCooldownRemaining = CONTACT_COOLDOWN_MS;
      return;
    }
  }

  private applyMonsterContactEffect(
    monster: MutableTowerMonster,
    player: MutableTowerPlayer,
  ): void {
    const definition = this.monsterCatalog(monster.kind);
    if (definition === undefined) return;
    const effect = monsterBehaviorProfile(definition.signature as TowerMonsterSignature).contact;
    if (effect === 'poison') {
      this.damagePlayer(player, monster.contactDamage * 0.28);
    } else if (effect === 'drain') {
      const drained = monster.contactDamage * 0.45;
      this.damagePlayer(player, drained);
      monster.hp = Math.min(monster.maxHp, monster.hp + drained);
      this.spawnMonsterZone('ray', monster.position, 8, 650, {
        damagePerPulse: 0,
        control: 'none',
        endPosition: player.position,
      });
    } else if (effect === 'slow') {
      player.hostileSlowRemainingMs = Math.max(
        player.hostileSlowRemainingMs,
        HOSTILE_SLOW_DURATION_MS,
      );
    } else if (effect === 'drag') {
      this.displacePlayerToward(player, monster.position, 48);
    } else if (effect === 'chain') {
      const chained = this.players.find(
        (candidate) =>
          candidate !== player &&
          candidate.hp > 0 &&
          candidate.downedRemainingMs <= 0 &&
          !this.isTurretWorkshopProtected(candidate) &&
          distance(candidate.position, player.position) <= 180,
      );
      if (chained !== undefined) {
        this.damagePlayer(chained, monster.contactDamage * 0.55);
        this.spawnMonsterZone('ray', player.position, 7, 650, {
          damagePerPulse: 0,
          control: 'none',
          endPosition: chained.position,
        });
      }
    }
  }

  private explosiveMonsterTouchesTarget(
    monster: MutableTowerMonster,
    definition: TowerMonsterCatalogEntry,
  ): boolean {
    if (definition.targeting === 'player') {
      return this.findContactedPlayer(monster) !== undefined;
    }
    if (definition.targeting === 'turret') {
      return this.findContactedTurret(monster) !== undefined || this.touchesHeart(monster);
    }
    return this.findContactedPlayer(monster) !== undefined || this.touchesHeart(monster);
  }

  /**
   * Applique l'explosion d'un kamikaze, sans le tuer : c'est `killMonster` qui l'appelle, de
   * sorte que la détonation ait lieu quelle que soit la cause de la mort — contact, balle,
   * brûlure ou aura. Auparavant elle n'était déclenchée qu'au contact, si bien qu'abattre un
   * kamikaze le désamorçait purement et simplement, contrairement à ce qu'annonçaient son nom,
   * le réglage et les règles de gameplay.
   */
  private detonateKamikaze(monster: MutableTowerMonster): void {
    const center = monster.position;
    for (const player of this.players) {
      if (
        player.downedRemainingMs > 0 ||
        player.hp <= 0 ||
        this.isTurretWorkshopProtected(player)
      ) {
        continue;
      }
      if (distance(player.position, center) <= KAMIKAZE_EXPLOSION.radius + PLAYER.radius) {
        this.damagePlayer(player, KAMIKAZE_EXPLOSION.damage);
      }
    }
    for (const turret of this.turrets) {
      if (!turret.alive) {
        continue;
      }
      if (distance(turret.position, center) <= KAMIKAZE_EXPLOSION.radius + TURRET.bodyRadius) {
        this.damageTurret(turret, KAMIKAZE_EXPLOSION.damage);
      }
    }
    if (distance(this.heart.position, center) <= KAMIKAZE_EXPLOSION.radius + this.heart.radius) {
      this.damageHeartInternal(KAMIKAZE_EXPLOSION.damage);
    }
  }

  private findContactedPlayer(monster: MutableTowerMonster): MutableTowerPlayer | undefined {
    for (const player of this.players) {
      if (
        player.downedRemainingMs > 0 ||
        player.hp <= 0 ||
        this.isTurretWorkshopProtected(player)
      ) {
        continue;
      }
      if (
        distance(player.position, monster.position) <=
        PLAYER.radius + monster.radius + CONTACT_MARGIN
      ) {
        return player;
      }
    }
    return undefined;
  }

  private findContactedTurret(monster: MutableTowerMonster): MutableTurret | undefined {
    for (const turret of this.turrets) {
      if (!turret.alive) {
        continue;
      }
      if (
        distance(turret.position, monster.position) <=
        TURRET.bodyRadius + monster.radius + CONTACT_MARGIN
      ) {
        return turret;
      }
    }
    return undefined;
  }

  private touchesHeart(monster: MutableTowerMonster): boolean {
    return (
      distance(this.heart.position, monster.position) <=
      this.heart.radius + monster.radius + CONTACT_MARGIN
    );
  }

  /** Applique des dégâts à un monstre. Renvoie `true` s'il vient d'être tué. */
  private damageMonster(
    monster: MutableTowerMonster,
    amount: number,
    killer: MutableTowerPlayer | undefined,
  ): boolean {
    if (monster.hp <= 0 || amount <= 0 || this.isFrozenMonster(monster)) {
      return false;
    }
    const definition = this.monsterCatalog(monster.kind);
    const receivedMultiplier =
      definition === undefined
        ? 1
        : (monsterBehaviorProfile(definition.signature as TowerMonsterSignature)
            .incomingDamageMultiplier ?? 1);
    let receivedAmount = amount * receivedMultiplier;
    if (monster.shieldHp > 0) {
      const absorbed = Math.min(monster.shieldHp, receivedAmount);
      monster.shieldHp -= absorbed;
      receivedAmount -= absorbed;
      if (receivedAmount <= 0) return false;
    }
    const beforeHp = monster.hp;
    monster.hp = Math.max(0, monster.hp - receivedAmount);
    monster.lastDamagedTick = this.tick;
    if (monster.hp <= 0) {
      this.killMonster(monster, killer);
      return true;
    }
    this.afterMonsterDamaged(monster, beforeHp);
    return false;
  }

  private killMonster(monster: MutableTowerMonster, killer: MutableTowerPlayer | undefined): void {
    // `detonated` garantit une seule explosion par kamikaze. Les points de vie ne peuvent pas
    // jouer ce rôle : `damageMonster` les met à zéro avant d'appeler cette méthode, si bien
    // qu'un test `hp > 0` désamorcerait précisément la mort par balle qu'on veut couvrir.
    // `detonateKamikaze` ne blesse que joueurs, tourelles et Cœur, jamais un monstre : aucune
    // récursion n'est possible.
    const explosiveSignature = this.monsterCatalog(monster.kind)?.signature;
    if (
      !monster.detonated &&
      (explosiveSignature === 'turret-explosion' ||
        explosiveSignature === 'player-explosion' ||
        explosiveSignature === 'explosive-merge' ||
        explosiveSignature === 'volatile-lifetime')
    ) {
      monster.detonated = true;
      this.detonateKamikaze(monster);
    }
    if (this.tryMonsterNativeRevive(monster)) {
      return;
    }
    if (this.tryResurrectWardenControlledMonster(monster)) {
      return;
    }
    if (monster.hp > 0) {
      monster.hp = 0;
    }
    if (monster.kind === 'time-watch') {
      this.applyWatchDeathEffect(monster);
    }
    if (monster.kind === 'time-warden') {
      this.timelandsWarden = {
        status: 'defeated',
        monsterId: monster.id,
        defeatedAtTick: this.tick,
      };
      this.addEvent('warden-defeated', { position: monster.position });
    }
    const definition = this.monsterCatalog(monster.kind);
    if (definition !== undefined) {
      const profile = monsterBehaviorProfile(definition.signature as TowerMonsterSignature);
      const death = profile.death;
      if (death !== undefined) {
        this.spawnMonsterChildren(monster, death.childKind, death.count, 0.48);
      }
      if (definition.signature === 'freeze-death-zone') {
        this.spawnMonsterZone('ice', monster.position, 145, 4_200, {
          damagePerPulse: 0,
          control: 'slow',
        });
      }
    }
    const reward = monster.reward;
    this.dropScrap(monster.position, reward);
    const beneficiary =
      killer ?? this.findNearestLivingPlayer(monster.position, Infinity) ?? this.players[0];
    if (beneficiary !== undefined) {
      beneficiary.gold += GOLD_PER_KILL_FACTOR * reward;
      this.addExperience(beneficiary, XP_PER_KILL_FACTOR * reward);
      const deer = timelandsMonsterDefinition(monster.kind);
      if (deer?.mechanic.kind === 'deer-escape' && deer.mechanic.guaranteedUpgradeDrop) {
        beneficiary.pendingUpgrades += 1;
        this.refreshUpgradeOffer(beneficiary);
      }
    }
    this.addEvent('monster-killed', { position: monster.position, amount: reward });
    this.advanceSharedQuest(monster.rarity, monster.position);
  }

  private tryMonsterNativeRevive(monster: MutableTowerMonster): boolean {
    const definition = this.monsterCatalog(monster.kind);
    if (definition === undefined || monster.reviveCount > 0) return false;
    const reviveFraction = monsterBehaviorProfile(
      definition.signature as TowerMonsterSignature,
    ).reviveFraction;
    if (reviveFraction === undefined) return false;
    monster.reviveCount += 1;
    monster.hp = Math.max(1, Math.round(monster.maxHp * reviveFraction));
    monster.contactCooldownRemaining = 900;
    monster.abilityCooldownRemainingMs = Math.max(monster.abilityCooldownRemainingMs, 1_200);
    return true;
  }

  private spawnMonsterChildren(
    parent: MutableTowerMonster,
    childKind: TowerMonsterKind,
    requestedCount: number,
    powerScale: number,
  ): void {
    const room = Math.max(
      0,
      this.activeMonsterLimit() - this.monsters.filter((item) => item.hp > 0).length,
    );
    const count = Math.min(requestedCount, room);
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / Math.max(1, count) + parent.behaviorElapsedMs / 10_000;
      const direction = exactUnitFromAngle(angle);
      const offset = parent.radius + (MONSTERS[childKind]?.radius ?? 10) + 5;
      this.spawnMonsterWithPower(
        childKind,
        {
          x: clamp(parent.position.x + direction.x * offset, -WORLD.bound, WORLD.bound),
          y: clamp(parent.position.y + direction.y * offset, -WORLD.bound, WORLD.bound),
        },
        powerScale,
        'common',
        parent.affinity,
      );
    }
  }

  private tryResurrectWardenControlledMonster(monster: MutableTowerMonster): boolean {
    if (
      monster.temporal?.status !== 'warden-controlled' ||
      monster.temporal.alteration === 'none' ||
      monster.kind === 'time-warden'
    ) {
      return false;
    }
    const mechanic = timelandsMonsterDefinition('time-warden')?.mechanic;
    if (mechanic?.kind !== 'warden-control') {
      return false;
    }
    const roll = new SeededRandom(`${this.seed}:warden-resurrection:${monster.id}`).next();
    if (roll >= mechanic.resurrectionChance) {
      return false;
    }
    monster.hp = Math.max(1, Math.round(monster.maxHp * mechanic.resurrectionHpFraction));
    monster.temporal = {
      status: 'warden-controlled',
      wardenMonsterId: monster.temporal.wardenMonsterId,
      alteration: 'none',
    };
    return true;
  }

  private applyWatchDeathEffect(monster: MutableTowerMonster): void {
    const definition = timelandsMonsterDefinition('time-watch');
    if (definition?.mechanic.kind !== 'watch-death-effect') {
      return;
    }
    const random = new SeededRandom(`${this.seed}:watch-death:${monster.id}`);
    if (random.next() < definition.mechanic.rewindChance) {
      this.rewindPersistentState(definition.mechanic.rewindTicks, monster.id);
      return;
    }
    const outcomes = ['global-slow', 'global-haste', 'player-slow', 'player-haste'] as const;
    const outcome = outcomes[random.integer(0, outcomes.length - 1)] ?? 'player-slow';
    const target = this.findNearestLivingPlayer(monster.position, Infinity) ?? this.players[0];
    if (outcome === 'global-slow') {
      const effect = definition.mechanic.globalSlow;
      this.addTemporalEffect('slow', effect.scale, effect.durationTicks, monster.id);
    } else if (outcome === 'global-haste') {
      const effect = definition.mechanic.globalHaste;
      this.addTemporalEffect('haste', effect.scale, effect.durationTicks, monster.id);
    } else if (outcome === 'player-slow' && target !== undefined) {
      const effect = definition.mechanic.playerSlow;
      this.addTemporalEffect('slow', effect.scale, effect.durationTicks, monster.id, target.id);
    } else if (target !== undefined) {
      const effect = definition.mechanic.playerHaste;
      this.addTemporalEffect('haste', effect.scale, effect.durationTicks, monster.id, target.id);
    }
  }

  private advanceSharedQuest(rarity: TowerMonsterRarity, position: Vector2): void {
    const quest = this.currentSharedQuestDefinition();
    const matchesObjective =
      quest.objective === 'kill-monsters' ||
      (quest.objective === 'kill-elite-or-boss' && (rarity === 'legendary' || rarity === 'boss'));
    if (!matchesObjective) {
      return;
    }

    this.sharedQuestProgress = Math.min(quest.target, this.sharedQuestProgress + 1);
    if (this.sharedQuestProgress < quest.target) {
      return;
    }

    this.scrapFund += quest.rewardScrap;
    this.sharedQuestCompletedCount += 1;
    this.sharedQuestProgress = 0;
    this.addEvent('quest-completed', { position, amount: quest.rewardScrap });
  }

  private currentSharedQuestDefinition(): (typeof TOWER_SHARED_QUESTS)[number] {
    if (TOWER_SHARED_QUESTS.length === 0) {
      throw new Error('Le catalogue Tower requiert au moins une quête commune.');
    }
    const quest = TOWER_SHARED_QUESTS[this.currentSharedQuestRotationId()];
    if (quest === undefined) {
      throw new Error('La rotation de quête Tower est invalide.');
    }
    return quest;
  }

  private currentSharedQuestRotationId(): number {
    return this.sharedQuestCompletedCount % TOWER_SHARED_QUESTS.length;
  }

  private removeDeadMonsters(): void {
    for (let index = this.monsters.length - 1; index >= 0; index -= 1) {
      const monster = this.monsters[index];
      if (monster !== undefined && monster.hp <= 0) {
        this.monsters.splice(index, 1);
      }
    }
  }

  // ── Dégâts au joueur / tourelle / Cœur ──────────────────────────────────────

  private damagePlayer(player: MutableTowerPlayer, amount: number): void {
    if (amount <= 0 || player.hp <= 0 || player.downedRemainingMs > 0) {
      return;
    }
    player.hp = Math.max(0, player.hp - amount);
    this.addEvent('player-hurt', { position: player.position, amount });
    if (player.hp <= 0 && this.players.length > 1) {
      // Co-op : l'avatar passe « à terre » et réapparaîtra ; il n'agit plus d'ici là.
      player.downedRemainingMs = DOWNED_DURATION_MS;
      player.fireCooldownRemaining = 0;
      for (const weapon of player.weapons) {
        weapon.fireCooldownRemaining = 0;
      }
    }
  }

  private damageTurret(turret: MutableTurret, amount: number): void {
    if (amount <= 0 || !turret.alive) {
      return;
    }
    turret.hp = Math.max(0, turret.hp - amount);
    this.addEvent('turret-hurt', { position: turret.position, amount });
    if (turret.hp <= 0) {
      turret.alive = false;
      turret.energy = 0;
      this.addEvent('turret-destroyed', { position: turret.position });
    }
  }

  private damageHeartInternal(amount: number): void {
    if (amount <= 0 || this.heart.hp <= 0) {
      return;
    }
    this.heart.hp = Math.max(0, this.heart.hp - amount);
    this.addEvent('heart-hurt', { position: this.heart.position, amount });
  }

  // ── Économie : ferraille & ramassage ────────────────────────────────────────

  private dropScrap(position: Vector2, amount: number): void {
    if (amount <= 0) {
      return;
    }
    this.scrapCounter += 1;
    this.scraps.push({
      id: `scrap-${this.scrapCounter}`,
      position: { x: position.x, y: position.y },
      amount,
      expiresAtTick: this.tick + SCRAP_LIFETIME_TICKS,
    });
  }

  private updateScrapPickup(): void {
    for (let index = this.scraps.length - 1; index >= 0; index -= 1) {
      const scrap = this.scraps[index];
      if (scrap === undefined) {
        continue;
      }
      const collector = this.players.find(
        (player) =>
          player.downedRemainingMs <= 0 &&
          player.hp > 0 &&
          distance(player.position, scrap.position) <= player.pickupRadius,
      );
      if (collector !== undefined) {
        this.scrapFund += scrap.amount;
        this.addEvent('scrap-collected', { position: scrap.position, amount: scrap.amount });
        this.scraps.splice(index, 1);
      }
    }
  }

  private updateScrapExpiration(): void {
    for (let index = this.scraps.length - 1; index >= 0; index -= 1) {
      const scrap = this.scraps[index];
      if (scrap !== undefined && this.tick >= scrap.expiresAtTick) {
        this.addEvent('scrap-expired', { position: scrap.position, amount: scrap.amount });
        this.scraps.splice(index, 1);
      }
    }
  }

  // ── Vagues ──────────────────────────────────────────────────────────────────

  private updateWaves(deltaMs: number): void {
    this.waveTimerMs += deltaMs;
    while (this.waveTimerMs >= WAVE.intervalMs) {
      this.waveTimerMs -= WAVE.intervalMs;
      this.spawnWave();
    }
  }

  private activeMonsterLimit(): number {
    const additionalPlayers = clamp(this.players.length - 1, 0, TOWER_MAX_ACTIVE_PLAYERS - 1);
    return MAX_ACTIVE_MONSTERS_SOLO + MAX_ACTIVE_MONSTERS_PER_EXTRA_PLAYER * additionalPlayers;
  }

  private spawnWave(): void {
    this.wave += 1;
    if (this.wave >= TIMELANDS_START_WAVE) {
      this.enterTimelands();
    }
    const elapsedSeconds = this.elapsedMs / 1_000;
    const steps = Math.floor(elapsedSeconds / WAVE.budgetStepSeconds);
    const pressureTier = TOWER_ENDGAME_TIERS.find((tier) => tier.id === 1);
    const budgetCap =
      this.isEndgameTierActive(1) && pressureTier?.effect.kind === 'spawn-pressure'
        ? pressureTier.effect.waveBudgetCap
        : WAVE.budgetCap;
    const baseBudget = Math.min(budgetCap, WAVE.budgetBase + WAVE.budgetPerStep * steps);
    const additionalPlayers = clamp(this.players.length - 1, 0, TOWER_MAX_ACTIVE_PLAYERS - 1);
    const budgetScale = monsterThreatBudgetScale(this.players.length);
    // La pression coop vient surtout de la composition. Les stats individuelles ne
    // gagnent que 2 % par allié, soit x1,18 au maximum à dix joueurs.
    const powerScale = 1 + 0.02 * additionalPlayers;
    let budget = baseBudget * budgetScale;
    const activeLimit = this.activeMonsterLimit();

    const biome = this.currentBiome();
    // Le boss est volontairement hors budget. La liste scénarisée évite de jeter le
    // Gardien Ancien sur les joueurs dès le premier jalon.
    const boss = WAVE_BOSS_SCHEDULE.find((entry) => entry.wave === this.wave);
    if (
      this.timelandsArrival.status === 'pending' &&
      boss !== undefined &&
      this.monsters.filter((monster) => monster.hp > 0).length < activeLimit
    ) {
      this.spawnMonsterWithPower(
        boss.kind,
        this.randomWaveSpawnPosition(),
        powerScale * boss.powerScale,
        'boss',
        biome.affinity,
      );
    }

    const spawnedThreatCounts = new Map<TowerWaveThreatBand, number>();
    const activeThreatCounts = new Map<TowerWaveThreatBand, number>();
    for (const monster of this.monsters) {
      if (monster.hp <= 0 || monster.rarity === 'boss') continue;
      const limit = waveThreatLimit(WAVE_MONSTER_COST[monster.kind], this.players.length);
      if (limit !== undefined) {
        activeThreatCounts.set(limit.band, (activeThreatCounts.get(limit.band) ?? 0) + 1);
      }
    }

    const initialBudget = budget;
    const spentByPowerTier = new Map<TowerMonsterPowerTier, number>();
    const spentByKind = new Map<TowerMonsterKind, number>();
    const spawnedKinds = new Set<TowerMonsterKind>();
    const progressionWave = this.timelandsArrival.status === 'pending';
    const pool = progressionWave
      ? this.eligibleProgressionWaveKinds()
      : this.eligibleTimelandsWaveKinds();

    while (budget >= 1 && this.monsters.filter((monster) => monster.hp > 0).length < activeLimit) {
      const affordable = pool.filter((kind) => {
        const cost = WAVE_MONSTER_COST[kind];
        if (cost > budget) return false;
        const limit = waveThreatLimit(cost, this.players.length);
        if (limit === undefined) return true;
        return (
          (spawnedThreatCounts.get(limit.band) ?? 0) < limit.maxSpawnedPerWave &&
          (activeThreatCounts.get(limit.band) ?? 0) < limit.maxAlive
        );
      });
      if (affordable.length === 0) {
        break;
      }
      const kind = progressionWave
        ? this.pickProgressionWaveKind(
            affordable,
            initialBudget,
            spentByPowerTier,
            spentByKind,
            spawnedKinds,
          )
        : this.pickWeightedTimelandsKind(affordable);
      if (kind === undefined) {
        break;
      }
      budget -= WAVE_MONSTER_COST[kind];
      this.spawnMonsterWithPower(
        kind,
        this.randomWaveSpawnPosition(),
        powerScale,
        this.pickWaveRarity(),
        this.pickWaveAffinity(biome.affinity),
      );
      const limit = waveThreatLimit(WAVE_MONSTER_COST[kind], this.players.length);
      if (limit !== undefined) {
        spawnedThreatCounts.set(limit.band, (spawnedThreatCounts.get(limit.band) ?? 0) + 1);
        activeThreatCounts.set(limit.band, (activeThreatCounts.get(limit.band) ?? 0) + 1);
      }
      if (progressionWave) {
        const cost = WAVE_MONSTER_COST[kind];
        const powerTier = monsterPowerTier(cost);
        spentByPowerTier.set(powerTier, (spentByPowerTier.get(powerTier) ?? 0) + cost);
        spentByKind.set(kind, (spentByKind.get(kind) ?? 0) + cost);
        spawnedKinds.add(kind);
      }
    }
  }

  private eligibleProgressionWaveKinds(): TowerMonsterKind[] {
    return ORDINARY_MONSTER_KINDS.filter((kind) => {
      const monster = MONSTER_CATALOG_BY_ID.get(kind);
      return monster !== undefined && minimumWaveForMonster(kind) <= this.wave;
    });
  }

  private pickProgressionWaveKind(
    affordable: readonly TowerMonsterKind[],
    initialBudget: number,
    spentByPowerTier: ReadonlyMap<TowerMonsterPowerTier, number>,
    spentByKind: ReadonlyMap<TowerMonsterKind, number>,
    spawnedKinds: ReadonlySet<TowerMonsterKind>,
  ): TowerMonsterKind | undefined {
    let candidates = [...affordable];
    const largestSingleCost = Math.max(...candidates.map((kind) => WAVE_MONSTER_COST[kind]));
    const maximumKindBudget = Math.max(
      largestSingleCost,
      initialBudget * WAVE.maximumKindBudgetShare,
    );
    const belowKindCap = candidates.filter(
      (kind) => (spentByKind.get(kind) ?? 0) + WAVE_MONSTER_COST[kind] <= maximumKindBudget,
    );
    if (belowKindCap.length > 0) {
      candidates = belowKindCap;
    }

    const minimumKinds = minimumDistinctMonsterKindsForWave(this.wave);
    if (spawnedKinds.size < minimumKinds) {
      const unseen = candidates.filter((kind) => !spawnedKinds.has(kind));
      if (unseen.length > 0) {
        candidates = unseen;
      }
    }

    const mix = wavePowerMix(this.wave);
    let preferredTier: TowerMonsterPowerTier | undefined;
    let largestRelativeDeficit = Number.NEGATIVE_INFINITY;
    for (const tier of TOWER_MONSTER_POWER_TIERS) {
      const targetBudget = initialBudget * mix[tier];
      if (
        targetBudget <= 0 ||
        !candidates.some((kind) => monsterPowerTier(WAVE_MONSTER_COST[kind]) === tier)
      ) {
        continue;
      }
      const relativeDeficit =
        (targetBudget - (spentByPowerTier.get(tier) ?? 0)) / Math.max(1, targetBudget);
      if (relativeDeficit > largestRelativeDeficit) {
        preferredTier = tier;
        largestRelativeDeficit = relativeDeficit;
      }
    }
    if (preferredTier !== undefined) {
      candidates = candidates.filter(
        (kind) => monsterPowerTier(WAVE_MONSTER_COST[kind]) === preferredTier,
      );
    }
    return candidates[this.random.integer(0, candidates.length - 1)];
  }

  private eligibleTimelandsWaveKinds(): TowerMonsterKind[] {
    const waveInBiome = Math.max(1, this.wave - TIMELANDS_START_WAVE + 1);
    return TIMELANDS_MONSTER_KINDS.filter((kind) => {
      const definition = timelandsMonsterDefinition(kind);
      if (definition === undefined || definition.minimumWaveInBiome > waveInBiome) {
        return false;
      }
      return (
        this.monsters.filter((monster) => monster.hp > 0 && monster.kind === kind).length <
        definition.maxAlive
      );
    });
  }

  private pickWeightedTimelandsKind(
    affordable: readonly TowerMonsterKind[],
  ): TowerMonsterKind | undefined {
    const weighted = affordable
      .map((kind) => ({ kind, weight: timelandsMonsterDefinition(kind)?.spawnWeight ?? 0 }))
      .filter((entry) => entry.weight > 0);
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = this.worldRandom.between(0, total);
    for (const entry of weighted) {
      roll -= entry.weight;
      if (roll < 0) {
        return entry.kind;
      }
    }
    return weighted.at(-1)?.kind;
  }

  private pickWaveRarity(): Exclude<TowerMonsterRarity, 'boss'> {
    const eligible = WAVE_RARITY_RULES.filter((rule) => rule.minimumWave <= this.wave);
    const totalWeight = eligible.reduce((total, rule) => total + rule.weight, 0);
    let roll = this.worldRandom.between(0, totalWeight);
    for (const rule of eligible) {
      roll -= rule.weight;
      if (roll < 0) {
        return this.minimumEndgameRarity(rule.rarity);
      }
    }
    return this.minimumEndgameRarity(eligible[eligible.length - 1]?.rarity ?? 'common');
  }

  private minimumEndgameRarity(
    rarity: Exclude<TowerMonsterRarity, 'boss'>,
  ): Exclude<TowerMonsterRarity, 'boss'> {
    if (!this.isEndgameTierActive(2) || rarity !== 'common') {
      return rarity;
    }
    return 'rare';
  }

  private pickWaveAffinity(dominant: TowerMonsterAffinity): TowerMonsterAffinity {
    if (this.worldRandom.next() < WAVE.biomeAffinityChance) {
      return dominant;
    }
    const alternatives = TOWER_BIOMES.map((biome) => biome.affinity).filter(
      (affinity) => affinity !== dominant,
    );
    return alternatives[this.worldRandom.integer(0, alternatives.length - 1)] ?? dominant;
  }

  private randomWaveSpawnPosition(): Vector2 {
    const minRadius = WORLD.spawnZoneRadius * WAVE.ringMinFactor;
    const maxRadius = WORLD.spawnZoneRadius * WAVE.ringMaxFactor;
    let fallback: Vector2 = { x: minRadius, y: 0 };
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const angle = this.random.between(0, Math.PI * 2);
      const radius = this.random.between(minRadius, maxRadius);
      const unit = exactUnitFromAngle(angle);
      const position = { x: unit.x * radius, y: unit.y * radius };
      fallback = position;
      const tooClose = this.players.some(
        (player) => distance(player.position, position) < WAVE.minDistanceFromPlayers,
      );
      if (!tooClose) {
        return position;
      }
    }
    return fallback;
  }

  // ── Progression / montée de niveau ──────────────────────────────────────────

  private addExperience(player: MutableTowerPlayer, amount: number): void {
    if (amount <= 0) {
      return;
    }
    player.experience += amount;
    while (player.experience >= player.experienceToNext) {
      player.experience -= player.experienceToNext;
      player.level += 1;
      player.experienceToNext = xpForLevel(player.level);
      player.pendingUpgrades += 1;
      this.addEvent('level-up', { position: player.position });
    }
    this.refreshUpgradeOffer(player);
  }

  private refreshUpgradeOffer(player: MutableTowerPlayer): void {
    if (player.pendingUpgrades <= 0 || player.upgradeChoices.length > 0) {
      return;
    }
    player.upgradeChoices = this.rollUpgradeOffer(player);
  }

  private rollUpgradeOffer(player: MutableTowerPlayer): TowerUpgradeCard[] {
    const offer: TowerUpgradeCard[] = [];
    const usedIds = new Set<string>();
    for (let slot = 0; slot < UPGRADE_CHOICE_COUNT; slot += 1) {
      const card = this.drawUpgradeCard(player, usedIds);
      if (card === undefined) {
        break;
      }
      usedIds.add(card.upgradeId);
      offer.push(card);
    }
    return offer;
  }

  private drawUpgradeCard(
    player: MutableTowerPlayer,
    usedIds: Set<string>,
  ): TowerUpgradeCard | undefined {
    // Tirage pondéré par rareté, puis une carte de cette rareté non déjà présente ;
    // repli sur n'importe quelle carte restante si la rareté tirée est épuisée.
    const rarity = this.pickRarity();
    const pools: UpgradeRarity[] = [rarity, ...UPGRADE_RARITIES.filter((r) => r !== rarity)];
    for (const pool of pools) {
      const candidates = getUpgradesByRarity(pool).filter(
        (card) => !usedIds.has(card.id) && (card.isEligible?.(player) ?? true),
      );
      if (candidates.length === 0) {
        continue;
      }
      const chosen = candidates[this.upgradeRandom.integer(0, candidates.length - 1)];
      if (chosen === undefined) {
        continue;
      }
      this.offerCounter += 1;
      return {
        offerId: `${chosen.id}#${this.offerCounter}`,
        upgradeId: chosen.id,
        rarity: chosen.rarity,
        label: chosen.label,
        description: chosen.description,
        ...(chosen.weaponId === undefined ? {} : { weaponId: chosen.weaponId }),
      };
    }
    return undefined;
  }

  private pickRarity(): UpgradeRarity {
    const total = UPGRADE_RARITIES.reduce((sum, rarity) => sum + UPGRADE_RARITY_WEIGHTS[rarity], 0);
    let roll = this.upgradeRandom.next() * total;
    for (const rarity of UPGRADE_RARITIES) {
      roll -= UPGRADE_RARITY_WEIGHTS[rarity];
      if (roll <= 0) {
        return rarity;
      }
    }
    return 'common';
  }

  private handleUpgradeSelection(player: MutableTowerPlayer, input: TowerInput): void {
    if (input.selectUpgradeId === undefined || player.upgradeChoices.length === 0) {
      return;
    }
    const card = player.upgradeChoices.find((choice) => choice.offerId === input.selectUpgradeId);
    if (card === undefined) {
      return;
    }
    const definition = getUpgradeById(card.upgradeId);
    if (definition === undefined) {
      return;
    }
    definition.apply(player);
    player.upgradeChoices = [];
    player.pendingUpgrades = Math.max(0, player.pendingUpgrades - 1);
    this.addEvent('upgrade-selected', { position: player.position });
    this.refreshUpgradeOffer(player);
  }

  private handleWeaponSelection(player: MutableTowerPlayer, input: TowerInput): void {
    const action = input.selectUpgradeId;
    if (action === undefined || !action.startsWith(WEAPON_ACTION_PREFIX)) {
      return;
    }
    const requested = action.slice(WEAPON_ACTION_PREFIX.length);
    const weapon = player.weapons.find((candidate) => candidate.id === requested);
    if (weapon !== undefined) {
      player.activeWeaponId = weapon.id;
    }
  }

  // ── Boutique de tourelle ─────────────────────────────────────────────────────

  private handleTurretShop(player: MutableTowerPlayer, input: TowerInput): void {
    const request = input.turretShop;
    if (
      request === undefined ||
      request === null ||
      typeof request !== 'object' ||
      typeof request.action !== 'string' ||
      player.downedRemainingMs > 0 ||
      !this.consumeTurretShopActionId(player, input.discreteActionId)
    ) {
      return;
    }
    const turret = this.turrets.find((candidate) => candidate.dir === request.turret);
    if (turret === undefined || !turret.alive) {
      return;
    }
    if (distance(player.position, turret.position) > TURRET_SHOP_RANGE) {
      return;
    }
    if (request.action === 'repair') {
      this.repairTurret(turret);
      return;
    }
    if (request.action.startsWith(MODULE_ACTION_PREFIX)) {
      this.buyTurretModule(turret, request.action.slice(MODULE_ACTION_PREFIX.length));
      return;
    }
    if (request.action.startsWith(PRIORITY_ACTION_PREFIX)) {
      this.setTurretTargetPriority(turret, request.action.slice(PRIORITY_ACTION_PREFIX.length));
      return;
    }
    if (request.action.startsWith(GLOBAL_ACTION_PREFIX)) {
      this.buyGlobalDefenseUpgrade(request.action.slice(GLOBAL_ACTION_PREFIX.length));
      return;
    }
    this.buyTurretUpgrade(turret, request.action);
  }

  private consumeTurretShopActionId(
    player: MutableTowerPlayer,
    discreteActionId: string | undefined,
  ): boolean {
    // Les anciennes commandes sans id restent compatibles. Dès qu'un id fiable est
    // présent, il est consommé au premier traitement, même si l'action échoue ensuite.
    if (discreteActionId === undefined) {
      return true;
    }
    if (
      typeof discreteActionId !== 'string' ||
      discreteActionId.length === 0 ||
      discreteActionId.length > 128
    ) {
      return false;
    }
    let processed = this.processedTurretShopActionIds.get(player.id);
    if (processed === undefined) {
      processed = new Set<string>();
      this.processedTurretShopActionIds.set(player.id, processed);
    }
    if (processed.has(discreteActionId)) {
      return false;
    }
    processed.add(discreteActionId);
    return true;
  }

  private buyTurretModule(turret: MutableTurret, requestedId: string): void {
    const module = TURRET_MODULE_CATALOG.find((candidate) => candidate.id === requestedId);
    const isSuperModule = TOWER_TURRET_SUPER_MODULES.some(
      (candidate) => candidate.id === requestedId,
    );
    if (
      module === undefined ||
      (isSuperModule &&
        !this.currentMerchantOfferIds().includes(requestedId as TowerSuperModuleId)) ||
      turret.modules.includes(module.id) ||
      this.scrapFund < module.cost
    ) {
      return;
    }

    switch (module.effect.kind) {
      case 'fire-cooldown-multiplier':
        turret.fireRate = Math.max(
          TURRET_SHOP_EFFECTS.rateMinimum,
          turret.fireRate * module.effect.multiplier,
        );
        break;
      case 'projectile-pierce-bonus':
        turret.pierce += module.effect.amount;
        break;
      case 'energy-capacity-and-grant':
        turret.maxEnergy += module.effect.capacityBonus;
        turret.energy = Math.min(turret.maxEnergy, turret.energy + module.effect.energyGrant);
        break;
    }

    turret.modules.push(module.id);
    turret.modules.sort(
      (left, right) =>
        TURRET_MODULE_CATALOG.findIndex((entry) => entry.id === left) -
        TURRET_MODULE_CATALOG.findIndex((entry) => entry.id === right),
    );
    this.scrapFund -= module.cost;
  }

  private setTurretTargetPriority(turret: MutableTurret, requested: string): void {
    const priority = TOWER_TURRET_TARGET_PRIORITIES.find((candidate) => candidate.id === requested);
    if (priority !== undefined) {
      turret.targetPriority = priority.id;
    }
  }

  private buyGlobalDefenseUpgrade(requestedId: string): void {
    const offer = TOWER_GLOBAL_DEFENSE_OFFERS.find((candidate) => candidate.id === requestedId);
    if (offer === undefined || !this.currentGlobalDefenseOfferIds().includes(offer.id)) {
      return;
    }
    const upgrade = this.globalDefenseUpgrades.find((candidate) => candidate.id === offer.id);
    if (upgrade === undefined || upgrade.level >= offer.maxLevel || this.scrapFund < offer.cost) {
      return;
    }

    switch (offer.effect.kind) {
      case 'heart-max-hp-bonus':
        this.heart.maxHp += offer.effect.amount;
        this.heart.hp += offer.effect.amount;
        break;
      case 'turret-damage-multiplier':
        for (const networkTurret of this.turrets) {
          networkTurret.bulletDamage *= offer.effect.multiplier;
        }
        break;
      case 'turret-range-bonus':
        for (const networkTurret of this.turrets) {
          networkTurret.range += offer.effect.amount;
          networkTurret.bulletRange += offer.effect.amount;
        }
        break;
    }

    upgrade.level += 1;
    this.scrapFund -= offer.cost;
  }

  private currentGlobalDefenseOfferIds(): readonly TowerGlobalDefenseOfferId[] {
    const rotation = TOWER_GLOBAL_DEFENSE_ROTATIONS[this.currentGlobalDefenseRotationId()];
    return rotation ?? [];
  }

  private currentGlobalDefenseRotationId(): number {
    return this.wave % TOWER_GLOBAL_DEFENSE_ROTATIONS.length;
  }

  private currentMerchantOfferIds(): readonly TowerSuperModuleId[] {
    const rotation = TOWER_MERCHANT_ROTATIONS[this.currentMerchantRotationId()];
    return rotation ?? [];
  }

  private currentMerchantRotationId(): number {
    return this.wave % TOWER_MERCHANT_ROTATIONS.length;
  }

  private buyTurretUpgrade(turret: MutableTurret, action: string): void {
    const entry = TOWER_TURRET_SHOP.find((candidate) => candidate.id === action);
    if (entry === undefined || this.scrapFund < entry.cost) {
      return;
    }
    switch (entry.id) {
      case 'dmg':
        turret.bulletDamage += TURRET_SHOP_EFFECTS.dmgBonus;
        break;
      case 'range':
        turret.range += TURRET_SHOP_EFFECTS.rangeBonus;
        turret.bulletRange += TURRET_SHOP_EFFECTS.rangeBonus;
        break;
      case 'rate':
        turret.fireRate = Math.max(
          TURRET_SHOP_EFFECTS.rateMinimum,
          turret.fireRate * TURRET_SHOP_EFFECTS.rateMultiplier,
        );
        break;
      case 'hp':
        turret.maxHp += TURRET_SHOP_EFFECTS.hpMaxBonus;
        turret.hp = Math.min(turret.maxHp, turret.hp + TURRET_SHOP_EFFECTS.hpHealBonus);
        break;
      case 'energy':
        turret.energyRegen += TURRET_SHOP_EFFECTS.energyRegenBonus;
        break;
      case 'maxenergy':
        turret.maxEnergy += TURRET_SHOP_EFFECTS.maxEnergyBonus;
        break;
      default:
        return;
    }
    this.scrapFund -= entry.cost;
  }

  private repairTurret(turret: MutableTurret): void {
    const missing = turret.maxHp - turret.hp;
    if (missing <= 0 || this.scrapFund <= 0) {
      return;
    }
    const affordableHp = this.scrapFund / TOWER_TURRET_REPAIR_COST_PER_HP;
    const restored = Math.min(missing, affordableHp);
    turret.hp += restored;
    this.scrapFund = Math.max(0, this.scrapFund - restored * TOWER_TURRET_REPAIR_COST_PER_HP);
  }

  private nearTurretFor(player: MutableTowerPlayer): TurretDir | undefined {
    let nearest: MutableTurret | undefined;
    let nearestDistance = Infinity;
    for (const turret of this.turrets) {
      if (!turret.alive) {
        continue;
      }
      const gap = distance(player.position, turret.position);
      if (gap <= TURRET_SHOP_RANGE && gap < nearestDistance) {
        nearestDistance = gap;
        nearest = turret;
      }
    }
    return nearest?.dir;
  }

  /**
   * Valide l'intention réseau contre l'état courant du monde. Ce calcul reste
   * dynamique : la destruction de la tourelle ou une sortie de portée pendant le
   * tick retire immédiatement la protection.
   */
  private isTurretWorkshopProtected(player: MutableTowerPlayer): boolean {
    return (
      player.turretWorkshopOpen &&
      player.hp > 0 &&
      player.downedRemainingMs <= 0 &&
      this.nearTurretFor(player) !== undefined
    );
  }

  // ── Défaite ───────────────────────────────────────────────────────────────

  private checkDefeat(): void {
    if (this.status !== 'running') {
      return;
    }
    if (this.heart.hp <= 0) {
      this.status = 'defeat';
      this.addEvent('defeat', {});
      return;
    }
    const onlyPlayer = this.players.length === 1 ? this.players[0] : undefined;
    if (onlyPlayer !== undefined && onlyPlayer.hp <= 0 && onlyPlayer.downedRemainingMs <= 0) {
      this.status = 'defeat';
      this.addEvent('defeat', {});
    }
  }

  // ── Recherches utilitaires ───────────────────────────────────────────────────

  private monsterCatalog(kind: TowerMonsterKind): TowerMonsterCatalogEntry | undefined {
    return MONSTER_CATALOG_BY_ID.get(kind);
  }

  private findNearestLivingTurret(position: Vector2): MutableTurret | undefined {
    let nearest: MutableTurret | undefined;
    let nearestDistance = Infinity;
    for (const turret of this.turrets) {
      if (!turret.alive) continue;
      const gap = distance(position, turret.position);
      if (gap < nearestDistance) {
        nearest = turret;
        nearestDistance = gap;
      }
    }
    return nearest;
  }

  /**
   * Le Pilleur choisit la structure vivante au plus faible pourcentage de PV, jamais celle qui
   * est seulement la plus proche. L'ordre des tourelles puis du Cœur fixe les égalités à graine
   * et état identiques.
   */
  private findMostWoundedLivingStructure():
    | Readonly<{
        position: Vector2;
        hp: number;
        maxHp: number;
      }>
    | undefined {
    let target: Readonly<{ position: Vector2; hp: number; maxHp: number }> | undefined;
    let lowestHealthRatio = Infinity;
    for (const turret of this.turrets) {
      if (!turret.alive) continue;
      const healthRatio = turret.hp / Math.max(1, turret.maxHp);
      if (healthRatio < lowestHealthRatio) {
        target = turret;
        lowestHealthRatio = healthRatio;
      }
    }
    if (this.heart.hp > 0) {
      const healthRatio = this.heart.hp / Math.max(1, this.heart.maxHp);
      if (healthRatio < lowestHealthRatio) {
        target = this.heart;
      }
    }
    return target;
  }

  private findNearestSupportAnchor(monster: MutableTowerMonster): MutableTowerMonster | undefined {
    let nearest: MutableTowerMonster | undefined;
    let nearestDistance = Infinity;
    for (const candidate of this.monsters) {
      if (candidate === monster || candidate.hp <= 0) continue;
      if (this.monsterCatalog(candidate.kind)?.targeting === 'support') continue;
      const gap = distance(monster.position, candidate.position);
      if (gap < nearestDistance) {
        nearest = candidate;
        nearestDistance = gap;
      }
    }
    return nearest;
  }

  private findMostIsolatedLivingPlayer(): MutableTowerPlayer | undefined {
    let isolated: MutableTowerPlayer | undefined;
    let greatestHeartDistance = -1;
    for (const player of this.players) {
      if (
        player.hp <= 0 ||
        player.downedRemainingMs > 0 ||
        this.isTurretWorkshopProtected(player)
      ) {
        continue;
      }
      const heartDistance = distance(player.position, this.heart.position);
      if (heartDistance > greatestHeartDistance) {
        isolated = player;
        greatestHeartDistance = heartDistance;
      }
    }
    return isolated;
  }

  private findPlayerById(id: string): MutableTowerPlayer | undefined {
    return this.players.find((player) => player.id === id);
  }

  private findNearestLivingPlayer(
    position: Vector2,
    maxRange: number,
    excludeTurretWorkshopProtected = false,
  ): MutableTowerPlayer | undefined {
    let nearest: MutableTowerPlayer | undefined;
    let nearestDistance = maxRange;
    for (const player of this.players) {
      if (
        player.downedRemainingMs > 0 ||
        player.hp <= 0 ||
        (excludeTurretWorkshopProtected && this.isTurretWorkshopProtected(player))
      ) {
        continue;
      }
      const gap = distance(player.position, position);
      if (gap <= nearestDistance) {
        nearestDistance = gap;
        nearest = player;
      }
    }
    return nearest;
  }

  // ── Helpers de debug (tests) ─────────────────────────────────────────────────

  public spawnMonster(kind: TowerMonsterKind, position?: Vector2): string {
    const biome = this.currentBiome();
    return this.spawnMonsterWithPower(
      kind,
      position ?? this.randomWaveSpawnPosition(),
      1,
      'common',
      biome.affinity,
    );
  }

  private spawnMonsterWithPower(
    kind: TowerMonsterKind,
    position: Vector2,
    powerScale: number,
    rarity: TowerMonsterRarity,
    affinity: TowerMonsterAffinity,
  ): string {
    const definition = MONSTERS[kind];
    const modifiers = MONSTER_RARITY_MODIFIERS[rarity];
    const adaptation = this.currentMonsterAdaptation();
    this.monsterCounter += 1;
    const id = `monster-${this.monsterCounter}`;
    const maxHp = Math.round(definition.hp * powerScale * modifiers.hp * adaptation.hp);
    this.monsters.push({
      id,
      kind,
      rarity,
      affinity,
      trait: rarity === 'boss' ? 'colossus' : MONSTER_AFFINITY_TRAITS[affinity],
      position: { x: position.x, y: position.y },
      hp: maxHp,
      maxHp,
      radius: definition.radius * modifiers.radius,
      speed: stableNumber(definition.speed * modifiers.speed * adaptation.speed),
      contactDamage: Math.round(
        definition.contactDamage * powerScale * modifiers.contactDamage * adaptation.damage,
      ),
      reward: Math.max(1, Math.round(definition.reward * modifiers.reward)),
      contactCooldownRemaining: 0,
      burnRemainingMs: 0,
      burnStacks: 0,
      burnOwnerId: undefined,
      slowRemainingMs: 0,
      slowStacks: 0,
      detonated: false,
      temporal: undefined,
      abilityCooldownRemainingMs: 900 + (this.monsterCounter % 7) * 170,
      abilityTelegraphRemainingMs: 0,
      abilityTelegraphTotalMs: 0,
      abilityTargetPosition: undefined,
      abilityUses: 0,
      behaviorElapsedMs: (this.monsterCounter % 11) * 73,
      lastDamagedTick: this.tick,
      reviveCount: 0,
      shieldHp: 0,
      camouflageRemainingMs: 0,
      supportBuffRemainingMs: 0,
      targetPlayerId: undefined,
      targetLockRemainingMs: 0,
      retreatRemainingMs: 0,
    });
    return id;
  }

  private currentBiome(): TowerBiomeState {
    if (this.timelandsArrival.status === 'pending') {
      return biomeForSeedAndWave(this.seed, this.wave);
    }
    return {
      id: TOWER_TIMELANDS_BIOME.id,
      affinity: TOWER_TIMELANDS_BIOME.affinity,
      cycle: Math.floor((TIMELANDS_START_WAVE - 1) / BIOME_DURATION_WAVES),
      startsAtWave: TIMELANDS_START_WAVE,
      durationWaves: Number.MAX_SAFE_INTEGER,
    };
  }

  public damageHeart(amount: number): void {
    if (this.status !== 'running') {
      return;
    }
    this.damageHeartInternal(Math.max(0, amount));
    this.checkDefeat();
  }

  public giveExperience(playerId: string, amount: number): void {
    if (this.status !== 'running') {
      return;
    }
    const player = this.findPlayerById(playerId);
    if (player !== undefined) {
      this.addExperience(player, Math.max(0, amount));
    }
  }

  public getScrapFund(): number {
    return this.scrapFund;
  }

  // ── Prédiction de rendu ───────────────────────────────────────────────────

  /**
   * Position qu'aura un avatar après `inputs`, sans rien modifier.
   *
   * Sert au rendu de l'avatar local en coopératif, où l'état affiché a toujours quelques ticks
   * de retard sur les touches enfoncées. Les entrées passées ici sont celles que le joueur a
   * **déjà émises** au réseau : elles seront appliquées telles quelles par tous les pairs, donc
   * la position calculée ici n'est pas un pari, c'est le résultat connu d'avance.
   *
   * La dernière entrée compte pour `lastFraction` de tick (0..1), ce qui donne un déplacement
   * continu entre deux ticks au lieu d'un saut de 13 pixels toutes les 50 ms.
   *
   * Renvoie `undefined` si l'avatar n'existe pas. Un avatar à terre ne bouge pas : sa position
   * courante est renvoyée telle quelle, comme le fait la simulation.
   *
   * **Cette méthode ne participe pas au déterminisme** : elle ne touche à aucun état, n'avance
   * aucun compteur et n'est jamais appelée par `step`. Deux pairs peuvent l'appeler à des
   * moments différents sans conséquence.
   */
  public predictPlayerPosition(
    playerId: string,
    inputs: readonly TowerInput[],
    lastFraction = 1,
  ): Vector2 | undefined {
    const playerIndex = this.playerIds.indexOf(playerId);
    const player = playerIndex < 0 ? undefined : this.players[playerIndex];
    if (player === undefined) {
      return undefined;
    }
    let position: Vector2 = { x: player.position.x, y: player.position.y };
    if (player.downedRemainingMs > 0) {
      return position;
    }
    const deltaSeconds = TICK_MS / 1_000;
    let hostileSlowRemainingMs = player.hostileSlowRemainingMs;
    for (let frame = 0; frame < inputs.length; frame += 1) {
      const input = inputs[frame];
      if (input === undefined) {
        break;
      }
      const fraction = frame === inputs.length - 1 ? clamp(lastFraction, 0, 1) : 1;
      const temporalScale = this.temporalScaleForPlayer(player.id, this.tick + frame + 1);
      hostileSlowRemainingMs = Math.max(0, hostileSlowRemainingMs - TICK_MS * fraction);
      position = movedPlayerPosition(
        position,
        input,
        player.speed,
        deltaSeconds * fraction * playerMovementScale(temporalScale, hostileSlowRemainingMs),
      );
    }
    return position;
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  public createSnapshot(): TowerGameState {
    const players = this.players.map((player) => this.projectPlayer(player));
    const primary = players[0];
    if (primary === undefined) {
      throw new Error('TowerSimulation requiert au moins un joueur.');
    }
    const rotationId = this.currentGlobalDefenseRotationId();
    const offerIds = TOWER_GLOBAL_DEFENSE_ROTATIONS[rotationId];
    if (offerIds === undefined) {
      throw new Error('Le catalogue Tower requiert au moins une rotation globale.');
    }
    const merchantRotationId = this.currentMerchantRotationId();
    const merchantOfferIds = TOWER_MERCHANT_ROTATIONS[merchantRotationId];
    if (merchantOfferIds === undefined) {
      throw new Error('Le catalogue Tower requiert au moins une rotation marchand.');
    }
    return {
      tick: this.tick,
      elapsedMs: this.elapsedMs,
      status: this.status,
      seed: this.seed,
      world: {
        width: WORLD.width,
        height: WORLD.height,
        spawnZoneRadius: WORLD.spawnZoneRadius,
      },
      biome: this.currentBiome(),
      timelands: this.projectTimelands(),
      endgame: this.projectEndgame(),
      wave: this.wave,
      scrapFund: this.scrapFund,
      globalDefenseUpgrades: this.globalDefenseUpgrades.map((upgrade) => ({ ...upgrade })),
      globalDefenseShop: { rotationId, offerIds: [...offerIds] },
      sharedQuest: this.projectSharedQuest(),
      merchantShop: { rotationId: merchantRotationId, offerIds: [...merchantOfferIds] },
      player: primary,
      players,
      heart: this.projectHeart(),
      turrets: this.turrets.map((turret) => this.projectTurret(turret)),
      monsters: this.monsters.map((monster) => this.projectMonster(monster)),
      monsterZones: this.monsterZones.map((zone) => this.projectMonsterZone(zone)),
      projectiles: this.projectiles.map((bullet) => this.projectProjectile(bullet)),
      scraps: this.scraps.map((scrap) => this.projectScrap(scrap)),
      events: this.events.map((event) => ({ ...event })),
    };
  }

  private projectTimelands(): TowerTimelandsState {
    const arrival: TowerTimelandsArrivalState = { ...this.timelandsArrival };
    const warden: TowerTimelandsWardenState =
      this.timelandsWarden.status === 'active'
        ? {
            ...this.timelandsWarden,
            releasedMonsterIds: [...this.timelandsWarden.releasedMonsterIds],
          }
        : { ...this.timelandsWarden };
    return {
      arrival,
      activeEffects: this.temporalEffects.map((effect) => ({ ...effect })),
      warden,
    };
  }

  private projectEndgame(): TowerEndgameState {
    const nextDefinition = TOWER_ENDGAME_TIERS.find(
      (definition) => !this.endgameActiveTiers.some((active) => active.id === definition.id),
    );
    return {
      phaseStartedAtTick: this.endgameStartedAtTick,
      activeTiers: this.endgameActiveTiers.map((tier) => ({ ...tier })),
      nextTier:
        nextDefinition === undefined || this.endgameStartedAtTick === null
          ? null
          : {
              id: nextDefinition.id,
              triggersAtTick: this.endgameStartedAtTick + nextDefinition.triggerOffsetTicks,
            },
      announcement: this.endgameAnnouncement === null ? null : { ...this.endgameAnnouncement },
    };
  }

  private projectSharedQuest(): TowerSharedQuestState {
    const quest = this.currentSharedQuestDefinition();
    return {
      rotationId: this.currentSharedQuestRotationId(),
      id: quest.id,
      objective: quest.objective,
      progress: this.sharedQuestProgress,
      target: quest.target,
      rewardScrap: quest.rewardScrap,
      completedCount: this.sharedQuestCompletedCount,
    };
  }

  private projectPlayer(player: MutableTowerPlayer): TowerPlayerState {
    const nearTurret = this.nearTurretFor(player);
    const turretWorkshopProtected = this.isTurretWorkshopProtected(player);
    const activeWeapon = this.projectWeapons(player).find(
      (weapon) => weapon.id === player.activeWeaponId,
    );
    if (activeWeapon === undefined) {
      throw new Error(`Arme active absente de l'arsenal : ${player.activeWeaponId}`);
    }
    return {
      id: player.id,
      position: { ...player.position },
      aim: { ...player.aim },
      hp: player.hp,
      maxHp: player.maxHp,
      level: player.level,
      experience: player.experience,
      experienceToNext: player.experienceToNext,
      gold: player.gold,
      activeWeaponId: player.activeWeaponId,
      weapons: this.projectWeapons(player),
      fireRate: activeWeapon.fireRate,
      bulletDamage: activeWeapon.bulletDamage,
      pendingUpgrades: player.pendingUpgrades,
      upgradeChoices: player.upgradeChoices.map((card) => ({ ...card })),
      downedRemainingMs: player.downedRemainingMs,
      hostileSlowRemainingMs: player.hostileSlowRemainingMs,
      ...(nearTurret === undefined ? {} : { nearTurret }),
      ...(turretWorkshopProtected ? { turretWorkshopProtected: true } : {}),
    };
  }

  private projectWeapons(player: MutableTowerPlayer): TowerWeaponState[] {
    return player.weapons.map((weapon) => {
      const definition = weaponDefinition(weapon.id);
      return {
        id: weapon.id,
        level: weapon.level,
        fireRate: this.weaponFireRate(player, weapon, definition),
        bulletDamage: this.weaponDamage(player, weapon, definition),
        projectileCount: definition.projectileCount,
      };
    });
  }

  private projectHeart(): HeartState {
    return {
      position: { ...this.heart.position },
      hp: this.heart.hp,
      maxHp: this.heart.maxHp,
      radius: this.heart.radius,
    };
  }

  private projectTurret(turret: MutableTurret): TurretState {
    return {
      dir: turret.dir,
      position: { ...turret.position },
      angle: turret.angle,
      hp: turret.hp,
      maxHp: turret.maxHp,
      energy: turret.energy,
      maxEnergy: turret.maxEnergy,
      range: turret.range,
      modules: [...turret.modules],
      targetPriority: turret.targetPriority,
      alive: turret.alive,
    };
  }

  private projectMonster(monster: MutableTowerMonster): TowerMonsterState {
    const definition = this.monsterCatalog(monster.kind);
    const ability =
      definition === undefined
        ? undefined
        : monsterBehaviorProfile(definition.signature as TowerMonsterSignature).ability;
    return {
      id: monster.id,
      kind: monster.kind,
      rarity: monster.rarity,
      affinity: monster.affinity,
      trait: monster.trait,
      position: { ...monster.position },
      hp: monster.hp,
      maxHp: monster.maxHp,
      radius: monster.radius,
      ...(monster.shieldHp <= 0
        ? {}
        : { shieldRatio: Math.min(1, monster.shieldHp / Math.max(1, monster.maxHp * 0.18)) }),
      ...(monster.camouflageRemainingMs > 0 ? { camouflaged: true } : {}),
      ...(monster.supportBuffRemainingMs > 0 ||
      (monster.kind === 'ancient-guardian' && monster.hp < monster.maxHp * 0.5)
        ? { empowered: true }
        : {}),
      ...(monster.temporal === undefined ? {} : { temporal: { ...monster.temporal } }),
      ...(ability === undefined || monster.abilityTelegraphRemainingMs <= 0
        ? {}
        : {
            ability: {
              kind: ability.kind,
              phase: 'telegraph' as const,
              remainingMs: monster.abilityTelegraphRemainingMs,
              totalMs: monster.abilityTelegraphTotalMs,
              radius: ability.radius,
              ...(monster.abilityTargetPosition === undefined
                ? {}
                : { targetPosition: { ...monster.abilityTargetPosition } }),
            },
          }),
    };
  }

  private projectProjectile(bullet: MutableTowerProjectile): TowerProjectileState {
    const source: ProjectileSource = bullet.source;
    return {
      id: bullet.id,
      position: { ...bullet.position },
      radius: bullet.radius,
      source,
      ...(bullet.ownerId === undefined ? {} : { ownerId: bullet.ownerId }),
      friendly: true,
      ...(bullet.weaponId === undefined ? {} : { weaponId: bullet.weaponId }),
    };
  }

  private projectMonsterZone(zone: MutableTowerMonsterZone): TowerMonsterZoneState {
    return {
      id: zone.id,
      kind: zone.kind,
      position: { ...zone.position },
      radius: zone.radius,
      remainingMs: zone.remainingMs,
      durationMs: zone.durationMs,
      ...(zone.endPosition === undefined ? {} : { endPosition: { ...zone.endPosition } }),
    };
  }

  private projectScrap(scrap: MutableScrap): ScrapPickupState {
    return {
      id: scrap.id,
      position: { ...scrap.position },
      amount: scrap.amount,
    };
  }

  private addEvent(
    type: TowerEventType,
    details: Readonly<{ position?: Vector2; amount?: number }>,
  ): void {
    this.eventCounter += 1;
    this.events.push({
      id: this.eventCounter,
      tick: this.tick,
      type,
      ...(details.position === undefined ? {} : { position: { ...details.position } }),
      ...(details.amount === undefined ? {} : { amount: details.amount }),
    });
  }
}

/** XP requise pour passer du niveau `level` au suivant : 55 puis ×1.11 (arrondi). */
function xpForLevel(level: number): number {
  // Multiplications successives plutôt qu'une puissance : l'opérateur `**` est approximé par
  // l'implémentation, et il fixe ici les seuils de niveau, donc les offres d'amélioration.
  let threshold = XP_BASE;
  for (let step = 1; step < level; step += 1) {
    threshold *= XP_GROWTH;
  }
  return Math.round(threshold);
}
