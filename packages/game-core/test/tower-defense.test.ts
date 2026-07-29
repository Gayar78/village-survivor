import {
  TOWER_GLOBAL_DEFENSE_OFFERS,
  TOWER_GLOBAL_DEFENSE_ROTATIONS,
  TOWER_TURRET_MODULES,
} from '@village-survivor/content';
import type {
  TowerGlobalDefenseOfferId,
  TowerInput,
  TowerMonsterKind,
  TurretDir,
  TurretModuleId,
  TurretTargetPriority,
  Vector2,
} from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { createTowerStateFingerprint, TowerSimulation } from '../src/tower/index.js';

function input(overrides: Partial<TowerInput> = {}): TowerInput {
  return { sequence: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0, ...overrides };
}

type TestMonster = {
  id: string;
  kind: TowerMonsterKind;
  position: Vector2;
  hp: number;
};

type TestTurret = {
  dir: TurretDir;
  position: Vector2;
  energy: number;
  maxEnergy: number;
  range: number;
  bulletRange: number;
  bulletDamage: number;
  fireRate: number;
  pierce: number;
  modules: TurretModuleId[];
  targetPriority: TurretTargetPriority;
};

type SimulationInternals = {
  scrapFund: number;
  players: Array<{ position: Vector2 }>;
  turrets: TestTurret[];
  monsters: TestMonster[];
  findTurretTarget(turret: TestTurret): TestMonster | undefined;
};

function access(simulation: TowerSimulation): SimulationInternals {
  return simulation as unknown as SimulationInternals;
}

function nearEastTurret(simulation: TowerSimulation): TestTurret {
  const state = access(simulation);
  const turret = state.turrets.find((candidate) => candidate.dir === 'E');
  if (turret === undefined) {
    throw new Error('La tourelle Est est requise par ce scénario.');
  }
  const player = state.players[0];
  if (player === undefined) {
    throw new Error('Un joueur est requis par ce scénario.');
  }
  player.position = { ...turret.position };
  return turret;
}

function buy(
  simulation: TowerSimulation,
  action:
    | `module:${TurretModuleId}`
    | `priority:${TurretTargetPriority}`
    | `global:${TowerGlobalDefenseOfferId}`,
): void {
  simulation.step({ 'player-1': input({ turretShop: { turret: 'E', action } }) });
}

describe('Tower advanced defense', () => {
  it('sélectionne exactement nearest, strongest et heartward avec un départage stable', () => {
    const simulation = new TowerSimulation('target-priorities');
    simulation.start();
    const turret = nearEastTurret(simulation);
    turret.energy = 0;

    const nearestId = simulation.spawnMonster('runner', { x: 330, y: 0 });
    const heartwardId = simulation.spawnMonster('chaser', { x: 300, y: 80 });
    const strongestId = simulation.spawnMonster('brute', { x: 430, y: 0 });

    const expected: Readonly<Record<TurretTargetPriority, string>> = {
      nearest: nearestId,
      strongest: strongestId,
      heartward: heartwardId,
    };
    for (const priority of ['nearest', 'strongest', 'heartward'] as const) {
      buy(simulation, `priority:${priority}`);
      expect(turret.targetPriority).toBe(priority);
      expect(access(simulation).findTurretTarget(turret)?.id).toBe(expected[priority]);
    }

    const before = turret.targetPriority;
    simulation.step({
      'player-1': input({ turretShop: { turret: 'E', action: 'priority:invalid' as never } }),
    });
    expect(turret.targetPriority).toBe(before);
  });

  it('installe chaque module une seule fois et modifie cadence, perforation et énergie', () => {
    const simulation = new TowerSimulation('turret-modules');
    simulation.start();
    const state = access(simulation);
    const turret = nearEastTurret(simulation);
    state.scrapFund = 100;
    turret.energy = 10;

    buy(simulation, 'module:overclock');
    buy(simulation, 'module:piercer');
    buy(simulation, 'module:capacitor');

    expect(turret.modules).toEqual(TOWER_TURRET_MODULES.map((module) => module.id));
    expect(turret.fireRate).toBeCloseTo(1.2 * 0.8);
    expect(turret.pierce).toBe(1);
    expect(turret.maxEnergy).toBe(150);
    expect(turret.energy).toBeGreaterThanOrEqual(60);
    expect(state.scrapFund).toBe(26);

    const beforeDuplicate = {
      scrap: state.scrapFund,
      fireRate: turret.fireRate,
      modules: [...turret.modules],
    };
    buy(simulation, 'module:overclock');
    expect({
      scrap: state.scrapFund,
      fireRate: turret.fireRate,
      modules: turret.modules,
    }).toEqual(beforeDuplicate);
  });

  it('le module piercer fait réellement traverser un second monstre', () => {
    const simulation = new TowerSimulation('turret-piercer-combat');
    simulation.start();
    const state = access(simulation);
    const turret = nearEastTurret(simulation);
    state.scrapFund = 28;
    buy(simulation, 'module:piercer');
    turret.energy = turret.maxEnergy;

    simulation.spawnMonster('brute', { x: 330, y: 0 });
    simulation.spawnMonster('brute', { x: 360, y: 0 });
    for (let tick = 0; tick < 5; tick += 1) {
      simulation.step({ 'player-1': input() });
    }

    expect(simulation.createSnapshot().monsters).toHaveLength(2);
    expect(
      simulation.createSnapshot().monsters.every((monster) => monster.hp < monster.maxHp),
    ).toBe(true);
  });

  it('applique une amélioration globale une fois au cœur ou au réseau entier', () => {
    const simulation = new TowerSimulation('global-defense');
    simulation.start();
    const state = access(simulation);
    nearEastTurret(simulation);
    state.scrapFund = 200;
    const before = simulation.createSnapshot();

    buy(simulation, 'global:fortify-heart');
    buy(simulation, 'global:network-damage');
    buy(simulation, 'global:network-range');
    const after = simulation.createSnapshot();

    expect(after.heart.maxHp).toBe(before.heart.maxHp + 250);
    expect(after.heart.hp).toBe(before.heart.hp + 250);
    for (let index = 0; index < state.turrets.length; index += 1) {
      const oldTurret = before.turrets[index];
      const newTurret = state.turrets[index];
      expect(oldTurret).toBeDefined();
      expect(newTurret?.bulletDamage).toBeCloseTo(42 * 1.12);
      expect(newTurret?.range).toBe((oldTurret?.range ?? 0) + 60);
      expect(newTurret?.bulletRange).toBe(400);
    }
    expect(after.globalDefenseUpgrades).toEqual(
      TOWER_GLOBAL_DEFENSE_OFFERS.map((offer) => ({ id: offer.id, level: 1 })),
    );
    expect(after.scrapFund).toBe(92);
  });

  it('ignore les actions invalides et les achats sans ferraille', () => {
    const simulation = new TowerSimulation('invalid-defense-actions');
    simulation.start();
    nearEastTurret(simulation);
    const before = simulation.createSnapshot();

    buy(simulation, 'module:overclock');
    simulation.step({
      'player-1': input({ turretShop: { turret: 'E', action: 'global:invalid' as never } }),
    });
    const after = simulation.createSnapshot();

    expect(after.scrapFund).toBe(before.scrapFund);
    expect(after.turrets.find((turret) => turret.dir === 'E')?.modules).toEqual([]);
    expect(after.globalDefenseUpgrades).toEqual(before.globalDefenseUpgrades);
    expect(after.heart).toEqual(before.heart);
  });

  it('fait tourner trois offres par vague sans horloge ni hasard ambiant et reste lockstep', () => {
    const first = new TowerSimulation('deterministic-defense-rotation');
    const second = new TowerSimulation('deterministic-defense-rotation');
    first.start();
    second.start();

    for (let wave = 0; wave < 3; wave += 1) {
      const firstSnapshot = first.createSnapshot();
      const secondSnapshot = second.createSnapshot();
      expect(firstSnapshot.globalDefenseShop).toEqual({
        rotationId: wave,
        offerIds: TOWER_GLOBAL_DEFENSE_ROTATIONS[wave],
      });
      expect(firstSnapshot.globalDefenseShop.offerIds).toHaveLength(3);
      expect(new Set(firstSnapshot.globalDefenseShop.offerIds).size).toBe(3);
      expect(createTowerStateFingerprint(secondSnapshot)).toBe(
        createTowerStateFingerprint(firstSnapshot),
      );

      if (wave < 2) {
        for (let tick = 0; tick < 200; tick += 1) {
          const tickInput = { 'player-1': input({ sequence: wave * 200 + tick }) };
          first.step(tickInput);
          second.step(tickInput);
        }
      }
    }
  });
});
