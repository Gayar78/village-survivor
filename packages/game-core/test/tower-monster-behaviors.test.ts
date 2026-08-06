import { TOWER_NATURAL_MONSTERS } from '@village-survivor/content';
import type { TowerInput, TowerMonsterKind, Vector2 } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { HOSTILE_SLOW_DURATION_MS, TowerSimulation } from '../src/tower/index.js';
import { monsterBehaviorProfile } from '../src/tower/monster-behaviors.js';
import type { MutableTowerMonster, MutableTowerPlayer, MutableTurret } from '../src/tower/state.js';
import { MONSTERS, TURRET } from '../src/tower/tuning.js';

const input = (sequence: number): TowerInput => ({
  sequence,
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
});

type MonsterAbility = NonNullable<ReturnType<typeof monsterBehaviorProfile>['ability']>;

type SimulationInternals = {
  heart: { hp: number; maxHp: number };
  monsters: MutableTowerMonster[];
  players: MutableTowerPlayer[];
  turrets: MutableTurret[];
  damageMonster(
    monster: MutableTowerMonster,
    amount: number,
    killer: MutableTowerPlayer | undefined,
  ): boolean;
  findMonsterTarget(monster: MutableTowerMonster): Vector2;
  monsterAbilityTarget(monster: MutableTowerMonster, ability: MonsterAbility): Vector2 | undefined;
  resolveMonsterMerges(): void;
};

function isInertMonsterProfile(profile: ReturnType<typeof monsterBehaviorProfile>): boolean {
  return (
    profile.movement === 'direct' &&
    profile.contact === 'none' &&
    profile.ability === undefined &&
    profile.regenerationPerSecond === undefined &&
    profile.growthPerSecond === undefined &&
    profile.incomingDamageMultiplier === undefined &&
    profile.mergeWithOwnKind === undefined &&
    profile.volatileLifetimeMs === undefined &&
    profile.reviveFraction === undefined &&
    profile.death === undefined
  );
}

function internals(simulation: TowerSimulation): SimulationInternals {
  return simulation as unknown as SimulationInternals;
}

function spawned(simulation: TowerSimulation, kind: TowerMonsterKind): MutableTowerMonster {
  const found = internals(simulation).monsters.find((monster) => monster.kind === kind);
  if (found === undefined) throw new Error(`Monstre de test absent : ${kind}`);
  return found;
}

describe('Tower Torri monster behavior primitives', () => {
  it("n'associe aucun profil inerte aux monstres naturels du catalogue", () => {
    for (const monster of TOWER_NATURAL_MONSTERS) {
      const profile = monsterBehaviorProfile(monster.signature);
      expect(isInertMonsterProfile(profile), `${monster.id} (${monster.signature})`).toBe(false);
    }
  });

  it('mémorise un seul profil immuable par signature', () => {
    expect(monsterBehaviorProfile('portal-summon')).toBe(monsterBehaviorProfile('portal-summon'));
  });

  it('n’arme ni soin, buff, invocation ni slam lorsqu’aucune cible utile n’existe', () => {
    const simulation = new TowerSimulation('torri-ability-targets');
    simulation.start();
    const state = internals(simulation);
    simulation.spawnMonster('healer', { x: 1_000, y: 0 });
    simulation.spawnMonster('banner', { x: 1_200, y: 0 });
    simulation.spawnMonster('summoner', { x: 1_400, y: 0 });
    simulation.spawnMonster('ancient-guardian', { x: 1_600, y: 0 });
    const healAbility = monsterBehaviorProfile('area-heal').ability;
    const bolsterAbility = monsterBehaviorProfile('ally-buff').ability;
    const summonAbility = monsterBehaviorProfile('portal-summon').ability;
    const slamAbility = monsterBehaviorProfile('guardian-arena-slam').ability;
    if (
      healAbility === undefined ||
      bolsterAbility === undefined ||
      summonAbility === undefined ||
      slamAbility === undefined
    ) {
      throw new Error('Le harnais requiert les quatre profils de capacité Torri.');
    }

    expect(state.monsterAbilityTarget(spawned(simulation, 'healer'), healAbility)).toBeUndefined();
    expect(
      state.monsterAbilityTarget(spawned(simulation, 'banner'), bolsterAbility),
    ).toBeUndefined();
    expect(
      state.monsterAbilityTarget(spawned(simulation, 'summoner'), summonAbility),
    ).toBeUndefined();
    expect(
      state.monsterAbilityTarget(spawned(simulation, 'ancient-guardian'), slamAbility),
    ).toBeUndefined();

    const woundedId = simulation.spawnMonster('slime', { x: 1_030, y: 0 });
    const wounded = state.monsters.find((monster) => monster.id === woundedId);
    const player = state.players[0];
    if (wounded === undefined || player === undefined) {
      throw new Error('Le harnais requiert un Slime et un joueur.');
    }
    wounded.hp /= 2;
    player.position = { x: 1_450, y: 0 };

    expect(state.monsterAbilityTarget(spawned(simulation, 'healer'), healAbility)).toEqual(
      wounded.position,
    );
    expect(state.monsterAbilityTarget(spawned(simulation, 'banner'), bolsterAbility)).toEqual(
      wounded.position,
    );
    expect(state.monsterAbilityTarget(spawned(simulation, 'summoner'), summonAbility)).toEqual(
      player.position,
    );
    expect(
      state.monsterAbilityTarget(spawned(simulation, 'ancient-guardian'), slamAbility),
    ).toEqual(player.position);
  });

  it('donne au petit squelette invoqué une cadence de bond distincte', () => {
    expect(monsterBehaviorProfile('bone-strike').movement).toBe('pounce');
  });

  it('ne confond pas les signatures contenant « merge » avec les fusions voulues', () => {
    expect(monsterBehaviorProfile('burrow-emerge').mergeWithOwnKind).toBeUndefined();
    expect(monsterBehaviorProfile('emergency-heal').mergeWithOwnKind).toBeUndefined();
  });

  it('ne ralentit pas le joueur avec le rayon purement visuel du Voleur de vie', () => {
    const simulation = new TowerSimulation('torri-life-thief-visual-ray');
    simulation.start();
    const player = internals(simulation).players[0];
    if (player === undefined) throw new Error('Joueur de test absent.');
    player.position = { x: 1_000, y: 700 };
    player.hp = 1_000_000;
    player.maxHp = 1_000_000;
    simulation.spawnMonster('life-thief', { ...player.position });

    for (let tick = 1; tick <= 300; tick += 1) {
      simulation.step({ 'player-1': input(tick) });
      expect(player.hostileSlowRemainingMs).toBe(0);
    }
  });

  it('applique deux secondes de ralentissement sans rapprocher le joueur du Cœur', () => {
    const simulation = new TowerSimulation('torri-contact-slow');
    simulation.start();
    const player = internals(simulation).players[0];
    if (player === undefined) throw new Error('Joueur de test absent.');
    player.position = { x: 1_000, y: 700 };
    const before = { ...player.position };
    simulation.spawnMonster('frosty', { ...player.position });

    simulation.step({ 'player-1': input(1) });

    expect(player.hostileSlowRemainingMs).toBe(HOSTILE_SLOW_DURATION_MS);
    expect(player.position).toEqual(before);
  });

  it('borne le sabotage du Super Pilleur à moins de 30 % de 1 200 ticks', () => {
    const simulation = new TowerSimulation('torri-super-looter-probe');
    simulation.start();
    const state = internals(simulation);
    const turret = state.turrets.find((candidate) => candidate.dir === 'E');
    if (turret === undefined) throw new Error('Tourelle Est absente.');
    // La tourelle reste vivante mais ne tire pas d'elle-même : la sonde isole l'indisponibilité
    // induite par le sabotage, sans compter sa cadence de tir normale.
    turret.hp = 1_000_000;
    turret.maxHp = 1_000_000;
    turret.range = -100;
    const id = simulation.spawnMonster('super-looter', { x: 300, y: 0 });
    const superLooter = state.monsters.find((monster) => monster.id === id);
    if (superLooter === undefined) throw new Error('Super Pilleur absent.');
    superLooter.hp = 1_000_000;
    superLooter.maxHp = 1_000_000;

    let unavailableTicks = 0;
    let maximumRetreatMs = 0;
    for (let tick = 1; tick <= 1_200; tick += 1) {
      simulation.step({ 'player-1': input(tick) });
      if (
        superLooter.abilityUses > 0 &&
        (turret.fireCooldownRemaining > 0 || turret.energy < TURRET.energyPerShot)
      ) {
        unavailableTicks += 1;
      }
      maximumRetreatMs = Math.max(maximumRetreatMs, superLooter.retreatRemainingMs);
    }

    expect(superLooter.abilityUses).toBe(1);
    expect(maximumRetreatMs).toBe(3_000);
    expect(unavailableTicks / 1_200).toBeLessThan(0.3);
  });

  it('fait copier au Truand un effet positif du joueur, sans lire les buffs d’un allié monstre', () => {
    const simulation = new TowerSimulation('torri-thug-player-copy');
    simulation.start();
    const state = internals(simulation);
    const player = state.players[0];
    if (player === undefined) throw new Error('Joueur de test absent.');
    player.position = { x: 1_100, y: 0 };
    const thugId = simulation.spawnMonster('thug', { x: 1_000, y: 0 });
    const allyId = simulation.spawnMonster('protector', { x: 1_020, y: 0 });
    const thug = state.monsters.find((monster) => monster.id === thugId);
    const ally = state.monsters.find((monster) => monster.id === allyId);
    if (thug === undefined || ally === undefined) throw new Error('Monstres de test absents.');
    thug.abilityCooldownRemainingMs = 0;
    ally.shieldHp = ally.maxHp;

    for (let tick = 1; tick <= 12; tick += 1) {
      simulation.step({ 'player-1': input(tick) });
    }
    expect(thug.shieldHp).toBe(0);
    expect(thug.supportBuffRemainingMs).toBe(0);

    const playerDamage = player.bulletDamage + 1;
    player.bulletDamage = playerDamage;
    thug.abilityCooldownRemainingMs = 0;
    thug.abilityTelegraphRemainingMs = 0;
    for (let tick = 13; tick <= 24; tick += 1) {
      simulation.step({ 'player-1': input(tick) });
    }

    expect(player.bulletDamage).toBe(playerDamage);
    expect(thug.supportBuffRemainingMs).toBeGreaterThan(0);
  });

  it('fait viser au Pilleur la structure vivante au plus faible pourcentage de PV', () => {
    const simulation = new TowerSimulation('torri-looter-wounded-structure');
    simulation.start();
    const state = internals(simulation);
    const looterId = simulation.spawnMonster('looter', { x: 0, y: 0 });
    const looter = state.monsters.find((monster) => monster.id === looterId);
    const north = state.turrets.find((turret) => turret.dir === 'N');
    const east = state.turrets.find((turret) => turret.dir === 'E');
    if (looter === undefined || north === undefined || east === undefined) {
      throw new Error('Cibles de structure absentes.');
    }
    north.hp = north.maxHp;
    east.hp = east.maxHp * 0.2;

    expect(state.findMonsterTarget(looter)).toEqual(east.position);

    state.heart.hp = state.heart.maxHp * 0.1;
    expect(state.findMonsterTarget(looter)).toEqual({ x: 0, y: 0 });
  });

  it('plafonne les PV et dégâts d’une fusion de quarante Slimes comme son rayon', () => {
    const simulation = new TowerSimulation('torri-forty-slimes-merge-cap');
    simulation.start();
    const state = internals(simulation);
    for (let index = 0; index < 40; index += 1) {
      const id = simulation.spawnMonster('slime', { x: 900, y: 900 });
      const slime = state.monsters.find((monster) => monster.id === id);
      if (slime === undefined) throw new Error('Slime de test absent.');
      slime.behaviorElapsedMs = 900;
    }

    while (state.monsters.filter((monster) => monster.hp > 0).length > 1) {
      state.resolveMonsterMerges();
    }

    const survivor = state.monsters.find((monster) => monster.hp > 0);
    if (survivor === undefined) throw new Error('Aucun Slime fusionné survivant.');
    expect(survivor.maxHp).toBeLessThanOrEqual(Math.round(MONSTERS.slime.hp * 1.6));
    expect(survivor.contactDamage).toBeLessThanOrEqual(
      Math.round(MONSTERS.slime.contactDamage * 1.6),
    );
    expect(survivor.radius).toBeLessThanOrEqual(MONSTERS.slime.radius * 1.6);
  });

  it('télégraphie une attaque à distance avant de toucher le joueur', () => {
    const simulation = new TowerSimulation('torri-ranged-telegraph');
    simulation.start();
    const player = internals(simulation).players[0];
    if (player === undefined) throw new Error('Joueur de test absent.');
    player.position = { x: 250, y: 0 };
    simulation.spawnMonster('sniper', { x: 0, y: 0 });

    let sawTelegraph = false;
    for (let tick = 1; tick <= 90; tick += 1) {
      simulation.step({ 'player-1': input(tick) });
      sawTelegraph ||= simulation
        .createSnapshot()
        .monsters.some(
          (monster) => monster.kind === 'sniper' && monster.ability?.kind === 'ranged',
        );
    }

    expect(sawTelegraph).toBe(true);
    expect(player.hp).toBeLessThan(player.maxHp);
  });

  it('invoque des unités avec un plafond et divise les monstres à leur mort', () => {
    const summoning = new TowerSimulation('torri-summon');
    summoning.start();
    const summoningPlayer = internals(summoning).players[0];
    if (summoningPlayer === undefined) throw new Error('Joueur de test absent.');
    summoningPlayer.position = { x: 700, y: 500 };
    summoning.spawnMonster('summoner', { x: 500, y: 500 });
    for (let tick = 1; tick <= 70; tick += 1) {
      summoning.step({ 'player-1': input(tick) });
    }
    expect(
      summoning.createSnapshot().monsters.filter((monster) => monster.kind === 'skeleton-small')
        .length,
    ).toBeGreaterThanOrEqual(2);

    const splitting = new TowerSimulation('torri-split');
    splitting.start();
    splitting.spawnMonster('skeleton-medium', { x: 500, y: 500 });
    const parent = spawned(splitting, 'skeleton-medium');
    internals(splitting).damageMonster(parent, parent.maxHp * 10, undefined);
    splitting.step({ 'player-1': input(1) });
    expect(
      splitting.createSnapshot().monsters.filter((monster) => monster.kind === 'skeleton-small'),
    ).toHaveLength(2);
  });

  it('accorde une seule résurrection native à la momie', () => {
    const simulation = new TowerSimulation('torri-revive');
    simulation.start();
    simulation.spawnMonster('mummy', { x: 500, y: 500 });
    const mummy = spawned(simulation, 'mummy');

    expect(internals(simulation).damageMonster(mummy, mummy.maxHp * 10, undefined)).toBe(true);
    expect(mummy.hp).toBeGreaterThan(0);
    expect(mummy.reviveCount).toBe(1);

    expect(internals(simulation).damageMonster(mummy, mummy.maxHp * 10, undefined)).toBe(true);
    expect(mummy.hp).toBe(0);
  });

  it('projette les zones persistantes et les boucliers dans le snapshot serveur', () => {
    const zones = new TowerSimulation('torri-persistent-zones');
    zones.start();
    const player = internals(zones).players[0];
    if (player === undefined) throw new Error('Joueur de test absent.');
    player.position = { x: 250, y: 0 };
    zones.spawnMonster('scorpion', { x: 0, y: 0 });
    for (let tick = 1; tick <= 80; tick += 1) {
      zones.step({ 'player-1': input(tick) });
    }
    expect(zones.createSnapshot().monsterZones.some((zone) => zone.kind === 'poison')).toBe(true);

    const shields = new TowerSimulation('torri-shields');
    shields.start();
    shields.spawnMonster('protector', { x: 900, y: 900 });
    shields.spawnMonster('slime', { x: 930, y: 900 });
    for (let tick = 1; tick <= 65; tick += 1) {
      shields.step({ 'player-1': input(tick) });
    }
    expect(
      shields.createSnapshot().monsters.some((monster) => monster.shieldRatio !== undefined),
    ).toBe(true);
  });

  it('reste strictement déterministe avec mouvements, invocations et télégraphes', () => {
    const first = new TowerSimulation('torri-abilities-determinism', {
      playerIds: ['alpha', 'bravo'],
    });
    const second = new TowerSimulation('torri-abilities-determinism', {
      playerIds: ['alpha', 'bravo'],
    });
    first.start();
    second.start();
    const roster: readonly TowerMonsterKind[] = [
      'goblin',
      'wolf',
      'sniper',
      'summoner',
      'healer',
      'super-looter',
      'ancient-guardian',
    ];
    roster.forEach((kind, index) => {
      const position = { x: 350 + index * 45, y: 280 - index * 30 };
      first.spawnMonster(kind, position);
      second.spawnMonster(kind, position);
    });

    for (let tick = 1; tick <= 240; tick += 1) {
      const inputs = { alpha: input(tick), bravo: input(tick) };
      first.step(inputs);
      second.step(inputs);
      expect(second.createSnapshot()).toEqual(first.createSnapshot());
    }
  });

  it('reste strictement déterministe sur 1 000 ticks avec zones, invocation, fusion et résurrection', () => {
    const first = new TowerSimulation('torri-thousand-tick-determinism', {
      playerIds: ['alpha', 'bravo'],
    });
    const second = new TowerSimulation('torri-thousand-tick-determinism', {
      playerIds: ['alpha', 'bravo'],
    });
    const setup = (simulation: TowerSimulation): readonly [string, string] => {
      simulation.start();
      const state = internals(simulation);
      state.heart.hp = state.heart.maxHp = 1_000_000_000;
      for (const [index, player] of state.players.entries()) {
        player.hp = player.maxHp = 1_000_000_000;
        player.position = { x: 210 + index * 30, y: 0 };
      }
      simulation.spawnMonster('scorpion', { x: 0, y: 0 });
      simulation.spawnMonster('summoner', { x: 80, y: 0 });
      const firstSlime = simulation.spawnMonster('slime', { x: 900, y: 0 });
      const secondSlime = simulation.spawnMonster('slime', { x: 900, y: 0 });
      for (const id of [firstSlime, secondSlime]) {
        const slime = state.monsters.find((monster) => monster.id === id);
        if (slime === undefined) throw new Error('Le harnais requiert deux Slimes.');
        slime.behaviorElapsedMs = 900;
      }
      simulation.spawnMonster('mummy', { x: 1_200, y: 0 });
      const mummy = spawned(simulation, 'mummy');
      state.damageMonster(mummy, mummy.maxHp * 10, undefined);
      expect(mummy.reviveCount).toBe(1);
      return [firstSlime, secondSlime];
    };

    const firstSlimeIds = setup(first);
    const secondSlimeIds = setup(second);
    expect(secondSlimeIds).toEqual(firstSlimeIds);
    let sawPoisonZone = false;
    let sawSummonedChild = false;
    let sawMergedSlimes = false;

    for (let tick = 1; tick <= 1_000; tick += 1) {
      const horizontal = tick % 20 < 10 ? 1 : -1;
      const inputs = {
        alpha: { ...input(tick), moveX: horizontal, aimX: 1 },
        bravo: { ...input(tick), moveX: -horizontal, aimX: -1 },
      };
      first.step(inputs);
      second.step(inputs);
      const firstState = first.createSnapshot();
      sawPoisonZone ||= firstState.monsterZones.some((zone) => zone.kind === 'poison');
      sawSummonedChild ||= firstState.monsters.some((monster) => monster.kind === 'skeleton-small');
      sawMergedSlimes ||=
        firstState.monsters.filter((monster) => firstSlimeIds.includes(monster.id)).length === 1;
      expect(second.createSnapshot()).toEqual(firstState);
    }

    expect(sawPoisonZone).toBe(true);
    expect(sawSummonedChild).toBe(true);
    expect(sawMergedSlimes).toBe(true);
  });

  it('borne des vagues naturelles à dix joueurs et mesure le tick au plafond', () => {
    const playerIds = Array.from({ length: 10 }, (_, index) => `player-${index + 1}`);
    const simulation = new TowerSimulation('torri-ten-player-density', { playerIds });
    simulation.start();
    const state = internals(simulation);
    // Le harnais ne crée aucun monstre : il garde seulement les cibles vivantes pour que
    // les vagues naturelles atteignent puis dépassent réellement le plafond coopératif.
    state.heart.hp = state.heart.maxHp = 1_000_000_000;
    for (const player of state.players) player.hp = player.maxHp = 1_000_000_000;
    const inputs = (sequence: number) =>
      Object.fromEntries(playerIds.map((id) => [id, input(sequence)]));

    const WARMUP_TICKS = 6_000;
    const MEASURED_TICKS = 600;
    for (let tick = 1; tick <= WARMUP_TICKS; tick += 1) {
      simulation.step(inputs(tick));
    }
    const saturated = simulation.createSnapshot();
    const startedAt = Date.now();
    for (let tick = WARMUP_TICKS + 1; tick <= WARMUP_TICKS + MEASURED_TICKS; tick += 1) {
      simulation.step(inputs(tick));
    }
    const microsecondsPerTick = ((Date.now() - startedAt) * 1_000) / MEASURED_TICKS;
    const snapshot = simulation.createSnapshot();

    expect(snapshot.players).toHaveLength(10);
    expect(saturated.wave).toBeGreaterThanOrEqual(30);
    expect(saturated.monsters.filter((monster) => monster.hp > 0)).toHaveLength(160);
    expect(snapshot.wave).toBeGreaterThanOrEqual(33);
    expect(snapshot.monsters.filter((monster) => monster.hp > 0).length).toBeLessThanOrEqual(160);
    expect(snapshot.monsterZones.length).toBeLessThanOrEqual(48);
    expect(
      snapshot.monsters.every(
        (monster) => Number.isFinite(monster.position.x) && Number.isFinite(monster.position.y),
      ),
    ).toBe(true);
    // Sonde locale : 558 µs/tick après saturation. 1 500 µs conserve une marge de
    // charge tout en détectant une dégradation nette du plafond réel.
    expect(microsecondsPerTick).toBeLessThan(1_500);
  }, 15_000);
});
