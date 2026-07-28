import type { EnemyKind, InventorySlot, ResourceType, Vector2 } from '@village-survivor/protocol';

export interface MutableEnemy {
  id: string;
  kind: EnemyKind;
  position: Vector2;
  home: Vector2;
  hp: number;
  maxHp: number;
  awake: boolean;
  attackCooldownRemainingMs: number;
  /** Multiplie les dégâts de base ; croît par cycle pour les assauts nocturnes. */
  damageScale: number;
}

export interface MutableResource {
  id: string;
  position: Vector2;
  /** Type de ressource récoltée sur ce gisement. */
  resourceType: ResourceType;
  amountRemaining: number;
  guardianId: string;
  /** Temps restant avant la prochaine pousse de ce gisement. */
  regenRemainingMs: number;
}

/** Inventaire à cases de longueur fixe ; une case vide vaut `undefined`. */
export type MutableInventory = (InventorySlot | undefined)[];

/** Canal d'interaction interne en cours (récolte ou réparation). */
export interface InteractionChannel {
  targetId: string;
  kind: 'harvest' | 'repair';
  remainingMs: number;
  totalMs: number;
}

export interface MutablePlayer {
  position: Vector2;
  hp: number;
  maxHp: number;
  ward: number;
  maxWard: number;
  wardRefreshRemainingMs: number;
  moveSpeed: number;
  /** Inventaire à cases (longueur INVENTORY_SIZE), plafond PLAYER_STACK_SIZE/case. */
  inventory: MutableInventory;
  experience: number;
  experienceToNext: number;
  level: number;
  swordAutoDamage: number;
  swordAutoRange: number;
  swordAutoCooldownMs: number;
  swordAutoCooldownRemainingMs: number;
  swordCooldownMs: number;
  swordCooldownRemainingMs: number;
  barrierCooldownMs: number;
  barrierCooldownRemainingMs: number;
  barrierDurationMs: number;
  barrierActiveRemainingMs: number;
  /** Fenêtre de soin/frénésie vampirique restante (0 = inactif). */
  healBuffRemainingMs: number;
  /** Durée totale du cooldown de soin (constante). */
  healCooldownMs: number;
  healCooldownRemainingMs: number;
  /** Canal de récolte/réparation en cours, ou `undefined`. */
  interactionChannel: InteractionChannel | undefined;
  /**
   * `true` une fois qu'un appui `interact` a engagé une interaction : la récolte se
   * poursuit alors automatiquement (relance de canal à chaque unité) sans nouvel appui
   * ni maintien du clic. Repasse à `false` sur mouvement, dégâts subis, gisement épuisé
   * ou sac plein.
   */
  interactionCommitted: boolean;
  /** Info-bulle d'interaction propre à cet avatar, recalculée à chaque snapshot. */
  interactionHint: string | undefined;
  selectedUpgrades: string[];
  pendingUpgrades: number;
  lastAim: Vector2;
}

export interface MutableVillage {
  position: Vector2;
  hp: number;
  maxHp: number;
  heartLevel: 1 | 2 | 3;
  underAttack: boolean;
  /** Inventaire du village (longueur INVENTORY_SIZE), sans plafond de quantité. */
  inventory: MutableInventory;
}

export interface MutableDefense {
  id: string;
  position: Vector2;
  built: boolean;
  hp: number;
  maxHp: number;
  cooldownRemainingMs: number;
  buildRemainingMs: number;
}
