// Contenu PARTAGÉ du nouveau jeu (« Tower / arme à feu », Phase 3).
//
// Seules les données dont PLUSIEURS lots ont besoin vivent ici (pour éviter toute
// divergence entre le moteur qui applique et l'UI qui affiche). Le reste du réglage
// (stats joueur/arme/tourelle/monstres, courbe d'XP, budget de vagues…) appartient au
// moteur (game-core, Lot A).

/** Identifiants canoniques du roster du biome final. */
export type TowerTimelandsMonsterId =
  'time-deer' | 'time-controller' | 'time-watch' | 'time-warden';

export type TowerTimelandsMechanic =
  | Readonly<{
      kind: 'warden-control';
      releaseIntervalTicks: number;
      releaseCount: number;
      resurrectionChance: number;
      resurrectionHpFraction: number;
      alterations: readonly ['slow', 'haste', 'blink'];
      lowHpRelocationThreshold: number;
    }>
  | Readonly<{
      kind: 'deer-escape';
      teleportCooldownTicks: number;
      minimumTeleportDistance: number;
      guaranteedUpgradeDrop: true;
    }>
  | Readonly<{
      kind: 'controller-strike';
      freezeDurationTicks: number;
      vanishAfterHit: true;
      rollbackChance: number;
      rollbackCooldownTicks: number;
    }>
  | Readonly<{
      kind: 'watch-death-effect';
      rewindChance: number;
      rewindTicks: number;
      globalSlow: Readonly<{ scale: number; durationTicks: number }>;
      globalHaste: Readonly<{ scale: number; durationTicks: number }>;
      playerSlow: Readonly<{ scale: number; durationTicks: number }>;
      playerHaste: Readonly<{ scale: number; durationTicks: number }>;
    }>;

/** Fiche partagée moteur/UI d'un monstre Timelands. */
export type TowerTimelandsMonsterDefinition = Readonly<{
  id: TowerTimelandsMonsterId;
  label: string;
  unique: boolean;
  hp: number;
  speed: number;
  radius: number;
  contactDamage: number;
  reward: number;
  spawnWeight: number;
  minimumWaveInBiome: number;
  maxAlive: number;
  mechanic: TowerTimelandsMechanic;
}>;

/**
 * Biome final et fenêtre de rembobinage, exprimés en ticks de simulation (20 Hz).
 * Aucun consommateur n'a à convertir une durée murale pour prendre une décision.
 */
export const TOWER_TIMELANDS_BIOME = Object.freeze({
  id: 'timelands' as const,
  label: 'Terres du Temps',
  affinity: 'time' as const,
  finalBiome: true as const,
  arrivalAnnouncementTicks: 80,
  historySampleIntervalTicks: 5,
  historyDepthTicks: 120,
  rosterIds: Object.freeze(['time-deer', 'time-controller', 'time-watch', 'time-warden'] as const),
});

/** Roster minimal Timelands. Le Warden est exclu du tirage (`spawnWeight: 0`). */
export const TOWER_TIMELANDS_MONSTERS: readonly TowerTimelandsMonsterDefinition[] = Object.freeze([
  Object.freeze({
    id: 'time-deer',
    label: 'Cerf du Temps',
    unique: false,
    hp: 4_600,
    speed: 80,
    radius: 32,
    contactDamage: 0,
    reward: 45,
    spawnWeight: 50,
    minimumWaveInBiome: 2,
    maxAlive: 3,
    mechanic: Object.freeze({
      kind: 'deer-escape',
      teleportCooldownTicks: 30,
      minimumTeleportDistance: 500,
      guaranteedUpgradeDrop: true,
    }),
  }),
  Object.freeze({
    id: 'time-controller',
    label: 'Contrôleur',
    unique: false,
    hp: 5_400,
    speed: 280,
    radius: 22,
    contactDamage: 64,
    reward: 18,
    spawnWeight: 28,
    minimumWaveInBiome: 4,
    maxAlive: 4,
    mechanic: Object.freeze({
      kind: 'controller-strike',
      freezeDurationTicks: 60,
      vanishAfterHit: true,
      rollbackChance: 0.25,
      rollbackCooldownTicks: 15,
    }),
  }),
  Object.freeze({
    id: 'time-watch',
    label: 'La Montre',
    unique: false,
    hp: 3_600,
    speed: 105,
    radius: 27,
    contactDamage: 50,
    reward: 16,
    spawnWeight: 24,
    minimumWaveInBiome: 1,
    maxAlive: 8,
    mechanic: Object.freeze({
      kind: 'watch-death-effect',
      rewindChance: 0.05,
      rewindTicks: 80,
      globalSlow: Object.freeze({ scale: 0.35, durationTicks: 100 }),
      globalHaste: Object.freeze({ scale: 2.2, durationTicks: 80 }),
      playerSlow: Object.freeze({ scale: 0.4, durationTicks: 100 }),
      playerHaste: Object.freeze({ scale: 2.6, durationTicks: 100 }),
    }),
  }),
  Object.freeze({
    id: 'time-warden',
    label: 'Manieur du Temps',
    unique: true,
    hp: 36_000,
    speed: 50,
    radius: 42,
    contactDamage: 220,
    reward: 70,
    spawnWeight: 0,
    minimumWaveInBiome: 0,
    maxAlive: 1,
    mechanic: Object.freeze({
      kind: 'warden-control',
      releaseIntervalTicks: 280,
      releaseCount: 1,
      resurrectionChance: 0.35,
      resurrectionHpFraction: 0.9,
      alterations: Object.freeze(['slow', 'haste', 'blink'] as const),
      lowHpRelocationThreshold: 0.2,
    }),
  }),
]);

export type TowerEndgameTierDefinition = Readonly<{
  id: 1 | 2 | 3 | 4;
  label: string;
  description: string;
  /** Décalage depuis l'arrivée des Timelands ; le palier 1 est immédiat. */
  triggerOffsetTicks: number;
  effect:
    | Readonly<{
        kind: 'spawn-pressure';
        waveBudgetCap: number;
      }>
    | Readonly<{ kind: 'minimum-rarity'; rarity: 'rare' }>
    | Readonly<{
        kind: 'turret-energy-drain';
        basePerSecond: number;
        rampPerMinute: number;
      }>
    | Readonly<{
        kind: 'monster-adaptation';
        hpPerMinute: number;
        damagePerMinute: number;
        speedPerMinute: number;
      }>;
}>;

export const TOWER_ENDGAME_TIER_INTERVAL_TICKS = 3_000;
export const TOWER_ENDGAME_ANNOUNCEMENT_TICKS = 80;

/** Quatre paliers cumulatifs effectifs, triés par id et déclenchés sans horloge murale. */
export const TOWER_ENDGAME_TIERS: readonly TowerEndgameTierDefinition[] = Object.freeze([
  Object.freeze({
    id: 1,
    label: 'Pression accrue',
    description: 'Le plafond de budget de vague passe à 160.',
    triggerOffsetTicks: 0,
    effect: Object.freeze({
      kind: 'spawn-pressure',
      waveBudgetCap: 160,
    }),
  }),
  Object.freeze({
    id: 2,
    label: 'Rareté forcée',
    description: 'Tout nouveau monstre est au minimum rare.',
    triggerOffsetTicks: 6_000,
    effect: Object.freeze({ kind: 'minimum-rarity', rarity: 'rare' }),
  }),
  Object.freeze({
    id: 3,
    label: 'Fuite énergétique',
    description: "L'énergie des tourelles décroît continuellement et de plus en plus vite.",
    triggerOffsetTicks: 9_000,
    effect: Object.freeze({
      kind: 'turret-energy-drain',
      basePerSecond: 3.5,
      rampPerMinute: 1.5,
    }),
  }),
  Object.freeze({
    id: 4,
    label: 'Adaptation des monstres',
    description: 'Les monstres gagnent sans limite en robustesse, puissance et vitesse.',
    triggerOffsetTicks: 12_000,
    effect: Object.freeze({
      kind: 'monster-adaptation',
      hpPerMinute: 0.08,
      damagePerMinute: 0.08,
      speedPerMinute: 0.08,
    }),
  }),
]);

/** Une amélioration achetable à la boutique de tourelle (payée en Ferraille commune). */
export interface TowerTurretShopEntry {
  id: string;
  label: string;
  desc: string;
  cost: number;
}

/**
 * Catalogue de la boutique de tourelle (Phase 1). Le moteur (Lot A) applique l'effet
 * décrit par `id` ; l'UI (Lot C) affiche `label`/`desc`/`cost`. Adapté de son
 * `TURRET_UPGRADES` (constants/world.js).
 */
export const TOWER_TURRET_SHOP: readonly TowerTurretShopEntry[] = [
  { id: 'dmg', label: 'Dégâts', desc: '+15 dégâts/tir', cost: 10 },
  { id: 'range', label: 'Portée', desc: '+40 px de portée', cost: 8 },
  { id: 'rate', label: 'Cadence', desc: '-7 % de temps de recharge', cost: 12 },
  { id: 'hp', label: 'PV max', desc: '+110 PV max (et soin partiel)', cost: 11 },
  { id: 'energy', label: 'Régén énergie', desc: '+2 énergie/s', cost: 11 },
  { id: 'maxenergy', label: 'Capacité énergie', desc: '+30 énergie max', cost: 9 },
];

/** Coût en Ferraille commune pour réparer 1 PV d'une tourelle (action « Réparer »). */
export const TOWER_TURRET_REPAIR_COST_PER_HP = 0.1;

/** Définition sérialisable d'un module individuel de tourelle. */
export type TowerTurretModuleDefinition = Readonly<{
  id: 'overclock' | 'piercer' | 'capacitor' | 'super-overdrive' | 'super-rail' | 'super-battery';
  label: string;
  desc: string;
  cost: number;
  /** Nombre maximal d'installations sur une même tourelle. */
  maxStacks: 1;
  effect:
    | Readonly<{ kind: 'fire-cooldown-multiplier'; multiplier: number }>
    | Readonly<{ kind: 'projectile-pierce-bonus'; amount: number }>
    | Readonly<{ kind: 'energy-capacity-and-grant'; capacityBonus: number; energyGrant: number }>;
}>;

/**
 * Modules de tourelle Phase 3. Chacun occupe un axe mécanique distinct et ne peut
 * être installé qu'une fois sur une même tourelle.
 */
export const TOWER_TURRET_MODULES: readonly TowerTurretModuleDefinition[] = Object.freeze([
  Object.freeze({
    id: 'overclock',
    label: 'Surcadence',
    desc: '-20 % de temps entre les tirs.',
    cost: 24,
    maxStacks: 1,
    effect: Object.freeze({ kind: 'fire-cooldown-multiplier', multiplier: 0.8 }),
  }),
  Object.freeze({
    id: 'piercer',
    label: 'Perforateur',
    desc: '+1 ennemi traversé par projectile.',
    cost: 28,
    maxStacks: 1,
    effect: Object.freeze({ kind: 'projectile-pierce-bonus', amount: 1 }),
  }),
  Object.freeze({
    id: 'capacitor',
    label: 'Condensateur',
    desc: '+50 énergie maximale et +50 énergie à l’installation.',
    cost: 22,
    maxStacks: 1,
    effect: Object.freeze({
      kind: 'energy-capacity-and-grant',
      capacityBonus: 50,
      energyGrant: 50,
    }),
  }),
]);

/** Modules rares vendus uniquement lorsque leur id figure dans la rotation du marchand. */
export const TOWER_TURRET_SUPER_MODULES: readonly TowerTurretModuleDefinition[] = Object.freeze([
  Object.freeze({
    id: 'super-overdrive',
    label: 'Surmultiplicateur',
    desc: '-35 % de temps entre les tirs.',
    cost: 45,
    maxStacks: 1,
    effect: Object.freeze({ kind: 'fire-cooldown-multiplier', multiplier: 0.65 }),
  }),
  Object.freeze({
    id: 'super-rail',
    label: 'Rail spectral',
    desc: '+3 ennemis traversés par projectile.',
    cost: 50,
    maxStacks: 1,
    effect: Object.freeze({ kind: 'projectile-pierce-bonus', amount: 3 }),
  }),
  Object.freeze({
    id: 'super-battery',
    label: 'Batterie quantique',
    desc: '+120 énergie maximale et +120 énergie à l’installation.',
    cost: 42,
    maxStacks: 1,
    effect: Object.freeze({
      kind: 'energy-capacity-and-grant',
      capacityBonus: 120,
      energyGrant: 120,
    }),
  }),
]);

export type TowerMerchantRotation = readonly [
  'super-overdrive' | 'super-rail' | 'super-battery',
  'super-overdrive' | 'super-rail' | 'super-battery',
];

/** Deux offres uniques par vague ; l’index est exclusivement `wave % length`. */
export const TOWER_MERCHANT_ROTATIONS: readonly TowerMerchantRotation[] = Object.freeze([
  Object.freeze(['super-overdrive', 'super-rail'] as const),
  Object.freeze(['super-rail', 'super-battery'] as const),
  Object.freeze(['super-battery', 'super-overdrive'] as const),
]);

export type TowerSharedQuestDefinition = Readonly<{
  id: 'cull-the-horde' | 'elite-bounty';
  label: string;
  desc: string;
  objective: 'kill-monsters' | 'kill-elite-or-boss';
  target: number;
  rewardScrap: number;
}>;

/**
 * Rotation canonique des quêtes de partie. Les récompenses sont exclusivement de la
 * ferraille commune et restent donc sans effet sur l’or personnel ou la méta-progression.
 */
export const TOWER_SHARED_QUESTS: readonly TowerSharedQuestDefinition[] = Object.freeze([
  Object.freeze({
    id: 'cull-the-horde',
    label: 'Éclaircir la horde',
    desc: 'Éliminer 5 monstres en équipe.',
    objective: 'kill-monsters',
    target: 5,
    rewardScrap: 18,
  }),
  Object.freeze({
    id: 'elite-bounty',
    label: 'Prime d’élite',
    desc: 'Éliminer un monstre élite ou un boss.',
    objective: 'kill-elite-or-boss',
    target: 1,
    rewardScrap: 25,
  }),
]);

/** Libellés partagés des règles de ciblage ; leur changement ne dépense pas de ferraille. */
export type TowerTurretTargetPriorityDefinition = Readonly<{
  id: 'nearest' | 'strongest' | 'heartward';
  label: string;
  desc: string;
  cost: 0;
}>;

export const TOWER_TURRET_TARGET_PRIORITIES: readonly TowerTurretTargetPriorityDefinition[] =
  Object.freeze([
    Object.freeze({
      id: 'nearest',
      label: 'Plus proche',
      desc: 'Cible le monstre le plus proche de la tourelle.',
      cost: 0,
    }),
    Object.freeze({
      id: 'strongest',
      label: 'Plus robuste',
      desc: 'Cible le monstre ayant le plus de PV restants.',
      cost: 0,
    }),
    Object.freeze({
      id: 'heartward',
      label: 'Menace du Cœur',
      desc: 'Cible le monstre le plus proche du Cœur.',
      cost: 0,
    }),
  ]);

/** Définition d'une offre payée avec la ferraille commune et appliquée à la base. */
export type TowerGlobalDefenseOfferDefinition = Readonly<{
  id: 'fortify-heart' | 'network-damage' | 'network-range';
  label: string;
  desc: string;
  cost: number;
  maxLevel: number;
  effect:
    | Readonly<{ kind: 'heart-max-hp-bonus'; amount: number }>
    | Readonly<{ kind: 'turret-damage-multiplier'; multiplier: number }>
    | Readonly<{ kind: 'turret-range-bonus'; amount: number }>;
}>;

/** Offres globales persistantes ; leur coût est toujours prélevé sur la caisse commune. */
export const TOWER_GLOBAL_DEFENSE_OFFERS: readonly TowerGlobalDefenseOfferDefinition[] =
  Object.freeze([
    Object.freeze({
      id: 'fortify-heart',
      label: 'Fortifier le Cœur',
      desc: '+250 PV maximum au Cœur par niveau.',
      cost: 36,
      maxLevel: 5,
      effect: Object.freeze({ kind: 'heart-max-hp-bonus', amount: 250 }),
    }),
    Object.freeze({
      id: 'network-damage',
      label: 'Puissance du réseau',
      desc: '+12 % de dégâts pour toutes les tourelles par niveau.',
      cost: 40,
      maxLevel: 5,
      effect: Object.freeze({ kind: 'turret-damage-multiplier', multiplier: 1.12 }),
    }),
    Object.freeze({
      id: 'network-range',
      label: 'Portée du réseau',
      desc: '+60 px de portée pour toutes les tourelles par niveau.',
      cost: 32,
      maxLevel: 5,
      effect: Object.freeze({ kind: 'turret-range-bonus', amount: 60 }),
    }),
  ]);

export type TowerGlobalDefenseRotation = readonly [
  TowerGlobalDefenseOfferDefinition['id'],
  TowerGlobalDefenseOfferDefinition['id'],
  TowerGlobalDefenseOfferDefinition['id'],
];

/**
 * Rotations pures indexées par la vague : `rotationId = wave % length`. L'ordre varie
 * sans tirage aléatoire ni dépendance à l'heure réelle ; chaque paquet contient trois
 * identifiants uniques.
 */
export const TOWER_GLOBAL_DEFENSE_ROTATIONS: readonly TowerGlobalDefenseRotation[] = Object.freeze([
  Object.freeze(['fortify-heart', 'network-damage', 'network-range'] as const),
  Object.freeze(['network-damage', 'network-range', 'fortify-heart'] as const),
  Object.freeze(['network-range', 'fortify-heart', 'network-damage'] as const),
]);

/** Définition partagée d'une arme personnelle Tower (moteur + HUD). */
export interface TowerWeaponDefinition {
  id: 'rifle' | 'shotgun' | 'marksman';
  label: string;
  description: string;
  fireRate: number;
  bulletDamage: number;
  bulletSpeed: number;
  bulletRange: number;
  bulletRadius: number;
  projectileCount: number;
  spreadRad: number;
  basePierce: number;
}

/**
 * Arsenal Phase 2. Le fusil reste l'arme initiale ; les deux autres armes troquent
 * cadence, portée et nombre de projectiles pour des styles réellement distincts.
 */
export const TOWER_WEAPONS: readonly TowerWeaponDefinition[] = [
  {
    id: 'rifle',
    label: 'Fusil de garde',
    description: 'Polyvalent et rapide.',
    fireRate: 0.4,
    bulletDamage: 15,
    bulletSpeed: 600,
    bulletRange: 650,
    bulletRadius: 4,
    projectileCount: 1,
    spreadRad: 0,
    basePierce: 0,
  },
  {
    id: 'shotgun',
    label: 'Tromblon',
    description: 'Cinq plombs à courte portée.',
    fireRate: 0.8,
    bulletDamage: 10,
    bulletSpeed: 520,
    bulletRange: 360,
    bulletRadius: 4,
    projectileCount: 5,
    spreadRad: 0.18,
    basePierce: 0,
  },
  {
    id: 'marksman',
    label: 'Longue-vue',
    description: 'Lent, précis et perforant.',
    fireRate: 1.05,
    bulletDamage: 65,
    bulletSpeed: 950,
    bulletRange: 1_050,
    bulletRadius: 3,
    projectileCount: 1,
    spreadRad: 0,
    basePierce: 1,
  },
];
