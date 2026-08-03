import type { TowerMonsterAffinity, TowerMonsterTrait } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { TowerSimulation } from '../src/tower/index.js';
import {
  MONSTER_AFFINITY_TRAITS,
  MONSTER_RARITY_MODIFIERS,
  MONSTERS,
  WAVE,
} from '../src/tower/tuning.js';

type WaveInternals = {
  spawnWave(): void;
};

function spawnWaves(simulation: TowerSimulation, count: number): void {
  const internals = simulation as unknown as WaveInternals;
  for (let wave = 0; wave < count; wave += 1) {
    internals.spawnWave();
  }
}

describe('Tower deterministic living world', () => {
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

  it('ajoute exactement un boss hors budget à chaque cinquième vague', () => {
    const simulation = new TowerSimulation('living-boss-seed');
    spawnWaves(simulation, WAVE.bossEvery - 1);
    expect(
      simulation.createSnapshot().monsters.filter((monster) => monster.rarity === 'boss'),
    ).toHaveLength(0);

    spawnWaves(simulation, 1);
    const firstBosses = simulation
      .createSnapshot()
      .monsters.filter((monster) => monster.rarity === 'boss');
    expect(firstBosses).toHaveLength(1);
    expect(firstBosses[0]).toMatchObject({
      kind: WAVE.bossKind,
      trait: 'colossus',
      maxHp: Math.round(MONSTERS[WAVE.bossKind].hp * MONSTER_RARITY_MODIFIERS.boss.hp),
    });

    spawnWaves(simulation, WAVE.bossEvery);
    expect(
      simulation.createSnapshot().monsters.filter((monster) => monster.rarity === 'boss'),
    ).toHaveLength(2);
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
