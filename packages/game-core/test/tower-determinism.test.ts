import type { TowerInput } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { TowerSimulation } from '../src/index.js';

function input(sequence: number, overrides: Partial<TowerInput> = {}): TowerInput {
  return {
    sequence,
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    ...overrides,
  };
}

describe('Tower simulation determinism', () => {
  it('keeps two same-seed simulations identical through movement, combat, weapons and upgrades', () => {
    const roster = ['alpha', 'bravo'] as const;
    const first = new TowerSimulation('authoritative-parity-seed', { playerIds: roster });
    const second = new TowerSimulation('authoritative-parity-seed', { playerIds: roster });
    first.start();
    second.start();

    // Identical deterministic setup exercises the upgrade RNG before the tick stream.
    for (const simulation of [first, second]) {
      simulation.giveExperience('alpha', 70);
      for (let index = 0; index < 10; index += 1) {
        simulation.spawnMonster('runner', { x: 430 + index * 3, y: 90 });
      }
    }

    const upgradeOfferId = first.createSnapshot().players[0]?.upgradeChoices[0]?.offerId;
    expect(upgradeOfferId).toBeDefined();
    expect(second.createSnapshot().players[0]?.upgradeChoices[0]?.offerId).toBe(upgradeOfferId);

    const checkpoints = new Set([1, 40, 120, 200, 260, 320]);
    let attemptedTurretUpgrade = false;
    for (let tick = 1; tick <= 320; tick += 1) {
      const state = first.createSnapshot();
      const alpha = state.players.find((player) => player.id === 'alpha');
      const eastTurret = state.turrets.find((turret) => turret.dir === 'E');
      if (alpha === undefined || eastTurret === undefined) {
        throw new Error('Expected authoritative player and east turret.');
      }

      const targetMonster = state.monsters[0];
      const canBuyRange = state.scrapFund >= 8;
      const moveTarget = canBuyRange
        ? eastTurret.position
        : (state.scraps[0]?.position ?? { x: 430, y: 90 });
      const alphaInput = input(tick, {
        moveX: moveTarget.x - alpha.position.x,
        moveY: moveTarget.y - alpha.position.y,
        aimX: (targetMonster?.position.x ?? 430) - alpha.position.x,
        aimY: (targetMonster?.position.y ?? 90) - alpha.position.y,
        fire: true,
        ...(tick === 1 && upgradeOfferId !== undefined
          ? { selectUpgradeId: upgradeOfferId }
          : tick === 2
            ? { selectUpgradeId: 'weapon:shotgun' }
            : {}),
        ...(canBuyRange ? { turretShop: { turret: 'E' as const, action: 'range' } } : {}),
      });
      if (canBuyRange) {
        attemptedTurretUpgrade = true;
      }
      const bravoInput = input(tick, {
        moveX: tick % 80 < 40 ? 1 : -1,
        moveY: tick % 100 < 50 ? -0.5 : 0.5,
        aimX: -1,
        aimY: tick % 60 < 30 ? 0.25 : -0.25,
        fire: tick % 3 !== 0,
        ...(tick === 3 ? { selectUpgradeId: 'weapon:marksman' } : {}),
      });
      const tickInputs = { alpha: alphaInput, bravo: bravoInput };

      first.step(tickInputs);
      second.step(tickInputs);

      if (checkpoints.has(tick)) {
        const firstState = first.createSnapshot();
        const secondState = second.createSnapshot();
        expect(secondState).toEqual(firstState);
      }
    }

    const finalState = first.createSnapshot();
    expect(finalState.tick).toBe(320);
    expect(finalState.players.find((player) => player.id === 'alpha')?.level).toBeGreaterThan(1);
    expect(finalState.players.find((player) => player.id === 'alpha')?.activeWeaponId).toBe(
      'shotgun',
    );
    expect(finalState.players.find((player) => player.id === 'bravo')?.activeWeaponId).toBe(
      'marksman',
    );
    expect(attemptedTurretUpgrade).toBe(true);
    expect(finalState.turrets.find((turret) => turret.dir === 'E')?.range).toBeGreaterThan(320);
  });
});
