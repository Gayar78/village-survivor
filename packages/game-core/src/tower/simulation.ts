// Moteur de simulation du NOUVEAU jeu Tower / twin-stick (Lot A), host-autoritaire.
//
// `TowerSimulation` fait tourner l'unique simulation : avatars (arme/build PERSONNELS),
// base partagée (Cœur, 4 tourelles, ferraille commune, vagues) et projette le tout dans
// le `TowerGameState` figé du protocole. Déterministe (SeededRandom) pour les tests.

import {
  TOWER_GLOBAL_DEFENSE_OFFERS,
  TOWER_GLOBAL_DEFENSE_ROTATIONS,
  TOWER_TURRET_REPAIR_COST_PER_HP,
  TOWER_TURRET_MODULES,
  TOWER_TURRET_SHOP,
  TOWER_TURRET_TARGET_PRIORITIES,
  TOWER_WEAPONS,
  type TowerWeaponDefinition,
} from '@village-survivor/content';
import type {
  HeartState,
  ProjectileSource,
  TowerEvent,
  TowerEventType,
  TowerGameState,
  TowerGlobalDefenseOfferId,
  TowerInput,
  TowerMonsterKind,
  TowerMonsterState,
  TowerPlayerState,
  TowerProjectileState,
  TowerStatus,
  TowerUpgradeCard,
  TowerWeaponId,
  TowerWeaponState,
  TurretDir,
  TurretState,
  ScrapPickupState,
  UpgradeRarity,
  Vector2,
} from '@village-survivor/protocol';

import { SeededRandom } from '../random.js';
import type {
  MutableHeart,
  MutableScrap,
  MutableTowerMonster,
  MutableTowerPlayer,
  MutableTowerProjectile,
  MutableTurret,
} from './state.js';
import {
  AVATAR_START_SPACING,
  BURN,
  CONTACT_COOLDOWN_MS,
  CONTACT_MARGIN,
  DOWNED_DURATION_MS,
  EXPLODE_ON_KILL,
  GOLD_PER_KILL_FACTOR,
  HEART,
  KAMIKAZE_EXPLOSION,
  MONSTER_PLAYER_AGGRO_RANGE,
  MONSTERS,
  MULTISHOT_SPREAD_RAD,
  NATURAL_SCRAP,
  PLAYER,
  TICK_MS,
  TURRET,
  TURRET_ANGLES,
  TURRET_SHOP_EFFECTS,
  TURRET_SHOP_RANGE,
  UPGRADE_CHOICE_COUNT,
  UPGRADE_RARITY_WEIGHTS,
  WAVE,
  WAVE_MONSTER_COST,
  WORLD,
  XP_BASE,
  XP_GROWTH,
  XP_PER_KILL_FACTOR,
} from './tuning.js';
import { getUpgradeById, getUpgradesByRarity } from './upgrades.js';

const NEUTRAL_INPUT: TowerInput = { sequence: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0 };

const TURRET_DIRS: readonly TurretDir[] = ['N', 'E', 'S', 'W'];

const MONSTER_KINDS: readonly TowerMonsterKind[] = ['chaser', 'runner', 'brute', 'kamikaze'];

const WEAPON_ACTION_PREFIX = 'weapon:';
const MODULE_ACTION_PREFIX = 'module:';
const PRIORITY_ACTION_PREFIX = 'priority:';
const GLOBAL_ACTION_PREFIX = 'global:';

function weaponDefinition(id: TowerWeaponId): TowerWeaponDefinition {
  const definition = TOWER_WEAPONS.find((candidate) => candidate.id === id);
  if (definition === undefined) {
    throw new Error(`Arme Tower inconnue : ${id}`);
  }
  return definition;
}

const UPGRADE_RARITIES: readonly UpgradeRarity[] = [
  'common',
  'rare',
  'epic',
  'legendary',
  'mythic',
  'divin',
];

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Différence angulaire absolue (degrés) ramenée dans [0, 180]. */
function angleDifferenceDeg(a: number, b: number): number {
  const diff = ((((a - b) % 360) + 540) % 360) - 180;
  return Math.abs(diff);
}

export class TowerSimulation {
  private readonly random: SeededRandom;
  private readonly upgradeRandom: SeededRandom;
  private readonly combatRandom: SeededRandom;
  private readonly seed: string;

  private readonly players: MutableTowerPlayer[];
  private readonly playerIds: string[];
  private readonly heart: MutableHeart;
  private readonly turrets: MutableTurret[];
  private readonly monsters: MutableTowerMonster[] = [];
  private readonly projectiles: MutableTowerProjectile[] = [];
  private readonly scraps: MutableScrap[] = [];
  private readonly globalDefenseUpgrades: Array<{
    id: TowerGlobalDefenseOfferId;
    level: number;
  }> = TOWER_GLOBAL_DEFENSE_OFFERS.map((offer) => ({ id: offer.id, level: 0 }));

  private status: TowerStatus = 'ready';
  private tick = 0;
  private elapsedMs = 0;
  private wave = 0;
  private scrapFund = 0;

  private monsterCounter = 0;
  private projectileCounter = 0;
  private scrapCounter = 0;
  private offerCounter = 0;
  private eventCounter = 0;
  private events: TowerEvent[] = [];

  private waveTimerMs = 0;
  private naturalScrapTimerMs = 0;

  public constructor(seed: string, options?: { playerIds?: readonly string[] }) {
    this.seed = seed;
    this.random = new SeededRandom(seed);
    this.upgradeRandom = new SeededRandom(`${seed}:upgrades`);
    this.combatRandom = new SeededRandom(`${seed}:combat`);
    this.playerIds = TowerSimulation.resolvePlayerIds(options);
    this.players = this.playerIds.map((id, index) => this.createPlayer(id, index));
    this.heart = {
      position: { x: 0, y: 0 },
      hp: HEART.hp,
      maxHp: HEART.hp,
      radius: HEART.radius,
    };
    this.turrets = TURRET_DIRS.map((dir) => this.createTurret(dir));
  }

  private static resolvePlayerIds(options?: { playerIds?: readonly string[] }): string[] {
    const requested = options?.playerIds;
    if (requested !== undefined && requested.length > 0) {
      return requested.slice(0, 10).map((id) => String(id));
    }
    return ['player-1'];
  }

  private createPlayer(id: string, index: number): MutableTowerPlayer {
    const offset = (index - (this.playerIds.length - 1) / 2) * AVATAR_START_SPACING;
    return {
      id,
      position: { x: offset, y: HEART.radius + PLAYER.radius + 60 },
      aim: { x: 0, y: -1 },
      hp: PLAYER.maxHp,
      maxHp: PLAYER.maxHp,
      level: 1,
      experience: 0,
      experienceToNext: xpForLevel(1),
      gold: 0,
      pendingUpgrades: 0,
      upgradeChoices: [],
      downedRemainingMs: 0,
      activeWeaponId: 'rifle',
      weapons: TOWER_WEAPONS.map((weapon) => ({
        id: weapon.id,
        level: 1,
        damageMultiplier: 1,
        fireRateMultiplier: 1,
        spreadMultiplier: 1,
        pierceBonus: 0,
        fireCooldownRemaining: 0,
      })),
      speed: PLAYER.speed,
      pickupRadius: PLAYER.pickupRadius,
      fireRate: PLAYER.fireRate,
      fireCooldownRemaining: 0,
      bulletDamage: PLAYER.bulletDamage,
      bulletSpeed: PLAYER.bulletSpeed,
      bulletRange: PLAYER.bulletRange,
      bulletRadius: PLAYER.bulletRadius,
      critChance: PLAYER.critChance,
      critMult: PLAYER.critMult,
      pierce: 0,
      bounce: 0,
      multishotChance: 0,
      burnStacks: 0,
      auraDps: 0,
      auraRadius: 0,
      lifestealPct: 0,
      bulletSpeedBonusApplied: false,
      explodeOnKill: false,
      growingBullet: 0,
      critSlowStacks: 0,
    };
  }

  private createTurret(dir: TurretDir): MutableTurret {
    const angle = TURRET_ANGLES[dir];
    const radians = (angle * Math.PI) / 180;
    return {
      dir,
      position: { x: Math.cos(radians) * TURRET.offset, y: Math.sin(radians) * TURRET.offset },
      angle,
      hp: TURRET.hp,
      maxHp: TURRET.hp,
      energy: TURRET.maxEnergy,
      maxEnergy: TURRET.maxEnergy,
      energyRegen: TURRET.energyRegen,
      range: TURRET.range,
      bulletDamage: TURRET.bulletDamage,
      bulletSpeed: TURRET.bulletSpeed,
      bulletRange: TURRET.bulletRange,
      bulletRadius: TURRET.bulletRadius,
      halfArcDeg: TURRET.halfArcDeg,
      fireRate: TURRET.fireRate,
      fireCooldownRemaining: 0,
      alive: true,
      modules: [],
      targetPriority: 'nearest',
      pierce: 0,
    };
  }

  public start(): void {
    if (this.status === 'ready') {
      this.status = 'running';
    }
  }

  public step(inputsById: Readonly<Record<string, TowerInput>>): void {
    this.events = [];
    if (this.status !== 'running') {
      return;
    }

    const deltaMs = TICK_MS;
    const deltaSeconds = deltaMs / 1_000;
    this.tick += 1;
    this.elapsedMs += deltaMs;

    const entries = this.players.map((player, index) => ({
      player,
      input: inputsById[this.playerIds[index] ?? ''] ?? NEUTRAL_INPUT,
    }));

    for (const { player, input } of entries) {
      this.updateDownedState(player, deltaMs);
      if (player.downedRemainingMs > 0) {
        continue;
      }
      this.updatePlayerMovement(player, input, deltaSeconds);
      this.updatePlayerAim(player, input);
      this.updatePlayerFiring(player, input, deltaSeconds);
      this.applyPlayerAura(player, deltaSeconds);
    }

    this.updateTurrets(deltaSeconds);
    this.updateProjectiles(deltaSeconds);
    this.updateMonsters(deltaMs, deltaSeconds);
    this.updateScrapPickup();
    this.removeDeadMonsters();

    this.updateWaves(deltaMs);
    this.updateNaturalScrap(deltaMs);

    for (const { player, input } of entries) {
      this.handleWeaponSelection(player, input);
      this.handleTurretShop(player, input);
      this.handleUpgradeSelection(player, input);
    }

    this.checkDefeat();
  }

  // ── Joueur ────────────────────────────────────────────────────────────────

  private updateDownedState(player: MutableTowerPlayer, deltaMs: number): void {
    if (player.downedRemainingMs <= 0) {
      return;
    }
    player.downedRemainingMs = Math.max(0, player.downedRemainingMs - deltaMs);
    if (player.downedRemainingMs <= 0) {
      player.hp = player.maxHp;
      player.position = { x: this.heart.position.x, y: this.heart.position.y + HEART.radius + 40 };
    }
  }

  private updatePlayerMovement(
    player: MutableTowerPlayer,
    input: TowerInput,
    deltaSeconds: number,
  ): void {
    let dx = input.moveX;
    let dy = input.moveY;
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    const next = {
      x: player.position.x + dx * player.speed * deltaSeconds,
      y: player.position.y + dy * player.speed * deltaSeconds,
    };
    player.position = {
      x: clamp(next.x, -WORLD.bound, WORLD.bound),
      y: clamp(next.y, -WORLD.bound, WORLD.bound),
    };
  }

  private updatePlayerAim(player: MutableTowerPlayer, input: TowerInput): void {
    const length = Math.hypot(input.aimX, input.aimY);
    if (length > 0) {
      player.aim = { x: input.aimX / length, y: input.aimY / length };
    }
  }

  private updatePlayerFiring(
    player: MutableTowerPlayer,
    input: TowerInput,
    deltaSeconds: number,
  ): void {
    const weapon = player.weapons.find((candidate) => candidate.id === player.activeWeaponId);
    if (weapon === undefined) {
      return;
    }
    weapon.fireCooldownRemaining = Math.max(0, weapon.fireCooldownRemaining - deltaSeconds);
    if (input.fire !== true || weapon.fireCooldownRemaining > 0) {
      return;
    }
    const aimLength = Math.hypot(player.aim.x, player.aim.y);
    if (aimLength <= 0) {
      return;
    }
    const baseAngle = Math.atan2(player.aim.y, player.aim.x);
    const definition = weaponDefinition(weapon.id);
    const extraShots = this.rollMultishot(player.multishotChance);
    const totalShots = definition.projectileCount + extraShots;
    const spreadStep =
      definition.projectileCount > 1
        ? definition.spreadRad * weapon.spreadMultiplier
        : MULTISHOT_SPREAD_RAD;
    for (let index = 0; index < totalShots; index += 1) {
      const spread = (index - (totalShots - 1) / 2) * spreadStep;
      this.spawnPlayerBullet(player, weapon, definition, baseAngle + spread);
    }
    weapon.fireCooldownRemaining = this.weaponFireRate(player, weapon, definition);
  }

  private rollMultishot(chance: number): number {
    if (chance <= 0) {
      return 0;
    }
    let extra = Math.floor(chance);
    const fraction = chance - extra;
    if (fraction > 0 && this.combatRandom.next() < fraction) {
      extra += 1;
    }
    return extra;
  }

  private spawnPlayerBullet(
    player: MutableTowerPlayer,
    weapon: MutableTowerPlayer['weapons'][number],
    definition: TowerWeaponDefinition,
    angle: number,
  ): void {
    let damage = this.weaponDamage(player, weapon, definition);
    if (player.critChance > 0 && this.combatRandom.next() < player.critChance) {
      damage *= player.critMult;
    }
    this.projectileCounter += 1;
    this.projectiles.push({
      id: `bullet-${this.projectileCounter}`,
      position: { x: player.position.x, y: player.position.y },
      velocityX: Math.cos(angle) * this.weaponBulletSpeed(player, definition),
      velocityY: Math.sin(angle) * this.weaponBulletSpeed(player, definition),
      radius: this.weaponBulletRadius(player, definition),
      damage,
      source: 'player',
      weaponId: weapon.id,
      remainingRange: this.weaponBulletRange(player, definition),
      pierce: definition.basePierce + player.pierce + weapon.pierceBonus,
      bounce: player.bounce,
      burnStacks: player.burnStacks,
      explodeOnKill: player.explodeOnKill,
      lifestealPct: player.lifestealPct,
      growingBullet: player.growingBullet,
      ownerId: player.id,
      hitMonsterIds: new Set<string>(),
    });
  }

  private weaponDamage(
    player: MutableTowerPlayer,
    weapon: MutableTowerPlayer['weapons'][number],
    definition: TowerWeaponDefinition,
  ): number {
    return (
      definition.bulletDamage *
      (player.bulletDamage / PLAYER.bulletDamage) *
      weapon.damageMultiplier
    );
  }

  private weaponFireRate(
    player: MutableTowerPlayer,
    weapon: MutableTowerPlayer['weapons'][number],
    definition: TowerWeaponDefinition,
  ): number {
    return Math.max(
      TURRET_SHOP_EFFECTS.rateMinimum,
      definition.fireRate * (player.fireRate / PLAYER.fireRate) * weapon.fireRateMultiplier,
    );
  }

  private weaponBulletSpeed(player: MutableTowerPlayer, definition: TowerWeaponDefinition): number {
    return Math.max(1, definition.bulletSpeed + player.bulletSpeed - PLAYER.bulletSpeed);
  }

  private weaponBulletRange(player: MutableTowerPlayer, definition: TowerWeaponDefinition): number {
    return Math.max(1, definition.bulletRange + player.bulletRange - PLAYER.bulletRange);
  }

  private weaponBulletRadius(
    player: MutableTowerPlayer,
    definition: TowerWeaponDefinition,
  ): number {
    return Math.max(1, definition.bulletRadius + player.bulletRadius - PLAYER.bulletRadius);
  }

  private applyPlayerAura(player: MutableTowerPlayer, deltaSeconds: number): void {
    if (player.auraDps <= 0 || player.auraRadius <= 0) {
      return;
    }
    const amount = player.auraDps * deltaSeconds;
    for (const monster of this.monsters) {
      if (monster.hp <= 0) {
        continue;
      }
      if (distance(monster.position, player.position) <= player.auraRadius + monster.radius) {
        this.damageMonster(monster, amount, player);
      }
    }
  }

  // ── Tourelles ───────────────────────────────────────────────────────────────

  private updateTurrets(deltaSeconds: number): void {
    for (const turret of this.turrets) {
      if (!turret.alive) {
        continue;
      }
      turret.energy = Math.min(turret.maxEnergy, turret.energy + turret.energyRegen * deltaSeconds);
      turret.fireCooldownRemaining = Math.max(0, turret.fireCooldownRemaining - deltaSeconds);
      if (turret.fireCooldownRemaining > 0 || turret.energy < TURRET.energyPerShot) {
        continue;
      }
      const target = this.findTurretTarget(turret);
      if (target === undefined) {
        continue;
      }
      this.spawnTurretBullet(turret, target);
      turret.energy -= TURRET.energyPerShot;
      turret.fireCooldownRemaining = turret.fireRate;
    }
  }

  private findTurretTarget(turret: MutableTurret): MutableTowerMonster | undefined {
    let selected: MutableTowerMonster | undefined;
    let selectedScore = Infinity;
    for (const monster of this.monsters) {
      if (monster.hp <= 0) {
        continue;
      }
      const gap = distance(monster.position, turret.position);
      if (gap > turret.range + monster.radius) {
        continue;
      }
      const angleToMonster =
        (Math.atan2(
          monster.position.y - turret.position.y,
          monster.position.x - turret.position.x,
        ) *
          180) /
        Math.PI;
      if (angleDifferenceDeg(angleToMonster, turret.angle) > turret.halfArcDeg) {
        continue;
      }
      const score = this.turretTargetScore(turret, monster, gap);
      // L'ordre d'apparition des monstres est le départage canonique en cas d'égalité.
      if (score < selectedScore) {
        selectedScore = score;
        selected = monster;
      }
    }
    return selected;
  }

  private turretTargetScore(
    turret: MutableTurret,
    monster: MutableTowerMonster,
    gap: number,
  ): number {
    switch (turret.targetPriority) {
      case 'nearest':
        return gap;
      case 'strongest':
        return -monster.hp;
      case 'heartward':
        return distance(monster.position, this.heart.position);
    }
  }

  private spawnTurretBullet(turret: MutableTurret, target: MutableTowerMonster): void {
    const angle = Math.atan2(
      target.position.y - turret.position.y,
      target.position.x - turret.position.x,
    );
    this.projectileCounter += 1;
    this.projectiles.push({
      id: `bullet-${this.projectileCounter}`,
      position: { x: turret.position.x, y: turret.position.y },
      velocityX: Math.cos(angle) * turret.bulletSpeed,
      velocityY: Math.sin(angle) * turret.bulletSpeed,
      radius: turret.bulletRadius,
      damage: turret.bulletDamage,
      source: 'turret',
      weaponId: undefined,
      remainingRange: turret.bulletRange,
      pierce: turret.pierce,
      bounce: 0,
      burnStacks: 0,
      explodeOnKill: false,
      lifestealPct: 0,
      growingBullet: 0,
      ownerId: undefined,
      hitMonsterIds: new Set<string>(),
    });
  }

  // ── Projectiles ─────────────────────────────────────────────────────────────

  private updateProjectiles(deltaSeconds: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const bullet = this.projectiles[index];
      if (bullet === undefined) {
        continue;
      }
      const step = Math.hypot(bullet.velocityX, bullet.velocityY) * deltaSeconds;
      bullet.position = {
        x: bullet.position.x + bullet.velocityX * deltaSeconds,
        y: bullet.position.y + bullet.velocityY * deltaSeconds,
      };
      bullet.remainingRange -= step;
      if (bullet.growingBullet > 0) {
        bullet.radius += bullet.growingBullet * deltaSeconds;
      }
      const alive = this.resolveBulletCollisions(bullet);
      const outOfRange = bullet.remainingRange <= 0;
      const outOfBounds =
        Math.abs(bullet.position.x) > WORLD.bound || Math.abs(bullet.position.y) > WORLD.bound;
      if (!alive || outOfRange || outOfBounds) {
        this.projectiles.splice(index, 1);
      }
    }
  }

  /** Résout les impacts d'une balle sur ce tick. Renvoie `false` si la balle disparaît. */
  private resolveBulletCollisions(bullet: MutableTowerProjectile): boolean {
    // Jusqu'à quelques impacts par tick (perforation/rebond) ; borné pour éviter les boucles.
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const monster = this.findBulletHit(bullet);
      if (monster === undefined) {
        return true;
      }
      bullet.hitMonsterIds.add(monster.id);
      const owner = bullet.ownerId === undefined ? undefined : this.findPlayerById(bullet.ownerId);
      this.applyBulletDamage(bullet, monster, owner);
      if (bullet.pierce > 0) {
        bullet.pierce -= 1;
        continue;
      }
      if (bullet.bounce > 0) {
        const next = this.findBounceTarget(bullet, monster.position);
        if (next !== undefined) {
          bullet.bounce -= 1;
          this.redirectBullet(bullet, next.position);
          continue;
        }
      }
      return false;
    }
    return true;
  }

  private findBulletHit(bullet: MutableTowerProjectile): MutableTowerMonster | undefined {
    let nearest: MutableTowerMonster | undefined;
    let nearestDistance = Infinity;
    for (const monster of this.monsters) {
      if (monster.hp <= 0 || bullet.hitMonsterIds.has(monster.id)) {
        continue;
      }
      const gap = distance(monster.position, bullet.position);
      if (gap <= bullet.radius + monster.radius && gap < nearestDistance) {
        nearestDistance = gap;
        nearest = monster;
      }
    }
    return nearest;
  }

  private findBounceTarget(
    bullet: MutableTowerProjectile,
    from: Vector2,
  ): MutableTowerMonster | undefined {
    let nearest: MutableTowerMonster | undefined;
    let nearestDistance = Infinity;
    for (const monster of this.monsters) {
      if (monster.hp <= 0 || bullet.hitMonsterIds.has(monster.id)) {
        continue;
      }
      const gap = distance(monster.position, from);
      if (gap < nearestDistance) {
        nearestDistance = gap;
        nearest = monster;
      }
    }
    return nearest;
  }

  private redirectBullet(bullet: MutableTowerProjectile, target: Vector2): void {
    const speed = Math.hypot(bullet.velocityX, bullet.velocityY);
    const angle = Math.atan2(target.y - bullet.position.y, target.x - bullet.position.x);
    bullet.velocityX = Math.cos(angle) * speed;
    bullet.velocityY = Math.sin(angle) * speed;
  }

  private applyBulletDamage(
    bullet: MutableTowerProjectile,
    monster: MutableTowerMonster,
    owner: MutableTowerPlayer | undefined,
  ): void {
    if (bullet.burnStacks > 0) {
      monster.burnStacks += bullet.burnStacks;
      monster.burnRemainingMs = BURN.durationMs;
      monster.burnOwnerId = owner?.id;
    }
    const killed = this.damageMonster(monster, bullet.damage, owner);
    if (owner !== undefined && bullet.lifestealPct > 0) {
      owner.hp = Math.min(owner.maxHp, owner.hp + bullet.damage * bullet.lifestealPct);
    }
    if (killed && bullet.explodeOnKill) {
      this.explodeOnKill(monster.position, bullet.damage, owner);
    }
  }

  /** Détonation (build joueur) : dégâts de zone aux AUTRES monstres autour du kill. */
  private explodeOnKill(
    center: Vector2,
    damage: number,
    owner: MutableTowerPlayer | undefined,
  ): void {
    for (const monster of this.monsters) {
      if (monster.hp <= 0) {
        continue;
      }
      if (distance(monster.position, center) <= EXPLODE_ON_KILL.radius + monster.radius) {
        this.damageMonster(monster, damage, owner);
      }
    }
  }

  // ── Monstres ────────────────────────────────────────────────────────────────

  private updateMonsters(deltaMs: number, deltaSeconds: number): void {
    for (const monster of this.monsters) {
      if (monster.hp <= 0) {
        continue;
      }
      monster.contactCooldownRemaining = Math.max(0, monster.contactCooldownRemaining - deltaMs);
      this.applyBurn(monster, deltaMs, deltaSeconds);
      if (monster.hp <= 0) {
        continue;
      }
      this.moveMonster(monster, deltaSeconds);
      this.resolveMonsterContacts(monster);
    }
  }

  private applyBurn(monster: MutableTowerMonster, deltaMs: number, deltaSeconds: number): void {
    if (monster.burnRemainingMs <= 0 || monster.burnStacks <= 0) {
      return;
    }
    const owner =
      monster.burnOwnerId === undefined ? undefined : this.findPlayerById(monster.burnOwnerId);
    const amount = monster.burnStacks * BURN.dpsPerStack * deltaSeconds;
    monster.burnRemainingMs = Math.max(0, monster.burnRemainingMs - deltaMs);
    this.damageMonster(monster, amount, owner);
  }

  private moveMonster(monster: MutableTowerMonster, deltaSeconds: number): void {
    const target = this.findMonsterTarget(monster);
    const dx = target.x - monster.position.x;
    const dy = target.y - monster.position.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0) {
      return;
    }
    const stepDistance = Math.min(length, monster.speed * deltaSeconds);
    monster.position = {
      x: monster.position.x + (dx / length) * stepDistance,
      y: monster.position.y + (dy / length) * stepDistance,
    };
  }

  private findMonsterTarget(monster: MutableTowerMonster): Vector2 {
    const player = this.findNearestLivingPlayer(monster.position, MONSTER_PLAYER_AGGRO_RANGE);
    return player?.position ?? this.heart.position;
  }

  private resolveMonsterContacts(monster: MutableTowerMonster): void {
    if (monster.kind === 'kamikaze') {
      if (this.kamikazeTouchesTarget(monster)) {
        this.explodeKamikaze(monster);
      }
      return;
    }
    if (monster.contactCooldownRemaining > 0) {
      return;
    }
    // Priorité : joueur, puis tourelle, puis Cœur (un seul contact par cooldown).
    const player = this.findContactedPlayer(monster);
    if (player !== undefined) {
      this.damagePlayer(player, monster.contactDamage);
      monster.contactCooldownRemaining = CONTACT_COOLDOWN_MS;
      return;
    }
    const turret = this.findContactedTurret(monster);
    if (turret !== undefined) {
      this.damageTurret(turret, monster.contactDamage);
      monster.contactCooldownRemaining = CONTACT_COOLDOWN_MS;
      return;
    }
    if (this.touchesHeart(monster)) {
      this.damageHeartInternal(monster.contactDamage);
      monster.contactCooldownRemaining = CONTACT_COOLDOWN_MS;
    }
  }

  private kamikazeTouchesTarget(monster: MutableTowerMonster): boolean {
    return (
      this.findContactedPlayer(monster) !== undefined ||
      this.findContactedTurret(monster) !== undefined ||
      this.touchesHeart(monster)
    );
  }

  private explodeKamikaze(monster: MutableTowerMonster): void {
    const center = monster.position;
    for (const player of this.players) {
      if (player.downedRemainingMs > 0 || player.hp <= 0) {
        continue;
      }
      if (distance(player.position, center) <= KAMIKAZE_EXPLOSION.radius + PLAYER.radius) {
        this.damagePlayer(player, KAMIKAZE_EXPLOSION.damage);
      }
    }
    for (const turret of this.turrets) {
      if (!turret.alive) {
        continue;
      }
      if (distance(turret.position, center) <= KAMIKAZE_EXPLOSION.radius + TURRET.bodyRadius) {
        this.damageTurret(turret, KAMIKAZE_EXPLOSION.damage);
      }
    }
    if (distance(this.heart.position, center) <= KAMIKAZE_EXPLOSION.radius + this.heart.radius) {
      this.damageHeartInternal(KAMIKAZE_EXPLOSION.damage);
    }
    // Le kamikaze meurt dans son explosion (sans dégâts joueur crédités, mais lâche sa ferraille).
    this.killMonster(monster, this.findNearestLivingPlayer(center, Infinity));
  }

  private findContactedPlayer(monster: MutableTowerMonster): MutableTowerPlayer | undefined {
    for (const player of this.players) {
      if (player.downedRemainingMs > 0 || player.hp <= 0) {
        continue;
      }
      if (
        distance(player.position, monster.position) <=
        PLAYER.radius + monster.radius + CONTACT_MARGIN
      ) {
        return player;
      }
    }
    return undefined;
  }

  private findContactedTurret(monster: MutableTowerMonster): MutableTurret | undefined {
    for (const turret of this.turrets) {
      if (!turret.alive) {
        continue;
      }
      if (
        distance(turret.position, monster.position) <=
        TURRET.bodyRadius + monster.radius + CONTACT_MARGIN
      ) {
        return turret;
      }
    }
    return undefined;
  }

  private touchesHeart(monster: MutableTowerMonster): boolean {
    return (
      distance(this.heart.position, monster.position) <=
      this.heart.radius + monster.radius + CONTACT_MARGIN
    );
  }

  /** Applique des dégâts à un monstre. Renvoie `true` s'il vient d'être tué. */
  private damageMonster(
    monster: MutableTowerMonster,
    amount: number,
    killer: MutableTowerPlayer | undefined,
  ): boolean {
    if (monster.hp <= 0 || amount <= 0) {
      return false;
    }
    monster.hp = Math.max(0, monster.hp - amount);
    if (monster.hp <= 0) {
      this.killMonster(monster, killer);
      return true;
    }
    return false;
  }

  private killMonster(monster: MutableTowerMonster, killer: MutableTowerPlayer | undefined): void {
    if (monster.hp > 0) {
      monster.hp = 0;
    }
    const reward = monster.reward;
    this.dropScrap(monster.position, reward);
    const beneficiary =
      killer ?? this.findNearestLivingPlayer(monster.position, Infinity) ?? this.players[0];
    if (beneficiary !== undefined) {
      beneficiary.gold += GOLD_PER_KILL_FACTOR * reward;
      this.addExperience(beneficiary, XP_PER_KILL_FACTOR * reward);
    }
    this.addEvent('monster-killed', { position: monster.position, amount: reward });
  }

  private removeDeadMonsters(): void {
    for (let index = this.monsters.length - 1; index >= 0; index -= 1) {
      const monster = this.monsters[index];
      if (monster !== undefined && monster.hp <= 0) {
        this.monsters.splice(index, 1);
      }
    }
  }

  // ── Dégâts au joueur / tourelle / Cœur ──────────────────────────────────────

  private damagePlayer(player: MutableTowerPlayer, amount: number): void {
    if (amount <= 0 || player.hp <= 0 || player.downedRemainingMs > 0) {
      return;
    }
    player.hp = Math.max(0, player.hp - amount);
    this.addEvent('player-hurt', { position: player.position, amount });
    if (player.hp <= 0 && this.players.length > 1) {
      // Co-op : l'avatar passe « à terre » et réapparaîtra ; il n'agit plus d'ici là.
      player.downedRemainingMs = DOWNED_DURATION_MS;
      player.fireCooldownRemaining = 0;
      for (const weapon of player.weapons) {
        weapon.fireCooldownRemaining = 0;
      }
    }
  }

  private damageTurret(turret: MutableTurret, amount: number): void {
    if (amount <= 0 || !turret.alive) {
      return;
    }
    turret.hp = Math.max(0, turret.hp - amount);
    this.addEvent('turret-hurt', { position: turret.position, amount });
    if (turret.hp <= 0) {
      turret.alive = false;
      turret.energy = 0;
      this.addEvent('turret-destroyed', { position: turret.position });
    }
  }

  private damageHeartInternal(amount: number): void {
    if (amount <= 0 || this.heart.hp <= 0) {
      return;
    }
    this.heart.hp = Math.max(0, this.heart.hp - amount);
    this.addEvent('heart-hurt', { position: this.heart.position, amount });
  }

  // ── Économie : ferraille & ramassage ────────────────────────────────────────

  private dropScrap(position: Vector2, amount: number): void {
    if (amount <= 0) {
      return;
    }
    this.scrapCounter += 1;
    this.scraps.push({
      id: `scrap-${this.scrapCounter}`,
      position: { x: position.x, y: position.y },
      amount,
    });
  }

  private updateScrapPickup(): void {
    for (let index = this.scraps.length - 1; index >= 0; index -= 1) {
      const scrap = this.scraps[index];
      if (scrap === undefined) {
        continue;
      }
      const collector = this.players.find(
        (player) =>
          player.downedRemainingMs <= 0 &&
          player.hp > 0 &&
          distance(player.position, scrap.position) <= player.pickupRadius,
      );
      if (collector !== undefined) {
        this.scrapFund += scrap.amount;
        this.addEvent('scrap-collected', { position: scrap.position, amount: scrap.amount });
        this.scraps.splice(index, 1);
      }
    }
  }

  private updateNaturalScrap(deltaMs: number): void {
    this.naturalScrapTimerMs += deltaMs;
    while (this.naturalScrapTimerMs >= NATURAL_SCRAP.intervalMs) {
      this.naturalScrapTimerMs -= NATURAL_SCRAP.intervalMs;
      for (let index = 0; index < NATURAL_SCRAP.count; index += 1) {
        this.dropScrap(this.randomNaturalScrapPosition(), NATURAL_SCRAP.amount);
      }
    }
  }

  private randomNaturalScrapPosition(): Vector2 {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = this.random.between(0, Math.PI * 2);
      const radius = this.random.between(NATURAL_SCRAP.minRadiusFromHeart, WORLD.spawnZoneRadius);
      const position = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
      if (distance(position, this.heart.position) >= NATURAL_SCRAP.minRadiusFromHeart) {
        return position;
      }
    }
    return { x: NATURAL_SCRAP.minRadiusFromHeart, y: 0 };
  }

  // ── Vagues ──────────────────────────────────────────────────────────────────

  private updateWaves(deltaMs: number): void {
    this.waveTimerMs += deltaMs;
    while (this.waveTimerMs >= WAVE.intervalMs) {
      this.waveTimerMs -= WAVE.intervalMs;
      this.spawnWave();
    }
  }

  private spawnWave(): void {
    this.wave += 1;
    const elapsedSeconds = this.elapsedMs / 1_000;
    const steps = Math.floor(elapsedSeconds / WAVE.budgetStepSeconds);
    const baseBudget = Math.min(WAVE.budgetCap, WAVE.budgetBase + WAVE.budgetPerStep * steps);
    const playerScale = 1 + WAVE.perPlayerFactor * (this.players.length - 1);
    let budget = baseBudget * playerScale;

    while (budget >= 1) {
      const affordable = MONSTER_KINDS.filter((kind) => WAVE_MONSTER_COST[kind] <= budget);
      if (affordable.length === 0) {
        break;
      }
      const kind = affordable[this.random.integer(0, affordable.length - 1)];
      if (kind === undefined) {
        break;
      }
      budget -= WAVE_MONSTER_COST[kind];
      this.spawnMonster(kind, this.randomWaveSpawnPosition());
    }
  }

  private randomWaveSpawnPosition(): Vector2 {
    const minRadius = WORLD.spawnZoneRadius * WAVE.ringMinFactor;
    const maxRadius = WORLD.spawnZoneRadius * WAVE.ringMaxFactor;
    let fallback: Vector2 = { x: minRadius, y: 0 };
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const angle = this.random.between(0, Math.PI * 2);
      const radius = this.random.between(minRadius, maxRadius);
      const position = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
      fallback = position;
      const tooClose = this.players.some(
        (player) => distance(player.position, position) < WAVE.minDistanceFromPlayers,
      );
      if (!tooClose) {
        return position;
      }
    }
    return fallback;
  }

  // ── Progression / montée de niveau ──────────────────────────────────────────

  private addExperience(player: MutableTowerPlayer, amount: number): void {
    if (amount <= 0) {
      return;
    }
    player.experience += amount;
    while (player.experience >= player.experienceToNext) {
      player.experience -= player.experienceToNext;
      player.level += 1;
      player.experienceToNext = xpForLevel(player.level);
      player.pendingUpgrades += 1;
      this.addEvent('level-up', { position: player.position });
    }
    this.refreshUpgradeOffer(player);
  }

  private refreshUpgradeOffer(player: MutableTowerPlayer): void {
    if (player.pendingUpgrades <= 0 || player.upgradeChoices.length > 0) {
      return;
    }
    player.upgradeChoices = this.rollUpgradeOffer(player);
  }

  private rollUpgradeOffer(player: MutableTowerPlayer): TowerUpgradeCard[] {
    const offer: TowerUpgradeCard[] = [];
    const usedIds = new Set<string>();
    for (let slot = 0; slot < UPGRADE_CHOICE_COUNT; slot += 1) {
      const card = this.drawUpgradeCard(player, usedIds);
      if (card === undefined) {
        break;
      }
      usedIds.add(card.upgradeId);
      offer.push(card);
    }
    return offer;
  }

  private drawUpgradeCard(
    player: MutableTowerPlayer,
    usedIds: Set<string>,
  ): TowerUpgradeCard | undefined {
    // Tirage pondéré par rareté, puis une carte de cette rareté non déjà présente ;
    // repli sur n'importe quelle carte restante si la rareté tirée est épuisée.
    const rarity = this.pickRarity();
    const pools: UpgradeRarity[] = [rarity, ...UPGRADE_RARITIES.filter((r) => r !== rarity)];
    for (const pool of pools) {
      const candidates = getUpgradesByRarity(pool).filter(
        (card) => !usedIds.has(card.id) && (card.isEligible?.(player) ?? true),
      );
      if (candidates.length === 0) {
        continue;
      }
      const chosen = candidates[this.upgradeRandom.integer(0, candidates.length - 1)];
      if (chosen === undefined) {
        continue;
      }
      this.offerCounter += 1;
      return {
        offerId: `${chosen.id}#${this.offerCounter}`,
        upgradeId: chosen.id,
        rarity: chosen.rarity,
        label: chosen.label,
        description: chosen.description,
        ...(chosen.weaponId === undefined ? {} : { weaponId: chosen.weaponId }),
      };
    }
    return undefined;
  }

  private pickRarity(): UpgradeRarity {
    const total = UPGRADE_RARITIES.reduce((sum, rarity) => sum + UPGRADE_RARITY_WEIGHTS[rarity], 0);
    let roll = this.upgradeRandom.next() * total;
    for (const rarity of UPGRADE_RARITIES) {
      roll -= UPGRADE_RARITY_WEIGHTS[rarity];
      if (roll <= 0) {
        return rarity;
      }
    }
    return 'common';
  }

  private handleUpgradeSelection(player: MutableTowerPlayer, input: TowerInput): void {
    if (input.selectUpgradeId === undefined || player.upgradeChoices.length === 0) {
      return;
    }
    const card = player.upgradeChoices.find((choice) => choice.offerId === input.selectUpgradeId);
    if (card === undefined) {
      return;
    }
    const definition = getUpgradeById(card.upgradeId);
    if (definition === undefined) {
      return;
    }
    definition.apply(player);
    player.upgradeChoices = [];
    player.pendingUpgrades = Math.max(0, player.pendingUpgrades - 1);
    this.addEvent('upgrade-selected', { position: player.position });
    this.refreshUpgradeOffer(player);
  }

  private handleWeaponSelection(player: MutableTowerPlayer, input: TowerInput): void {
    const action = input.selectUpgradeId;
    if (action === undefined || !action.startsWith(WEAPON_ACTION_PREFIX)) {
      return;
    }
    const requested = action.slice(WEAPON_ACTION_PREFIX.length);
    const weapon = player.weapons.find((candidate) => candidate.id === requested);
    if (weapon !== undefined) {
      player.activeWeaponId = weapon.id;
    }
  }

  // ── Boutique de tourelle ─────────────────────────────────────────────────────

  private handleTurretShop(player: MutableTowerPlayer, input: TowerInput): void {
    const request = input.turretShop;
    if (request === undefined || player.downedRemainingMs > 0) {
      return;
    }
    const turret = this.turrets.find((candidate) => candidate.dir === request.turret);
    if (turret === undefined || !turret.alive) {
      return;
    }
    if (distance(player.position, turret.position) > TURRET_SHOP_RANGE) {
      return;
    }
    if (request.action === 'repair') {
      this.repairTurret(turret);
      return;
    }
    if (request.action.startsWith(MODULE_ACTION_PREFIX)) {
      this.buyTurretModule(turret, request.action.slice(MODULE_ACTION_PREFIX.length));
      return;
    }
    if (request.action.startsWith(PRIORITY_ACTION_PREFIX)) {
      this.setTurretTargetPriority(turret, request.action.slice(PRIORITY_ACTION_PREFIX.length));
      return;
    }
    if (request.action.startsWith(GLOBAL_ACTION_PREFIX)) {
      this.buyGlobalDefenseUpgrade(request.action.slice(GLOBAL_ACTION_PREFIX.length));
      return;
    }
    this.buyTurretUpgrade(turret, request.action);
  }

  private buyTurretModule(turret: MutableTurret, requestedId: string): void {
    const module = TOWER_TURRET_MODULES.find((candidate) => candidate.id === requestedId);
    if (
      module === undefined ||
      turret.modules.includes(module.id) ||
      this.scrapFund < module.cost
    ) {
      return;
    }

    switch (module.effect.kind) {
      case 'fire-cooldown-multiplier':
        turret.fireRate = Math.max(
          TURRET_SHOP_EFFECTS.rateMinimum,
          turret.fireRate * module.effect.multiplier,
        );
        break;
      case 'projectile-pierce-bonus':
        turret.pierce += module.effect.amount;
        break;
      case 'energy-capacity-and-grant':
        turret.maxEnergy += module.effect.capacityBonus;
        turret.energy = Math.min(turret.maxEnergy, turret.energy + module.effect.energyGrant);
        break;
    }

    turret.modules.push(module.id);
    turret.modules.sort(
      (left, right) =>
        TOWER_TURRET_MODULES.findIndex((entry) => entry.id === left) -
        TOWER_TURRET_MODULES.findIndex((entry) => entry.id === right),
    );
    this.scrapFund -= module.cost;
  }

  private setTurretTargetPriority(turret: MutableTurret, requested: string): void {
    const priority = TOWER_TURRET_TARGET_PRIORITIES.find((candidate) => candidate.id === requested);
    if (priority !== undefined) {
      turret.targetPriority = priority.id;
    }
  }

  private buyGlobalDefenseUpgrade(requestedId: string): void {
    const offer = TOWER_GLOBAL_DEFENSE_OFFERS.find((candidate) => candidate.id === requestedId);
    if (offer === undefined || !this.currentGlobalDefenseOfferIds().includes(offer.id)) {
      return;
    }
    const upgrade = this.globalDefenseUpgrades.find((candidate) => candidate.id === offer.id);
    if (upgrade === undefined || upgrade.level >= offer.maxLevel || this.scrapFund < offer.cost) {
      return;
    }

    switch (offer.effect.kind) {
      case 'heart-max-hp-bonus':
        this.heart.maxHp += offer.effect.amount;
        this.heart.hp += offer.effect.amount;
        break;
      case 'turret-damage-multiplier':
        for (const networkTurret of this.turrets) {
          networkTurret.bulletDamage *= offer.effect.multiplier;
        }
        break;
      case 'turret-range-bonus':
        for (const networkTurret of this.turrets) {
          networkTurret.range += offer.effect.amount;
          networkTurret.bulletRange += offer.effect.amount;
        }
        break;
    }

    upgrade.level += 1;
    this.scrapFund -= offer.cost;
  }

  private currentGlobalDefenseOfferIds(): readonly TowerGlobalDefenseOfferId[] {
    const rotation = TOWER_GLOBAL_DEFENSE_ROTATIONS[this.currentGlobalDefenseRotationId()];
    return rotation ?? [];
  }

  private currentGlobalDefenseRotationId(): number {
    return this.wave % TOWER_GLOBAL_DEFENSE_ROTATIONS.length;
  }

  private buyTurretUpgrade(turret: MutableTurret, action: string): void {
    const entry = TOWER_TURRET_SHOP.find((candidate) => candidate.id === action);
    if (entry === undefined || this.scrapFund < entry.cost) {
      return;
    }
    switch (entry.id) {
      case 'dmg':
        turret.bulletDamage += TURRET_SHOP_EFFECTS.dmgBonus;
        break;
      case 'range':
        turret.range += TURRET_SHOP_EFFECTS.rangeBonus;
        turret.bulletRange += TURRET_SHOP_EFFECTS.rangeBonus;
        break;
      case 'rate':
        turret.fireRate = Math.max(
          TURRET_SHOP_EFFECTS.rateMinimum,
          turret.fireRate * TURRET_SHOP_EFFECTS.rateMultiplier,
        );
        break;
      case 'hp':
        turret.maxHp += TURRET_SHOP_EFFECTS.hpMaxBonus;
        turret.hp = Math.min(turret.maxHp, turret.hp + TURRET_SHOP_EFFECTS.hpHealBonus);
        break;
      case 'energy':
        turret.energyRegen += TURRET_SHOP_EFFECTS.energyRegenBonus;
        break;
      case 'maxenergy':
        turret.maxEnergy += TURRET_SHOP_EFFECTS.maxEnergyBonus;
        break;
      default:
        return;
    }
    this.scrapFund -= entry.cost;
  }

  private repairTurret(turret: MutableTurret): void {
    const missing = turret.maxHp - turret.hp;
    if (missing <= 0 || this.scrapFund <= 0) {
      return;
    }
    const affordableHp = this.scrapFund / TOWER_TURRET_REPAIR_COST_PER_HP;
    const restored = Math.min(missing, affordableHp);
    turret.hp += restored;
    this.scrapFund = Math.max(0, this.scrapFund - restored * TOWER_TURRET_REPAIR_COST_PER_HP);
  }

  private nearTurretFor(player: MutableTowerPlayer): TurretDir | undefined {
    let nearest: MutableTurret | undefined;
    let nearestDistance = Infinity;
    for (const turret of this.turrets) {
      if (!turret.alive) {
        continue;
      }
      const gap = distance(player.position, turret.position);
      if (gap <= TURRET_SHOP_RANGE && gap < nearestDistance) {
        nearestDistance = gap;
        nearest = turret;
      }
    }
    return nearest?.dir;
  }

  // ── Défaite ───────────────────────────────────────────────────────────────

  private checkDefeat(): void {
    if (this.status !== 'running') {
      return;
    }
    if (this.heart.hp <= 0) {
      this.status = 'defeat';
      this.addEvent('defeat', {});
      return;
    }
    if (this.players.length === 1 && (this.players[0]?.hp ?? 0) <= 0) {
      this.status = 'defeat';
      this.addEvent('defeat', {});
    }
  }

  // ── Recherches utilitaires ───────────────────────────────────────────────────

  private findPlayerById(id: string): MutableTowerPlayer | undefined {
    return this.players.find((player) => player.id === id);
  }

  private findNearestLivingPlayer(
    position: Vector2,
    maxRange: number,
  ): MutableTowerPlayer | undefined {
    let nearest: MutableTowerPlayer | undefined;
    let nearestDistance = maxRange;
    for (const player of this.players) {
      if (player.downedRemainingMs > 0 || player.hp <= 0) {
        continue;
      }
      const gap = distance(player.position, position);
      if (gap <= nearestDistance) {
        nearestDistance = gap;
        nearest = player;
      }
    }
    return nearest;
  }

  // ── Helpers de debug (tests) ─────────────────────────────────────────────────

  public spawnMonster(kind: TowerMonsterKind, position?: Vector2): string {
    const definition = MONSTERS[kind];
    this.monsterCounter += 1;
    const id = `monster-${this.monsterCounter}`;
    const spawnPosition = position ?? this.randomWaveSpawnPosition();
    this.monsters.push({
      id,
      kind,
      position: { x: spawnPosition.x, y: spawnPosition.y },
      hp: definition.hp,
      maxHp: definition.hp,
      radius: definition.radius,
      speed: definition.speed,
      contactDamage: definition.contactDamage,
      reward: definition.reward,
      contactCooldownRemaining: 0,
      burnRemainingMs: 0,
      burnStacks: 0,
      burnOwnerId: undefined,
    });
    return id;
  }

  public damageHeart(amount: number): void {
    if (this.status !== 'running') {
      return;
    }
    this.damageHeartInternal(Math.max(0, amount));
    this.checkDefeat();
  }

  public giveExperience(playerId: string, amount: number): void {
    if (this.status !== 'running') {
      return;
    }
    const player = this.findPlayerById(playerId);
    if (player !== undefined) {
      this.addExperience(player, Math.max(0, amount));
    }
  }

  public getScrapFund(): number {
    return this.scrapFund;
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  public createSnapshot(): TowerGameState {
    const players = this.players.map((player) => this.projectPlayer(player));
    const primary = players[0];
    if (primary === undefined) {
      throw new Error('TowerSimulation requiert au moins un joueur.');
    }
    const rotationId = this.currentGlobalDefenseRotationId();
    const offerIds = TOWER_GLOBAL_DEFENSE_ROTATIONS[rotationId];
    if (offerIds === undefined) {
      throw new Error('Le catalogue Tower requiert au moins une rotation globale.');
    }
    return {
      tick: this.tick,
      elapsedMs: this.elapsedMs,
      status: this.status,
      seed: this.seed,
      world: {
        width: WORLD.width,
        height: WORLD.height,
        spawnZoneRadius: WORLD.spawnZoneRadius,
      },
      wave: this.wave,
      scrapFund: this.scrapFund,
      globalDefenseUpgrades: this.globalDefenseUpgrades.map((upgrade) => ({ ...upgrade })),
      globalDefenseShop: { rotationId, offerIds: [...offerIds] },
      player: primary,
      players,
      heart: this.projectHeart(),
      turrets: this.turrets.map((turret) => this.projectTurret(turret)),
      monsters: this.monsters.map((monster) => this.projectMonster(monster)),
      projectiles: this.projectiles.map((bullet) => this.projectProjectile(bullet)),
      scraps: this.scraps.map((scrap) => this.projectScrap(scrap)),
      events: this.events.map((event) => ({ ...event })),
    };
  }

  private projectPlayer(player: MutableTowerPlayer): TowerPlayerState {
    const nearTurret = this.nearTurretFor(player);
    const activeWeapon = this.projectWeapons(player).find(
      (weapon) => weapon.id === player.activeWeaponId,
    );
    if (activeWeapon === undefined) {
      throw new Error(`Arme active absente de l'arsenal : ${player.activeWeaponId}`);
    }
    return {
      id: player.id,
      position: { ...player.position },
      aim: { ...player.aim },
      hp: player.hp,
      maxHp: player.maxHp,
      level: player.level,
      experience: player.experience,
      experienceToNext: player.experienceToNext,
      gold: player.gold,
      activeWeaponId: player.activeWeaponId,
      weapons: this.projectWeapons(player),
      fireRate: activeWeapon.fireRate,
      bulletDamage: activeWeapon.bulletDamage,
      pendingUpgrades: player.pendingUpgrades,
      upgradeChoices: player.upgradeChoices.map((card) => ({ ...card })),
      downedRemainingMs: player.downedRemainingMs,
      ...(nearTurret === undefined ? {} : { nearTurret }),
    };
  }

  private projectWeapons(player: MutableTowerPlayer): TowerWeaponState[] {
    return player.weapons.map((weapon) => {
      const definition = weaponDefinition(weapon.id);
      return {
        id: weapon.id,
        level: weapon.level,
        fireRate: this.weaponFireRate(player, weapon, definition),
        bulletDamage: this.weaponDamage(player, weapon, definition),
        projectileCount: definition.projectileCount,
      };
    });
  }

  private projectHeart(): HeartState {
    return {
      position: { ...this.heart.position },
      hp: this.heart.hp,
      maxHp: this.heart.maxHp,
      radius: this.heart.radius,
    };
  }

  private projectTurret(turret: MutableTurret): TurretState {
    return {
      dir: turret.dir,
      position: { ...turret.position },
      angle: turret.angle,
      hp: turret.hp,
      maxHp: turret.maxHp,
      energy: turret.energy,
      maxEnergy: turret.maxEnergy,
      range: turret.range,
      modules: [...turret.modules],
      targetPriority: turret.targetPriority,
      alive: turret.alive,
    };
  }

  private projectMonster(monster: MutableTowerMonster): TowerMonsterState {
    return {
      id: monster.id,
      kind: monster.kind,
      position: { ...monster.position },
      hp: monster.hp,
      maxHp: monster.maxHp,
      radius: monster.radius,
    };
  }

  private projectProjectile(bullet: MutableTowerProjectile): TowerProjectileState {
    const source: ProjectileSource = bullet.source;
    return {
      id: bullet.id,
      position: { ...bullet.position },
      radius: bullet.radius,
      source,
      ...(bullet.ownerId === undefined ? {} : { ownerId: bullet.ownerId }),
      friendly: true,
      ...(bullet.weaponId === undefined ? {} : { weaponId: bullet.weaponId }),
    };
  }

  private projectScrap(scrap: MutableScrap): ScrapPickupState {
    return {
      id: scrap.id,
      position: { ...scrap.position },
      amount: scrap.amount,
    };
  }

  private addEvent(
    type: TowerEventType,
    details: Readonly<{ position?: Vector2; amount?: number }>,
  ): void {
    this.eventCounter += 1;
    this.events.push({
      id: this.eventCounter,
      tick: this.tick,
      type,
      ...(details.position === undefined ? {} : { position: { ...details.position } }),
      ...(details.amount === undefined ? {} : { amount: details.amount }),
    });
  }
}

/** XP requise pour passer du niveau `level` au suivant : 55 puis ×1.11 (arrondi). */
function xpForLevel(level: number): number {
  return Math.round(XP_BASE * XP_GROWTH ** (level - 1));
}
