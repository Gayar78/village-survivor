import type {
  TowerMonsterAffinity,
  TowerMonsterKind,
  TowerMonsterTrait,
} from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { TowerSimulation } from '../src/tower/index.js';
import {
  MONSTER_AFFINITY_TRAITS,
  MONSTER_RARITY_MODIFIERS,
  MONSTERS,
  minimumDistinctMonsterKindsForWave,
  minimumWaveForMonster,
  monsterPowerTier,
  TOWER_MONSTER_POWER_TIERS,
  WAVE,
  WAVE_BOSS_SCHEDULE,
  WAVE_COMPOSITION_STAGES,
  WAVE_MONSTER_COST,
  WAVE_PROGRESSION_STAGES,
  WAVE_RARITY_RULES,
  wavePowerMix,
  waveProgressionStage,
  waveThreatLimit,
} from '../src/tower/tuning.js';

type WaveInternals = {
  elapsedMs: number;
  wave: number;
  spawnWave(): void;
  eligibleProgressionWaveKinds(): TowerMonsterKind[];
};

function spawnWaves(simulation: TowerSimulation, count: number): void {
  const internals = simulation as unknown as WaveInternals;
  for (let wave = 0; wave < count; wave += 1) {
    internals.spawnWave();
  }
}

describe('Tower deterministic living world', () => {
  it('offre plusieurs monstres faibles différents dès la première vague', () => {
    const simulation = new TowerSimulation('torri-first-wave-variety');
    spawnWaves(simulation, 1);
    const monsters = simulation.createSnapshot().monsters;

    expect(monsters.length).toBeGreaterThan(0);
    expect(new Set(monsters.map((monster) => monster.kind)).size).toBeGreaterThanOrEqual(2);
    expect(monsters.every((monster) => !['chaser', 'runner', 'brute'].includes(monster.kind))).toBe(
      true,
    );
    expect(monsters.every((monster) => WAVE_MONSTER_COST[monster.kind] <= 3)).toBe(true);
  });

  it('choisit le biome depuis seed/vague, le garde trois vagues puis garantit une transition', () => {
    const first = new TowerSimulation('living-biome-seed');
    const second = new TowerSimulation('living-biome-seed');

    const initial = first.createSnapshot().biome;
    expect(second.createSnapshot().biome).toEqual(initial);
    expect(initial).toMatchObject({ cycle: 0, startsAtWave: 1, durationWaves: 3 });

    spawnWaves(first, 3);
    spawnWaves(second, 3);
    expect(first.createSnapshot().biome).toEqual(initial);
    expect(second.createSnapshot().biome).toEqual(initial);

    spawnWaves(first, 1);
    spawnWaves(second, 1);
    const next = first.createSnapshot().biome;
    expect(next).toMatchObject({ cycle: 1, startsAtWave: 4, durationWaves: 3 });
    expect(next.id).not.toBe(initial.id);
    expect(second.createSnapshot().biome).toEqual(next);
  });

  it('attribue à chaque monstre une rareté, une affinité et un trait cohérents', () => {
    const simulation = new TowerSimulation('living-monster-seed');
    spawnWaves(simulation, 20);
    const monsters = simulation.createSnapshot().monsters;
    const ordinary = monsters.filter((monster) => monster.rarity !== 'boss');

    expect(ordinary.length).toBeGreaterThan(0);
    expect(ordinary.some((monster) => monster.rarity !== 'common')).toBe(true);
    for (const monster of ordinary) {
      const expectedTrait: Readonly<Record<TowerMonsterAffinity, TowerMonsterTrait>> =
        MONSTER_AFFINITY_TRAITS;
      const modifiers = MONSTER_RARITY_MODIFIERS[monster.rarity];
      expect(monster.trait).toBe(expectedTrait[monster.affinity]);
      expect(monster.maxHp).toBe(Math.round(MONSTERS[monster.kind].hp * modifiers.hp));
      expect(monster.radius).toBeCloseTo(MONSTERS[monster.kind].radius * modifiers.radius);
    }
  });

  it('étale les déblocages sur cent vagues sans laisser une mécanique les contourner', () => {
    expect(WAVE_PROGRESSION_STAGES.map((stage) => stage.minimumWave)).toEqual([
      1, 11, 26, 41, 56, 71, 86, 101,
    ]);
    expect(WAVE_RARITY_RULES.map((rule) => rule.minimumWave)).toEqual([1, 11, 41, 71]);
    expect(minimumWaveForMonster('slime')).toBe(1);
    expect(minimumWaveForMonster('shooter')).toBe(11);
    expect(minimumWaveForMonster('healer')).toBe(26);
    expect(minimumWaveForMonster('summoner')).toBe(41);
    expect(minimumWaveForMonster('mummy')).toBe(56);
    expect(minimumWaveForMonster('polar-bear')).toBe(71);
    expect(minimumWaveForMonster('spider-queen')).toBe(86);
    expect(minimumWaveForMonster('siege-engine')).toBe(86);
    expect(minimumWaveForMonster('ancient-guardian')).toBe(101);

    const simulation = new TowerSimulation('hundred-wave-progression');
    const internals = simulation as unknown as WaveInternals;
    let previousPool = new Set<TowerMonsterKind>();
    for (const wave of [1, 10, 11, 25, 26, 40, 41, 55, 56, 70, 71, 85, 86, 100]) {
      internals.wave = wave;
      const stage = waveProgressionStage(wave);
      const eligible = internals.eligibleProgressionWaveKinds();
      expect(eligible.length).toBeGreaterThan(0);
      expect(
        eligible.every(
          (kind) =>
            minimumWaveForMonster(kind) <= wave &&
            WAVE_MONSTER_COST[kind] <= stage.maximumThreatCost,
        ),
      ).toBe(true);
      expect([...previousPool].every((kind) => eligible.includes(kind))).toBe(true);
      previousPool = new Set(eligible);
    }
    expect(previousPool.size).toBeGreaterThan(60);
  });

  it('conserve une part de faibles tout en enrichissant chaque composition', () => {
    expect(WAVE_COMPOSITION_STAGES.map((stage) => stage.minimumWave)).toEqual([
      1, 11, 26, 41, 56, 71, 86,
    ]);
    for (const stage of WAVE_COMPOSITION_STAGES) {
      expect(
        TOWER_MONSTER_POWER_TIERS.reduce((total, tier) => total + stage.mix[tier], 0),
      ).toBeCloseTo(1);
      expect(stage.mix.weak).toBeGreaterThan(0);
    }
    expect(wavePowerMix(1)).toMatchObject({ weak: 1, elite: 0 });
    expect(wavePowerMix(100)).toMatchObject({ weak: 0.25, elite: 0.18 });
    expect(minimumDistinctMonsterKindsForWave(1)).toBe(2);
    expect(minimumDistinctMonsterKindsForWave(20)).toBe(3);
    expect(minimumDistinctMonsterKindsForWave(40)).toBe(4);
    expect(minimumDistinctMonsterKindsForWave(100)).toBe(5);

    const simulation = new TowerSimulation('late-cumulative-variety');
    const internals = simulation as unknown as WaveInternals;
    internals.wave = 85;
    internals.elapsedMs = 1_000_000;
    internals.spawnWave();
    const monsters = simulation
      .createSnapshot()
      .monsters.filter((monster) => monster.rarity !== 'boss');
    const costs = monsters.map((monster) => WAVE_MONSTER_COST[monster.kind]);
    expect(new Set(monsters.map((monster) => monster.kind)).size).toBeGreaterThanOrEqual(5);
    expect(costs.some((cost) => monsterPowerTier(cost) === 'weak')).toBe(true);
    expect(costs.some((cost) => monsterPowerTier(cost) === 'elite')).toBe(true);
    expect(costs.filter((cost) => monsterPowerTier(cost) === 'weak').length).toBeGreaterThan(
      costs.filter((cost) => monsterPowerTier(cost) === 'elite').length,
    );
  });

  it('plafonne séparément les spécialistes, lourds et élites', () => {
    expect(waveThreatLimit(7, 1)).toBeUndefined();
    expect(waveThreatLimit(8, 1)).toMatchObject({
      band: 'specialist',
      maxSpawnedPerWave: 2,
      maxAlive: 4,
    });
    expect(waveThreatLimit(12, 1)).toMatchObject({
      band: 'heavy',
      maxSpawnedPerWave: 1,
      maxAlive: 2,
    });
    expect(waveThreatLimit(14, 1)).toMatchObject({
      band: 'elite',
      maxSpawnedPerWave: 1,
      maxAlive: 1,
    });
    expect(waveThreatLimit(14, 10)).toMatchObject({
      band: 'elite',
      maxSpawnedPerWave: 3,
      maxAlive: 3,
    });
  });

  it('place un boss appris tous les dix paliers et le Gardien à la vague 100', () => {
    const simulation = new TowerSimulation('living-boss-seed');
    spawnWaves(simulation, WAVE.firstBossWave - 1);
    expect(
      simulation.createSnapshot().monsters.filter((monster) => monster.rarity === 'boss'),
    ).toHaveLength(0);

    spawnWaves(simulation, 1);
    const firstDefinition = WAVE_BOSS_SCHEDULE[0];
    const firstBosses = simulation
      .createSnapshot()
      .monsters.filter((monster) => monster.rarity === 'boss');
    expect(firstBosses).toHaveLength(1);
    expect(firstBosses[0]).toMatchObject({
      kind: firstDefinition?.kind,
      trait: 'colossus',
      maxHp: Math.round(
        MONSTERS[firstDefinition?.kind ?? 'wolf'].hp *
          (firstDefinition?.powerScale ?? 1) *
          MONSTER_RARITY_MODIFIERS.boss.hp,
      ),
    });

    spawnWaves(simulation, WAVE.bossEvery);
    const bosses = simulation
      .createSnapshot()
      .monsters.filter((monster) => monster.rarity === 'boss');
    expect(bosses).toHaveLength(2);
    expect(bosses[1]?.kind).toBe(WAVE_BOSS_SCHEDULE[1]?.kind);

    expect(WAVE_BOSS_SCHEDULE.map((entry) => entry.wave)).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
    ]);
    expect(WAVE_BOSS_SCHEDULE.at(-1)?.kind).toBe('ancient-guardian');
  });

  it('conserve les multiplicateurs de boss rétablis après le lot Torri', () => {
    expect(MONSTER_RARITY_MODIFIERS.boss).toEqual({
      hp: 6,
      speed: 0.85,
      contactDamage: 2.25,
      radius: 1.5,
      reward: 12,
    });
  });

  it('conserve une parité complète avec les mêmes seed et vagues', () => {
    const first = new TowerSimulation('living-authoritative-seed', {
      playerIds: ['alpha', 'bravo'],
    });
    const second = new TowerSimulation('living-authoritative-seed', {
      playerIds: ['alpha', 'bravo'],
    });

    for (let wave = 1; wave <= 12; wave += 1) {
      spawnWaves(first, 1);
      spawnWaves(second, 1);
      expect(second.createSnapshot()).toEqual(first.createSnapshot());
    }
  });
});
