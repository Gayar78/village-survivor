// Contrat de données du NOUVEAU jeu (« Tower / arme à feu ») — Phase 3.
//
// Ce module est volontairement séparé de `index.ts` (l'ancien survivor à épée) :
// tant que la bascule finale (Lot D) n'est pas faite, l'ancien jeu continue de
// compiler et d'être déployé. Le nouveau moteur (game-core), le rendu et l'UI se
// construisent en parallèle contre ce contrat figé.
//
// La v2 transporte ces projections depuis un serveur autoritaire. Les durées restent
// des temps de simulation, jamais l'heure réelle. Chaque joueur a un avatar
// (position/arme/PV/niveau/build PERSONNELS) ; la base (Cœur, 4 tourelles, ferraille
// commune, vagues, carte) est PARTAGÉE.

import type { Vector2 } from './index.js';

/** Statut de partie — survie sans fin : pas de victoire, seulement défaite. */
export type TowerStatus = 'ready' | 'running' | 'defeat';

/** Les quatre tourelles fixes autour du Cœur. */
export type TurretDir = 'N' | 'E' | 'S' | 'W';

/** Règle déterministe utilisée par une tourelle pour départager ses cibles valides. */
export type TurretTargetPriority = 'nearest' | 'strongest' | 'heartward';

/** Super-modules rares, disponibles uniquement dans la rotation courante du marchand. */
export type TowerSuperModuleId = 'super-overdrive' | 'super-rail' | 'super-battery';

/** Modules uniques installables sur une tourelle. */
export type TurretModuleId = 'overclock' | 'piercer' | 'capacitor' | TowerSuperModuleId;

/** Améliorations persistantes achetées pour tout le réseau défensif. */
export type TowerGlobalDefenseOfferId = 'fortify-heart' | 'network-damage' | 'network-range';

/** Actions historiques de la boutique, conservées sans changement de protocole. */
export type LegacyTurretShopAction =
  'repair' | 'dmg' | 'range' | 'rate' | 'hp' | 'energy' | 'maxenergy';

/**
 * Grammaire fermée des actions de boutique transmises au serveur.
 *
 * Les préfixes empêchent toute collision entre les catalogues. Une entrée reçue du
 * réseau qui ne correspond pas exactement à cette union doit être ignorée avant
 * mutation de la simulation ; les actions historiques restent valides telles quelles.
 */
export type TurretShopAction =
  | LegacyTurretShopAction
  | `module:${TurretModuleId}`
  | `priority:${TurretTargetPriority}`
  | `global:${TowerGlobalDefenseOfferId}`;

/**
 * Identifiants temporaires du prototype Tower. Ils restent acceptés pendant la
 * migration des sauvegardes/tests, mais le spawner de production ne doit plus les
 * générer une fois le nouveau bestiaire branché.
 */
export type TowerLegacyMonsterKind = 'chaser' | 'runner' | 'brute';

/** Monstres actifs issus du catalogue Torri validé (exclusions non comprises). */
export type TowerMonsterKind =
  | TowerLegacyMonsterKind
  | 'slime'
  | 'goblin'
  | 'wolf'
  | 'harpy'
  | 'protector'
  | 'shepherd'
  | 'grand-wolf'
  | 'greedy-slime'
  | 'bat'
  | 'dark-slime'
  | 'spider'
  | 'coward'
  | 'cave-giant'
  | 'bowler'
  | 'giant-spider'
  | 'weaver-spider'
  | 'spider-queen'
  | 'sand-slime'
  | 'mummy'
  | 'hyena'
  | 'sand-worm'
  | 'scorpion'
  | 'beetle'
  | 'mini-beetle'
  | 'djinn'
  | 'sand-golem'
  | 'zombie'
  | 'necromancer'
  | 'virus-f'
  | 'stalker'
  | 'dark-knight'
  | 'skeleton-small'
  | 'skeleton-medium'
  | 'skeleton-large'
  | 'vampire'
  | 'life-thief'
  | 'decomposed-slime'
  | 'mini-slime'
  | 'shooter'
  | 'thug'
  | 'sniper'
  | 'mauga'
  | 'looter'
  | 'super-looter'
  | 'chief'
  | 'grenadier'
  | 'frosty'
  | 'grumpy-dwarf'
  | 'cannoneer'
  | 'yeti'
  | 'blizzard-spirit'
  | 'polar-bear'
  | 'summoner'
  | 'healer'
  | 'banner'
  | 'paramedic'
  | 'chanter'
  | 'kamikaze'
  | 'demon'
  | 'infernal-tank'
  | 'kidnapper'
  | 'enchainer'
  | 'burning-soul'
  | 'explosive-slime'
  | 'infernal-angel'
  | 'explosive-robot'
  | 'scrap-reaver'
  | 'drillbot'
  | 'siege-engine'
  | 'squad-launcher'
  | 'squadling'
  | 'time-controller'
  | 'time-watch'
  | 'time-warden'
  | 'ancient-guardian';

/** Biomes du monde vivant. Leur rotation ne dépend que de la seed et de la vague. */
export type TowerBiomeId = 'grove' | 'badlands' | 'tundra' | 'tempest' | 'timelands';

/** Affinité élémentaire visible d'un monstre et couleur dominante de son biome. */
export type TowerMonsterAffinity = 'nature' | 'fire' | 'frost' | 'storm' | 'time';

/**
 * Rareté de combat ; `boss` est réservée au monstre périodique unique d'une vague.
 *
 * La liste est exposée à l'exécution parce qu'elle traverse le réseau : un client ne peut pas
 * supposer que le serveur parle exactement la même version du contrat. Les valeurs `uncommon` et
 * `elite` ont par exemple disparu du contrat, et un serveur antérieur les émet encore.
 */
export const TOWER_MONSTER_RARITIES = ['common', 'rare', 'epic', 'legendary', 'boss'] as const;

export type TowerMonsterRarity = (typeof TOWER_MONSTER_RARITIES)[number];

/** Ramène une rareté venue du réseau dans le contrat courant ; `common` est le repli neutre. */
export function normalizeTowerMonsterRarity(value: unknown): TowerMonsterRarity {
  return TOWER_MONSTER_RARITIES.includes(value as TowerMonsterRarity)
    ? (value as TowerMonsterRarity)
    : 'common';
}

/** Trait synthétique exposé au rendu. Les traits ordinaires découlent de l'affinité. */
export type TowerMonsterTrait =
  'hardened' | 'ferocious' | 'armored' | 'swift' | 'colossus' | 'temporal';

/** Altérations persistantes que le Warden peut appliquer à un monstre libéré. */
export type TowerTemporalAlteration = 'none' | 'slow' | 'haste' | 'blink';

/** Identifiants ordonnés des quatre paliers cumulatifs effectifs de fin de partie. */
export type TowerEndgameTierId = 1 | 2 | 3 | 4;

/** Arsenal personnel disponible dès le début d'une partie Tower. */
export type TowerWeaponId = 'rifle' | 'shotgun' | 'marksman';

/** Raretés des cartes de montée de niveau (pondérées côté contenu). */
export type UpgradeRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'divin';

/** Propriétaire d'un projectile (pour la couleur/les collisions côté rendu). */
export type ProjectileSource = 'player' | 'turret';

// ─── Entrées ────────────────────────────────────────────────────────────────

/** Limite commune à tous les pairs pour le roster Tower actif. */
export const TOWER_MAX_ACTIVE_PLAYERS = 10;

/**
 * Mutation de roster déterministe planifiée par la couche réseau.
 *
 * `tick` désigne une frontière de simulation : l'événement s'applique après
 * exactement ce nombre de ticks terminés et avant le tick suivant. Il ne contient
 * volontairement aucun timestamp mural.
 */
export type TowerRosterEvent =
  | Readonly<{ type: 'join'; tick: number; playerId: string }>
  | Readonly<{ type: 'leave'; tick: number; playerId: string }>;

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
  /**
   * Intention persistante d'utiliser l'atelier de la tourelle proche. Le moteur ne
   * l'accepte que pour un joueur vivant et effectivement à portée d'une tourelle
   * vivante ; cette intention n'est donc pas, à elle seule, une invulnérabilité.
   */
  turretWorkshopOpen?: boolean;
  /**
   * Identifiant idempotent d'une action ponctuelle. Les sessions réseau peuvent
   * l'ajouter automatiquement afin de retransmettre l'action sans la rejouer.
   * Les anciennes commandes sans identifiant restent valides.
   */
  discreteActionId?: string;
  /**
   * Id de la carte d'amélioration choisie ce tick (montée de niveau), ou commande
   * bornée `weapon:<TowerWeaponId>` pour changer d'arme. Ce multiplexage conserve
   * le canal d'action ponctuelle fiable/idempotent des anciennes sessions co-op.
   */
  selectUpgradeId?: string;
  /**
   * Action de boutique demandée ce tick. Formats admis : action historique,
   * `module:<TurretModuleId>`, `priority:<TurretTargetPriority>` ou
   * `global:<TowerGlobalDefenseOfferId>`. Une action globale conserve `turret` pour
   * rester compatible avec l'enveloppe historique et exige la même proximité.
   */
  // `string` reste volontairement rétrocompatible sur le fil ; `TurretShopAction`
  // décrit les seules valeurs reconnues après validation à la frontière réseau.
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
  /** Arme visée par une carte conditionnelle ; absent pour une carte générique. */
  weaponId?: TowerWeaponId;
}>;

/** Progression et statistiques courantes propres à une arme d'un joueur. */
export type TowerWeaponState = Readonly<{
  id: TowerWeaponId;
  level: number;
  fireRate: number;
  bulletDamage: number;
  projectileCount: number;
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
  /** Arme tenue, visible par le joueur local comme par ses alliés. */
  activeWeaponId: TowerWeaponId;
  /** Arsenal et progression PERSONNELS de cet avatar. */
  weapons: readonly TowerWeaponState[];
  /** Cadence courante (s entre tirs) et dégâts — pour un éventuel affichage. */
  fireRate: number;
  bulletDamage: number;
  /** Améliorations en attente + offre courante (par joueur). */
  pendingUpgrades: number;
  upgradeChoices: readonly TowerUpgradeCard[];
  /** > 0 ⇒ à terre (K.O.), en attente de réapparition (ms restantes). */
  downedRemainingMs: number;
  /** Ralentissement hostile restant, synchronisé afin que la prédiction locale reste exacte. */
  hostileSlowRemainingMs: number;
  /** Le joueur est-il à portée d'une tourelle (ouverture possible de la boutique) ? */
  nearTurret?: TurretDir;
  /** true lorsque l'intention atelier est validée par la simulation pour ce tick. */
  turretWorkshopProtected?: boolean;
}>;

export type TowerProjectileState = Readonly<{
  id: string;
  position: Vector2;
  radius: number;
  source: ProjectileSource;
  /** Joueur ayant tiré le projectile ; absent pour une tourelle. */
  ownerId?: string;
  /** true = tir allié (joueur/tourelle) ; réservé pour un futur tir ennemi. */
  friendly: boolean;
  /** Arme d'origine d'un tir joueur ; absent pour les projectiles de tourelle. */
  weaponId?: TowerWeaponId;
}>;

/** Niveau persistant d'une amélioration globale, partagé par tous les joueurs. */
export type TowerGlobalDefenseUpgradeState = Readonly<{
  id: TowerGlobalDefenseOfferId;
  level: number;
}>;

/**
 * Paquet courant de trois offres globales. `rotationId` est un index déterministe du
 * catalogue de rotations (généralement `wave % rotationCount`), jamais un timestamp.
 */
export type TowerGlobalDefenseShopState = Readonly<{
  rotationId: number;
  offerIds: readonly [
    TowerGlobalDefenseOfferId,
    TowerGlobalDefenseOfferId,
    TowerGlobalDefenseOfferId,
  ];
}>;

/** Identifiants du catalogue cyclique de quêtes communes à la partie. */
export type TowerSharedQuestId = 'cull-the-horde' | 'elite-bounty';

/** Événement de combat suivi par une quête commune. */
export type TowerSharedQuestObjective = 'kill-monsters' | 'kill-elite-or-boss';

/**
 * Quête commune active. Une complétion verse `rewardScrap` une fois, puis active
 * immédiatement la définition suivante dans la rotation canonique.
 */
export type TowerSharedQuestState = Readonly<{
  rotationId: number;
  id: TowerSharedQuestId;
  objective: TowerSharedQuestObjective;
  progress: number;
  target: number;
  rewardScrap: number;
  completedCount: number;
}>;

/** Paquet courant d'offres rares du marchand, dérivé de la vague de simulation. */
export type TowerMerchantShopState = Readonly<{
  rotationId: number;
  offerIds: readonly [TowerSuperModuleId, TowerSuperModuleId];
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
  /** Modules uniques, sans doublon et dans l'ordre canonique du catalogue partagé. */
  modules: readonly TurretModuleId[];
  /** `heartward` cible le monstre actuellement le plus proche du Cœur. */
  targetPriority: TurretTargetPriority;
  alive: boolean;
}>;

export type HeartState = Readonly<{
  position: Vector2;
  hp: number;
  maxHp: number;
  radius: number;
}>;

/** Projection déterministe du biome courant, suffisante pour le décor et le HUD. */
export type TowerBiomeState = Readonly<{
  id: TowerBiomeId;
  affinity: TowerMonsterAffinity;
  /** Index de rotation, à partir de zéro. */
  cycle: number;
  /** Première vague utilisant ce biome (la pré-vague 0 annonce le biome de la vague 1). */
  startsAtWave: number;
  durationWaves: number;
}>;

/**
 * Arrivée unique des Timelands. La forme discriminée interdit les combinaisons
 * impossibles (par exemple une annonce sans tick d'arrivée).
 */
export type TowerTimelandsArrivalState =
  | Readonly<{ status: 'pending' }>
  | Readonly<{
      status: 'announcing';
      arrivedAtTick: number;
      announcementEndsAtTick: number;
    }>
  | Readonly<{ status: 'active'; arrivedAtTick: number }>;

/** Ralenti, accélération ou gel actif, borné exclusivement par des ticks lockstep. */
export type TowerTemporalEffectState =
  | Readonly<{
      id: number;
      kind: 'slow' | 'haste' | 'freeze';
      scope: 'global';
      scale: number;
      activatedAtTick: number;
      expiresAtTick: number;
      sourceMonsterId: string | null;
    }>
  | Readonly<{
      id: number;
      kind: 'slow' | 'haste' | 'freeze';
      scope: 'player';
      playerId: string;
      scale: number;
      activatedAtTick: number;
      expiresAtTick: number;
      sourceMonsterId: string | null;
    }>;

/** Cycle de vie public du Warden singleton invoqué à l'arrivée des Timelands. */
export type TowerTimelandsWardenState =
  | Readonly<{ status: 'not-spawned' }>
  | Readonly<{
      status: 'active';
      monsterId: string;
      nextReleaseAtTick: number;
      releasedMonsterIds: readonly string[];
      lowHpRelocationUsed: boolean;
    }>
  | Readonly<{
      status: 'defeated';
      monsterId: string;
      defeatedAtTick: number;
    }>;

/** Projection publique complète du biome final et de ses effets temporels. */
export type TowerTimelandsState = Readonly<{
  arrival: TowerTimelandsArrivalState;
  activeEffects: readonly TowerTemporalEffectState[];
  warden: TowerTimelandsWardenState;
}>;

export type TowerEndgameActiveTierState = Readonly<{
  id: TowerEndgameTierId;
  activatedAtTick: number;
}>;

/**
 * Paliers cumulatifs de fin de partie. `nextTier` rend le prochain déclenchement
 * affichable sans que le client ne recalcule le calendrier du moteur.
 */
export type TowerEndgameState = Readonly<{
  phaseStartedAtTick: number | null;
  activeTiers: readonly TowerEndgameActiveTierState[];
  nextTier: Readonly<{ id: TowerEndgameTierId; triggersAtTick: number }> | null;
  announcement: Readonly<{ tierId: TowerEndgameTierId; endsAtTick: number }> | null;
}>;

/** État temporel optionnel d'un monstre ; l'absence signifie qu'il n'est pas affecté. */
export type TowerMonsterTemporalState =
  | Readonly<{ status: 'frozen' }>
  | Readonly<{
      status: 'warden-controlled';
      wardenMonsterId: string;
      alteration: TowerTemporalAlteration;
    }>;

/** Télégraphe public d'une capacité ennemie, calculé uniquement par la simulation. */
export type TowerMonsterAbilityState = Readonly<{
  kind: 'ranged' | 'heal' | 'bolster' | 'summon' | 'control' | 'slam' | 'disable';
  phase: 'telegraph';
  remainingMs: number;
  totalMs: number;
  radius: number;
  targetPosition?: Vector2;
}>;

export type TowerMonsterState = Readonly<{
  id: string;
  kind: TowerMonsterKind;
  rarity: TowerMonsterRarity;
  affinity: TowerMonsterAffinity;
  trait: TowerMonsterTrait;
  position: Vector2;
  hp: number;
  maxHp: number;
  radius: number;
  shieldRatio?: number;
  camouflaged?: boolean;
  empowered?: boolean;
  temporal?: TowerMonsterTemporalState;
  /** Absent entre deux capacités afin de garder les snapshots réseau compacts. */
  ability?: TowerMonsterAbilityState;
}>;

export type TowerMonsterZoneKind = 'poison' | 'web' | 'sand' | 'ice' | 'fire' | 'time' | 'ray';

/** Zone hostile bornée et persistante. Aucun timestamp mural ne transite sur le fil. */
export type TowerMonsterZoneState = Readonly<{
  id: string;
  kind: TowerMonsterZoneKind;
  position: Vector2;
  radius: number;
  remainingMs: number;
  durationMs: number;
  endPosition?: Vector2;
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
  | 'scrap-expired'
  | 'quest-completed'
  | 'timelands-arrived'
  | 'time-rewound'
  | 'warden-defeated'
  | 'endgame-tier-activated'
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
  /** Biome actif, calculé uniquement depuis `seed` et `wave`. */
  biome: TowerBiomeState;
  /** État du biome final, présent dès le début afin d'exposer son arrivée à venir. */
  timelands: TowerTimelandsState;
  /** Calendrier et paliers cumulatifs activés après l'arrivée des Timelands. */
  endgame: TowerEndgameState;
  /** Numéro de vague courant + budget d'apparition (pour le HUD/debug). */
  wave: number;
  /** Ferraille COMMUNE (fonds de défense partagé pour la boutique de tourelle). */
  scrapFund: number;
  /** Niveaux globaux persistants, triés dans l'ordre canonique du catalogue. */
  globalDefenseUpgrades: readonly TowerGlobalDefenseUpgradeState[];
  /** Trois offres globales de la vague courante et leur rotation déterministe. */
  globalDefenseShop: TowerGlobalDefenseShopState;
  /** Quête de partie commune, alimentée par les kills de tous les joueurs et tourelles. */
  sharedQuest: TowerSharedQuestState;
  /** Offres rares achetables à la tourelle, canoniques pour la vague courante. */
  merchantShop: TowerMerchantShopState;
  /** Avatar local (celui du client qui reçoit l'état) ; toujours l'un de `players`. */
  player: TowerPlayerState;
  players: readonly TowerPlayerState[];
  heart: HeartState;
  turrets: readonly TurretState[];
  monsters: readonly TowerMonsterState[];
  monsterZones: readonly TowerMonsterZoneState[];
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
