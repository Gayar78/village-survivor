// Contrat de données du NOUVEAU jeu (« Tower / arme à feu ») — Phase 1.
//
// Ce module est volontairement séparé de `index.ts` (l'ancien survivor à épée) :
// tant que la bascule finale (Lot D) n'est pas faite, l'ancien jeu continue de
// compiler et d'être déployé. Le nouveau moteur (game-core), le rendu et l'UI se
// construisent en parallèle contre ce contrat figé.
//
// Modèle réseau : host-autoritaire. L'hôte fait tourner l'unique simulation et
// diffuse `TowerGameState` ~20 Hz ; chaque client envoie son `TowerInput`. Chaque
// joueur a un avatar (position/arme/PV/niveau/build PERSONNELS) ; la base (Cœur,
// 4 tourelles, ferraille commune, vagues, carte) est PARTAGÉE.

import type { Vector2 } from './index.js';

/** Statut de partie — survie sans fin : pas de victoire, seulement défaite. */
export type TowerStatus = 'ready' | 'running' | 'defeat';

/** Les quatre tourelles fixes autour du Cœur. */
export type TurretDir = 'N' | 'E' | 'S' | 'W';

/** Types de monstres du set MVP (Phase 1). Le roster complet viendra plus tard. */
export type TowerMonsterKind = 'chaser' | 'runner' | 'brute' | 'kamikaze';

/** Raretés des cartes de montée de niveau (pondérées côté contenu). */
export type UpgradeRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'divin';

/** Propriétaire d'un projectile (pour la couleur/les collisions côté rendu). */
export type ProjectileSource = 'player' | 'turret';

// ─── Entrées ────────────────────────────────────────────────────────────────

export type TowerInput = Readonly<{
  sequence: number;
  /** Déplacement normalisé (-1..1) sur chaque axe (clavier). */
  moveX: number;
  moveY: number;
  /**
   * Direction de visée (vecteur, pas forcément normalisé) — la souris relativement
   * au joueur. Détermine l'orientation du tir.
   */
  aimX: number;
  aimY: number;
  /** Bouton de tir maintenu. */
  fire?: boolean;
  /** Id de la carte d'amélioration choisie ce tick (montée de niveau). */
  selectUpgradeId?: string;
  /**
   * Action de boutique de tourelle demandée ce tick : améliorer/réparer une tourelle.
   * `upgradeId` = id d'une amélioration de boutique, ou 'repair'. Ignorée si le joueur
   * n'est pas à portée d'une tourelle ou si la ferraille commune est insuffisante.
   */
  turretShop?: Readonly<{ turret: TurretDir; action: string }>;
}>;

// ─── Projections publiques ────────────────────────────────────────────────────

/** Une carte d'amélioration proposée à la montée de niveau (par joueur). */
export type TowerUpgradeCard = Readonly<{
  /** Id d'amélioration (constants) + palier, unique dans une offre. */
  offerId: string;
  upgradeId: string;
  rarity: UpgradeRarity;
  label: string;
  description: string;
}>;

/** Stats d'arme/joueur exposées au HUD (le strict utile à l'affichage). */
export type TowerPlayerState = Readonly<{
  id: string;
  position: Vector2;
  /** Direction de visée courante (pour dessiner le canon). */
  aim: Vector2;
  hp: number;
  maxHp: number;
  level: number;
  experience: number;
  experienceToNext: number;
  /** Or PERSONNEL (progression/forge à venir). */
  gold: number;
  /** Cadence courante (s entre tirs) et dégâts — pour un éventuel affichage. */
  fireRate: number;
  bulletDamage: number;
  /** Améliorations en attente + offre courante (par joueur). */
  pendingUpgrades: number;
  upgradeChoices: readonly TowerUpgradeCard[];
  /** > 0 ⇒ à terre (K.O.), en attente de réapparition (ms restantes). */
  downedRemainingMs: number;
  /** Le joueur est-il à portée d'une tourelle (ouverture possible de la boutique) ? */
  nearTurret?: TurretDir;
}>;

export type TowerProjectileState = Readonly<{
  id: string;
  position: Vector2;
  radius: number;
  source: ProjectileSource;
  /** true = tir allié (joueur/tourelle) ; réservé pour un futur tir ennemi. */
  friendly: boolean;
}>;

export type TurretState = Readonly<{
  dir: TurretDir;
  position: Vector2;
  /** Axe de visée (degrés) — arc fixe de la tourelle. */
  angle: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  range: number;
  alive: boolean;
}>;

export type HeartState = Readonly<{
  position: Vector2;
  hp: number;
  maxHp: number;
  radius: number;
}>;

export type TowerMonsterState = Readonly<{
  id: string;
  kind: TowerMonsterKind;
  position: Vector2;
  hp: number;
  maxHp: number;
  radius: number;
}>;

/** Ferraille au sol (ramassable). L'or n'a pas d'entité : gagné directement au kill. */
export type ScrapPickupState = Readonly<{
  id: string;
  position: Vector2;
  amount: number;
}>;

export type TowerEventType =
  | 'player-hurt'
  | 'monster-killed'
  | 'turret-hurt'
  | 'turret-destroyed'
  | 'heart-hurt'
  | 'level-up'
  | 'upgrade-selected'
  | 'scrap-collected'
  | 'defeat';

export type TowerEvent = Readonly<{
  id: number;
  tick: number;
  type: TowerEventType;
  position?: Vector2;
  amount?: number;
}>;

export type TowerGameState = Readonly<{
  tick: number;
  elapsedMs: number;
  status: TowerStatus;
  seed: string;
  world: Readonly<{ width: number; height: number; spawnZoneRadius: number }>;
  /** Numéro de vague courant + budget d'apparition (pour le HUD/debug). */
  wave: number;
  /** Ferraille COMMUNE (fonds de défense partagé pour la boutique de tourelle). */
  scrapFund: number;
  /** Avatar local (celui du client qui reçoit l'état) ; toujours l'un de `players`. */
  player: TowerPlayerState;
  players: readonly TowerPlayerState[];
  heart: HeartState;
  turrets: readonly TurretState[];
  monsters: readonly TowerMonsterState[];
  projectiles: readonly TowerProjectileState[];
  scraps: readonly ScrapPickupState[];
  events: readonly TowerEvent[];
}>;

/** Session du nouveau jeu, même forme que l'ancienne (start/stop/sendInput/subscribe). */
export interface TowerSession {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendInput(input: TowerInput): void;
  subscribe(listener: (state: TowerGameState) => void): () => void;
}
