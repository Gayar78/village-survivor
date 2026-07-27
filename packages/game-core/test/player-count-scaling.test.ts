import { defaultContent } from '@village-survivor/content';
import { describe, expect, it } from 'vitest';

import { GameSimulation } from '../src/index.js';

/** Nombre total d'assaillants présents dans l'état courant de la simulation. */
function countEnemies(simulation: GameSimulation): number {
  return simulation.createSnapshot().enemies.length;
}

describe('GameSimulation playerCount scaling', () => {
  it('omitting options behaves exactly like playerCount = 1 (non-regression)', () => {
    const withoutOptions = new GameSimulation(defaultContent, 'scale-seed');
    const withExplicitDefault = new GameSimulation(defaultContent, 'scale-seed', {
      playerCount: 1,
    });
    withoutOptions.start();
    withExplicitDefault.start();
    withoutOptions.skipToNight();
    withExplicitDefault.skipToNight();

    expect(withoutOptions.createSnapshot()).toEqual(withExplicitDefault.createSnapshot());
  });

  it('spawns strictly more assailants on the first night wave as playerCount grows (same seed)', () => {
    const solo = new GameSimulation(defaultContent, 'scale-seed', { playerCount: 1 });
    const party = new GameSimulation(defaultContent, 'scale-seed', { playerCount: 5 });
    solo.start();
    party.start();

    const soloBeforeNight = countEnemies(solo);
    const partyBeforeNight = countEnemies(party);
    // La génération du monde (gardiens, dormeurs initiaux) ne dépend pas du
    // nombre de joueurs : seules les vagues d'assaillants sont renforcées.
    expect(partyBeforeNight).toBe(soloBeforeNight);

    solo.skipToNight();
    party.skipToNight();

    const soloSpawned = countEnemies(solo) - soloBeforeNight;
    const partySpawned = countEnemies(party) - partyBeforeNight;
    expect(soloSpawned).toBeGreaterThan(0);
    expect(partySpawned).toBeGreaterThan(soloSpawned);
  });

  it('scales the final wave assailant count with playerCount (same seed)', () => {
    const solo = new GameSimulation(defaultContent, 'scale-seed-final', { playerCount: 1 });
    const party = new GameSimulation(defaultContent, 'scale-seed-final', { playerCount: 8 });
    solo.start();
    party.start();

    const soloBefore = countEnemies(solo);
    const partyBefore = countEnemies(party);

    solo.forceFinalWave();
    party.forceFinalWave();

    const soloSpawned = countEnemies(solo) - soloBefore;
    const partySpawned = countEnemies(party) - partyBefore;
    expect(soloSpawned).toBeGreaterThan(0);
    expect(partySpawned).toBeGreaterThan(soloSpawned);
  });

  it('is deterministic: same seed and same playerCount always produce the same spawn count', () => {
    const first = new GameSimulation(defaultContent, 'scale-seed-determinism', { playerCount: 5 });
    const second = new GameSimulation(defaultContent, 'scale-seed-determinism', { playerCount: 5 });
    first.start();
    second.start();
    first.skipToNight();
    second.skipToNight();

    expect(first.createSnapshot()).toEqual(second.createSnapshot());
  });

  it('clamps playerCount to the [1, 10] range', () => {
    const outOfRange = new GameSimulation(defaultContent, 'scale-seed-clamp', {
      playerCount: 999,
    });
    const clampedEquivalent = new GameSimulation(defaultContent, 'scale-seed-clamp', {
      playerCount: 10,
    });
    outOfRange.start();
    clampedEquivalent.start();
    outOfRange.skipToNight();
    clampedEquivalent.skipToNight();

    expect(countEnemies(outOfRange)).toBe(countEnemies(clampedEquivalent));
  });
});
