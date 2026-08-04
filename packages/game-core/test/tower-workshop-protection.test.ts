import type { TowerInput, TowerMonsterKind, TurretDir, Vector2 } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { TowerSimulation } from '../src/tower/index.js';

function input(overrides: Partial<TowerInput> = {}): TowerInput {
  return { sequence: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0, ...overrides };
}

type TestPlayer = {
  id: string;
  position: Vector2;
  hp: number;
  maxHp: number;
  downedRemainingMs: number;
  turretWorkshopOpen: boolean;
};

type TestTurret = {
  dir: TurretDir;
  position: Vector2;
  hp: number;
  alive: boolean;
};

type TestMonster = {
  id: string;
  kind: TowerMonsterKind;
  position: Vector2;
};

type SimulationInternals = {
  players: TestPlayer[];
  turrets: TestTurret[];
  monsters: TestMonster[];
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

function player(simulation: TowerSimulation, id = 'player-1'): TestPlayer {
  const found = access(simulation).players.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`Joueur de test absent : ${id}`);
  }
  return found;
}

function placeAtEastWorkshop(simulation: TowerSimulation, playerId = 'player-1'): TestPlayer {
  const found = player(simulation, playerId);
  found.position = { ...eastTurret(simulation).position };
  return found;
}

describe('Tower turret workshop protection', () => {
  it('ne valide l’intention persistante que vivant, à portée et près d’une tourelle vivante', () => {
    const simulation = new TowerSimulation('workshop-validation', {
      playerIds: ['player-1', 'player-2'],
    });
    simulation.start();
    const protectedPlayer = placeAtEastWorkshop(simulation);

    simulation.step({ 'player-1': input({ turretWorkshopOpen: true }) });
    expect(simulation.createSnapshot().players[0]?.turretWorkshopProtected).toBe(true);
    expect(protectedPlayer.turretWorkshopOpen).toBe(true);

    simulation.step({ 'player-1': input() });
    expect(simulation.createSnapshot().players[0]?.turretWorkshopProtected).toBeUndefined();
    expect(protectedPlayer.turretWorkshopOpen).toBe(false);

    protectedPlayer.position = { x: 600, y: 600 };
    simulation.step({ 'player-1': input({ turretWorkshopOpen: true }) });
    expect(simulation.createSnapshot().players[0]?.turretWorkshopProtected).toBeUndefined();

    placeAtEastWorkshop(simulation);
    eastTurret(simulation).alive = false;
    simulation.step({ 'player-1': input({ turretWorkshopOpen: true }) });
    expect(simulation.createSnapshot().players[0]?.turretWorkshopProtected).toBeUndefined();

    eastTurret(simulation).alive = true;
    protectedPlayer.hp = 0;
    protectedPlayer.downedRemainingMs = 1_000;
    simulation.step({ 'player-1': input({ turretWorkshopOpen: true }) });
    expect(simulation.createSnapshot().players[0]?.turretWorkshopProtected).toBeUndefined();
  });

  it('détourne le ciblage vers un autre joueur, puis vers le Cœur si tous sont protégés', () => {
    const coop = new TowerSimulation('workshop-target-coop', {
      playerIds: ['player-1', 'player-2'],
    });
    coop.start();
    placeAtEastWorkshop(coop, 'player-1');
    player(coop, 'player-2').position = { x: 400, y: 200 };
    const coopMonsterId = coop.spawnMonster('chaser', { x: 300, y: 0 });
    coop.step({
      'player-1': input({ turretWorkshopOpen: true }),
      'player-2': input(),
    });
    const coopMonster = access(coop).monsters.find((monster) => monster.id === coopMonsterId);
    expect(coopMonster?.position.y).toBeGreaterThan(0);

    const solo = new TowerSimulation('workshop-target-heart');
    solo.start();
    placeAtEastWorkshop(solo);
    const soloMonsterId = solo.spawnMonster('chaser', { x: 240, y: 300 });
    solo.step({ 'player-1': input({ turretWorkshopOpen: true }) });
    const soloMonster = access(solo).monsters.find((monster) => monster.id === soloMonsterId);
    expect(soloMonster?.position.x).toBeLessThan(240);
  });

  it('supprime le contact normal tout en laissant le monstre frapper la tourelle', () => {
    const simulation = new TowerSimulation('workshop-contact');
    simulation.start();
    const protectedPlayer = placeAtEastWorkshop(simulation);
    const turret = eastTurret(simulation);
    const playerHpBefore = protectedPlayer.hp;
    const turretHpBefore = turret.hp;
    simulation.spawnMonster('brute', { ...protectedPlayer.position });

    simulation.step({ 'player-1': input({ turretWorkshopOpen: true }) });

    expect(protectedPlayer.hp).toBe(playerHpBefore);
    expect(turret.hp).toBeLessThan(turretHpBefore);

    const unprotected = new TowerSimulation('workshop-contact-closed');
    unprotected.start();
    const unprotectedPlayer = placeAtEastWorkshop(unprotected);
    const hpBefore = unprotectedPlayer.hp;
    unprotected.spawnMonster('brute', { ...unprotectedPlayer.position });
    unprotected.step({ 'player-1': input() });
    expect(unprotectedPlayer.hp).toBeLessThan(hpBefore);
  });

  it('ignore le joueur protégé dans une explosion kamikaze sans protéger la tourelle', () => {
    const simulation = new TowerSimulation('workshop-kamikaze');
    simulation.start();
    const protectedPlayer = placeAtEastWorkshop(simulation);
    const turret = eastTurret(simulation);
    const playerHpBefore = protectedPlayer.hp;
    const turretHpBefore = turret.hp;
    simulation.spawnMonster('kamikaze', { ...protectedPlayer.position });

    simulation.step({ 'player-1': input({ turretWorkshopOpen: true }) });

    expect(protectedPlayer.hp).toBe(playerHpBefore);
    expect(turret.hp).toBeLessThan(turretHpBefore);
    expect(simulation.createSnapshot().monsters).toHaveLength(0);

    const outOfRange = new TowerSimulation('workshop-kamikaze-out-of-range');
    outOfRange.start();
    const exposedPlayer = player(outOfRange);
    exposedPlayer.position = { x: 600, y: 600 };
    const exposedHpBefore = exposedPlayer.hp;
    outOfRange.spawnMonster('explosive-robot', { ...exposedPlayer.position });
    outOfRange.step({ 'player-1': input({ turretWorkshopOpen: true }) });
    expect(exposedPlayer.hp).toBeLessThan(exposedHpBefore);
  });

  it('reste identique pour une même seed et les mêmes intentions atelier', () => {
    const first = new TowerSimulation('workshop-authoritative');
    const second = new TowerSimulation('workshop-authoritative');
    first.start();
    second.start();
    placeAtEastWorkshop(first);
    placeAtEastWorkshop(second);
    first.spawnMonster('chaser', { x: 360, y: 0 });
    second.spawnMonster('chaser', { x: 360, y: 0 });

    for (let tick = 1; tick <= 20; tick += 1) {
      const tickInput = input({ sequence: tick, turretWorkshopOpen: tick <= 12 });
      first.step({ 'player-1': tickInput });
      second.step({ 'player-1': tickInput });
      if (tick === 10) {
        const firstProtectedSnapshot = first.createSnapshot();
        const secondProtectedSnapshot = second.createSnapshot();
        expect(firstProtectedSnapshot.player.turretWorkshopProtected).toBe(true);
        expect(secondProtectedSnapshot).toEqual(firstProtectedSnapshot);
      }
    }

    const firstSnapshot = first.createSnapshot();
    const secondSnapshot = second.createSnapshot();
    expect(secondSnapshot).toEqual(firstSnapshot);
  });
});
