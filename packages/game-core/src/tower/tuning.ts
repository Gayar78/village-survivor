// Réglage (« tuning ») du NOUVEAU jeu Tower / twin-stick — Phase 1 (Lot A).
//
// Toutes les constantes de simulation vivent ici pour rester lisibles et faciles à
// équilibrer. Le moteur (`simulation.ts`) les applique ; rien n'est dupliqué ailleurs.

import type {
  TowerBiomeId,
  TowerMonsterAffinity,
  TowerMonsterKind,
  TowerMonsterRarity,
  TowerMonsterTrait,
  TurretDir,
} from '@village-survivor/protocol';

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

export const MONSTERS: Readonly<Record<TowerMonsterKind, MonsterDefinition>> = {
  chaser: { hp: 40, speed: 90, radius: 12, contactDamage: 12, reward: 1 },
  runner: { hp: 20, speed: 170, radius: 9, contactDamage: 8, reward: 1 },
  brute: { hp: 160, speed: 55, radius: 18, contactDamage: 25, reward: 3 },
  kamikaze: { hp: 25, speed: 120, radius: 11, contactDamage: 0, reward: 2 },
};

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

/** Nombre de vagues consécutives passées dans le même biome. */
export const BIOME_DURATION_WAVES = 3;

/** Trait ordinaire stable associé à chaque affinité (le boss force `colossus`). */
export const MONSTER_AFFINITY_TRAITS: Readonly<Record<TowerMonsterAffinity, TowerMonsterTrait>> = {
  nature: 'hardened',
  fire: 'ferocious',
  frost: 'armored',
  storm: 'swift',
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
    uncommon: { hp: 1.3, speed: 1.05, contactDamage: 1.15, radius: 1.05, reward: 2 },
    rare: { hp: 1.8, speed: 1.08, contactDamage: 1.35, radius: 1.1, reward: 3 },
    elite: { hp: 2.7, speed: 1.12, contactDamage: 1.65, radius: 1.2, reward: 5 },
    boss: { hp: 6, speed: 0.85, contactDamage: 2.25, radius: 1.5, reward: 12 },
  };

/** Poids progressifs : les raretés supérieures n'entrent qu'aux vagues indiquées. */
export const WAVE_RARITY_RULES: readonly Readonly<{
  rarity: Exclude<TowerMonsterRarity, 'boss'>;
  minimumWave: number;
  weight: number;
}>[] = [
  { rarity: 'common', minimumWave: 1, weight: 70 },
  { rarity: 'uncommon', minimumWave: 2, weight: 20 },
  { rarity: 'rare', minimumWave: 4, weight: 8 },
  { rarity: 'elite', minimumWave: 7, weight: 2 },
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

/** Durée maximale d'un tas de ferraille au sol : 600 ticks × 50 ms = 30 secondes. */
export const SCRAP_LIFETIME_TICKS = 600;

/** Vagues de groupe. */
export const WAVE = {
  intervalMs: 10_000,
  budgetBase: 5,
  budgetPerStep: 2,
  budgetStepSeconds: 30,
  budgetCap: 90,
  /** Facteur additionnel de budget par joueur supplémentaire. */
  perPlayerFactor: 0.6,
  /** Anneau d'apparition, en fraction de `spawnZoneRadius`. */
  ringMinFactor: 0.6,
  ringMaxFactor: 0.95,
  /** Distance minimale d'apparition par rapport à chaque joueur. */
  minDistanceFromPlayers: 720,
  /** Probabilité qu'un monstre ordinaire adopte l'affinité dominante du biome. */
  biomeAffinityChance: 0.7,
  /** Chaque multiple de cette valeur reçoit exactement un boss supplémentaire. */
  bossEvery: 5,
  bossKind: 'brute' as TowerMonsterKind,
} as const;

/** Coût (budget) de chaque type de monstre dans une vague. */
export const WAVE_MONSTER_COST: Readonly<Record<TowerMonsterKind, number>> = {
  chaser: 1,
  runner: 1,
  kamikaze: 2,
  brute: 4,
};

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
