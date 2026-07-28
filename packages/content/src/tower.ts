// Contenu PARTAGÉ du nouveau jeu (« Tower / arme à feu », Phase 1).
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
