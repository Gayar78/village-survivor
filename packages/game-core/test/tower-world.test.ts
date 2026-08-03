import type {
  TowerMonsterAffinity,
  TowerMonsterKind,
  TowerMonsterTrait,
} from '@village-survivor/protocol';
import { TOWER_MONSTER_CATALOG } from '@village-survivor/content';
import { describe, expect, it } from 'vitest';

import { createTowerStateFingerprint, TowerSimulation } from '../src/tower/index.js';
import {
  MONSTER_AFFINITY_TRAITS,
  MONSTER_RARITY_MODIFIERS,
  MONSTERS,
  minimumWaveForMonster,
  WAVE,
  WAVE_BOSS_SCHEDULE,
  WAVE_MONSTER_COST,
  WAVE_PROGRESSION_STAGES,
  WAVE_RARITY_RULES,
  waveProgressionStage,
  waveThreatLimit,
} from '../src/tower/tuning.js';

type WaveInternals = {
  wave: number;
  spawnWave(): void;
  eligibleIncursionWaveKinds(): TowerMonsterKind[];
};

function spawnWaves(simulation: TowerSimulation, count: number): void {
  const internals = simulation as unknown as WaveInternals;
  for (let wave = 0; wave < count; wave += 1) {
    internals.spawnWave();
  }
}

describe('Tower deterministic living world', () => {
  it('remplace les monstres génériques par la première incursion Forêt/Grottes', () => {
    const simulation = new TowerSimulation('torri-first-incursion');
    spawnWaves(simulation, 3);
    const monsters = simulation.createSnapshot().monsters;
    const catalog = new Map(TOWER_MONSTER_CATALOG.map((monster) => [monster.id, monster]));

    expect(monsters.length).toBeGreaterThan(0);
    expect(
      monsters.every(
        (monster) => !['chaser', 'runner', 'brute', 'time-deer'].includes(monster.kind),
      ),
    ).toBe(true);
    expect(
      monsters.every((monster) => {
        const faction = catalog.get(monster.kind)?.faction;
        return faction === 'forest' || faction === 'cave';
      }),
    ).toBe(true);
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
    spawnWaves(simulation, 8);
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

  it('applique les six paliers validés sans laisser une mécanique dangereuse les contourner', () => {
    expect(WAVE_PROGRESSION_STAGES.map((stage) => stage.minimumWave)).toEqual([
      1, 6, 11, 16, 21, 26, 31,
    ]);
    expect(WAVE_RARITY_RULES.map((rule) => rule.minimumWave)).toEqual([1, 6, 16, 26]);
    expect(minimumWaveForMonster('slime')).toBe(1);
    expect(minimumWaveForMonster('shooter')).toBe(6);
    expect(minimumWaveForMonster('healer')).toBe(11);
    expect(minimumWaveForMonster('summoner')).toBe(16);
    expect(minimumWaveForMonster('mummy')).toBe(21);
    expect(minimumWaveForMonster('spider-queen')).toBe(26);
    expect(minimumWaveForMonster('ancient-guardian')).toBe(31);

    const simulation = new TowerSimulation('thirty-wave-progression');
    const internals = simulation as unknown as WaveInternals;
    for (const wave of [1, 5, 6, 10, 11, 15, 16, 20, 21, 25, 26, 30]) {
      internals.wave = wave;
      const stage = waveProgressionStage(wave);
      const eligible = internals.eligibleIncursionWaveKinds();
      expect(eligible.length).toBeGreaterThan(0);
      expect(
        eligible.every(
          (kind) =>
            minimumWaveForMonster(kind) <= wave &&
            WAVE_MONSTER_COST[kind] <= stage.maximumThreatCost,
        ),
      ).toBe(true);
    }
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

  it('commence les boss en vague 10 puis augmente leur puissance jusqu’au Gardien', () => {
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
        MONSTERS[firstDefinition?.kind ?? 'thug'].hp *
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
  });

  it('conserve une parité lockstep complète avec les mêmes seed et vagues', () => {
    const first = new TowerSimulation('living-lockstep-seed', {
      playerIds: ['alpha', 'bravo'],
    });
    const second = new TowerSimulation('living-lockstep-seed', {
      playerIds: ['alpha', 'bravo'],
    });

    for (let wave = 1; wave <= 12; wave += 1) {
      spawnWaves(first, 1);
      spawnWaves(second, 1);
      expect(second.createSnapshot()).toEqual(first.createSnapshot());
      expect(createTowerStateFingerprint(second.createSnapshot())).toBe(
        createTowerStateFingerprint(first.createSnapshot()),
      );
    }
  });
});
