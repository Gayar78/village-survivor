// Types mutables INTERNES du moteur Tower (Lot A). Ils ne sortent jamais tels quels :
// `simulation.ts` les projette dans le `TowerGameState` figé (protocol) à chaque snapshot.

import type {
  ProjectileSource,
  TowerMonsterKind,
  TowerUpgradeCard,
  TurretDir,
  Vector2,
} from '@village-survivor/protocol';

/**
 * Avatar joueur mutable. Regroupe la position, l'arme classique et le « build »
 * (statistiques modifiables par les cartes de montée de niveau) — tout est PERSONNEL.
 */
export interface MutableTowerPlayer {
  id: string;
  position: Vector2;
  aim: Vector2;
  hp: number;
  maxHp: number;
  level: number;
  experience: number;
  experienceToNext: number;
  gold: number;
  /** Or/xp personnels + progression. */
  pendingUpgrades: number;
  upgradeChoices: TowerUpgradeCard[];
  downedRemainingMs: number;

  // ── Arme / build ──────────────────────────────────────────────────────────
  speed: number;
  pickupRadius: number;
  fireRate: number;
  /** Recharge restante avant le prochain tir (s). */
  fireCooldownRemaining: number;
  bulletDamage: number;
  bulletSpeed: number;
  bulletRange: number;
  bulletRadius: number;
  critChance: number;
  critMult: number;
  pierce: number;
  bounce: number;
  multishotChance: number;
  burnStacks: number;
  auraDps: number;
  auraRadius: number;
  lifestealPct: number;
  /** Marqueur : un bonus de vitesse de balle a été appliqué (pour un futur rendu). */
  bulletSpeedBonusApplied: boolean;
  explodeOnKill: boolean;
  /** Croissance du calibre de la balle en vol (px/s). */
  growingBullet: number;
  /** Piles de « crit-slow » (stockées, effet fin — pas encore rendu). */
  critSlowStacks: number;
}

export interface MutableTowerMonster {
  id: string;
  kind: TowerMonsterKind;
  position: Vector2;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  contactDamage: number;
  reward: number;
  /** Recharge de contact restante (ms). */
  contactCooldownRemaining: number;
  /** Brûlure en cours : durée restante (ms) et nombre de piles. */
  burnRemainingMs: number;
  burnStacks: number;
  /** Joueur crédité des dégâts de brûlure (id) ; undefined sinon. */
  burnOwnerId: string | undefined;
}

export interface MutableTowerProjectile {
  id: string;
  position: Vector2;
  velocityX: number;
  velocityY: number;
  radius: number;
  damage: number;
  source: ProjectileSource;
  /** Portée restante (px) avant disparition. */
  remainingRange: number;
  /** Perforations restantes (pierce). */
  pierce: number;
  /** Rebonds restants (bounce/ricochet). */
  bounce: number;
  burnStacks: number;
  explodeOnKill: boolean;
  lifestealPct: number;
  /** Croissance du calibre en vol (px/s). */
  growingBullet: number;
  /** Id du joueur tireur (crédit XP/or/vol de vie) ; undefined pour une tourelle. */
  ownerId: string | undefined;
  /** Monstres déjà touchés (évite les doubles impacts en perforation/rebond). */
  hitMonsterIds: Set<string>;
}

export interface MutableTurret {
  dir: TurretDir;
  position: Vector2;
  angle: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  energyRegen: number;
  range: number;
  bulletDamage: number;
  bulletSpeed: number;
  bulletRange: number;
  bulletRadius: number;
  halfArcDeg: number;
  fireRate: number;
  fireCooldownRemaining: number;
  alive: boolean;
}

export interface MutableHeart {
  position: Vector2;
  hp: number;
  maxHp: number;
  radius: number;
}

export interface MutableScrap {
  id: string;
  position: Vector2;
  amount: number;
}
