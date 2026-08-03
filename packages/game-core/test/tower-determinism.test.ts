import type { TowerGameState, TowerInput } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { createTowerStateFingerprint, TowerSimulation } from '../src/index.js';

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

/** Rebuilds every object in reverse key order without changing its values. */
function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reverseObjectKeys);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, child]) => [key, reverseObjectKeys(child)]),
    );
  }
  return value;
}

describe('Tower lockstep determinism', () => {
  it('fingerprints the complete public state independently of object key order', () => {
    const simulation = new TowerSimulation('fingerprint-seed', {
      playerIds: ['alpha', 'bravo'],
    });
    simulation.start();
    simulation.spawnMonster('runner', { x: 420, y: 80 });
    simulation.step({
      alpha: input(1, { aimX: 1, fire: true }),
      bravo: input(1, { moveX: -1, aimY: -1, fire: true }),
    });

    const state = simulation.createSnapshot();
    const reordered = reverseObjectKeys(state) as TowerGameState;
    expect(createTowerStateFingerprint(reordered)).toBe(createTowerStateFingerprint(state));

    const changed = { ...state, scrapFund: state.scrapFund + 1 };
    expect(createTowerStateFingerprint(changed)).not.toBe(createTowerStateFingerprint(state));
    expect(createTowerStateFingerprint(state)).toMatch(/^tower-v1:[0-9a-f]{16}$/);
    // Vecteur de référence. Il est calculé sur un état de simulation réel : il change donc aussi
    // bien si la canonicalisation ou le hachage évoluent — ce qui exigerait un passage en
    // `tower-v2` — que si les valeurs produites par la simulation changent. Seul le premier cas
    // est une régression ; le second est une mise à jour légitime, à faire en connaissance de
    // cause.
    //
    // Mis à jour le 1er août 2026 : le passage à une arithmétique exactement reproductible a
    // modifié les valeurs numériques de la simulation. Les tourelles, notamment, sont désormais
    // à des coordonnées exactement nulles là où `Math.cos(-π/2) * 240` donnait 1,47e-14.
    expect(createTowerStateFingerprint(state)).toBe('tower-v1:327a9b83a38acca3');
  });

  it('keeps two same-seed simulations identical through movement, combat, weapons and upgrades', () => {
    const roster = ['alpha', 'bravo'] as const;
    const first = new TowerSimulation('lockstep-parity-seed', { playerIds: roster });
    const second = new TowerSimulation('lockstep-parity-seed', { playerIds: roster });
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
        throw new Error('Expected lockstep player and east turret.');
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
        expect(createTowerStateFingerprint(firstState)).toBe(
          createTowerStateFingerprint(secondState),
        );
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
