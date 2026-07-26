import { defaultContent, type GameContent } from '@village-survivor/content';
import { describe, expect, it } from 'vitest';

import { GameSimulation } from '../src/index.js';

describe('reproducible simulation performance scenario', () => {
  it('simulates fifteen minutes with more than one hundred entities', () => {
    const benchmarkContent: GameContent = {
      ...defaultContent,
      player: { ...defaultContent.player, maxHp: 1_000_000 },
      village: { ...defaultContent.village, maxHp: 1_000_000 },
    };
    const simulation = new GameSimulation(benchmarkContent, 'benchmark-100-entities');
    simulation.start();
    for (let index = 0; index < 100; index += 1) {
      simulation.spawnEnemy('guardian');
    }

    const tickCount = (15 * 60 * 1_000) / benchmarkContent.simulation.tickMs;
    const startedAt = Date.now();
    for (let tick = 0; tick < tickCount; tick += 1) {
      simulation.step({ sequence: tick, moveX: 0, moveY: 0 });
    }
    const durationMs = Date.now() - startedAt;

    const snapshot = simulation.createSnapshot();
    expect(snapshot.tick).toBe(tickCount);
    expect(snapshot.enemies.length).toBeGreaterThan(100);
    expect(durationMs).toBeLessThan(2_000);

    const snapshotStartedAt = Date.now();
    for (let index = 0; index < 1_000; index += 1) {
      simulation.createSnapshot();
    }
    const snapshotDurationMs = Date.now() - snapshotStartedAt;
    expect(snapshotDurationMs).toBeLessThan(1_000);
  });
});
