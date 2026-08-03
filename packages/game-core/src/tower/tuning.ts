// Réglage (« tuning ») du NOUVEAU jeu Tower / twin-stick — Phase 1 (Lot A).
//
// Toutes les constantes de simulation vivent ici pour rester lisibles et faciles à
// équilibrer. Le moteur (`simulation.ts`) les applique ; rien n'est dupliqué ailleurs.

import type {
  TowerBiomeId,
  TowerMonsterAffinity,
  TowerMonsterKind,
  TowerLegacyMonsterKind,
  TowerMonsterRarity,
  TowerMonsterTrait,
  TurretDir,
} from '@village-survivor/protocol';
import {
  TOWER_ACTIVE_MONSTERS,
  TOWER_TIMELANDS_MONSTERS,
  type TowerMonsterCatalogEntry,
  type TowerMonsterFaction,
} from '@village-survivor/content';

/** Durée d'un tick de simulation (ms). 20 Hz. */
export const TICK_MS = 50;

/** Bornes et dimensions du monde. Le Cœur est à l'origine (0, 0). */
export const WORLD = {
  width: 12_000,
  height: 12_000,
  spawnZoneRadius: 4_000,
  /** Demi-largeur jouable : positions clampées dans [-bound, +bound]. */
  bound: 6_000,
} as const;

/** Stats de base d'un avatar joueur et de son arme classique. */
export const PLAYER = {
  maxHp: 300,
  speed: 260,
  radius: 14,
  pickupRadius: 60,
  /** Arme classique. */
  fireRate: 0.4,
  bulletDamage: 15,
  bulletSpeed: 600,
  bulletRange: 650,
  bulletRadius: 4,
  critChance: 0,
  critMult: 1.5,
} as const;

/** Espacement horizontal des avatars co-op au départ (pour ne pas les empiler). */
export const AVATAR_START_SPACING = 60;

/** Durée « à terre » (K.O.) avant réapparition en co-op (30 s). */
export const DOWNED_DURATION_MS = 30_000;

/** Courbe d'XP : xpForLevel(1) = 55 puis ×1.11 par niveau (arrondi). */
export const XP_BASE = 55;
export const XP_GROWTH = 1.11;
/** XP gagnée par kill = reward du monstre × ce facteur. */
export const XP_PER_KILL_FACTOR = 4;
/** Or personnel gagné par kill = reward du monstre × ce facteur. */
export const GOLD_PER_KILL_FACTOR = 3;

/** Le Cœur à défendre. */
export const HEART = {
  hp: 1_400,
  radius: 55,
} as const;

/** Les quatre tourelles fixes autour du Cœur. */
export const TURRET = {
  /** Distance au Cœur (origine). */
  offset: 240,
  hp: 500,
  maxEnergy: 100,
  energyPerShot: 5,
  energyRegen: 4,
  fireRate: 1.2,
  range: 320,
  bulletDamage: 42,
  bulletSpeed: 550,
  bulletRange: 340,
  bulletRadius: 5,
  /** Rayon du corps de la tourelle (collisions de contact). */
  bodyRadius: 22,
  /** Demi-arc de visée (degrés). */
  halfArcDeg: 55,
} as const;

/** Angle de visée (degrés) de chaque tourelle. */
export const TURRET_ANGLES: Readonly<Record<TurretDir, number>> = {
  N: -90,
  E: 0,
  S: 90,
  W: 180,
};

/** Distance maximale joueur→tourelle pour ouvrir la boutique de tourelle. */
export const TURRET_SHOP_RANGE = 90;

/** Effets d'achat de la boutique de tourelle (id de `TOWER_TURRET_SHOP`). */
export const TURRET_SHOP_EFFECTS = {
  dmgBonus: 15,
  rangeBonus: 40,
  rateMultiplier: 0.93,
  rateMinimum: 0.05,
  hpMaxBonus: 110,
  hpHealBonus: 100,
  energyRegenBonus: 2,
  maxEnergyBonus: 30,
} as const;

/** Définition d'un type de monstre du set MVP. */
export interface MonsterDefinition {
  hp: number;
  speed: number;
  radius: number;
  contactDamage: number;
  reward: number;
}

const MONSTER_RADIUS_BY_SIZE = {
  'very-small': 6,
  small: 10,
  medium: 14,
  large: 20,
  'very-large': 28,
} as const;

/**
 * Première passe d'équilibrage commune au catalogue. Les valeurs sont dérivées du
 * coût de menace afin que l'ajout d'une fiche reste jouable avant son réglage fin.
 */
function catalogStats(monster: TowerMonsterCatalogEntry): MonsterDefinition {
  const timelands = TOWER_TIMELANDS_MONSTERS.find((candidate) => candidate.id === monster.id);
  if (timelands !== undefined) {
    return {
      hp: timelands.hp,
      speed: timelands.speed,
      radius: timelands.radius,
      contactDamage: timelands.contactDamage,
      reward: timelands.reward,
    };
  }
  if (monster.id === 'ancient-guardian') {
    return { hp: 5_000, speed: 70, radius: 46, contactDamage: 55, reward: 80 };
  }
  const radius = MONSTER_RADIUS_BY_SIZE[monster.sizeClass];
  const speedByShape = {
    circle: 90,
    triangle: 145,
    square: 58,
    pentagon: 78,
    hexagon: 70,
    star: 105,
  } as const;
  return {
    hp: Math.round(24 + monster.threatCost * 24 + radius * 2),
    speed: speedByShape[monster.roleShape],
    radius,
    contactDamage: Math.round(5 + monster.threatCost * 2.2),
    reward: Math.max(1, Math.round(monster.threatCost / 2)),
  };
}

function timelandsStats(
  id: 'time-deer' | 'time-controller' | 'time-watch' | 'time-warden',
): MonsterDefinition {
  const monster = TOWER_TIMELANDS_MONSTERS.find((candidate) => candidate.id === id);
  if (monster === undefined) {
    throw new Error(`Monstre Timelands absent du catalogue: ${id}`);
  }
  return {
    hp: monster.hp,
    speed: monster.speed,
    radius: monster.radius,
    contactDamage: monster.contactDamage,
    reward: monster.reward,
  };
}

const LEGACY_MONSTERS: Readonly<Record<TowerLegacyMonsterKind, MonsterDefinition>> = {
  chaser: { hp: 40, speed: 90, radius: 12, contactDamage: 12, reward: 1 },
  runner: { hp: 20, speed: 170, radius: 9, contactDamage: 8, reward: 1 },
  brute: { hp: 160, speed: 55, radius: 18, contactDamage: 25, reward: 3 },
  'time-deer': timelandsStats('time-deer'),
};

export const MONSTERS: Readonly<Record<TowerMonsterKind, MonsterDefinition>> = Object.freeze({
  ...LEGACY_MONSTERS,
  ...Object.fromEntries(
    TOWER_ACTIVE_MONSTERS.map((monster) => [monster.id, catalogStats(monster)]),
  ),
}) as Readonly<Record<TowerMonsterKind, MonsterDefinition>>;

/** Rotation des décors. Une entrée décrit aussi l'affinité dominante de ses vagues. */
export const TOWER_BIOMES: readonly Readonly<{
  id: TowerBiomeId;
  affinity: TowerMonsterAffinity;
}>[] = [
  { id: 'grove', affinity: 'nature' },
  { id: 'badlands', affinity: 'fire' },
  { id: 'tundra', affinity: 'frost' },
  { id: 'tempest', affinity: 'storm' },
];

/** Incursions thématiques validées : une ou deux factions dominent trois vagues. */
export const TOWER_MONSTER_INCURSIONS: readonly (readonly TowerMonsterFaction[])[] = [
  ['forest', 'cave'],
  ['desert', 'graveyard'],
  ['mercenary', 'mountain'],
  ['tribe', 'hell'],
  ['machines'],
];

/** Nombre de vagues consécutives passées dans le même biome. */
export const BIOME_DURATION_WAVES = 3;

/** Trait ordinaire stable associé à chaque affinité (le boss force `colossus`). */
export const MONSTER_AFFINITY_TRAITS: Readonly<Record<TowerMonsterAffinity, TowerMonsterTrait>> = {
  nature: 'hardened',
  fire: 'ferocious',
  frost: 'armored',
  storm: 'swift',
  time: 'temporal',
};

export interface MonsterStatModifiers {
  hp: number;
  speed: number;
  contactDamage: number;
  radius: number;
  reward: number;
}

/** Multiplicateurs bornés et centralisés appliqués une seule fois à l'apparition. */
export const MONSTER_RARITY_MODIFIERS: Readonly<Record<TowerMonsterRarity, MonsterStatModifiers>> =
  {
    common: { hp: 1, speed: 1, contactDamage: 1, radius: 1, reward: 1 },
    rare: { hp: 1.2, speed: 1.01, contactDamage: 1.1, radius: 1, reward: 1.3 },
    epic: { hp: 1.45, speed: 1.02, contactDamage: 1.2, radius: 1.05, reward: 1.75 },
    legendary: { hp: 1.8, speed: 1.03, contactDamage: 1.35, radius: 1.1, reward: 2.5 },
    boss: { hp: 1, speed: 1, contactDamage: 1, radius: 1, reward: 1 },
  };

/** Poids progressifs : les raretés supérieures n'entrent qu'aux vagues indiquées. */
export const WAVE_RARITY_RULES: readonly Readonly<{
  rarity: Exclude<TowerMonsterRarity, 'boss'>;
  minimumWave: number;
  weight: number;
}>[] = [
  { rarity: 'common', minimumWave: 1, weight: 70 },
  { rarity: 'rare', minimumWave: 2, weight: 20 },
  { rarity: 'epic', minimumWave: 4, weight: 8 },
  { rarity: 'legendary', minimumWave: 7, weight: 2 },
];

/** Explosion du kamikaze (au contact d'un joueur/tourelle/cœur OU à sa mort). */
export const KAMIKAZE_EXPLOSION = {
  radius: 70,
  damage: 35,
} as const;

/** Explosion « détonation » d'un build joueur (explodeOnKill) — touche les monstres. */
export const EXPLODE_ON_KILL = {
  radius: 90,
} as const;

/** Marge de tolérance ajoutée à la somme des rayons pour un contact. */
export const CONTACT_MARGIN = 4;

/** Cooldown de contact d'un monstre (s) : entre deux dégâts qu'il inflige. */
export const CONTACT_COOLDOWN_MS = 600;

/** Distance à partir de laquelle un monstre poursuit un joueur plutôt que le Cœur. */
export const MONSTER_PLAYER_AGGRO_RANGE = 900;

/** Brûlure (burnStacks) : dégâts par pile et par seconde, durée par application. */
export const BURN = {
  dpsPerStack: 5,
  durationMs: 3_000,
} as const;

/**
 * Ralentissement infligé par un coup critique, amélioration « Fracture glaciale ».
 *
 * Valeurs volontairement prudentes : l'amélioration existait dans le catalogue sans qu'aucun
 * effet ne lui soit associé, donc sans équilibrage antérieur. Elles demandent à être validées
 * par des parties réelles avant d'être considérées comme acquises.
 */
export const CRIT_SLOW = {
  /** Fraction de vitesse retirée par pile. */
  perStack: 0.15,
  /** Piles simultanées maximales sur un même monstre. */
  maxStacks: 3,
  /** Durée d'une application (ms), rafraîchie à chaque nouveau coup critique. */
  durationMs: 2_000,
} as const;

/** Écart angulaire (rad) entre projectiles supplémentaires du tir multiple. */
export const MULTISHOT_SPREAD_RAD = 0.14;

/** Économie : ferraille naturelle. */
export const NATURAL_SCRAP = {
  intervalMs: 7_000,
  count: 5,
  amount: 1,
  /** Rayon minimal autour du Cœur où la ferraille naturelle n'apparaît pas. */
  minRadiusFromHeart: 300,
} as const;

/** Vagues de groupe. */
export const WAVE = {
  intervalMs: 10_000,
  budgetBase: 5,
  budgetPerStep: 2,
  budgetStepSeconds: 30,
  budgetCap: 90,
  /** Anneau d'apparition, en fraction de `spawnZoneRadius`. */
  ringMinFactor: 0.6,
  ringMaxFactor: 0.95,
  /** Distance minimale d'apparition par rapport à chaque joueur. */
  minDistanceFromPlayers: 720,
  /** Probabilité qu'un monstre ordinaire adopte l'affinité dominante du biome. */
  biomeAffinityChance: 0.7,
  /** Chaque multiple de cette valeur reçoit exactement un boss supplémentaire. */
  bossEvery: 5,
  bossKind: 'ancient-guardian' as TowerMonsterKind,
} as const;

/** Courbe validée du budget de menace coopératif, plafonnée à dix joueurs. */
export function monsterThreatBudgetScale(playerCount: number): number {
  const activePlayers = Math.max(1, Math.min(10, Math.floor(playerCount)));
  if (activePlayers === 1) return 1;
  if (activePlayers === 2) return 1.65;
  return Math.round((2.2 + (activePlayers - 3) * 0.45) * 100) / 100;
}

/** Coût (budget) de chaque type de monstre dans une vague. */
export const WAVE_MONSTER_COST: Readonly<Record<TowerMonsterKind, number>> = Object.freeze({
  chaser: 1,
  runner: 1,
  brute: 4,
  'time-deer': 12,
  ...Object.fromEntries(
    TOWER_ACTIVE_MONSTERS.map((monster) => [monster.id, Math.max(1, monster.threatCost)]),
  ),
}) as Readonly<Record<TowerMonsterKind, number>>;

/** Premiere vague du biome final: un cycle complet de chaque biome ordinaire. */
export const TIMELANDS_START_WAVE = TOWER_MONSTER_INCURSIONS.length * BIOME_DURATION_WAVES + 1;

/** Poids de tirage de chaque rareté de carte de montée de niveau. */
export const UPGRADE_RARITY_WEIGHTS = {
  common: 58.3,
  rare: 25,
  epic: 13,
  legendary: 2.7,
  mythic: 0.9,
  divin: 0.1,
} as const;

/** Nombre de cartes proposées à chaque offre de montée de niveau. */
export const UPGRADE_CHOICE_COUNT = 3;
