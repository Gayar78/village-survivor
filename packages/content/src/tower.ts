// Contenu PARTAGÉ du nouveau jeu (« Tower / arme à feu », Phase 3).
//
// Seules les données dont PLUSIEURS lots ont besoin vivent ici (pour éviter toute
// divergence entre le moteur qui applique et l'UI qui affiche). Le reste du réglage
// (stats joueur/arme/tourelle/monstres, courbe d'XP, budget de vagues…) appartient au
// moteur (game-core, Lot A).

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
  id: 'overclock' | 'piercer' | 'capacitor';
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
