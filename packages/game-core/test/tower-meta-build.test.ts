import { describe, expect, it } from 'vitest';

import { TowerSimulation } from '../src/tower/index.js';

describe('Tower meta-build effects', () => {
  it('keeps the neutral build identical to the original starting state', () => {
    const baseline = new TowerSimulation('meta-neutral');
    const explicitNeutral = new TowerSimulation('meta-neutral', {
      metaBuildsByPlayerId: { 'player-1': {} },
    });

    expect(explicitNeutral.createSnapshot()).toEqual(baseline.createSnapshot());
  });

  it('applies a bounded build only to its owner and uses the best shared heart bonus once', () => {
    const simulation = new TowerSimulation('meta-effects', {
      playerIds: ['alpha', 'bravo'],
      metaBuildsByPlayerId: {
        alpha: {
          damageMultiplier: 1.2,
          fireRateMultiplier: 1.1,
          maxHealthMultiplier: 1.25,
          heartMaxHealthMultiplier: 1.1,
        },
        bravo: { moveSpeedMultiplier: Number.POSITIVE_INFINITY, heartMaxHealthMultiplier: 1.05 },
      },
    });

    const state = simulation.createSnapshot();
    const alpha = state.players.find((player) => player.id === 'alpha');
    const bravo = state.players.find((player) => player.id === 'bravo');
    expect(alpha).toMatchObject({ maxHp: 375, bulletDamage: 18, fireRate: 0.4 / 1.1 });
    expect(bravo).toMatchObject({ maxHp: 300, bulletDamage: 15, fireRate: 0.4 });
    expect(state.heart.maxHp).toBe(1540);
  });
});
