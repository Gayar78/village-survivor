import {
  TOWER_MERCHANT_ROTATIONS,
  TOWER_SHARED_QUESTS,
  TOWER_TURRET_SUPER_MODULES,
} from '@village-survivor/content';
import type {
  TowerInput,
  TowerMonsterRarity,
  TowerSuperModuleId,
  TurretModuleId,
  Vector2,
} from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { TowerSimulation } from '../src/tower/index.js';

function input(overrides: Partial<TowerInput> = {}): TowerInput {
  return { sequence: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0, ...overrides };
}

type TestMonster = {
  id: string;
  hp: number;
  rarity: TowerMonsterRarity;
};

type TestTurret = {
  dir: 'N' | 'E' | 'S' | 'W';
  position: Vector2;
  fireRate: number;
  pierce: number;
  modules: TurretModuleId[];
};

type TestPlayer = { position: Vector2 };

type SimulationInternals = {
  scrapFund: number;
  players: TestPlayer[];
  turrets: TestTurret[];
  monsters: TestMonster[];
  damageMonster(monster: TestMonster, amount: number, killer: TestPlayer | undefined): boolean;
};

function access(simulation: TowerSimulation): SimulationInternals {
  return simulation as unknown as SimulationInternals;
}

function eastTurret(simulation: TowerSimulation): TestTurret {
  const turret = access(simulation).turrets.find((candidate) => candidate.dir === 'E');
  if (turret === undefined) {
    throw new Error('La tourelle Est est requise par ce scénario.');
  }
  return turret;
}

function movePlayerNearEastTurret(simulation: TowerSimulation): void {
  const state = access(simulation);
  const player = state.players[0];
  if (player === undefined) {
    throw new Error('Un joueur est requis par ce scénario.');
  }
  player.position = { ...eastTurret(simulation).position };
}

function killSpawnedMonster(
  simulation: TowerSimulation,
  rarity: TowerMonsterRarity = 'common',
): TestMonster {
  const id = simulation.spawnMonster('chaser', { x: 600, y: 600 });
  const state = access(simulation);
  const monster = state.monsters.find((candidate) => candidate.id === id);
  if (monster === undefined) {
    throw new Error(`Monstre de test absent : ${id}`);
  }
  monster.rarity = rarity;
  expect(state.damageMonster(monster, Number.MAX_SAFE_INTEGER, state.players[0])).toBe(true);
  return monster;
}

function buySuperModule(
  simulation: TowerSimulation,
  moduleId: TowerSuperModuleId,
  discreteActionId: string,
): void {
  simulation.step({
    'player-1': input({
      discreteActionId,
      turretShop: { turret: 'E', action: `module:${moduleId}` },
    }),
  });
}

describe('Tower shared quests and merchant', () => {
  it('projette la quête commune, progresse sur les kills et verse exactement une récompense', () => {
    const simulation = new TowerSimulation('shared-quest-rewards');
    simulation.start();

    expect(simulation.createSnapshot().sharedQuest).toEqual({
      rotationId: 0,
      id: 'cull-the-horde',
      objective: 'kill-monsters',
      progress: 0,
      target: 5,
      rewardScrap: 18,
      completedCount: 0,
    });

    for (let kill = 0; kill < 4; kill += 1) {
      killSpawnedMonster(simulation);
    }
    expect(simulation.createSnapshot().sharedQuest.progress).toBe(4);
    expect(simulation.createSnapshot().scraps).toHaveLength(4);
    expect(simulation.getScrapFund()).toBe(0);

    const completingMonster = killSpawnedMonster(simulation);
    const afterFirstQuest = simulation.createSnapshot();
    expect(afterFirstQuest.scrapFund).toBe(18);
    // Le cinquième tas vient du monstre ; la récompense de quête va directement au fonds.
    expect(afterFirstQuest.scraps).toHaveLength(5);
    expect(afterFirstQuest.sharedQuest).toEqual({
      rotationId: 1,
      id: 'elite-bounty',
      objective: 'kill-elite-or-boss',
      progress: 0,
      target: 1,
      rewardScrap: 25,
      completedCount: 1,
    });
    expect(afterFirstQuest.events.at(-1)).toMatchObject({
      type: 'quest-completed',
      amount: 18,
    });

    expect(
      access(simulation).damageMonster(
        completingMonster,
        Number.MAX_SAFE_INTEGER,
        access(simulation).players[0],
      ),
    ).toBe(false);
    expect(simulation.getScrapFund()).toBe(18);

    killSpawnedMonster(simulation, 'common');
    expect(simulation.createSnapshot().sharedQuest.progress).toBe(0);
    killSpawnedMonster(simulation, 'elite');
    expect(simulation.createSnapshot().sharedQuest).toMatchObject({
      rotationId: 0,
      id: 'cull-the-horde',
      progress: 0,
      completedCount: 2,
    });
    expect(simulation.getScrapFund()).toBe(43);
  });

  it('n’achète que les super-modules de la rotation courante, à proximité et une fois par id', () => {
    const simulation = new TowerSimulation('merchant-validation');
    simulation.start();
    const state = access(simulation);
    const turret = eastTurret(simulation);
    state.scrapFund = 200;
    movePlayerNearEastTurret(simulation);

    expect(simulation.createSnapshot().merchantShop).toEqual({
      rotationId: 0,
      offerIds: TOWER_MERCHANT_ROTATIONS[0],
    });

    buySuperModule(simulation, 'super-battery', 'off-rotation');
    expect(state.scrapFund).toBe(200);
    expect(turret.modules).toEqual([]);

    buySuperModule(simulation, 'super-overdrive', 'merchant-action-1');
    expect(turret.modules).toEqual(['super-overdrive']);
    expect(turret.fireRate).toBeCloseTo(1.2 * 0.65);
    expect(state.scrapFund).toBe(155);

    // Même id fiable, autre payload : l’action a déjà été consommée et ne dépense rien.
    buySuperModule(simulation, 'super-rail', 'merchant-action-1');
    expect(turret.modules).toEqual(['super-overdrive']);
    expect(state.scrapFund).toBe(155);

    const player = state.players[0];
    if (player === undefined) {
      throw new Error('Un joueur est requis par ce scénario.');
    }
    player.position = { x: 0, y: 0 };
    buySuperModule(simulation, 'super-rail', 'too-far');
    expect(state.scrapFund).toBe(155);

    movePlayerNearEastTurret(simulation);
    buySuperModule(simulation, 'super-rail', 'merchant-action-2');
    expect(turret.modules).toEqual(['super-overdrive', 'super-rail']);
    expect(turret.pierce).toBe(3);
    expect(state.scrapFund).toBe(105);

    simulation.step({
      'player-1': input({
        discreteActionId: 'malformed',
        turretShop: { turret: 'E', action: 'module:super-rail:extra' },
      }),
    });
    expect(state.scrapFund).toBe(105);
  });

  it('fait tourner les offres canoniques et reste identique pour seed et inputs égaux', () => {
    const first = new TowerSimulation('quests-merchant-authoritative');
    const second = new TowerSimulation('quests-merchant-authoritative');
    first.start();
    second.start();

    for (const simulation of [first, second]) {
      access(simulation).scrapFund = 200;
      movePlayerNearEastTurret(simulation);
      for (let kill = 0; kill < TOWER_SHARED_QUESTS[0]!.target; kill += 1) {
        killSpawnedMonster(simulation);
      }
    }

    for (let tick = 0; tick <= 200; tick += 1) {
      const tickInput = input({
        sequence: tick,
        ...(tick === 0
          ? {
              discreteActionId: 'authoritative-super-module',
              turretShop: { turret: 'E' as const, action: 'module:super-overdrive' },
            }
          : {}),
      });
      first.step({ 'player-1': tickInput });
      second.step({ 'player-1': tickInput });
    }

    const firstSnapshot = first.createSnapshot();
    const secondSnapshot = second.createSnapshot();
    expect(firstSnapshot.wave).toBe(1);
    expect(firstSnapshot.merchantShop).toEqual({
      rotationId: 1,
      offerIds: TOWER_MERCHANT_ROTATIONS[1],
    });
    expect(firstSnapshot.sharedQuest).toEqual(secondSnapshot.sharedQuest);
    expect(secondSnapshot).toEqual(firstSnapshot);
    expect(TOWER_TURRET_SUPER_MODULES.map((module) => module.id)).toEqual([
      'super-overdrive',
      'super-rail',
      'super-battery',
    ]);
  });
});
