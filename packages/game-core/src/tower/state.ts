// Types mutables INTERNES du moteur Tower (Lot A). Ils ne sortent jamais tels quels :
// `simulation.ts` les projette dans le `TowerGameState` figé (protocol) à chaque snapshot.

import type {
  ProjectileSource,
  TowerMonsterAffinity,
  TowerMonsterKind,
  TowerMonsterRarity,
  TowerMonsterTemporalState,
  TowerMonsterTrait,
  TurretModuleId,
  TurretTargetPriority,
  TowerUpgradeCard,
  TowerWeaponId,
  TurretDir,
  Vector2,
} from '@village-survivor/protocol';

export interface MutableTowerWeapon {
  id: TowerWeaponId;
  level: number;
  damageMultiplier: number;
  fireRateMultiplier: number;
  spreadMultiplier: number;
  pierceBonus: number;
  /** Recharge propre à cette arme : une bascule ne réinitialise pas son tir. */
  fireCooldownRemaining: number;
}

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
  hostileSlowRemainingMs: number;
  /** Intention persistante reçue par l'entrée lockstep courante. */
  turretWorkshopOpen: boolean;
  activeWeaponId: TowerWeaponId;
  weapons: MutableTowerWeapon[];

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
  rarity: TowerMonsterRarity;
  affinity: TowerMonsterAffinity;
  trait: TowerMonsterTrait;
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
  slowRemainingMs: number;
  slowStacks: number;
  /** Prevents any death explosion from being applied twice. */
  detonated: boolean;
  /** Etat public des interactions Timelands; toute transition est projetee au snapshot. */
  temporal: TowerMonsterTemporalState | undefined;
  /** Deterministic timers used by the Torri behavior primitives. */
  abilityCooldownRemainingMs: number;
  abilityTelegraphRemainingMs: number;
  abilityTelegraphTotalMs: number;
  abilityTargetPosition: Vector2 | undefined;
  abilityUses: number;
  behaviorElapsedMs: number;
  lastDamagedTick: number;
  reviveCount: number;
  shieldHp: number;
  camouflageRemainingMs: number;
  supportBuffRemainingMs: number;
  targetPlayerId: string | undefined;
  targetLockRemainingMs: number;
}

export interface MutableTowerMonsterZone {
  id: string;
  kind: 'poison' | 'web' | 'sand' | 'ice' | 'fire' | 'time' | 'ray';
  position: Vector2;
  radius: number;
  remainingMs: number;
  durationMs: number;
  pulseCooldownRemainingMs: number;
  damagePerPulse: number;
  endPosition: Vector2 | undefined;
}

export interface MutableTowerProjectile {
  id: string;
  position: Vector2;
  velocityX: number;
  velocityY: number;
  radius: number;
  damage: number;
  source: ProjectileSource;
  weaponId: TowerWeaponId | undefined;
  /** Portée restante (px) avant disparition. */
  remainingRange: number;
  /** Perforations restantes (pierce). */
  pierce: number;
  /** Rebonds restants (bounce/ricochet). */
  bounce: number;
  burnStacks: number;
  critSlowStacks: number;
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
  /** Modules achetés pour cette tourelle, uniques et conservés dans l'ordre du catalogue. */
  modules: TurretModuleId[];
  /** Stratégie de ciblage locale, modifiable gratuitement par le joueur. */
  targetPriority: TurretTargetPriority;
  /** Perforations ajoutées aux projectiles de cette tourelle. */
  pierce: number;
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
