export type Vector2 = Readonly<{
  x: number;
  y: number;
}>;

export type GameStatus = 'ready' | 'running' | 'victory' | 'defeat';
export type GamePhase = 'day' | 'night' | 'final';
export type EnemyKind = 'guardian' | 'sleeper' | 'raider' | 'brute';

/** Les cinq ressources récoltables, du plus proche au plus lointain du village. */
export type ResourceType = 'wood' | 'stone' | 'iron' | 'gold' | 'diamond';

/** Une pile occupée d'un inventaire à cases. Une case vide vaut `undefined`. */
export interface InventorySlot {
  resourceType: ResourceType;
  quantity: number;
}

/** Nombre de cases de tout inventaire (joueur comme village). */
export const INVENTORY_SIZE = 20;
/** Plafond de quantité par case côté joueur. Le village est sans plafond. */
export const PLAYER_STACK_SIZE = 8;

export type PlayerInput = Readonly<{
  sequence: number;
  moveX: number;
  moveY: number;
  aimX?: number;
  aimY?: number;
  /** État maintenu du bouton d'interaction (récolte/réparation à canal). */
  interact?: boolean;
  buildDefense?: boolean;
  activateSword?: boolean;
  activateBarrier?: boolean;
  activateHeal?: true;
  selectUpgradeId?: string;
  /** Index 0..19 dans l'inventaire du JOUEUR, à transférer vers le village. */
  depositSlot?: number;
  /** Index 0..19 dans l'inventaire du VILLAGE, à transférer vers le joueur. */
  withdrawSlot?: number;
  /** Transfère toutes les piles occupées du joueur vers le village en une frame. */
  depositAll?: true;
  upgradeHeart?: true;
}>;

export type AbilityState = Readonly<{
  cooldownRemainingMs: number;
  cooldownMs: number;
}>;

/** Progression d'un canal d'interaction en cours (récolte ou réparation). */
export type InteractionChannelState = Readonly<{
  /** 0 (à peine commencé) à 1 (terminé). */
  progress: number;
  kind: 'harvest' | 'repair';
  /** Type de la ressource récoltée, présent seulement quand `kind === 'harvest'`. */
  resourceType?: ResourceType;
}>;

export type PlayerState = Readonly<{
  id: string;
  position: Vector2;
  hp: number;
  maxHp: number;
  ward: number;
  maxWard: number;
  moveSpeed: number;
  /** Inventaire à cases (longueur INVENTORY_SIZE), plafond PLAYER_STACK_SIZE/case. */
  inventory: readonly (InventorySlot | undefined)[];
  experience: number;
  experienceToNext: number;
  level: number;
  swordAutoDamage: number;
  swordAutoRange: number;
  swordAutoCooldownMs: number;
  swordAutoCooldownRemainingMs: number;
  sword: AbilityState;
  barrier: AbilityState & Readonly<{ activeRemainingMs: number }>;
  /** Soin/frénésie vampirique : troisième cooldown, `buffRemainingMs` = fenêtre active. */
  heal: AbilityState & Readonly<{ buffRemainingMs: number }>;
  /** Canal de récolte/réparation en cours, ou `undefined` si aucun. */
  interactionChannel?: InteractionChannelState;
  /**
   * Info-bulle d'interaction PROPRE à cet avatar (récolter, réparer, échanger,
   * construire…), ou `undefined`. En co-op, chaque joueur reçoit la sienne selon SA
   * position — le client doit lire `state.player.interactionHint`, pas le champ global.
   */
  interactionHint?: string;
  selectedUpgrades: readonly string[];
  /** Améliorations gagnées et pas encore choisies, l'offre courante comprise. */
  pendingUpgrades: number;
  /**
   * Offre d'améliorations PROPRE à cet avatar (les améliorations sont personnelles en
   * co-op). Le client doit lire `state.player.upgradeChoices`.
   */
  upgradeChoices: readonly UpgradeChoice[];
  /**
   * Temps restant « à terre » avant réapparition (ms), 0 si l'avatar est actif. > 0 ⇒
   * le joueur est K.O. (n'agit plus, n'inflige plus de dégâts) et réapparaîtra bientôt.
   */
  downedRemainingMs: number;
}>;

export type VillageState = Readonly<{
  position: Vector2;
  areaRadius: number;
  hp: number;
  maxHp: number;
  heartLevel: 1 | 2 | 3;
  underAttack: boolean;
  /** Inventaire du village (longueur INVENTORY_SIZE), sans plafond de quantité. */
  inventory: readonly (InventorySlot | undefined)[];
}>;

export type DefenseState = Readonly<{
  id: string;
  position: Vector2;
  built: boolean;
  hp: number;
  maxHp: number;
  range: number;
  cooldownRemainingMs: number;
  buildRemainingMs: number;
  buildDurationMs: number;
}>;

export type ResourceNodeState = Readonly<{
  id: string;
  position: Vector2;
  resourceType: ResourceType;
  amountRemaining: number;
  guardianId: string;
}>;

export type EnemyState = Readonly<{
  id: string;
  kind: EnemyKind;
  position: Vector2;
  home: Vector2;
  hp: number;
  maxHp: number;
  awake: boolean;
  attackCooldownRemainingMs: number;
}>;

export type UpgradeChoice = Readonly<{
  id: string;
  name: string;
  description: string;
  discipline: 'sword' | 'barrier';
}>;

export type GameEventType =
  | 'enemy-hit'
  | 'enemy-killed'
  | 'player-hurt'
  | 'village-hurt'
  | 'resource-collected'
  | 'resource-deposited'
  | 'resource-withdrawn'
  | 'defense-construction-started'
  | 'defense-construction-interrupted'
  | 'defense-built'
  | 'defense-destroyed'
  | 'defense-fired'
  | 'sword-auto-attack'
  | 'heart-upgraded'
  | 'level-up'
  | 'upgrade-selected'
  | 'phase-changed'
  | 'victory'
  | 'defeat';

export type GameEvent = Readonly<{
  id: number;
  tick: number;
  type: GameEventType;
  message: string;
  position?: Vector2;
  origin?: Vector2;
  amount?: number;
}>;

export type PublicGameState = Readonly<{
  tick: number;
  elapsedMs: number;
  status: GameStatus;
  resultReason?: string;
  seed: string;
  world: Readonly<{
    width: number;
    height: number;
  }>;
  phase: GamePhase;
  cycle: number;
  phaseRemainingMs: number;
  /**
   * Avatar « local » = celui contrôlé par le client qui reçoit cet état. En solo
   * c'est l'unique joueur ; en co-op, la session réseau renseigne l'avatar propre au
   * client. Toujours présent et toujours l'un des éléments de `players`.
   */
  player: PlayerState;
  /**
   * Tous les avatars de la partie (le joueur local et ses coéquipiers). En solo, ce
   * tableau contient uniquement `player`. La progression (niveau, améliorations) est
   * partagée : tous les avatars affichent le même niveau.
   */
  players: readonly PlayerState[];
  village: VillageState;
  defenses: readonly DefenseState[];
  resources: readonly ResourceNodeState[];
  enemies: readonly EnemyState[];
  upgradeChoices: readonly UpgradeChoice[];
  interactionHint?: string;
  objective: string;
  events: readonly GameEvent[];
}>;

export interface GameSession {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendInput(input: PlayerInput): void;
  subscribe(listener: (state: PublicGameState) => void): () => void;
}
