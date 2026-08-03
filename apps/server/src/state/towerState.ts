import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import type {
  TowerGameState,
  TowerPlayerState,
  TowerProjectileState,
  TowerRoomPhase,
  TurretState,
} from '@village-survivor/protocol';

export class VectorSchema extends Schema {
  @type('number') public x = 0;
  @type('number') public y = 0;
}

export class WorldSchema extends Schema {
  @type('number') public width = 0;
  @type('number') public height = 0;
  @type('number') public spawnZoneRadius = 0;
}

export class BiomeSchema extends Schema {
  @type('string') public id = '';
  @type('string') public affinity = '';
  @type('number') public cycle = 0;
  @type('number') public startsAtWave = 0;
  @type('number') public durationWaves = 0;
}

export class WeaponSchema extends Schema {
  @type('string') public id = '';
  @type('number') public level = 0;
  @type('number') public fireRate = 0;
  @type('number') public bulletDamage = 0;
  @type('number') public projectileCount = 0;
}

export class UpgradeCardSchema extends Schema {
  @type('string') public offerId = '';
  @type('string') public upgradeId = '';
  @type('string') public rarity = '';
  @type('string') public label = '';
  @type('string') public description = '';
  @type('string') public weaponId = '';
}

export class PlayerSchema extends Schema {
  @type('string') public id = '';
  @type(VectorSchema) public position = new VectorSchema();
  @type(VectorSchema) public aim = new VectorSchema();
  @type('number') public hp = 0;
  @type('number') public maxHp = 0;
  @type('number') public level = 0;
  @type('number') public experience = 0;
  @type('number') public experienceToNext = 0;
  @type('number') public gold = 0;
  @type('string') public activeWeaponId = '';
  @type([WeaponSchema]) public weapons = new ArraySchema<WeaponSchema>();
  @type('number') public fireRate = 0;
  @type('number') public bulletDamage = 0;
  @type('number') public pendingUpgrades = 0;
  @type([UpgradeCardSchema]) public upgradeChoices = new ArraySchema<UpgradeCardSchema>();
  @type('number') public downedRemainingMs = 0;
  @type('string') public nearTurret = '';
  @type('boolean') public turretWorkshopProtected = false;
}

export class HeartSchema extends Schema {
  @type(VectorSchema) public position = new VectorSchema();
  @type('number') public hp = 0;
  @type('number') public maxHp = 0;
  @type('number') public radius = 0;
}

export class TurretSchema extends Schema {
  @type('string') public dir = '';
  @type(VectorSchema) public position = new VectorSchema();
  @type('number') public angle = 0;
  @type('number') public hp = 0;
  @type('number') public maxHp = 0;
  @type('number') public energy = 0;
  @type('number') public maxEnergy = 0;
  @type('number') public range = 0;
  @type(['string']) public modules = new ArraySchema<string>();
  @type('string') public targetPriority = '';
  @type('boolean') public alive = false;
}

export class MonsterSchema extends Schema {
  @type('string') public id = '';
  @type('string') public kind = '';
  @type('string') public rarity = '';
  @type('string') public affinity = '';
  @type('string') public trait = '';
  @type(VectorSchema) public position = new VectorSchema();
  @type('number') public hp = 0;
  @type('number') public maxHp = 0;
  @type('number') public radius = 0;
}

export class ProjectileSchema extends Schema {
  @type('string') public id = '';
  @type(VectorSchema) public position = new VectorSchema();
  @type('number') public radius = 0;
  @type('string') public source = '';
  @type('string') public ownerId = '';
  @type('boolean') public friendly = true;
  @type('string') public weaponId = '';
}

export class ScrapSchema extends Schema {
  @type('string') public id = '';
  @type(VectorSchema) public position = new VectorSchema();
  @type('number') public amount = 0;
}

export class GlobalDefenseUpgradeSchema extends Schema {
  @type('string') public id = '';
  @type('number') public level = 0;
}

export class GlobalDefenseShopSchema extends Schema {
  @type('number') public rotationId = 0;
  @type(['string']) public offerIds = new ArraySchema<string>();
}

export class SharedQuestSchema extends Schema {
  @type('number') public rotationId = 0;
  @type('string') public id = '';
  @type('string') public objective = '';
  @type('number') public progress = 0;
  @type('number') public target = 0;
  @type('number') public rewardScrap = 0;
  @type('number') public completedCount = 0;
}

export class MerchantShopSchema extends Schema {
  @type('number') public rotationId = 0;
  @type(['string']) public offerIds = new ArraySchema<string>();
}

/** Schéma partagé complet. L'alias local `player` et les événements fiables restent hors Schema. */
export class TowerStateSchema extends Schema {
  @type('string') public phase: TowerRoomPhase = 'waiting';
  @type('number') public tick = 0;
  @type('number') public elapsedMs = 0;
  @type('string') public status = 'ready';
  @type(WorldSchema) public world = new WorldSchema();
  @type(BiomeSchema) public biome = new BiomeSchema();
  @type('number') public wave = 0;
  @type('number') public scrapFund = 0;
  @type({ map: GlobalDefenseUpgradeSchema })
  public globalDefenseUpgrades = new MapSchema<GlobalDefenseUpgradeSchema>();
  @type(GlobalDefenseShopSchema) public globalDefenseShop = new GlobalDefenseShopSchema();
  @type(SharedQuestSchema) public sharedQuest = new SharedQuestSchema();
  @type(MerchantShopSchema) public merchantShop = new MerchantShopSchema();
  @type({ map: PlayerSchema }) public players = new MapSchema<PlayerSchema>();
  @type(HeartSchema) public heart = new HeartSchema();
  @type({ map: TurretSchema }) public turrets = new MapSchema<TurretSchema>();
  @type({ map: MonsterSchema }) public monsters = new MapSchema<MonsterSchema>();
  @type({ map: ProjectileSchema }) public projectiles = new MapSchema<ProjectileSchema>();
  @type({ map: ScrapSchema }) public scraps = new MapSchema<ScrapSchema>();
}

function syncVector(target: VectorSchema, source: Readonly<{ x: number; y: number }>): void {
  target.x = source.x;
  target.y = source.y;
}

function replaceStrings(target: ArraySchema<string>, source: readonly string[]): void {
  if (target.length === source.length && source.every((value, index) => target[index] === value))
    return;
  target.clear();
  target.push(...source);
}

function syncPlayer(target: PlayerSchema, source: TowerPlayerState): void {
  target.id = source.id;
  syncVector(target.position, source.position);
  syncVector(target.aim, source.aim);
  target.hp = source.hp;
  target.maxHp = source.maxHp;
  target.level = source.level;
  target.experience = source.experience;
  target.experienceToNext = source.experienceToNext;
  target.gold = source.gold;
  target.activeWeaponId = source.activeWeaponId;
  target.fireRate = source.fireRate;
  target.bulletDamage = source.bulletDamage;
  target.pendingUpgrades = source.pendingUpgrades;
  target.downedRemainingMs = source.downedRemainingMs;
  target.nearTurret = source.nearTurret ?? '';
  target.turretWorkshopProtected = source.turretWorkshopProtected ?? false;

  const weaponsChanged =
    target.weapons.length !== source.weapons.length ||
    source.weapons.some((weapon, index) => {
      const current = target.weapons[index];
      return (
        current === undefined ||
        current.id !== weapon.id ||
        current.level !== weapon.level ||
        current.fireRate !== weapon.fireRate ||
        current.bulletDamage !== weapon.bulletDamage ||
        current.projectileCount !== weapon.projectileCount
      );
    });
  if (weaponsChanged) {
    target.weapons.clear();
    target.weapons.push(
      ...source.weapons.map((weapon) => {
        const schema = new WeaponSchema();
        schema.id = weapon.id;
        schema.level = weapon.level;
        schema.fireRate = weapon.fireRate;
        schema.bulletDamage = weapon.bulletDamage;
        schema.projectileCount = weapon.projectileCount;
        return schema;
      }),
    );
  }
  const choicesChanged =
    target.upgradeChoices.length !== source.upgradeChoices.length ||
    source.upgradeChoices.some((card, index) => {
      const current = target.upgradeChoices[index];
      return (
        current === undefined ||
        current.offerId !== card.offerId ||
        current.upgradeId !== card.upgradeId ||
        current.rarity !== card.rarity ||
        current.label !== card.label ||
        current.description !== card.description ||
        current.weaponId !== (card.weaponId ?? '')
      );
    });
  if (choicesChanged) {
    target.upgradeChoices.clear();
    target.upgradeChoices.push(
      ...source.upgradeChoices.map((card) => {
        const schema = new UpgradeCardSchema();
        schema.offerId = card.offerId;
        schema.upgradeId = card.upgradeId;
        schema.rarity = card.rarity;
        schema.label = card.label;
        schema.description = card.description;
        schema.weaponId = card.weaponId ?? '';
        return schema;
      }),
    );
  }
}

function syncTurret(target: TurretSchema, source: TurretState): void {
  target.dir = source.dir;
  syncVector(target.position, source.position);
  target.angle = source.angle;
  target.hp = source.hp;
  target.maxHp = source.maxHp;
  target.energy = source.energy;
  target.maxEnergy = source.maxEnergy;
  target.range = source.range;
  replaceStrings(target.modules, source.modules);
  target.targetPriority = source.targetPriority;
  target.alive = source.alive;
}

function syncProjectile(target: ProjectileSchema, source: TowerProjectileState): void {
  target.id = source.id;
  syncVector(target.position, source.position);
  target.radius = source.radius;
  target.source = source.source;
  target.ownerId = source.ownerId ?? '';
  target.friendly = source.friendly;
  target.weaponId = source.weaponId ?? '';
}

function deleteMissing<T extends Schema>(
  target: MapSchema<T>,
  retainedKeys: ReadonlySet<string>,
): void {
  const stale: string[] = [];
  target.forEach((_value, key) => {
    if (!retainedKeys.has(key)) stale.push(key);
  });
  for (const key of stale) target.delete(key);
}

/** Mutateur unique : chaque patch Colyseus est dérivé d'un snapshot autoritaire du moteur. */
export function syncTowerState(
  target: TowerStateSchema,
  source: TowerGameState,
  phase: TowerRoomPhase,
): void {
  target.phase = phase;
  target.tick = source.tick;
  target.elapsedMs = source.elapsedMs;
  target.status = source.status;
  target.world.width = source.world.width;
  target.world.height = source.world.height;
  target.world.spawnZoneRadius = source.world.spawnZoneRadius;
  target.biome.id = source.biome.id;
  target.biome.affinity = source.biome.affinity;
  target.biome.cycle = source.biome.cycle;
  target.biome.startsAtWave = source.biome.startsAtWave;
  target.biome.durationWaves = source.biome.durationWaves;
  target.wave = source.wave;
  target.scrapFund = source.scrapFund;

  const globalKeys = new Set<string>();
  for (const upgrade of source.globalDefenseUpgrades) {
    globalKeys.add(upgrade.id);
    const schema = target.globalDefenseUpgrades.get(upgrade.id) ?? new GlobalDefenseUpgradeSchema();
    schema.id = upgrade.id;
    schema.level = upgrade.level;
    target.globalDefenseUpgrades.set(upgrade.id, schema);
  }
  deleteMissing(target.globalDefenseUpgrades, globalKeys);
  target.globalDefenseShop.rotationId = source.globalDefenseShop.rotationId;
  replaceStrings(target.globalDefenseShop.offerIds, source.globalDefenseShop.offerIds);
  target.sharedQuest.rotationId = source.sharedQuest.rotationId;
  target.sharedQuest.id = source.sharedQuest.id;
  target.sharedQuest.objective = source.sharedQuest.objective;
  target.sharedQuest.progress = source.sharedQuest.progress;
  target.sharedQuest.target = source.sharedQuest.target;
  target.sharedQuest.rewardScrap = source.sharedQuest.rewardScrap;
  target.sharedQuest.completedCount = source.sharedQuest.completedCount;
  target.merchantShop.rotationId = source.merchantShop.rotationId;
  replaceStrings(target.merchantShop.offerIds, source.merchantShop.offerIds);

  const playerKeys = new Set<string>();
  for (const player of source.players) {
    playerKeys.add(player.id);
    const schema = target.players.get(player.id) ?? new PlayerSchema();
    syncPlayer(schema, player);
    target.players.set(player.id, schema);
  }
  deleteMissing(target.players, playerKeys);
  syncVector(target.heart.position, source.heart.position);
  target.heart.hp = source.heart.hp;
  target.heart.maxHp = source.heart.maxHp;
  target.heart.radius = source.heart.radius;

  const turretKeys = new Set<string>();
  for (const turret of source.turrets) {
    turretKeys.add(turret.dir);
    const schema = target.turrets.get(turret.dir) ?? new TurretSchema();
    syncTurret(schema, turret);
    target.turrets.set(turret.dir, schema);
  }
  deleteMissing(target.turrets, turretKeys);

  const monsterKeys = new Set<string>();
  for (const monster of source.monsters) {
    monsterKeys.add(monster.id);
    const schema = target.monsters.get(monster.id) ?? new MonsterSchema();
    schema.id = monster.id;
    schema.kind = monster.kind;
    schema.rarity = monster.rarity;
    schema.affinity = monster.affinity;
    schema.trait = monster.trait;
    syncVector(schema.position, monster.position);
    schema.hp = monster.hp;
    schema.maxHp = monster.maxHp;
    schema.radius = monster.radius;
    target.monsters.set(monster.id, schema);
  }
  deleteMissing(target.monsters, monsterKeys);

  const projectileKeys = new Set<string>();
  for (const projectile of source.projectiles) {
    projectileKeys.add(projectile.id);
    const schema = target.projectiles.get(projectile.id) ?? new ProjectileSchema();
    syncProjectile(schema, projectile);
    target.projectiles.set(projectile.id, schema);
  }
  deleteMissing(target.projectiles, projectileKeys);

  const scrapKeys = new Set<string>();
  for (const scrap of source.scraps) {
    scrapKeys.add(scrap.id);
    const schema = target.scraps.get(scrap.id) ?? new ScrapSchema();
    schema.id = scrap.id;
    syncVector(schema.position, scrap.position);
    schema.amount = scrap.amount;
    target.scraps.set(scrap.id, schema);
  }
  deleteMissing(target.scraps, scrapKeys);
}
