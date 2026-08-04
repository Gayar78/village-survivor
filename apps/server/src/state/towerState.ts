import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import type {
  TowerEndgameState,
  TowerGameState,
  TowerMonsterState,
  TowerMonsterZoneState,
  TowerPlayerState,
  TowerProjectileState,
  TowerRoomPhase,
  TowerTimelandsState,
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

export class MonsterTemporalSchema extends Schema {
  @type('string') public status = '';
  @type('string') public wardenMonsterId = '';
  @type('string') public alteration = '';
}

export class MonsterAbilitySchema extends Schema {
  @type('string') public kind = '';
  @type('string') public phase = '';
  @type('number') public remainingMs = 0;
  @type('number') public totalMs = 0;
  @type('number') public radius = 0;
  @type(VectorSchema) public targetPosition: VectorSchema | undefined = undefined;
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
  @type('number') public shieldRatio: number | undefined = undefined;
  @type('boolean') public camouflaged: boolean | undefined = undefined;
  @type('boolean') public empowered: boolean | undefined = undefined;
  @type(MonsterTemporalSchema) public temporal: MonsterTemporalSchema | undefined = undefined;
  @type(MonsterAbilitySchema) public ability: MonsterAbilitySchema | undefined = undefined;
}

export class MonsterZoneSchema extends Schema {
  @type('string') public id = '';
  @type('string') public kind = '';
  @type(VectorSchema) public position = new VectorSchema();
  @type('number') public radius = 0;
  @type('number') public remainingMs = 0;
  @type('number') public durationMs = 0;
  @type(VectorSchema) public endPosition: VectorSchema | undefined = undefined;
}

export class TimelandsArrivalSchema extends Schema {
  @type('string') public status = 'pending';
  @type('number') public arrivedAtTick = 0;
  @type('number') public announcementEndsAtTick = 0;
}

export class TemporalEffectSchema extends Schema {
  @type('number') public id = 0;
  @type('string') public kind = '';
  @type('string') public scope = 'global';
  @type('number') public scale = 1;
  @type('number') public activatedAtTick = 0;
  @type('number') public expiresAtTick = 0;
  @type('string') public sourceMonsterId = '';
  @type('string') public playerId = '';
}

export class TimelandsWardenSchema extends Schema {
  @type('string') public status = 'not-spawned';
  @type('string') public monsterId = '';
  @type('number') public nextReleaseAtTick = 0;
  @type(['string']) public releasedMonsterIds = new ArraySchema<string>();
  @type('boolean') public lowHpRelocationUsed = false;
  @type('number') public defeatedAtTick = 0;
}

export class TimelandsSchema extends Schema {
  @type(TimelandsArrivalSchema) public arrival = new TimelandsArrivalSchema();
  @type({ map: TemporalEffectSchema })
  public activeEffects = new MapSchema<TemporalEffectSchema>();
  @type(TimelandsWardenSchema) public warden = new TimelandsWardenSchema();
}

export class EndgameTierSchema extends Schema {
  @type('number') public id = 0;
  @type('number') public activatedAtTick = 0;
}

export class EndgameNextTierSchema extends Schema {
  @type('number') public id = 0;
  @type('number') public triggersAtTick = 0;
}

export class EndgameAnnouncementSchema extends Schema {
  @type('number') public tierId = 0;
  @type('number') public endsAtTick = 0;
}

export class EndgameSchema extends Schema {
  @type('boolean') public hasPhaseStartedAtTick = false;
  @type('number') public phaseStartedAtTick = 0;
  @type({ map: EndgameTierSchema }) public activeTiers = new MapSchema<EndgameTierSchema>();
  @type('boolean') public hasNextTier = false;
  @type(EndgameNextTierSchema) public nextTier = new EndgameNextTierSchema();
  @type('boolean') public hasAnnouncement = false;
  @type(EndgameAnnouncementSchema) public announcement = new EndgameAnnouncementSchema();
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
  @type(TimelandsSchema) public timelands = new TimelandsSchema();
  @type(EndgameSchema) public endgame = new EndgameSchema();
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
  @type({ map: MonsterZoneSchema }) public monsterZones = new MapSchema<MonsterZoneSchema>();
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

function syncMonster(target: MonsterSchema, source: TowerMonsterState): void {
  target.id = source.id;
  target.kind = source.kind;
  target.rarity = source.rarity;
  target.affinity = source.affinity;
  target.trait = source.trait;
  syncVector(target.position, source.position);
  target.hp = source.hp;
  target.maxHp = source.maxHp;
  target.radius = source.radius;
  target.shieldRatio = source.shieldRatio;
  target.camouflaged = source.camouflaged === true ? true : undefined;
  target.empowered = source.empowered === true ? true : undefined;

  if (source.temporal === undefined) {
    target.temporal = undefined;
  } else {
    const temporal = target.temporal ?? new MonsterTemporalSchema();
    temporal.status = source.temporal.status;
    temporal.wardenMonsterId =
      source.temporal.status === 'warden-controlled' ? source.temporal.wardenMonsterId : '';
    temporal.alteration =
      source.temporal.status === 'warden-controlled' ? source.temporal.alteration : '';
    target.temporal = temporal;
  }

  if (source.ability === undefined) {
    target.ability = undefined;
  } else {
    const ability = target.ability ?? new MonsterAbilitySchema();
    ability.kind = source.ability.kind;
    ability.phase = source.ability.phase;
    ability.remainingMs = source.ability.remainingMs;
    ability.totalMs = source.ability.totalMs;
    ability.radius = source.ability.radius;
    if (source.ability.targetPosition === undefined) {
      ability.targetPosition = undefined;
    } else {
      const targetPosition = ability.targetPosition ?? new VectorSchema();
      syncVector(targetPosition, source.ability.targetPosition);
      ability.targetPosition = targetPosition;
    }
    target.ability = ability;
  }
}

function syncMonsterZone(target: MonsterZoneSchema, source: TowerMonsterZoneState): void {
  target.id = source.id;
  target.kind = source.kind;
  syncVector(target.position, source.position);
  target.radius = source.radius;
  target.remainingMs = source.remainingMs;
  target.durationMs = source.durationMs;
  if (source.endPosition === undefined) {
    target.endPosition = undefined;
  } else {
    const endPosition = target.endPosition ?? new VectorSchema();
    syncVector(endPosition, source.endPosition);
    target.endPosition = endPosition;
  }
}

function syncTimelands(target: TimelandsSchema, source: TowerTimelandsState): void {
  target.arrival.status = source.arrival.status;
  target.arrival.arrivedAtTick =
    source.arrival.status === 'pending' ? 0 : source.arrival.arrivedAtTick;
  target.arrival.announcementEndsAtTick =
    source.arrival.status === 'announcing' ? source.arrival.announcementEndsAtTick : 0;

  const effectKeys = new Set<string>();
  for (const effect of source.activeEffects) {
    const key = String(effect.id);
    effectKeys.add(key);
    const schema = target.activeEffects.get(key) ?? new TemporalEffectSchema();
    schema.id = effect.id;
    schema.kind = effect.kind;
    schema.scope = effect.scope;
    schema.scale = effect.scale;
    schema.activatedAtTick = effect.activatedAtTick;
    schema.expiresAtTick = effect.expiresAtTick;
    schema.sourceMonsterId = effect.sourceMonsterId ?? '';
    schema.playerId = effect.scope === 'player' ? effect.playerId : '';
    target.activeEffects.set(key, schema);
  }
  deleteMissing(target.activeEffects, effectKeys);

  target.warden.status = source.warden.status;
  target.warden.monsterId = source.warden.status === 'not-spawned' ? '' : source.warden.monsterId;
  target.warden.nextReleaseAtTick =
    source.warden.status === 'active' ? source.warden.nextReleaseAtTick : 0;
  replaceStrings(
    target.warden.releasedMonsterIds,
    source.warden.status === 'active' ? source.warden.releasedMonsterIds : [],
  );
  target.warden.lowHpRelocationUsed =
    source.warden.status === 'active' ? source.warden.lowHpRelocationUsed : false;
  target.warden.defeatedAtTick =
    source.warden.status === 'defeated' ? source.warden.defeatedAtTick : 0;
}

function syncEndgame(target: EndgameSchema, source: TowerEndgameState): void {
  target.hasPhaseStartedAtTick = source.phaseStartedAtTick !== null;
  target.phaseStartedAtTick = source.phaseStartedAtTick ?? 0;

  const tierKeys = new Set<string>();
  for (const tier of source.activeTiers) {
    const key = String(tier.id);
    tierKeys.add(key);
    const schema = target.activeTiers.get(key) ?? new EndgameTierSchema();
    schema.id = tier.id;
    schema.activatedAtTick = tier.activatedAtTick;
    target.activeTiers.set(key, schema);
  }
  deleteMissing(target.activeTiers, tierKeys);

  target.hasNextTier = source.nextTier !== null;
  target.nextTier.id = source.nextTier?.id ?? 0;
  target.nextTier.triggersAtTick = source.nextTier?.triggersAtTick ?? 0;
  target.hasAnnouncement = source.announcement !== null;
  target.announcement.tierId = source.announcement?.tierId ?? 0;
  target.announcement.endsAtTick = source.announcement?.endsAtTick ?? 0;
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
  syncTimelands(target.timelands, source.timelands);
  syncEndgame(target.endgame, source.endgame);
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
    syncMonster(schema, monster);
    target.monsters.set(monster.id, schema);
  }
  deleteMissing(target.monsters, monsterKeys);

  const monsterZoneKeys = new Set<string>();
  for (const zone of source.monsterZones) {
    monsterZoneKeys.add(zone.id);
    const schema = target.monsterZones.get(zone.id) ?? new MonsterZoneSchema();
    syncMonsterZone(schema, zone);
    target.monsterZones.set(zone.id, schema);
  }
  deleteMissing(target.monsterZones, monsterZoneKeys);

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
