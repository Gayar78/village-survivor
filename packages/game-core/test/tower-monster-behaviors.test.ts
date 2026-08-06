import { TOWER_NATURAL_MONSTERS, type TowerMonsterSignature } from '@village-survivor/content';
import type { TowerInput, TowerMonsterKind } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { HOSTILE_SLOW_DURATION_MS, TowerSimulation } from '../src/tower/index.js';
import { monsterBehaviorProfile } from '../src/tower/monster-behaviors.js';
import type { MutableTowerMonster, MutableTowerPlayer, MutableTurret } from '../src/tower/state.js';
import { TURRET } from '../src/tower/tuning.js';

const input = (sequence: number): TowerInput => ({
  sequence,
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
});

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
      const profile = monsterBehaviorProfile(monster.signature as TowerMonsterSignature);
      expect(isInertMonsterProfile(profile), `${monster.id} (${monster.signature})`).toBe(false);
    }
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

  it('tÃ©lÃ©graphie une attaque Ã  distance avant de toucher le joueur', () => {
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

  it('invoque des unitÃ©s avec un plafond et divise les monstres Ã  leur mort', () => {
    const summoning = new TowerSimulation('torri-summon');
    summoning.start();
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

  it('accorde une seule rÃ©surrection native Ã  la momie', () => {
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

  it('reste strictement dÃ©terministe avec mouvements, invocations et tÃ©lÃ©graphes', () => {
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
