import Phaser from 'phaser';

import type { EnemyKind, PlayerInput, PublicGameState, Vector2 } from '@village-survivor/protocol';
import { defaultContent } from '@village-survivor/content';

import { HitFlashTracker, matchEnemyAt } from '../render/hit-flash.js';
import { lerpColor, resolvePhaseVisuals, type PhaseVisuals } from '../render/theme.js';
import type { LocalSession } from '../session/LocalSession.js';
import { VILLAGE_TRADE_HINT } from '../ui/VillageTrade.js';

/**
 * Ressources récoltables. Dupliqué ici volontairement (couleurs comprises) pour
 * ne créer aucun fichier partagé avec le lot UI qui possède la même table.
 */
type ResourceType = 'wood' | 'stone' | 'iron' | 'gold' | 'diamond';

const RESOURCE_COLORS: Readonly<Record<ResourceType, number>> = {
  wood: 0x3fb84f,
  stone: 0x9aa0a6,
  iron: 0xf2f2f2,
  gold: 0xf4c22f,
  diamond: 0x9be8ff,
};

/** Vert par défaut du cercle de chargement (réparation ou récolte sans type). */
const CHANNEL_DEFAULT_COLOR = 0x6bd66b;

const COLORS = {
  village: 0xf4c76f,
  villageCore: 0xffe9a6,
  player: 0x72ddf7,
  ward: 0x82aaff,
  resource: 0x75c96b,
  resourceEmpty: 0x415348,
  guardian: 0xf28f3b,
  sleeper: 0x8f78c9,
  raider: 0xe85d75,
  brute: 0xb23a48,
  defense: 0xe8d8a8,
};

/**
 * L'empreinte au sol du personnage est celle de son anneau de garde, pas celle de
 * son corps : une ombre calée sur le corps resterait cachée derrière cet anneau.
 */
const PLAYER_FOOTPRINT_RADIUS = 24;

const ENEMY_KINDS: readonly EnemyKind[] = ['guardian', 'sleeper', 'raider', 'brute'];
const SPARK_TEXTURE = 'vs-spark';

/** Fraction du reste à rattraper par frame de 60 Hz, corrigée du delta réel. */
const CAMERA_SMOOTHING = 0.14;
/** Décalage de la caméra vers le curseur, pour anticiper la direction visée. */
const CAMERA_LOOK_AHEAD = 0.12;
const CAMERA_LOOK_AHEAD_LIMIT = 110;
/** Décalage vertical de la cible caméra (px) : recentre le joueur plus haut. */
const CAMERA_VERTICAL_OFFSET = 50;

const DRAW_RESOURCE = 0;
const DRAW_DEFENSE = 1;
const DRAW_VILLAGE = 2;
const DRAW_ENEMY = 3;
const DRAW_PLAYER = 4;
type DrawKind = 0 | 1 | 2 | 3 | 4;

interface DepthEntry {
  y: number;
  kind: DrawKind;
  index: number;
}

/** Interpolation linéaire scalaire, utilisée pour le lissage des positions. */
function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function enemyColor(kind: EnemyKind): number {
  switch (kind) {
    case 'guardian':
      return COLORS.guardian;
    case 'sleeper':
      return COLORS.sleeper;
    case 'raider':
      return COLORS.raider;
    case 'brute':
      return COLORS.brute;
  }
}

function enemyRadius(kind: EnemyKind): number {
  return kind === 'brute' ? 27 : kind === 'guardian' ? 21 : 17;
}

export class GameScene extends Phaser.Scene {
  /** Distance (px) sous laquelle on considère la destination atteinte. */
  private static readonly ARRIVAL_THRESHOLD = 12;
  /** Rayon du cercle de chargement, calé autour du corps du joueur. */
  private static readonly CHANNEL_RING_RADIUS = 30;

  private readonly session: LocalSession;
  private graphics!: Phaser.GameObjects.Graphics;
  private minimap!: Phaser.GameObjects.Graphics;
  private channelRing!: Phaser.GameObjects.Graphics;
  private deathEmitters!: Record<EnemyKind, Phaser.GameObjects.Particles.ParticleEmitter>;
  private state: PublicGameState | undefined;
  /**
   * Instantané du tick précédent : sert à interpoler les positions mobiles
   * (joueur, ennemis) entre deux ticks de simulation pour un rendu fluide.
   */
  private previousState: PublicGameState | undefined;
  /** Position de rendu interpolée du joueur (repère `player.position`). */
  private renderPlayerPos: Vector2 = { x: 0, y: 0 };
  /** Positions de rendu interpolées des ennemis, indexées par leur `id`. */
  private readonly renderEnemyPos = new Map<string, Vector2>();
  private unsubscribe: (() => void) | undefined;
  private sequence = 0;
  private pendingUpgradeId: string | undefined;
  private pendingBuild = false;
  private pendingSword = false;
  private pendingBarrier = false;
  private pendingHeal = false;
  /**
   * Destination courante du déplacement au clic droit (dans le repère de
   * `player.position`). Conservée après relâchement : le joueur poursuit sa
   * course jusqu'à l'atteindre. `undefined` = pas de trajet en cours.
   */
  private moveTarget: Vector2 | undefined;
  private rightButtonDown = false;
  private leftButtonDown = false;
  private lastRenderedEventId = 0;

  private readonly hitFlash = new HitFlashTracker();
  /**
   * Les événements décrivent des entités qui viennent d'être retirées de l'état
   * courant : c'est l'instantané précédent qui permet de les identifier.
   */
  private previousEnemies: PublicGameState['enemies'] = [];
  private readonly depthPool: DepthEntry[] = [];
  private readonly depthOrder: DepthEntry[] = [];
  private cameraReady = false;
  private offsetX = 0;
  private offsetY = 0;
  /** Halo discret (anneau fin) posé autour de l'objet interactif à portée. */
  private interactionHalo!: Phaser.GameObjects.Graphics;

  public constructor(session: LocalSession) {
    super({ key: 'GameScene' });
    this.session = session;
  }

  public create(): void {
    this.createSparkTexture();
    this.graphics = this.add.graphics();
    this.createDeathEmitters();
    this.minimap = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.channelRing = this.add.graphics().setDepth(47);
    this.interactionHalo = this.add.graphics().setDepth(59).setVisible(false);
    this.cameras.main.setRoundPixels(true);
    this.input.mouse?.disableContextMenu();
    const keyboard = this.input.keyboard;
    if (keyboard === null) {
      throw new Error('Le clavier est requis pour le M1.');
    }
    keyboard.on('keydown', (event: KeyboardEvent) => {
      if (event.code === 'KeyB') {
        this.pendingBuild = true;
      } else if (event.code === 'Space') {
        this.pendingSword = true;
      } else if (event.key.toLowerCase() === 'q') {
        // On teste le CARACTÈRE produit (event.key), pas la position physique
        // (event.code) : la touche imprimée « Q » déclenche la Barrière quelle que
        // soit la disposition clavier (QWERTY, AZERTY, etc.).
        this.pendingBarrier = true;
      } else if (event.code === 'KeyE') {
        this.pendingHeal = true;
      }
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2) {
        // Clic droit : (re)définit la destination de déplacement et active le
        // suivi tant que le bouton reste enfoncé.
        this.setMoveTargetFromPointer(pointer);
        this.rightButtonDown = true;
        return;
      }
      if (pointer.button === 0) {
        // Quand l'indice est « Échanger avec le village », l'ouverture de la vue
        // d'échange est prise en charge par main.ts sur ce même clic : on
        // n'active alors pas l'état continu de récolte/réparation.
        if (this.state?.interactionHint === VILLAGE_TRADE_HINT) {
          return;
        }
        this.leftButtonDown = true;
      }
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.rightButtonDown) {
        this.setMoveTargetFromPointer(pointer);
      }
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2) {
        // On ne vide pas `moveTarget` : le joueur poursuit sa course.
        this.rightButtonDown = false;
      } else if (pointer.button === 0) {
        this.leftButtonDown = false;
      }
    });
    this.input.on('pointerupoutside', () => {
      this.rightButtonDown = false;
      this.leftButtonDown = false;
    });
    this.unsubscribe = this.session.subscribe((state) => {
      this.consumeEvents(state);
      // On conserve l'état courant comme « précédent » avant de le remplacer :
      // c'est entre ces deux instantanés que le rendu interpole les positions.
      this.previousState = this.state;
      this.state = state;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
  }

  public override update(_time: number, delta: number): void {
    const state = this.state;
    if (state === undefined) {
      return;
    }
    this.hitFlash.prune(this.time.now);
    this.computeInterpolation(state);
    this.sendControls(state);
    this.renderWorld(state);
    this.renderChannelRing(state);
    this.updateCamera(state, delta);
    this.renderMinimap(state);
    this.renderInteractionPrompt(state);
  }

  public selectUpgrade(upgradeId: string): void {
    this.pendingUpgradeId = upgradeId;
  }

  private createSparkTexture(): void {
    if (this.textures.exists(SPARK_TEXTURE)) {
      return;
    }
    const brush = this.make.graphics({}, false);
    brush.fillStyle(0xffffff, 1);
    brush.fillCircle(5, 5, 5);
    brush.generateTexture(SPARK_TEXTURE, 10, 10);
    brush.destroy();
  }

  /** Un émetteur par espèce, réutilisé : aucune allocation au moment des morts. */
  private createDeathEmitters(): void {
    const emitters = {} as Record<EnemyKind, Phaser.GameObjects.Particles.ParticleEmitter>;
    for (const kind of ENEMY_KINDS) {
      emitters[kind] = this.add
        .particles(0, 0, SPARK_TEXTURE, {
          speed: { min: 55, max: 190 },
          angle: { min: 0, max: 360 },
          lifespan: { min: 260, max: 520 },
          scale: { start: 0.95, end: 0 },
          alpha: { start: 0.95, end: 0 },
          tint: enemyColor(kind),
          emitting: false,
        })
        .setDepth(48);
    }
    this.deathEmitters = emitters;
  }

  /**
   * Convertit la position écran d'un pointeur en coordonnées monde exprimées
   * dans le même repère que `player.position` (l'offset de rendu retiré).
   */
  private setMoveTargetFromPointer(pointer: Phaser.Input.Pointer): void {
    const state = this.state;
    if (state === undefined) {
      return;
    }
    const world = pointer.positionToCamera(this.cameras.main) as Vector2;
    this.moveTarget = {
      x: world.x - state.world.width / 2,
      y: world.y - state.world.height / 2,
    };
  }

  private sendControls(state: PublicGameState): void {
    let moveX = 0;
    let moveY = 0;
    if (this.moveTarget !== undefined) {
      const dx = this.moveTarget.x - state.player.position.x;
      const dy = this.moveTarget.y - state.player.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance < GameScene.ARRIVAL_THRESHOLD) {
        // Destination atteinte : on stoppe et on efface le trajet.
        this.moveTarget = undefined;
      } else {
        moveX = dx / distance;
        moveY = dy / distance;
      }
    }
    const halfWidth = state.world.width / 2;
    const halfHeight = state.world.height / 2;
    const pointerWorld = this.input.activePointer.positionToCamera(this.cameras.main) as Vector2;
    const aim = {
      x: pointerWorld.x - halfWidth - state.player.position.x,
      y: pointerWorld.y - halfHeight - state.player.position.y,
    };
    this.sequence += 1;
    const pendingUpgrade = this.pendingUpgradeId;
    const input: PlayerInput & { activateHeal?: true } = {
      sequence: this.sequence,
      moveX,
      moveY,
      aimX: aim.x,
      aimY: aim.y,
      interact: this.leftButtonDown,
      buildDefense: this.pendingBuild,
      activateSword: this.pendingSword,
      activateBarrier: this.pendingBarrier,
      ...(this.pendingHeal ? { activateHeal: true } : {}),
      ...(pendingUpgrade === undefined ? {} : { selectUpgradeId: pendingUpgrade }),
    };
    this.pendingUpgradeId = undefined;
    this.pendingBuild = false;
    this.pendingSword = false;
    this.pendingBarrier = false;
    this.pendingHeal = false;
    this.session.sendInput(input);
  }

  /**
   * Calcule les positions de RENDU du joueur et des ennemis par interpolation
   * linéaire entre l'instantané précédent et l'instantané courant, pondérée par
   * la fraction de progression vers le prochain tick (`getRenderAlpha`). Sans ça,
   * les positions ne changent qu'une fois par tick (~50ms) alors que Phaser rend
   * à 60-144Hz, ce qui produit des saccades.
   *
   * Cas particuliers : un ennemi absent de l'état précédent (spawn) est rendu
   * directement à sa position courante ; un ennemi disparu de l'état courant
   * (mort) n'est simplement pas interpolé (il n'est plus dessiné).
   */
  private computeInterpolation(state: PublicGameState): void {
    const alpha = this.session.getRenderAlpha();
    const previous = this.previousState;
    const previousPlayer = previous?.player.position;
    this.renderPlayerPos =
      previousPlayer === undefined
        ? state.player.position
        : {
            x: lerp(previousPlayer.x, state.player.position.x, alpha),
            y: lerp(previousPlayer.y, state.player.position.y, alpha),
          };
    this.renderEnemyPos.clear();
    for (const enemy of state.enemies) {
      const previousEnemy = previous?.enemies.find((item) => item.id === enemy.id);
      this.renderEnemyPos.set(
        enemy.id,
        previousEnemy === undefined
          ? enemy.position
          : {
              x: lerp(previousEnemy.position.x, enemy.position.x, alpha),
              y: lerp(previousEnemy.position.y, enemy.position.y, alpha),
            },
      );
    }
  }

  /** Position de rendu interpolée d'un ennemi (repli sur sa position brute). */
  private enemyRenderPos(enemy: PublicGameState['enemies'][number]): Vector2 {
    return this.renderEnemyPos.get(enemy.id) ?? enemy.position;
  }

  /** Dessine le cercle de progression de récolte/réparation autour du joueur. */
  private renderChannelRing(state: PublicGameState): void {
    const graphics = this.channelRing;
    graphics.clear();
    const channel = state.player.interactionChannel;
    if (channel === undefined) {
      return;
    }
    const playerPos = this.renderPlayerPos;
    const x = playerPos.x + this.offsetX;
    const y = playerPos.y + this.offsetY;
    const color =
      channel.kind === 'harvest' && channel.resourceType !== undefined
        ? RESOURCE_COLORS[channel.resourceType]
        : CHANNEL_DEFAULT_COLOR;
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * Phaser.Math.Clamp(channel.progress, 0, 1);
    graphics.lineStyle(5, color, 0.92);
    graphics.beginPath();
    graphics.arc(x, y, GameScene.CHANNEL_RING_RADIUS, start, end);
    graphics.strokePath();
  }

  private renderWorld(state: PublicGameState): void {
    this.offsetX = state.world.width / 2;
    this.offsetY = state.world.height / 2;
    const visuals = resolvePhaseVisuals(state.phase, state.phaseRemainingMs);
    const graphics = this.graphics;
    graphics.clear();
    this.drawGround(state, visuals);
    this.drawGroundMarkings(state);
    this.drawShadows(state, visuals);
    this.drawSortedBodies(state, visuals);
    this.drawHealthBars(state);
    this.drawBarrierDome(state);
  }

  private drawGround(state: PublicGameState, visuals: PhaseVisuals): void {
    const graphics = this.graphics;
    graphics.fillStyle(visuals.ground, 1);
    graphics.fillRect(0, 0, state.world.width, state.world.height);
    graphics.lineStyle(1, visuals.grid, visuals.gridAlpha);
    for (let x = 0; x <= state.world.width; x += 100) {
      graphics.lineBetween(x, 0, x, state.world.height);
    }
    for (let y = 0; y <= state.world.height; y += 100) {
      graphics.lineBetween(0, y, state.world.width, y);
    }
  }

  /** Auréole du village et portées des balistes : elles appartiennent au sol. */
  private drawGroundMarkings(state: PublicGameState): void {
    const graphics = this.graphics;
    const villageX = state.village.position.x + this.offsetX;
    const villageY = state.village.position.y + this.offsetY;
    const playerInsideVillage =
      Math.hypot(
        state.player.position.x - state.village.position.x,
        state.player.position.y - state.village.position.y,
      ) <= state.village.areaRadius;
    graphics.fillStyle(COLORS.village, playerInsideVillage ? 0.1 : 0.055);
    graphics.fillCircle(villageX, villageY, state.village.areaRadius);
    graphics.lineStyle(3, COLORS.village, playerInsideVillage ? 0.85 : 0.48);
    graphics.strokeCircle(villageX, villageY, state.village.areaRadius);
    graphics.lineStyle(2, COLORS.village, 0.14);
    for (const radius of [300, 600, 900]) {
      graphics.strokeCircle(villageX, villageY, radius);
    }
    for (const defense of state.defenses) {
      if (!defense.built) {
        continue;
      }
      const x = defense.position.x + this.offsetX;
      const y = defense.position.y + this.offsetY;
      graphics.fillStyle(COLORS.defense, 0.025);
      graphics.fillCircle(x, y, defense.range);
      graphics.lineStyle(2, COLORS.defense, 0.22);
      graphics.strokeCircle(x, y, defense.range);
    }
  }

  /**
   * Toutes les ombres sont posées avant les corps : une ombre ne peut donc jamais
   * recouvrir une entité déjà dessinée.
   */
  private drawShadows(state: PublicGameState, visuals: PhaseVisuals): void {
    for (const resource of state.resources) {
      this.drawShadow(resource.position, 20, visuals.shadowAlpha);
    }
    for (const defense of state.defenses) {
      this.drawShadow(defense.position, defense.built ? 22 : 27, visuals.shadowAlpha);
    }
    this.drawShadow(state.village.position, 50 + state.village.heartLevel * 5, visuals.shadowAlpha);
    for (const enemy of state.enemies) {
      this.drawShadow(this.enemyRenderPos(enemy), enemyRadius(enemy.kind), visuals.shadowAlpha);
    }
    this.drawShadow(this.renderPlayerPos, PLAYER_FOOTPRINT_RADIUS, visuals.shadowAlpha);
  }

  /**
   * L'ellipse est posée au pied de l'entité et non sous son centre : `fillEllipse`
   * prend des dimensions totales, donc une ombre centrée plus haut resterait
   * entièrement masquée par le corps opaque dessiné par-dessus.
   */
  private drawShadow(position: Vector2, radius: number, alpha: number): void {
    this.graphics.fillStyle(0x000000, alpha);
    this.graphics.fillEllipse(
      position.x + this.offsetX,
      position.y + this.offsetY + radius,
      radius * 1.8,
      radius * 0.66,
    );
  }

  /**
   * Les corps sont triés par ordonnée : ce qui est plus bas à l'écran est plus
   * proche de la caméra, et passe donc devant.
   */
  private drawSortedBodies(state: PublicGameState, visuals: PhaseVisuals): void {
    this.depthOrder.length = 0;
    state.resources.forEach((resource, index) => {
      this.pushDepth(resource.position.y, DRAW_RESOURCE, index);
    });
    state.defenses.forEach((defense, index) => {
      this.pushDepth(defense.position.y, DRAW_DEFENSE, index);
    });
    this.pushDepth(state.village.position.y, DRAW_VILLAGE, 0);
    state.enemies.forEach((enemy, index) => {
      this.pushDepth(this.enemyRenderPos(enemy).y, DRAW_ENEMY, index);
    });
    this.pushDepth(this.renderPlayerPos.y, DRAW_PLAYER, 0);
    this.depthOrder.sort((first, second) => first.y - second.y);

    for (const entry of this.depthOrder) {
      switch (entry.kind) {
        case DRAW_RESOURCE:
          this.drawResource(state, entry.index);
          break;
        case DRAW_DEFENSE:
          this.drawDefense(state, entry.index);
          break;
        case DRAW_VILLAGE:
          this.drawVillageCore(state);
          break;
        case DRAW_ENEMY:
          this.drawEnemy(state, entry.index, visuals);
          break;
        case DRAW_PLAYER:
          this.drawPlayer(state, visuals);
          break;
      }
    }
  }

  /** Les entrées sont recyclées d'une frame à l'autre pour ne rien allouer. */
  private pushDepth(y: number, kind: DrawKind, index: number): void {
    const pooled = this.depthPool[this.depthOrder.length];
    if (pooled === undefined) {
      const created: DepthEntry = { y, kind, index };
      this.depthPool.push(created);
      this.depthOrder.push(created);
      return;
    }
    pooled.y = y;
    pooled.kind = kind;
    pooled.index = index;
    this.depthOrder.push(pooled);
  }

  private drawResource(state: PublicGameState, index: number): void {
    const resource = state.resources[index];
    if (resource === undefined) {
      return;
    }
    const graphics = this.graphics;
    const x = resource.position.x + this.offsetX;
    const y = resource.position.y + this.offsetY;
    const typeColor = RESOURCE_COLORS[resource.resourceType];
    const depleted = resource.amountRemaining === 0;
    // Épuisé : on garde la teinte du type mais assombrie et atténuée, pour rester
    // reconnaissable tout en se distinguant clairement d'une ressource disponible.
    const fillColor = depleted ? lerpColor(typeColor, 0x000000, 0.62) : typeColor;
    graphics.fillStyle(fillColor, depleted ? 0.7 : 1);
    graphics.fillRoundedRect(x - 20, y - 20, 40, 40, 8);
    graphics.lineStyle(2, state.phase === 'day' ? 0x315b37 : 0xdff0d8, 0.65);
    graphics.strokeRoundedRect(x - 20, y - 20, 40, 40, 8);
  }

  private drawDefense(state: PublicGameState, index: number): void {
    const defense = state.defenses[index];
    if (defense === undefined) {
      return;
    }
    const graphics = this.graphics;
    const x = defense.position.x + this.offsetX;
    const y = defense.position.y + this.offsetY;
    if (defense.built) {
      graphics.fillStyle(COLORS.defense, 1);
      graphics.fillTriangle(x - 22, y + 18, x + 22, y + 18, x, y - 24);
      return;
    }
    const progress = 1 - defense.buildRemainingMs / defense.buildDurationMs;
    graphics.fillStyle(COLORS.defense, 0.12 + progress * 0.24);
    graphics.fillCircle(x, y, 27);
    graphics.lineStyle(4, COLORS.defense, 0.8);
    graphics.beginPath();
    graphics.arc(x, y, 33, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    graphics.strokePath();
    graphics.lineStyle(3, COLORS.defense, 0.65);
    graphics.lineBetween(x - 18, y, x + 18, y);
  }

  private drawVillageCore(state: PublicGameState): void {
    const graphics = this.graphics;
    const x = state.village.position.x + this.offsetX;
    const y = state.village.position.y + this.offsetY;
    graphics.fillStyle(COLORS.village, state.village.underAttack ? 0.75 : 1);
    graphics.fillCircle(x, y, 50 + state.village.heartLevel * 5);
    graphics.fillStyle(COLORS.villageCore, 1);
    graphics.fillCircle(x, y, 18 + state.village.heartLevel * 3);
  }

  private drawEnemy(state: PublicGameState, index: number, visuals: PhaseVisuals): void {
    const enemy = state.enemies[index];
    if (enemy === undefined) {
      return;
    }
    const graphics = this.graphics;
    const position = this.enemyRenderPos(enemy);
    const x = position.x + this.offsetX;
    const y = position.y + this.offsetY;
    const intensity = this.hitFlash.intensity(enemy.id, this.time.now);
    const baseColor = enemyColor(enemy.kind);
    const color = intensity > 0 ? lerpColor(baseColor, 0xffffff, 0.85 * intensity) : baseColor;
    const radius = enemyRadius(enemy.kind) * (1 + 0.16 * intensity);
    graphics.fillStyle(color, enemy.awake ? 1 : 0.5);
    if (enemy.kind === 'brute') {
      graphics.fillRoundedRect(x - radius, y - radius, radius * 2, radius * 2, 8);
    } else {
      graphics.fillCircle(x, y, radius);
    }
    if (!enemy.awake) {
      graphics.lineStyle(2, visuals.outline, 0.55);
      graphics.strokeCircle(x, y, radius + 5);
    }
  }

  private drawPlayer(state: PublicGameState, visuals: PhaseVisuals): void {
    const graphics = this.graphics;
    const x = this.renderPlayerPos.x + this.offsetX;
    const y = this.renderPlayerPos.y + this.offsetY;
    if (state.player.ward > 0) {
      graphics.lineStyle(3, COLORS.ward, 0.8);
      graphics.strokeCircle(x, y, 23);
    }
    graphics.fillStyle(COLORS.player, 1);
    graphics.fillCircle(x, y, 16);
    graphics.lineStyle(2, visuals.outline, 0.9);
    graphics.strokeCircle(x, y, 16);
    graphics.fillStyle(0xeafcff, 1);
    graphics.fillTriangle(x + 11, y, x - 3, y - 6, x - 3, y + 6);
  }

  /** Dessinées après les corps pour rester lisibles quoi qu'il se chevauche. */
  private drawHealthBars(state: PublicGameState): void {
    const graphics = this.graphics;
    for (const defense of state.defenses) {
      if (defense.built) {
        this.drawHealthBar(
          graphics,
          defense.position.x + this.offsetX - 24,
          defense.position.y + this.offsetY - 34,
          48,
          defense.hp / defense.maxHp,
          COLORS.defense,
        );
      }
    }
    this.drawHealthBar(
      graphics,
      state.village.position.x + this.offsetX - 55,
      state.village.position.y + this.offsetY - 72,
      110,
      state.village.hp / state.village.maxHp,
      COLORS.village,
    );
    for (const enemy of state.enemies) {
      const position = this.enemyRenderPos(enemy);
      this.drawHealthBar(
        graphics,
        position.x + this.offsetX - 22,
        position.y + this.offsetY - enemyRadius(enemy.kind) - 12,
        44,
        enemy.hp / enemy.maxHp,
        enemyColor(enemy.kind),
      );
    }
  }

  private drawBarrierDome(state: PublicGameState): void {
    if (state.player.barrier.activeRemainingMs <= 0) {
      return;
    }
    const graphics = this.graphics;
    const x = this.renderPlayerPos.x + this.offsetX;
    const y = this.renderPlayerPos.y + this.offsetY;
    graphics.fillStyle(COLORS.ward, 0.1);
    graphics.fillCircle(x, y, 175);
    graphics.lineStyle(3, COLORS.ward, 0.75);
    graphics.strokeCircle(x, y, 175);
  }

  /**
   * La caméra rejoint sa cible par interpolation corrigée du delta, pour rester
   * identique quelle que soit la fréquence d'affichage.
   */
  private updateCamera(state: PublicGameState, delta: number): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, state.world.width, state.world.height);
    const playerX = this.renderPlayerPos.x + this.offsetX;
    // La caméra centre 50px SOUS le joueur : celui-ci apparaît donc rendu 50px
    // plus haut à l'écran que le centre. Appliqué sur la position interpolée.
    const playerY = this.renderPlayerPos.y + this.offsetY + CAMERA_VERTICAL_OFFSET;
    const pointer = this.input.activePointer.positionToCamera(camera) as Vector2;
    const targetX =
      playerX +
      Phaser.Math.Clamp(
        (pointer.x - playerX) * CAMERA_LOOK_AHEAD,
        -CAMERA_LOOK_AHEAD_LIMIT,
        CAMERA_LOOK_AHEAD_LIMIT,
      );
    const targetY =
      playerY +
      Phaser.Math.Clamp(
        (pointer.y - playerY) * CAMERA_LOOK_AHEAD,
        -CAMERA_LOOK_AHEAD_LIMIT,
        CAMERA_LOOK_AHEAD_LIMIT,
      );
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

  private renderInteractionPrompt(state: PublicGameState): void {
    const hint = state.interactionHint;
    const isInteractive = hint?.startsWith('E — ') === true || hint?.startsWith('B — ') === true;
    const target = isInteractive ? this.findInteractionTarget(state) : undefined;
    if (target === undefined) {
      this.interactionHalo.setVisible(false);
      return;
    }
    // Halo discret : un simple anneau fin coloré autour de la cible, sans lettre
    // ni fond opaque. Couleur cohérente avec le type de ressource, sinon dorée.
    const x = target.x + this.offsetX;
    const y = target.y + this.offsetY;
    const halo = this.interactionHalo;
    halo.clear();
    halo.setVisible(true);
    halo.lineStyle(2, target.color, 0.55);
    halo.strokeCircle(x, y, target.radius + 8);
  }

  private findInteractionTarget(
    state: PublicGameState,
  ): { x: number; y: number; radius: number; color: number } | undefined {
    const range = defaultContent.player.interactionRange;
    const player = state.player.position;
    const resource = state.resources.find(
      (item) =>
        item.amountRemaining > 0 &&
        Math.hypot(item.position.x - player.x, item.position.y - player.y) <= range,
    );
    if (resource !== undefined) {
      return {
        x: resource.position.x,
        y: resource.position.y,
        radius: 20,
        color: RESOURCE_COLORS[resource.resourceType],
      };
    }
    const insideVillage =
      Math.hypot(player.x - state.village.position.x, player.y - state.village.position.y) <=
      state.village.areaRadius;
    const hasCarriedGoods = state.player.inventory.some(
      (slot) => slot !== undefined && slot.quantity > 0,
    );
    if (hasCarriedGoods && insideVillage) {
      return {
        x: state.village.position.x,
        y: state.village.position.y,
        radius: 50 + state.village.heartLevel * 5,
        color: COLORS.village,
      };
    }
    const defense = state.defenses.find(
      (item) =>
        item.built && Math.hypot(item.position.x - player.x, item.position.y - player.y) <= range,
    );
    if (defense !== undefined) {
      return { x: defense.position.x, y: defense.position.y, radius: 27, color: COLORS.defense };
    }
    if (
      Math.hypot(player.x - state.village.position.x, player.y - state.village.position.y) <= range
    ) {
      return {
        x: state.village.position.x,
        y: state.village.position.y,
        radius: 50 + state.village.heartLevel * 5,
        color: COLORS.village,
      };
    }
    if (insideVillage) {
      return { x: player.x, y: player.y, radius: 16, color: COLORS.village };
    }
    return undefined;
  }

  private renderMinimap(state: PublicGameState): void {
    const graphics = this.minimap;
    const width = 166;
    const height = 166;
    const x = this.scale.width - width - 22;
    const y = 88;
    const scaleX = width / state.world.width;
    const scaleY = height / state.world.height;
    const point = (position: Vector2): Vector2 => ({
      x: x + (position.x + state.world.width / 2) * scaleX,
      y: y + (position.y + state.world.height / 2) * scaleY,
    });
    graphics.clear();
    graphics.fillStyle(0x091013, 0.82);
    graphics.fillRoundedRect(x - 6, y - 6, width + 12, height + 12, 10);
    graphics.lineStyle(1, 0xffffff, 0.18);
    graphics.strokeRect(x, y, width, height);
    for (const resource of state.resources) {
      if (resource.amountRemaining > 0) {
        const resourcePoint = point(resource.position);
        graphics.fillStyle(RESOURCE_COLORS[resource.resourceType], 0.9);
        graphics.fillRect(resourcePoint.x - 2, resourcePoint.y - 2, 4, 4);
      }
    }
    for (const enemy of state.enemies) {
      if (enemy.awake) {
        const enemyPoint = point(enemy.position);
        graphics.fillStyle(enemyColor(enemy.kind), 0.85);
        graphics.fillCircle(enemyPoint.x, enemyPoint.y, enemy.kind === 'brute' ? 3 : 2);
      }
    }
    for (const defense of state.defenses) {
      const defensePoint = point(defense.position);
      graphics.fillStyle(COLORS.defense, defense.built ? 1 : 0.45);
      graphics.fillRect(defensePoint.x - 2, defensePoint.y - 2, 4, 4);
    }
    const villagePoint = point(state.village.position);
    graphics.fillStyle(COLORS.village, 1);
    graphics.fillCircle(villagePoint.x, villagePoint.y, 4);
    const playerPoint = point(state.player.position);
    graphics.fillStyle(COLORS.player, 1);
    graphics.fillCircle(playerPoint.x, playerPoint.y, 3);
  }

  private drawHealthBar(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    ratio: number,
    color: number,
  ): void {
    graphics.fillStyle(0x070b0c, 0.8);
    graphics.fillRoundedRect(x, y, width, 5, 2);
    graphics.fillStyle(color, 1);
    graphics.fillRoundedRect(x, y, Math.max(0, width * ratio), 5, 2);
  }

  private consumeEvents(state: PublicGameState): void {
    const now = this.time.now;
    for (const event of state.events) {
      if (event.id <= this.lastRenderedEventId || event.position === undefined) {
        continue;
      }
      this.lastRenderedEventId = event.id;
      if (event.type === 'defense-fired' && event.origin !== undefined) {
        this.renderDefenseShot(state, event.origin, event.position);
        continue;
      }
      if (event.type === 'sword-auto-attack' && event.origin !== undefined) {
        this.renderSwordSlash(state, event.origin, event.position);
        continue;
      }
      if (event.type === 'enemy-killed') {
        this.renderEnemyDeath(state, event.position);
        continue;
      }
      if (event.type === 'enemy-hit') {
        const target = matchEnemyAt(this.previousEnemies, event.position);
        if (target !== undefined) {
          this.hitFlash.register(target.id, now);
        }
      } else if (
        event.type !== 'resource-collected' &&
        event.type !== 'defense-built' &&
        event.type !== 'defense-construction-interrupted'
      ) {
        continue;
      }
      const color =
        event.type === 'enemy-hit'
          ? '#ffe7a0'
          : event.type === 'defense-construction-interrupted'
            ? '#ff8fa3'
            : '#b8f4a5';
      const label =
        event.type === 'enemy-hit'
          ? `-${Math.ceil(event.amount ?? 0)}`
          : event.type === 'resource-collected'
            ? `+${event.amount ?? 0}`
            : event.type === 'defense-built'
              ? 'BALISTE PRÊTE'
              : 'FABRICATION INTERROMPUE';
      const text = this.add
        .text(
          event.position.x + state.world.width / 2,
          event.position.y + state.world.height / 2 - 22,
          label,
          {
            color,
            fontFamily: 'system-ui, sans-serif',
            fontSize: '15px',
            fontStyle: 'bold',
            stroke: '#11181b',
            strokeThickness: 4,
          },
        )
        .setOrigin(0.5)
        .setDepth(50);
      this.tweens.add({
        targets: text,
        y: text.y - 34,
        alpha: 0,
        duration: 650,
        ease: 'Cubic.easeOut',
        onComplete: () => text.destroy(),
      });
    }
    this.previousEnemies = state.enemies;
  }

  private renderEnemyDeath(state: PublicGameState, position: Vector2): void {
    const victim = matchEnemyAt(this.previousEnemies, position);
    const kind = victim?.kind ?? 'raider';
    const count = kind === 'brute' ? 16 : kind === 'guardian' ? 12 : 9;
    this.deathEmitters[kind].explode(
      count,
      position.x + state.world.width / 2,
      position.y + state.world.height / 2,
    );
  }

  private renderDefenseShot(state: PublicGameState, origin: Vector2, target: Vector2): void {
    const halfWidth = state.world.width / 2;
    const halfHeight = state.world.height / 2;
    const originX = origin.x + halfWidth;
    const originY = origin.y + halfHeight;
    const targetX = target.x + halfWidth;
    const targetY = target.y + halfHeight;
    const distance = Math.hypot(targetX - originX, targetY - originY);
    const bolt = this.add.graphics().setDepth(45);
    bolt.lineStyle(3, 0x704b2c, 1);
    bolt.lineBetween(-13, 0, 7, 0);
    bolt.fillStyle(COLORS.defense, 1);
    bolt.fillTriangle(13, 0, 5, -4, 5, 4);
    bolt.setPosition(originX, originY);
    bolt.setRotation(Math.atan2(targetY - originY, targetX - originX));
    this.tweens.add({
      targets: bolt,
      x: targetX,
      y: targetY,
      duration: Math.max(130, Math.min(260, distance * 0.7)),
      ease: 'Linear',
      onComplete: () => bolt.destroy(),
    });
  }

  private renderSwordSlash(state: PublicGameState, origin: Vector2, target: Vector2): void {
    const halfWidth = state.world.width / 2;
    const halfHeight = state.world.height / 2;
    const originX = origin.x + halfWidth;
    const originY = origin.y + halfHeight;
    const angle = Math.atan2(target.y - origin.y, target.x - origin.x);
    const slash = this.add.graphics().setDepth(46);
    slash.lineStyle(7, 0xfff2bd, 0.95);
    slash.beginPath();
    slash.arc(0, 0, 42, angle - 0.72, angle + 0.72, false);
    slash.strokePath();
    slash.lineStyle(2, 0xffffff, 0.9);
    slash.beginPath();
    slash.arc(0, 0, 36, angle - 0.62, angle + 0.62, false);
    slash.strokePath();
    slash.setPosition(originX, originY);
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 190,
      ease: 'Quad.easeOut',
      onComplete: () => slash.destroy(),
    });
  }
}
