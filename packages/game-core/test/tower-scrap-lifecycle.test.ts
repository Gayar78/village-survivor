import type { TowerInput, TowerMonsterKind, Vector2 } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { TowerSimulation } from '../src/tower/index.js';
import { SCRAP_LIFETIME_TICKS } from '../src/tower/tuning.js';

function input(): TowerInput {
  return { sequence: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0 };
}

function run(simulation: TowerSimulation, ticks: number): void {
  for (let index = 0; index < ticks; index += 1) {
    simulation.step({ 'player-1': input() });
  }
}

type TestPlayer = {
  position: Vector2;
};

type TestMonster = {
  id: string;
  kind: TowerMonsterKind;
  hp: number;
  maxHp: number;
  reward: number;
  speed: number;
};

type TestTurret = { alive: boolean };

type TestScrap = {
  id: string;
  position: Vector2;
  amount: number;
  expiresAtTick: number;
};

type SimulationInternals = {
  tick: number;
  waveTimerMs: number;
  players: TestPlayer[];
  monsters: TestMonster[];
  turrets: TestTurret[];
  scraps: TestScrap[];
  dropScrap(position: Vector2, amount: number): void;
  damageMonster(monster: TestMonster, amount: number, killer: TestPlayer | undefined): boolean;
};

function access(simulation: TowerSimulation): SimulationInternals {
  return simulation as unknown as SimulationInternals;
}

function disableWaves(simulation: TowerSimulation): void {
  access(simulation).waveTimerMs = -1_000_000_000;
}

function spawnAndKill(
  simulation: TowerSimulation,
  kind: TowerMonsterKind,
  killer: TestPlayer | undefined,
): TestMonster {
  const id = simulation.spawnMonster(kind, { x: 600, y: 600 });
  const internals = access(simulation);
  const monster = internals.monsters.find((candidate) => candidate.id === id);
  if (monster === undefined) {
    throw new Error(`Monstre de test absent : ${id}`);
  }
  expect(internals.damageMonster(monster, Number.MAX_SAFE_INTEGER, killer)).toBe(true);
  return monster;
}

describe('cycle de vie de la ferraille', () => {
  it('ne fait apparaître aucune ferraille sans mort de monstre, même en partie longue', () => {
    const simulation = new TowerSimulation('scrap-no-natural-spawn');
    simulation.start();
    const internals = access(simulation);
    for (const turret of internals.turrets) {
      turret.alive = false;
    }

    for (let tick = 0; tick < 2_000; tick += 1) {
      // Les vagues restent actives. Les monstres déjà apparus sont rendus immobiles et
      // invulnérables avant leur premier tick d'activité afin que le scénario ne contienne
      // aucune mort susceptible de produire légitimement un tas.
      for (const monster of internals.monsters) {
        monster.hp = Number.MAX_SAFE_INTEGER;
        monster.maxHp = Number.MAX_SAFE_INTEGER;
        monster.speed = 0;
      }
      simulation.step({ 'player-1': input() });
    }

    expect(simulation.createSnapshot()).toMatchObject({ tick: 2_000, scraps: [] });
    expect(internals.monsters.length).toBeGreaterThan(0);
  });

  it('produit exactement un tas de la récompense du monstre quelle que soit la source du kill', () => {
    const simulation = new TowerSimulation('scrap-monster-rewards');
    simulation.start();
    disableWaves(simulation);
    const internals = access(simulation);

    const chaser = spawnAndKill(simulation, 'chaser', internals.players[0]);
    const brute = spawnAndKill(simulation, 'brute', undefined);
    const projectedScraps = simulation.createSnapshot().scraps;

    expect(
      projectedScraps.map((scrap) => scrap.amount).sort((left, right) => left - right),
    ).toEqual([chaser.reward, brute.reward].sort((left, right) => left - right));
    expect(projectedScraps).toHaveLength(2);
    expect(Object.keys(projectedScraps[0] ?? {}).sort()).toEqual(['amount', 'id', 'position']);
  });

  it('dépose aussi la récompense d’un kamikaze mort indirectement au contact', () => {
    const simulation = new TowerSimulation('scrap-kamikaze-contact');
    simulation.start();
    disableWaves(simulation);
    const internals = access(simulation);
    for (const turret of internals.turrets) {
      turret.alive = false;
    }
    const player = internals.players[0];
    if (player === undefined) {
      throw new Error('Un joueur est requis par ce scénario.');
    }
    const heartPosition = simulation.createSnapshot().heart.position;
    const id = simulation.spawnMonster('kamikaze', heartPosition);
    const kamikaze = internals.monsters.find((monster) => monster.id === id);
    if (kamikaze === undefined) {
      throw new Error(`Kamikaze de test absent : ${id}`);
    }
    kamikaze.speed = 0;
    const reward = kamikaze.reward;

    simulation.step({ 'player-1': input() });
    const afterContact = simulation.createSnapshot();

    expect(afterContact.monsters.some((monster) => monster.id === id)).toBe(false);
    expect(afterContact.scraps).toContainEqual(expect.objectContaining({ amount: reward }));
    expect(afterContact.events).toContainEqual(
      expect.objectContaining({ type: 'monster-killed', amount: reward }),
    );
  });

  it('expire un tas exactement au tick de dépôt + 600', () => {
    const simulation = new TowerSimulation('scrap-exact-expiry');
    simulation.start();
    disableWaves(simulation);
    const internals = access(simulation);
    const player = internals.players[0];
    if (player === undefined) {
      throw new Error('Un joueur est requis par ce scénario.');
    }
    player.position = { x: 1_000, y: 1_000 };
    internals.dropScrap({ x: 0, y: 0 }, 3);

    expect(internals.scraps[0]?.expiresAtTick).toBe(SCRAP_LIFETIME_TICKS);
    run(simulation, SCRAP_LIFETIME_TICKS - 1);
    expect(simulation.createSnapshot().scraps).toHaveLength(1);

    simulation.step({ 'player-1': input() });
    const expired = simulation.createSnapshot();
    expect(expired.tick).toBe(SCRAP_LIFETIME_TICKS);
    expect(expired.scraps).toHaveLength(0);
    expect(expired.events).toContainEqual(
      expect.objectContaining({ type: 'scrap-expired', amount: 3, tick: SCRAP_LIFETIME_TICKS }),
    );
  });

  it('donne la priorité au ramassage sur l’expiration au tick limite', () => {
    const simulation = new TowerSimulation('scrap-pickup-wins');
    simulation.start();
    disableWaves(simulation);
    const internals = access(simulation);
    const player = internals.players[0];
    if (player === undefined) {
      throw new Error('Un joueur est requis par ce scénario.');
    }
    player.position = { x: 1_000, y: 1_000 };
    internals.dropScrap({ x: 0, y: 0 }, 7);
    run(simulation, SCRAP_LIFETIME_TICKS - 1);

    player.position = { x: 0, y: 0 };
    simulation.step({ 'player-1': input() });
    const collected = simulation.createSnapshot();

    expect(collected.scrapFund).toBe(7);
    expect(collected.scraps).toHaveLength(0);
    expect(collected.events).toContainEqual(
      expect.objectContaining({ type: 'scrap-collected', amount: 7 }),
    );
    expect(collected.events.some((event) => event.type === 'scrap-expired')).toBe(false);
  });

  it('borne une partie longue aux tas issus des 600 derniers ticks', () => {
    const simulation = new TowerSimulation('scrap-long-run-bound');
    simulation.start();
    disableWaves(simulation);
    const internals = access(simulation);
    const player = internals.players[0];
    if (player === undefined) {
      throw new Error('Un joueur est requis par ce scénario.');
    }
    player.position = { x: 1_000, y: 1_000 };

    for (let index = 0; index < SCRAP_LIFETIME_TICKS * 2; index += 1) {
      internals.dropScrap({ x: 0, y: 0 }, 1);
      simulation.step({ 'player-1': input() });
    }

    expect(internals.scraps.length).toBeLessThanOrEqual(SCRAP_LIFETIME_TICKS);
    expect(internals.scraps.every((scrap) => scrap.expiresAtTick > internals.tick)).toBe(true);
  });
});
