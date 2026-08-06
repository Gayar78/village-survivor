import Phaser from 'phaser';

import { recordFrameDuration } from '../observability/gameTelemetry.js';
import {
  TOWER_MONSTER_CATALOG,
  type TowerMonsterCatalogEntry,
  type TowerMonsterFaction,
  type TowerMonsterRoleShape,
  type TowerMonsterSignature,
} from '@village-survivor/content';

import {
  getVisualPreferences,
  subscribeVisualPreferences,
  type VisualPreferences,
} from '../preferences/visualPreferences.js';

import type {
  HeartState,
  ScrapPickupState,
  TowerGameState,
  TowerMonsterKind,
  TowerMonsterRarity,
  TowerMonsterState,
  TowerPlayerState,
  TowerProjectileState,
  TowerWeaponId,
  TurretState,
  Vector2,
} from '@village-survivor/protocol';

/**
 * Contrat attendu par `TowerScene` côté netcode : un flux d'états (`subscribe`)
 * plus la fraction de progression (0..1) vers le prochain tick (`getRenderAlpha`),
 * utilisée pour interpoler les positions entre deux instantanés de simulation.
 * Le netcode réel (Lot D) fournira l'implémentation ; cette scène ne fait que
 * consommer l'interface.
 */
export interface TowerRenderSession {
  subscribe(listener: (state: TowerGameState) => void): () => void;
  getRenderAlpha(): number;
  /**
   * Position à laquelle dessiner l'avatar local, quand la session sait l'anticiper — en
   * coopératif, l'état reçu a toujours quelques ticks de retard sur les touches enfoncées.
   * `undefined` demande le rendu interpolé ordinaire.
   */
  getLocalRenderPosition(): Vector2 | undefined;
}

const COLORS = {
  ground: 0x050814,
  groundShade: 0x02040d,
  terrainPatch: 0x0b1633,
  terrainPatchLight: 0x1b2855,
  terrainShadow: 0x171238,
  grid: 0x31416f,
  worldLine: 0x485b9e,
  minimapGround: 0x091126,
  minimapBorder: 0x6d78e5,
  root: 0x59432a,
  distanceNear: 0x123a66,
  distanceFar: 0x34205f,
  heart: 0xd45e3f,
  heartOutline: 0xf6b866,
  turret: 0xb98243,
  turretDead: 0x4b4033,
  turretRange: 0x596fe3,
  turretEnergy: 0xf4c76f,
  local: 0x5be3ff,
  ally: 0xdcc99a,
  downed: 0x6f7467,
  barrel: 0xd9d1b5,
  projectilePlayer: 0x8df0ff,
  projectileTurret: 0xc5db74,
  scrap: 0xc5a860,
  hpBack: 0x07100c,
} as const;

const LEGACY_MONSTER_COLORS: Readonly<Partial<Record<TowerMonsterKind, number>>> = {
  chaser: 0x8f6254,
  runner: 0xd0a749,
  brute: 0x765a82,
};

const MONSTER_FACTION_COLORS: Readonly<Record<TowerMonsterFaction, number>> = {
  forest: 0x21a66f,
  cave: 0x633a91,
  desert: 0xd68a32,
  graveyard: 0x62bf71,
  mercenary: 0xa84e45,
  mountain: 0x65afe8,
  tribe: 0x25bbb4,
  hell: 0xe34b35,
  machines: 0x71899b,
  timelands: 0x914fd4,
  unique: 0x8e44ad,
};

const MONSTER_CATALOG_BY_ID = new Map(
  TOWER_MONSTER_CATALOG.map((monster) => [monster.id, monster] as const),
);

function monsterCatalogEntry(kind: TowerMonsterKind): TowerMonsterCatalogEntry | undefined {
  return MONSTER_CATALOG_BY_ID.get(kind);
}

function monsterColor(kind: TowerMonsterKind): number {
  const monster = monsterCatalogEntry(kind);
  return monster === undefined
    ? (LEGACY_MONSTER_COLORS[kind] ?? 0x8f6254)
    : MONSTER_FACTION_COLORS[monster.faction];
}

const RARITY_MARKER_RADIUS: Readonly<Record<TowerMonsterRarity, number>> = {
  common: 0,
  rare: 3,
  epic: 5,
  legendary: 7,
  boss: 11,
};

const WEAPON_COLORS: Readonly<Record<TowerWeaponId, number>> = {
  rifle: 0xd9d1b5,
  shotgun: 0xf6b866,
  marksman: 0xa9d8c8,
};

const WEAPON_BARRELS: Readonly<Record<TowerWeaponId, { width: number; length: number }>> = {
  rifle: { width: 5, length: 14 },
  shotgun: { width: 8, length: 10 },
  marksman: { width: 3, length: 21 },
};

/** Demi-largeur (radians) de l'arc de portée d'une tourelle (110° au total). */
const TURRET_ARC_HALF_RAD = Phaser.Math.DegToRad(55);
const TURRET_RADIUS = 22;
const PLAYER_RADIUS = 16;

/** Fraction du reste à rattraper par frame de 60 Hz, corrigée du delta réel. */
const CAMERA_SMOOTHING = 0.18;

/** Convertit un #RRGGBB validé en entier Phaser, avec repli défensif. */
function hexToPhaserColor(value: string, fallback: number): number {
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    return fallback;
  }
  const color = Number.parseInt(value.slice(1), 16);
  return Number.isSafeInteger(color) ? color : fallback;
}

/** Interpolation linéaire scalaire, utilisée pour le lissage des positions. */
function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function lerpVec(from: Vector2, to: Vector2, alpha: number): Vector2 {
  return { x: lerp(from.x, to.x, alpha), y: lerp(from.y, to.y, alpha) };
}

/**
 * Scène de rendu du nouveau jeu (twin-stick shooter autour du Cœur). Consomme
 * `TowerGameState` via `TowerRenderSession` : aucune capture d'entrée ici, la
 * scène ne fait que dessiner l'état reçu, interpolé entre deux ticks.
 */
export class TowerScene extends Phaser.Scene {
  private readonly session: TowerRenderSession;
  private graphics!: Phaser.GameObjects.Graphics;
  private minimap!: Phaser.GameObjects.Graphics;
  private state: TowerGameState | undefined;
  /**
   * Instantané du tick précédent : sert à interpoler les positions mobiles
   * (joueurs, monstres, projectiles) entre deux ticks de simulation.
   */
  private previousState: TowerGameState | undefined;
  private readonly renderPlayerPos = new Map<string, Vector2>();
  private readonly renderMonsterPos = new Map<string, Vector2>();
  private readonly renderProjectilePos = new Map<string, Vector2>();
  /**
   * Étiquettes de nom (4 premiers caractères de l'id) au-dessus des avatars
   * alliés, jamais du local. Créées/détruites au fil des apparitions/disparitions.
   */
  private readonly allyLabels = new Map<string, Phaser.GameObjects.Text>();
  private unsubscribe: (() => void) | undefined;
  private unsubscribeVisualPreferences: (() => void) | undefined;
  private visualPreferences: VisualPreferences = getVisualPreferences();
  private cameraReady = false;
  private offsetX = 0;
  private offsetY = 0;

  public constructor(session: TowerRenderSession) {
    super({ key: 'TowerScene' });
    this.session = session;
  }

  public create(): void {
    this.graphics = this.add.graphics();
    this.minimap = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.cameras.main.setRoundPixels(true);
    this.unsubscribe = this.session.subscribe((state) => {
      // On conserve l'état courant comme « précédent » avant de le remplacer :
      // c'est entre ces deux instantanés que le rendu interpole les positions.
      this.previousState = this.state;
      this.state = state;
    });
    this.unsubscribeVisualPreferences = subscribeVisualPreferences((preferences) => {
      this.visualPreferences = preferences;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      this.unsubscribeVisualPreferences?.();
      this.unsubscribeVisualPreferences = undefined;
      for (const label of this.allyLabels.values()) {
        label.destroy();
      }
      this.allyLabels.clear();
    });
  }

  public override update(_time: number, delta: number): void {
    const state = this.state;
    if (state === undefined) {
      return;
    }
    // Mesurer le dessin séparément du tick de simulation est ce qui permet, devant une partie
    // qui rame, de savoir laquelle des deux moitiés coûte cher — sans quoi on optimise au jugé.
    const startedAt = performance.now();
    this.computeInterpolation(state);
    this.renderWorld(state);
    this.updateCamera(state, delta);
    this.renderMinimap(state);
    recordFrameDuration(performance.now() - startedAt, state.monsters.length);
  }

  /**
   * Calcule les positions de RENDU (joueurs, monstres, projectiles) par
   * interpolation linéaire entre l'instantané précédent et l'instantané courant,
   * pondérée par `getRenderAlpha()`. Une entité absente de l'instantané précédent
   * (apparition) est rendue directement à sa position courante ; une entité
   * disparue de l'instantané courant (mort/expiration) n'est simplement plus
   * dessinée.
   *
   * L'avatar local fait exception quand la session sait l'anticiper : il est alors dessiné en
   * avance sur le reste du monde, à l'heure des touches enfoncées plutôt qu'à celle de la
   * simulation. La caméra le suit, donc le décor suit le geste du joueur.
   */
  private computeInterpolation(state: TowerGameState): void {
    const alpha = this.session.getRenderAlpha();
    const previous = this.previousState;
    const localId = state.player.id;
    const localPredicted = this.session.getLocalRenderPosition();
    const previousPlayers = new Map(previous?.players.map((item) => [item.id, item] as const));
    const previousMonsters = new Map(previous?.monsters.map((item) => [item.id, item] as const));
    const previousProjectiles = new Map(
      previous?.projectiles.map((item) => [item.id, item] as const),
    );

    this.renderPlayerPos.clear();
    for (const player of state.players) {
      if (player.id === localId && localPredicted !== undefined) {
        this.renderPlayerPos.set(player.id, localPredicted);
        continue;
      }
      const before = previousPlayers.get(player.id);
      this.renderPlayerPos.set(
        player.id,
        before === undefined ? player.position : lerpVec(before.position, player.position, alpha),
      );
    }

    this.renderMonsterPos.clear();
    for (const monster of state.monsters) {
      const before = previousMonsters.get(monster.id);
      this.renderMonsterPos.set(
        monster.id,
        before === undefined ? monster.position : lerpVec(before.position, monster.position, alpha),
      );
    }

    this.renderProjectilePos.clear();
    for (const projectile of state.projectiles) {
      const before = previousProjectiles.get(projectile.id);
      this.renderProjectilePos.set(
        projectile.id,
        before === undefined
          ? projectile.position
          : lerpVec(before.position, projectile.position, alpha),
      );
    }
  }

  private playerRenderPos(player: TowerPlayerState): Vector2 {
    return this.renderPlayerPos.get(player.id) ?? player.position;
  }

  private monsterRenderPos(monster: TowerMonsterState): Vector2 {
    return this.renderMonsterPos.get(monster.id) ?? monster.position;
  }

  private projectileRenderPos(projectile: TowerProjectileState): Vector2 {
    return this.renderProjectilePos.get(projectile.id) ?? projectile.position;
  }

  private toScreen(position: Vector2): Vector2 {
    return { x: position.x + this.offsetX, y: position.y + this.offsetY };
  }

  private renderWorld(state: TowerGameState): void {
    this.offsetX = state.world.width / 2;
    this.offsetY = state.world.height / 2;
    const graphics = this.graphics;
    graphics.clear();
    this.drawGround(state);
    this.drawMonsterZones(state);
    this.drawScraps(state);
    this.drawHeart(state.heart);
    this.drawTurrets(state.turrets);
    this.drawProjectiles(state);
    this.drawMonsters(state);
    this.drawPlayers(state);
  }

  private drawMonsterZones(state: TowerGameState): void {
    const colors = {
      poison: 0x62d96b,
      web: 0xd8e5f2,
      sand: 0xd6a254,
      ice: 0x6ed8ff,
      fire: 0xff6238,
      time: 0xa768ff,
      ray: 0xff5f8f,
    } as const;
    for (const zone of state.monsterZones) {
      const start = this.toScreen(zone.position);
      const color = colors[zone.kind];
      const life = Math.max(0, zone.remainingMs / Math.max(1, zone.durationMs));
      if (zone.endPosition !== undefined) {
        const end = this.toScreen(zone.endPosition);
        this.graphics.lineStyle(Math.max(2, zone.radius * 2), color, 0.18 + life * 0.55);
        this.graphics.lineBetween(start.x, start.y, end.x, end.y);
        this.graphics.lineStyle(1.5, 0xffffff, 0.2 + life * 0.45);
        this.graphics.lineBetween(start.x, start.y, end.x, end.y);
        continue;
      }
      this.graphics.fillStyle(color, 0.05 + life * 0.09);
      this.graphics.fillCircle(start.x, start.y, zone.radius);
      this.graphics.lineStyle(1.5, color, 0.3 + life * 0.55);
      this.graphics.strokeCircle(start.x, start.y, zone.radius);
      this.graphics.lineStyle(1, color, 0.18 + life * 0.35);
      this.graphics.strokeCircle(start.x, start.y, zone.radius * life);
    }
  }

  private drawGround(state: TowerGameState): void {
    const graphics = this.graphics;
    graphics.fillStyle(COLORS.ground, 1);
    graphics.fillRect(0, 0, state.world.width, state.world.height);

    // Relief abstrait bleu nuit : les taches restent assez sombres pour ne pas
    // concurrencer les silhouettes et projectiles, quelle que soit leur couleur.
    for (let index = 0; index < 72; index += 1) {
      const seed = index * 91.73;
      const x = (Math.sin(seed) * 0.5 + 0.5) * state.world.width;
      const y = (Math.sin(seed * 1.71 + 2.4) * 0.5 + 0.5) * state.world.height;
      const radius = 26 + (Math.sin(seed * 0.37) + 1) * 22;
      graphics.fillStyle(
        index % 3 === 0 ? COLORS.terrainShadow : COLORS.terrainPatch,
        index % 3 === 0 ? 0.2 : 0.24,
      );
      graphics.fillEllipse(x, y, radius * 2.5, radius);
      graphics.fillStyle(COLORS.terrainPatchLight, 0.1);
      graphics.fillCircle(x + radius * 0.4, y - radius * 0.1, radius * 0.34);
    }

    // Repère spatial discret, commun au monde et à la mini-carte.
    const gridStep = 160;
    graphics.lineStyle(1, COLORS.grid, 0.075);
    for (let x = 0; x <= state.world.width; x += gridStep) {
      graphics.lineBetween(x, 0, x, state.world.height);
    }
    for (let y = 0; y <= state.world.height; y += gridStep) {
      graphics.lineBetween(0, y, state.world.width, y);
    }
    // Teinte de distance : bandes concentriques subtiles autour de l'origine
    // (centre du monde), du bleu profond au violet en s'éloignant.
    const centerX = this.offsetX;
    const centerY = this.offsetY;
    const maxRadius = Math.max(state.world.width, state.world.height) / 2;
    const bandCount = 5;
    // Les grands disques sont peints d'abord pour préserver la teinte bleue des
    // anneaux intérieurs, au lieu que le disque extérieur recouvre tout le monde.
    for (let band = bandCount; band >= 1; band -= 1) {
      const t = band / bandCount;
      const radius = maxRadius * t;
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(COLORS.distanceNear),
        Phaser.Display.Color.ValueToColor(COLORS.distanceFar),
        bandCount,
        band,
      );
      graphics.fillStyle(color.color, 0.035 + 0.018 * t);
      graphics.fillCircle(centerX, centerY, radius);
      graphics.lineStyle(2, COLORS.worldLine, 0.06 + 0.03 * t);
      graphics.strokeCircle(centerX, centerY, radius);
    }

    graphics.lineStyle(4, COLORS.worldLine, 0.14);
    for (let branch = 0; branch < 8; branch += 1) {
      const angle = (Math.PI * 2 * branch) / 8 + 0.16;
      const start = 180 + (branch % 2) * 35;
      const end = Math.min(maxRadius * 0.72, 780 + (branch % 3) * 90);
      graphics.lineBetween(
        centerX + Math.cos(angle) * start,
        centerY + Math.sin(angle) * start,
        centerX + Math.cos(angle + 0.12) * end,
        centerY + Math.sin(angle + 0.12) * end,
      );
    }
  }

  private drawScraps(state: TowerGameState): void {
    for (const scrap of state.scraps) {
      this.drawScrap(scrap);
    }
  }

  private drawScrap(scrap: ScrapPickupState): void {
    const graphics = this.graphics;
    const { x, y } = this.toScreen(scrap.position);
    graphics.fillStyle(COLORS.root, 0.8);
    graphics.fillCircle(x, y + 2, 7);
    graphics.fillStyle(COLORS.scrap, 0.95);
    graphics.fillTriangle(x, y - 6, x + 5, y + 3, x - 5, y + 3);
    graphics.lineStyle(1, COLORS.heartOutline, 0.65);
    graphics.strokeTriangle(x, y - 6, x + 5, y + 3, x - 5, y + 3);
  }

  private drawHeart(heart: HeartState): void {
    const graphics = this.graphics;
    const { x, y } = this.toScreen(heart.position);
    graphics.fillStyle(COLORS.heartOutline, 0.08);
    graphics.fillCircle(x, y, heart.radius + 24);
    graphics.fillStyle(COLORS.root, 0.9);
    graphics.fillCircle(x, y, heart.radius + 7);
    graphics.fillStyle(COLORS.heart, 1);
    graphics.fillCircle(x, y, heart.radius);
    graphics.fillStyle(COLORS.heartOutline, 0.9);
    graphics.fillCircle(x, y - heart.radius * 0.22, heart.radius * 0.34);
    graphics.lineStyle(3, COLORS.heartOutline, 0.9);
    graphics.strokeCircle(x, y, heart.radius);
    this.drawBar(x - 55, y - heart.radius - 18, 110, 7, heart.hp / heart.maxHp, COLORS.heart);
  }

  private drawTurrets(turrets: TowerGameState['turrets']): void {
    for (const turret of turrets) {
      this.drawTurret(turret);
    }
  }

  private drawTurret(turret: TurretState): void {
    const graphics = this.graphics;
    const { x, y } = this.toScreen(turret.position);
    const turretColor = hexToPhaserColor(this.visualPreferences.turretColor, COLORS.turret);
    const bodyColor = turret.alive ? turretColor : COLORS.turretDead;
    const bodyAlpha = turret.alive ? 1 : 0.5;

    if (turret.alive) {
      // Arc de portée (secteur de 110° dans la direction de visée fixe).
      const angleRad = Phaser.Math.DegToRad(turret.angle);
      graphics.fillStyle(COLORS.turretRange, 0.09);
      graphics.slice(
        x,
        y,
        turret.range,
        angleRad - TURRET_ARC_HALF_RAD,
        angleRad + TURRET_ARC_HALF_RAD,
        false,
      );
      graphics.fillPath();
      graphics.lineStyle(2, COLORS.turretRange, 0.16);
      graphics.slice(
        x,
        y,
        turret.range,
        angleRad - TURRET_ARC_HALF_RAD,
        angleRad + TURRET_ARC_HALF_RAD,
        false,
      );
      graphics.strokePath();
    }

    const angleRad = Phaser.Math.DegToRad(turret.angle);
    graphics.fillStyle(COLORS.root, bodyAlpha);
    graphics.fillCircle(x, y, TURRET_RADIUS + 4);
    graphics.fillStyle(bodyColor, bodyAlpha);
    graphics.fillCircle(x, y, TURRET_RADIUS);
    graphics.lineStyle(5, COLORS.barrel, bodyAlpha);
    graphics.lineBetween(
      x + Math.cos(angleRad) * 5,
      y + Math.sin(angleRad) * 5,
      x + Math.cos(angleRad) * (TURRET_RADIUS + 13),
      y + Math.sin(angleRad) * (TURRET_RADIUS + 13),
    );
    graphics.fillStyle(COLORS.heartOutline, bodyAlpha);
    graphics.fillCircle(x, y, 6);
    graphics.lineStyle(2, 0x15130d, bodyAlpha);
    graphics.strokeCircle(x, y, TURRET_RADIUS);

    this.drawBar(x - 20, y - TURRET_RADIUS - 14, 40, 5, turret.hp / turret.maxHp, turretColor);
    this.drawBar(
      x - 20,
      y - TURRET_RADIUS - 8,
      40,
      3,
      turret.maxEnergy > 0 ? turret.energy / turret.maxEnergy : 0,
      COLORS.turretEnergy,
    );
  }

  private drawProjectiles(state: TowerGameState): void {
    const graphics = this.graphics;
    for (const projectile of state.projectiles) {
      const { x, y } = this.toScreen(this.projectileRenderPos(projectile));
      const color =
        projectile.source === 'player' && projectile.ownerId === state.player.id
          ? hexToPhaserColor(this.visualPreferences.playerProjectileColor, COLORS.projectilePlayer)
          : projectile.source === 'player'
            ? projectile.weaponId === undefined
              ? COLORS.projectilePlayer
              : WEAPON_COLORS[projectile.weaponId]
            : COLORS.projectileTurret;
      graphics.fillStyle(color, projectile.source === 'player' ? 0.2 : 0.16);
      graphics.fillCircle(x, y, projectile.radius + 4);
      graphics.fillStyle(color, 1);
      graphics.fillCircle(x, y, projectile.radius);
    }
  }

  private drawMonsters(state: TowerGameState): void {
    const graphics = this.graphics;
    for (const monster of state.monsters) {
      const { x, y } = this.toScreen(this.monsterRenderPos(monster));
      const color = monsterColor(monster.kind);
      const catalog = monsterCatalogEntry(monster.kind);
      this.drawMonsterAbilityTelegraph(monster);
      this.drawMonsterTemporalState(x, y, monster);
      this.drawMonsterRarityAura(x, y, monster);
      graphics.fillStyle(color, monster.camouflaged === true ? 0.34 : 1);
      this.drawMonsterSilhouette(x, y, monster.radius, catalog?.roleShape ?? 'circle');
      if (monster.kind === 'brute' || catalog?.roleShape === 'square') {
        graphics.lineStyle(3, COLORS.root, 0.7);
        graphics.strokeCircle(x, y, monster.radius * 0.65);
      }
      this.drawMonsterSignatureMark(x, y, monster.radius, catalog?.signature);
      if (monster.shieldRatio !== undefined) {
        graphics.lineStyle(2.5, 0x66d9ff, 0.35 + monster.shieldRatio * 0.6);
        graphics.strokeCircle(x, y, monster.radius + 4);
      }
      if (monster.empowered === true) {
        graphics.lineStyle(2, 0x71f0c5, 0.75);
        graphics.strokeCircle(x, y, monster.radius * 0.78);
      }
      this.drawMonsterRarityMarker(x, y, monster);
      graphics.lineStyle(1, 0x15130d, 0.8);
      graphics.strokeCircle(x, y, monster.radius);
      const barWidth = monster.radius * 2 * (monster.rarity === 'boss' ? 1.45 : 1);
      const markerRadius = RARITY_MARKER_RADIUS[monster.rarity];
      this.drawBar(
        x - barWidth / 2,
        y - monster.radius - markerRadius - 8,
        barWidth,
        monster.rarity === 'boss' ? 5 : 3,
        monster.hp / monster.maxHp,
        monster.rarity === 'common' ? color : this.rarityMarkerColor(monster.rarity),
      );
    }
  }

  private drawMonsterAbilityTelegraph(monster: TowerMonsterState): void {
    const ability = monster.ability;
    if (ability === undefined) return;
    const center = this.toScreen(ability.targetPosition ?? this.monsterRenderPos(monster));
    const progress = 1 - ability.remainingMs / Math.max(1, ability.totalMs);
    const color =
      ability.kind === 'heal'
        ? 0x65f2a0
        : ability.kind === 'bolster'
          ? 0x62b6ff
          : ability.kind === 'summon'
            ? 0xc879ff
            : ability.kind === 'control'
              ? 0x7ad7ff
              : ability.kind === 'disable'
                ? 0xffd54f
                : 0xff665f;
    const radius = Math.max(18, ability.radius || monster.radius * 1.5);
    this.graphics.fillStyle(color, 0.035 + progress * 0.08);
    this.graphics.fillCircle(center.x, center.y, radius);
    this.graphics.lineStyle(1.5 + progress * 2, color, 0.35 + progress * 0.55);
    this.graphics.strokeCircle(center.x, center.y, radius * (1 - progress * 0.18));
    if (ability.kind === 'ranged' || ability.kind === 'disable') {
      const origin = this.toScreen(this.monsterRenderPos(monster));
      this.graphics.lineStyle(1.5, color, 0.28 + progress * 0.5);
      this.graphics.lineBetween(origin.x, origin.y, center.x, center.y);
    }
  }

  /** Les monstres figés ne doivent pas ressembler à un défaut de rendu ou de réseau. */
  private drawMonsterTemporalState(x: number, y: number, monster: TowerMonsterState): void {
    if (monster.temporal?.status !== 'frozen') return;
    const radius = monster.radius + 6;
    this.graphics.lineStyle(2, 0x9be7ff, 0.9);
    this.graphics.strokeCircle(x, y, radius);
    this.graphics.lineBetween(x - radius * 0.62, y, x + radius * 0.62, y);
    this.graphics.lineBetween(x, y - radius * 0.62, x, y + radius * 0.62);
  }

  /** Marque intérieure : elle porte le pouvoir, sans dépasser la zone de collision. */
  private drawMonsterSignatureMark(
    x: number,
    y: number,
    radius: number,
    signature: TowerMonsterSignature | undefined,
  ): void {
    const graphics = this.graphics;
    const extent = radius * 0.42;
    graphics.lineStyle(Math.max(1.5, radius * 0.1), 0x08101d, 0.82);
    if (signature === undefined) {
      graphics.strokeCircle(x, y, Math.max(2, extent * 0.48));
      return;
    }
    if (
      signature.includes('heal') ||
      signature.includes('repair') ||
      signature.includes('revive')
    ) {
      graphics.lineBetween(x - extent, y, x + extent, y);
      graphics.lineBetween(x, y - extent, x, y + extent);
      return;
    }
    if (signature.includes('explosion') || signature.includes('volatile')) {
      graphics.strokeCircle(x, y, extent * 0.62);
      for (let index = 0; index < 4; index += 1) {
        const angle = index * (Math.PI / 2);
        graphics.lineBetween(
          x + Math.cos(angle) * extent * 0.7,
          y + Math.sin(angle) * extent * 0.7,
          x + Math.cos(angle) * extent,
          y + Math.sin(angle) * extent,
        );
      }
      return;
    }
    if (
      signature.includes('shot') ||
      signature.includes('projectile') ||
      signature.includes('snipe') ||
      signature.includes('cannon') ||
      signature.includes('barrage')
    ) {
      graphics.lineBetween(x - extent, y + extent * 0.45, x + extent, y - extent * 0.45);
      graphics.fillStyle(0x08101d, 0.82);
      graphics.fillCircle(x + extent * 0.62, y - extent * 0.28, Math.max(1.5, radius * 0.1));
      return;
    }
    if (
      signature.includes('web') ||
      signature.includes('freeze') ||
      signature.includes('slow') ||
      signature.includes('control') ||
      signature.includes('curse')
    ) {
      graphics.lineBetween(x - extent, y - extent, x + extent, y + extent);
      graphics.lineBetween(x + extent, y - extent, x - extent, y + extent);
      return;
    }
    if (
      signature.includes('summon') ||
      signature.includes('brood') ||
      signature.includes('squad') ||
      signature.includes('carry')
    ) {
      graphics.fillStyle(0x08101d, 0.82);
      graphics.fillCircle(x, y - extent * 0.55, Math.max(1.5, radius * 0.1));
      graphics.fillCircle(x - extent * 0.55, y + extent * 0.4, Math.max(1.5, radius * 0.1));
      graphics.fillCircle(x + extent * 0.55, y + extent * 0.4, Math.max(1.5, radius * 0.1));
      return;
    }
    // Marque neutre mais stable pour les combattants de contact.
    graphics.strokeCircle(x, y, Math.max(2, extent * 0.48));
  }

  private regularPolygonPoints(
    x: number,
    y: number,
    radius: number,
    sides: number,
    rotation = -Math.PI / 2,
  ): Phaser.Math.Vector2[] {
    return Array.from({ length: sides }, (_, index) => {
      const angle = rotation + (index / sides) * Math.PI * 2;
      return new Phaser.Math.Vector2(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    });
  }

  private drawMonsterSilhouette(
    x: number,
    y: number,
    radius: number,
    shape: TowerMonsterRoleShape,
  ): void {
    const graphics = this.graphics;
    if (shape === 'circle') {
      graphics.fillCircle(x, y, radius);
      return;
    }
    if (shape === 'triangle') {
      graphics.fillTriangle(
        x,
        y - radius,
        x + radius * 0.88,
        y + radius * 0.72,
        x - radius * 0.88,
        y + radius * 0.72,
      );
      return;
    }
    if (shape === 'square') {
      const half = radius * 0.72;
      graphics.fillRect(x - half, y - half, half * 2, half * 2);
      return;
    }
    if (shape === 'star') {
      const points: Phaser.Math.Vector2[] = [];
      for (let index = 0; index < 10; index += 1) {
        const pointRadius = index % 2 === 0 ? radius : radius * 0.48;
        const angle = -Math.PI / 2 + (index / 10) * Math.PI * 2;
        points.push(
          new Phaser.Math.Vector2(
            x + Math.cos(angle) * pointRadius,
            y + Math.sin(angle) * pointRadius,
          ),
        );
      }
      graphics.fillPoints(points, true);
      return;
    }
    graphics.fillPoints(
      this.regularPolygonPoints(x, y, radius, shape === 'pentagon' ? 5 : 6),
      true,
    );
  }

  /**
   * Les couleurs suivent les préférences visuelles ; les formes conservent la lecture de rareté
   * même lorsque les deux accents choisis sont proches.
   */
  private rarityMarkerColor(rarity: TowerMonsterRarity): number {
    const accent = hexToPhaserColor(this.visualPreferences.accentColor, 0x3498db);
    const secondary = hexToPhaserColor(this.visualPreferences.accentSecondaryColor, 0x9b59b6);
    switch (rarity) {
      case 'rare':
        return accent;
      case 'epic':
        return secondary;
      case 'legendary':
        return accent;
      case 'boss':
        return secondary;
      case 'common':
        return 0;
    }
  }

  private drawMonsterRarityAura(x: number, y: number, monster: TowerMonsterState): void {
    if (monster.rarity === 'common') return;
    const graphics = this.graphics;
    const color = this.rarityMarkerColor(monster.rarity);
    const alpha = monster.rarity === 'rare' ? 0.06 : monster.rarity === 'epic' ? 0.1 : 0.13;
    graphics.fillStyle(color, alpha);
    graphics.fillCircle(x, y, monster.radius + RARITY_MARKER_RADIUS[monster.rarity] + 7);
  }

  private drawDiamond(x: number, y: number, radius: number, color: number, alpha: number): void {
    const graphics = this.graphics;
    graphics.lineStyle(2, color, alpha);
    graphics.lineBetween(x, y - radius, x + radius, y);
    graphics.lineBetween(x + radius, y, x, y + radius);
    graphics.lineBetween(x, y + radius, x - radius, y);
    graphics.lineBetween(x - radius, y, x, y - radius);
  }

  private drawMonsterRarityMarker(x: number, y: number, monster: TowerMonsterState): void {
    if (monster.rarity === 'common') {
      return;
    }
    const graphics = this.graphics;
    const color = this.rarityMarkerColor(monster.rarity);
    const radius = monster.radius + RARITY_MARKER_RADIUS[monster.rarity];

    if (monster.rarity === 'rare') {
      graphics.lineStyle(1.5, color, 0.9);
      graphics.strokeCircle(x, y, radius);
      return;
    }

    if (monster.rarity === 'epic') {
      this.drawDiamond(x, y, radius, color, 0.95);
      graphics.fillStyle(color, 0.95);
      for (let index = 0; index < 4; index += 1) {
        const angle = index * (Math.PI / 2) + Math.PI / 4;
        graphics.fillCircle(
          x + Math.cos(angle) * (radius + 4),
          y + Math.sin(angle) * (radius + 4),
          1.8,
        );
      }
      return;
    }

    if (monster.rarity === 'legendary') {
      graphics.lineStyle(2, color, 0.96);
      graphics.strokeCircle(x, y, radius);
      this.drawDiamond(x, y, radius + 3, color, 0.96);
      graphics.lineStyle(1.5, color, 0.96);
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        graphics.lineBetween(
          x + Math.cos(angle) * (radius + 4),
          y + Math.sin(angle) * (radius + 4),
          x + Math.cos(angle) * (radius + 8),
          y + Math.sin(angle) * (radius + 8),
        );
      }
      return;
    }

    // Boss : anneau épais, losange et quatre repères, lisibles dans une mêlée.
    graphics.lineStyle(3, color, 1);
    graphics.strokeCircle(x, y, radius);
    this.drawDiamond(x, y, radius + 5, color, 1);
    graphics.lineStyle(2, color, 1);
    const spokeStart = radius + 7;
    const spokeEnd = radius + 13;
    graphics.lineBetween(x, y - spokeStart, x, y - spokeEnd);
    graphics.lineBetween(x + spokeStart, y, x + spokeEnd, y);
    graphics.lineBetween(x, y + spokeStart, x, y + spokeEnd);
    graphics.lineBetween(x - spokeStart, y, x - spokeEnd, y);
  }

  private drawPlayers(state: TowerGameState): void {
    const seenAllyIds = new Set<string>();
    for (const player of state.players) {
      const isLocal = player.id === state.player.id;
      this.drawPlayer(player, isLocal);
      if (!isLocal) {
        seenAllyIds.add(player.id);
        this.syncAllyLabel(player);
      }
    }
    for (const [id, label] of this.allyLabels) {
      if (!seenAllyIds.has(id)) {
        label.destroy();
        this.allyLabels.delete(id);
      }
    }
  }

  private drawPlayer(player: TowerPlayerState, isLocal: boolean): void {
    const graphics = this.graphics;
    const { x, y } = this.toScreen(this.playerRenderPos(player));
    const downed = player.downedRemainingMs > 0;
    if (downed) {
      graphics.fillStyle(COLORS.downed, 0.4);
      graphics.fillCircle(x, y, PLAYER_RADIUS);
      graphics.lineStyle(2, COLORS.downed, 0.55);
      graphics.strokeCircle(x, y, PLAYER_RADIUS);
      return;
    }
    const bodyColor = isLocal
      ? hexToPhaserColor(this.visualPreferences.playerColor, COLORS.local)
      : COLORS.ally;
    const aimAngle = Math.atan2(player.aim.y, player.aim.x);
    const barrel = WEAPON_BARRELS[player.activeWeaponId];
    // Canon : petit trait orienté vers la direction de visée, dessiné avant le
    // corps pour que celui-ci le recouvre partiellement (aspect « arme tenue »).
    graphics.lineStyle(barrel.width, WEAPON_COLORS[player.activeWeaponId], 0.95);
    graphics.lineBetween(
      x + Math.cos(aimAngle) * (PLAYER_RADIUS - 4),
      y + Math.sin(aimAngle) * (PLAYER_RADIUS - 4),
      x + Math.cos(aimAngle) * (PLAYER_RADIUS + barrel.length),
      y + Math.sin(aimAngle) * (PLAYER_RADIUS + barrel.length),
    );
    graphics.fillStyle(bodyColor, 1);
    graphics.fillCircle(x, y, PLAYER_RADIUS);
    graphics.lineStyle(2, 0x0c1216, 0.9);
    graphics.strokeCircle(x, y, PLAYER_RADIUS);
    this.drawBar(x - 18, y - PLAYER_RADIUS - 12, 36, 4, player.hp / player.maxHp, bodyColor);
  }

  /**
   * Crée/déplace l'étiquette de nom (4 premiers caractères de l'id) d'un allié.
   * Jamais appelée pour le local : son rendu ne porte pas d'étiquette.
   */
  private syncAllyLabel(player: TowerPlayerState): void {
    const { x, y } = this.toScreen(this.playerRenderPos(player));
    const labelY = y - PLAYER_RADIUS - 26;
    const labelText = player.id.slice(0, 4);
    const existing = this.allyLabels.get(player.id);
    if (existing === undefined) {
      const label = this.add
        .text(x, labelY, labelText, {
          color: '#e7dbb8',
          fontFamily: 'Georgia, serif',
          fontSize: '12px',
          fontStyle: 'bold',
          stroke: '#10181b',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(49);
      this.allyLabels.set(player.id, label);
      return;
    }
    existing.setPosition(x, labelY);
    existing.setText(labelText);
  }

  private drawBar(
    x: number,
    y: number,
    width: number,
    height: number,
    ratio: number,
    color: number,
  ): void {
    const graphics = this.graphics;
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    graphics.fillStyle(COLORS.hpBack, 0.8);
    graphics.fillRoundedRect(x, y, width, height, Math.min(2, height / 2));
    graphics.fillStyle(color, 1);
    graphics.fillRoundedRect(x, y, Math.max(0, width * clamped), height, Math.min(2, height / 2));
  }

  /**
   * La caméra rejoint sa cible (l'avatar LOCAL) par interpolation corrigée du
   * delta, pour rester identique quelle que soit la fréquence d'affichage.
   */
  private updateCamera(state: TowerGameState, delta: number): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, state.world.width, state.world.height);
    const localPos = this.playerRenderPos(state.player);
    const targetX = localPos.x + this.offsetX;
    const targetY = localPos.y + this.offsetY;
    if (!this.cameraReady) {
      camera.centerOn(targetX, targetY);
      this.cameraReady = true;
      return;
    }
    const ratio = 1 - Math.pow(1 - CAMERA_SMOOTHING, delta / 16.667);
    camera.centerOn(
      Phaser.Math.Linear(camera.midPoint.x, targetX, ratio),
      Phaser.Math.Linear(camera.midPoint.y, targetY, ratio),
    );
  }

  /**
   * Mini-carte en haut à droite : fenêtre centrée sur l'avatar local, montrant
   * le Cœur, les tourelles, les joueurs et les monstres dans un rayon fixe autour
   * de lui (pas la carte entière, dont le monde peut être bien plus grand que
   * cette fenêtre).
   */
  private renderMinimap(state: TowerGameState): void {
    const graphics = this.minimap;
    const width = 166;
    const height = 166;
    const boxX = this.scale.width - width - 22;
    const boxY = 22;
    const viewRadius = 1600;
    const scale = width / (viewRadius * 2);
    const centerX = boxX + width / 2;
    const centerY = boxY + height / 2;
    const localPos = this.playerRenderPos(state.player);

    const point = (position: Vector2): Vector2 => {
      const dx = Phaser.Math.Clamp(position.x - localPos.x, -viewRadius, viewRadius);
      const dy = Phaser.Math.Clamp(position.y - localPos.y, -viewRadius, viewRadius);
      return { x: centerX + dx * scale, y: centerY + dy * scale };
    };

    graphics.clear();
    graphics.fillStyle(COLORS.groundShade, 0.92);
    graphics.fillRoundedRect(boxX - 6, boxY - 6, width + 12, height + 12, 10);
    graphics.fillStyle(COLORS.minimapGround, 0.96);
    graphics.fillRoundedRect(boxX, boxY, width, height, 6);

    graphics.lineStyle(1, COLORS.grid, 0.2);
    for (let index = 1; index < 4; index += 1) {
      const gridX = boxX + (width * index) / 4;
      const gridY = boxY + (height * index) / 4;
      graphics.lineBetween(gridX, boxY, gridX, boxY + height);
      graphics.lineBetween(boxX, gridY, boxX + width, gridY);
    }

    graphics.lineStyle(1, COLORS.minimapBorder, 0.48);
    graphics.strokeRoundedRect(boxX, boxY, width, height, 6);
    graphics.lineStyle(1, COLORS.minimapBorder, 0.56);
    graphics.lineBetween(centerX - 7, boxY + 8, centerX + 7, boxY + 8);

    const heartPoint = point(state.heart.position);
    graphics.fillStyle(COLORS.heart, 1);
    graphics.fillCircle(heartPoint.x, heartPoint.y, 4);

    for (const turret of state.turrets) {
      const turretPoint = point(turret.position);
      const turretColor = hexToPhaserColor(this.visualPreferences.turretColor, COLORS.turret);
      graphics.fillStyle(turret.alive ? turretColor : COLORS.turretDead, 1);
      graphics.fillRect(turretPoint.x - 2, turretPoint.y - 2, 4, 4);
    }

    for (const monster of state.monsters) {
      const monsterPoint = point(this.monsterRenderPos(monster));
      this.drawMinimapMonster(monsterPoint, monster);
    }

    for (const player of state.players) {
      if (player.id === state.player.id) {
        continue;
      }
      const allyPoint = point(this.playerRenderPos(player));
      graphics.fillStyle(COLORS.ally, 1);
      graphics.fillCircle(allyPoint.x, allyPoint.y, 3);
    }

    const localPoint = point(localPos);
    graphics.fillStyle(hexToPhaserColor(this.visualPreferences.playerColor, COLORS.local), 1);
    graphics.fillCircle(localPoint.x, localPoint.y, 3);
  }

  private drawMinimapMonster(point: Vector2, monster: TowerMonsterState): void {
    const graphics = this.minimap;
    const baseColor = monsterColor(monster.kind);
    const markerColor = this.rarityMarkerColor(monster.rarity);

    if (monster.rarity === 'boss') {
      graphics.fillStyle(markerColor, 0.2);
      graphics.fillCircle(point.x, point.y, 7);
      graphics.lineStyle(2, markerColor, 1);
      graphics.strokeCircle(point.x, point.y, 5);
      graphics.lineBetween(point.x - 7, point.y, point.x + 7, point.y);
      graphics.lineBetween(point.x, point.y - 7, point.x, point.y + 7);
      graphics.fillStyle(baseColor, 1);
      graphics.fillCircle(point.x, point.y, 3);
      return;
    }

    graphics.fillStyle(baseColor, 0.95);
    graphics.fillCircle(point.x, point.y, 2);
    if (monster.rarity === 'rare') {
      graphics.lineStyle(1, markerColor, 1);
      graphics.strokeCircle(point.x, point.y, 3.5);
      return;
    }
    if (monster.rarity === 'epic') {
      this.drawMinimapDiamond(point, 4, markerColor);
      return;
    }
    if (monster.rarity === 'legendary') {
      graphics.lineStyle(1.5, markerColor, 1);
      graphics.strokeCircle(point.x, point.y, 4.5);
      this.drawMinimapDiamond(point, 5.5, markerColor);
    }
  }

  private drawMinimapDiamond(point: Vector2, radius: number, color: number): void {
    const graphics = this.minimap;
    graphics.lineStyle(1.5, color, 1);
    graphics.lineBetween(point.x, point.y - radius, point.x + radius, point.y);
    graphics.lineBetween(point.x + radius, point.y, point.x, point.y + radius);
    graphics.lineBetween(point.x, point.y + radius, point.x - radius, point.y);
    graphics.lineBetween(point.x - radius, point.y, point.x, point.y - radius);
  }
}
