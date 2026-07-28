import Phaser from 'phaser';

import type {
  HeartState,
  ScrapPickupState,
  TowerGameState,
  TowerMonsterKind,
  TowerMonsterState,
  TowerPlayerState,
  TowerProjectileState,
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
}

const COLORS = {
  ground: 0x0b0f12,
  grid: 0x18232a,
  distanceNear: 0x1a2a33,
  distanceFar: 0x3a1620,
  heart: 0xe23b3b,
  heartOutline: 0xff8f8f,
  turret: 0x8fa3c9,
  turretDead: 0x4a4f57,
  turretRange: 0x8fa3c9,
  turretEnergy: 0xf4c22f,
  local: 0x5be3ff,
  ally: 0xff8fd9,
  downed: 0x6a7079,
  barrel: 0xeafcff,
  projectilePlayer: 0xffffff,
  projectileTurret: 0x6bd66b,
  scrap: 0x8a8f96,
  hpBack: 0x070b0c,
} as const;

const MONSTER_COLORS: Readonly<Record<TowerMonsterKind, number>> = {
  chaser: 0x9c6b6b,
  runner: 0xe8d24c,
  brute: 0x8a5cd6,
  kamikaze: 0xff8c3c,
};

/** Demi-largeur (radians) de l'arc de portée d'une tourelle (110° au total). */
const TURRET_ARC_HALF_RAD = Phaser.Math.DegToRad(55);
const TURRET_RADIUS = 22;
const PLAYER_RADIUS = 16;

/** Fraction du reste à rattraper par frame de 60 Hz, corrigée du delta réel. */
const CAMERA_SMOOTHING = 0.18;

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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
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
    this.computeInterpolation(state);
    this.renderWorld(state);
    this.updateCamera(state, delta);
    this.renderMinimap(state);
  }

  /**
   * Calcule les positions de RENDU (joueurs, monstres, projectiles) par
   * interpolation linéaire entre l'instantané précédent et l'instantané courant,
   * pondérée par `getRenderAlpha()`. Une entité absente de l'instantané précédent
   * (apparition) est rendue directement à sa position courante ; une entité
   * disparue de l'instantané courant (mort/expiration) n'est simplement plus
   * dessinée.
   */
  private computeInterpolation(state: TowerGameState): void {
    const alpha = this.session.getRenderAlpha();
    const previous = this.previousState;

    this.renderPlayerPos.clear();
    for (const player of state.players) {
      const before = previous?.players.find((item) => item.id === player.id);
      this.renderPlayerPos.set(
        player.id,
        before === undefined ? player.position : lerpVec(before.position, player.position, alpha),
      );
    }

    this.renderMonsterPos.clear();
    for (const monster of state.monsters) {
      const before = previous?.monsters.find((item) => item.id === monster.id);
      this.renderMonsterPos.set(
        monster.id,
        before === undefined ? monster.position : lerpVec(before.position, monster.position, alpha),
      );
    }

    this.renderProjectilePos.clear();
    for (const projectile of state.projectiles) {
      const before = previous?.projectiles.find((item) => item.id === projectile.id);
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
    this.drawScraps(state);
    this.drawHeart(state.heart);
    this.drawTurrets(state.turrets);
    this.drawProjectiles(state);
    this.drawMonsters(state);
    this.drawPlayers(state);
  }

  private drawGround(state: TowerGameState): void {
    const graphics = this.graphics;
    graphics.fillStyle(COLORS.ground, 1);
    graphics.fillRect(0, 0, state.world.width, state.world.height);
    graphics.lineStyle(1, COLORS.grid, 0.35);
    for (let x = 0; x <= state.world.width; x += 100) {
      graphics.lineBetween(x, 0, x, state.world.height);
    }
    for (let y = 0; y <= state.world.height; y += 100) {
      graphics.lineBetween(0, y, state.world.width, y);
    }
    // Teinte de distance : bandes concentriques subtiles autour de l'origine
    // (centre du monde), du calme (bleuté) au danger (rougeâtre) en s'éloignant.
    const centerX = this.offsetX;
    const centerY = this.offsetY;
    const maxRadius = Math.max(state.world.width, state.world.height) / 2;
    const bandCount = 5;
    for (let band = 1; band <= bandCount; band += 1) {
      const t = band / bandCount;
      const radius = maxRadius * t;
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(COLORS.distanceNear),
        Phaser.Display.Color.ValueToColor(COLORS.distanceFar),
        bandCount,
        band,
      );
      graphics.lineStyle(2, color.color, 0.06 + 0.04 * t);
      graphics.strokeCircle(centerX, centerY, radius);
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
    graphics.fillStyle(COLORS.scrap, 0.9);
    graphics.fillRect(x - 4, y - 4, 8, 8);
  }

  private drawHeart(heart: HeartState): void {
    const graphics = this.graphics;
    const { x, y } = this.toScreen(heart.position);
    graphics.fillStyle(COLORS.heart, 1);
    graphics.fillCircle(x, y, heart.radius);
    graphics.lineStyle(3, COLORS.heartOutline, 0.85);
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
    const bodyColor = turret.alive ? COLORS.turret : COLORS.turretDead;
    const bodyAlpha = turret.alive ? 1 : 0.5;

    if (turret.alive) {
      // Arc de portée (secteur de 110° dans la direction de visée fixe).
      const angleRad = Phaser.Math.DegToRad(turret.angle);
      graphics.fillStyle(COLORS.turretRange, 0.07);
      graphics.slice(
        x,
        y,
        turret.range,
        angleRad - TURRET_ARC_HALF_RAD,
        angleRad + TURRET_ARC_HALF_RAD,
        false,
      );
      graphics.fillPath();
      graphics.lineStyle(1, COLORS.turretRange, 0.18);
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

    graphics.fillStyle(bodyColor, bodyAlpha);
    graphics.fillCircle(x, y, TURRET_RADIUS);
    graphics.lineStyle(2, 0x0c1216, bodyAlpha);
    graphics.strokeCircle(x, y, TURRET_RADIUS);

    this.drawBar(x - 20, y - TURRET_RADIUS - 14, 40, 5, turret.hp / turret.maxHp, COLORS.turret);
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
        projectile.source === 'player' ? COLORS.projectilePlayer : COLORS.projectileTurret;
      graphics.fillStyle(color, 1);
      graphics.fillCircle(x, y, projectile.radius);
    }
  }

  private drawMonsters(state: TowerGameState): void {
    const graphics = this.graphics;
    for (const monster of state.monsters) {
      const { x, y } = this.toScreen(this.monsterRenderPos(monster));
      const color = MONSTER_COLORS[monster.kind];
      graphics.fillStyle(color, 1);
      graphics.fillCircle(x, y, monster.radius);
      graphics.lineStyle(1, 0x0c1216, 0.7);
      graphics.strokeCircle(x, y, monster.radius);
      this.drawBar(
        x - monster.radius,
        y - monster.radius - 8,
        monster.radius * 2,
        3,
        monster.hp / monster.maxHp,
        color,
      );
    }
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
    const bodyColor = isLocal ? COLORS.local : COLORS.ally;
    const aimAngle = Math.atan2(player.aim.y, player.aim.x);
    // Canon : petit trait orienté vers la direction de visée, dessiné avant le
    // corps pour que celui-ci le recouvre partiellement (aspect « arme tenue »).
    graphics.lineStyle(5, COLORS.barrel, 0.95);
    graphics.lineBetween(
      x + Math.cos(aimAngle) * (PLAYER_RADIUS - 4),
      y + Math.sin(aimAngle) * (PLAYER_RADIUS - 4),
      x + Math.cos(aimAngle) * (PLAYER_RADIUS + 14),
      y + Math.sin(aimAngle) * (PLAYER_RADIUS + 14),
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
          color: '#ffe1f5',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '12px',
          fontStyle: 'bold',
          stroke: '#11181b',
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
    graphics.fillStyle(0x091013, 0.82);
    graphics.fillRoundedRect(boxX - 6, boxY - 6, width + 12, height + 12, 10);
    graphics.lineStyle(1, 0xffffff, 0.18);
    graphics.strokeRect(boxX, boxY, width, height);

    const heartPoint = point(state.heart.position);
    graphics.fillStyle(COLORS.heart, 1);
    graphics.fillCircle(heartPoint.x, heartPoint.y, 4);

    for (const turret of state.turrets) {
      const turretPoint = point(turret.position);
      graphics.fillStyle(turret.alive ? COLORS.turret : COLORS.turretDead, 1);
      graphics.fillRect(turretPoint.x - 2, turretPoint.y - 2, 4, 4);
    }

    for (const monster of state.monsters) {
      const monsterPoint = point(this.monsterRenderPos(monster));
      graphics.fillStyle(MONSTER_COLORS[monster.kind], 0.9);
      graphics.fillCircle(monsterPoint.x, monsterPoint.y, 2);
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
    graphics.fillStyle(COLORS.local, 1);
    graphics.fillCircle(localPoint.x, localPoint.y, 3);
  }
}
