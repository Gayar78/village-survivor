import { TOWER_ACTIVE_MONSTERS, type TowerMonsterSignature } from '@village-survivor/content';
import type { TowerInput, TowerMonsterKind } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { createTowerStateFingerprint, TowerSimulation } from '../src/tower/index.js';
import { monsterBehaviorProfile } from '../src/tower/monster-behaviors.js';
import type { MutableTowerMonster, MutableTowerPlayer } from '../src/tower/state.js';

const input = (sequence: number): TowerInput => ({
  sequence,
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
});

type SimulationInternals = {
  monsters: MutableTowerMonster[];
  players: MutableTowerPlayer[];
  damageMonster(
    monster: MutableTowerMonster,
    amount: number,
    killer: MutableTowerPlayer | undefined,
  ): boolean;
};

function internals(simulation: TowerSimulation): SimulationInternals {
  return simulation as unknown as SimulationInternals;
}

function spawned(simulation: TowerSimulation, kind: TowerMonsterKind): MutableTowerMonster {
  const found = internals(simulation).monsters.find((monster) => monster.kind === kind);
  if (found === undefined) throw new Error(`Monstre de test absent : ${kind}`);
  return found;
}

describe('Tower Torri monster behavior primitives', () => {
  it('associe un profil exÃ©cutable aux 75 monstres actifs du catalogue', () => {
    expect(TOWER_ACTIVE_MONSTERS).toHaveLength(75);
    for (const monster of TOWER_ACTIVE_MONSTERS) {
      const profile = monsterBehaviorProfile(monster.signature as TowerMonsterSignature);
      expect(profile.movement).toBeTruthy();
      expect(profile.contact).toBeTruthy();
    }
  });

  it('tÃ©lÃ©graphie une attaque Ã  distance avant de toucher le joueur', () => {
    const simulation = new TowerSimulation('torri-ranged-telegraph');
    simulation.start();
    const player = internals(simulation).players[0];
    if (player === undefined) throw new Error('Joueur de test absent.');
    player.position = { x: 250, y: 0 };
    simulation.spawnMonster('sniper', { x: 0, y: 0 });

    let sawTelegraph = false;
    for (let tick = 1; tick <= 90; tick += 1) {
      simulation.step({ 'player-1': input(tick) });
      sawTelegraph ||= simulation
        .createSnapshot()
        .monsters.some(
          (monster) => monster.kind === 'sniper' && monster.ability?.kind === 'ranged',
        );
    }

    expect(sawTelegraph).toBe(true);
    expect(player.hp).toBeLessThan(player.maxHp);
  });

  it('invoque des unitÃ©s avec un plafond et divise les monstres Ã  leur mort', () => {
    const summoning = new TowerSimulation('torri-summon');
    summoning.start();
    summoning.spawnMonster('summoner', { x: 500, y: 500 });
    for (let tick = 1; tick <= 70; tick += 1) {
      summoning.step({ 'player-1': input(tick) });
    }
    expect(
      summoning.createSnapshot().monsters.filter((monster) => monster.kind === 'skeleton-small')
        .length,
    ).toBeGreaterThanOrEqual(2);

    const splitting = new TowerSimulation('torri-split');
    splitting.start();
    splitting.spawnMonster('skeleton-medium', { x: 500, y: 500 });
    const parent = spawned(splitting, 'skeleton-medium');
    internals(splitting).damageMonster(parent, parent.maxHp * 10, undefined);
    splitting.step({ 'player-1': input(1) });
    expect(
      splitting.createSnapshot().monsters.filter((monster) => monster.kind === 'skeleton-small'),
    ).toHaveLength(2);
  });

  it('accorde une seule rÃ©surrection native Ã  la momie', () => {
    const simulation = new TowerSimulation('torri-revive');
    simulation.start();
    simulation.spawnMonster('mummy', { x: 500, y: 500 });
    const mummy = spawned(simulation, 'mummy');

    expect(internals(simulation).damageMonster(mummy, mummy.maxHp * 10, undefined)).toBe(true);
    expect(mummy.hp).toBeGreaterThan(0);
    expect(mummy.reviveCount).toBe(1);

    expect(internals(simulation).damageMonster(mummy, mummy.maxHp * 10, undefined)).toBe(true);
    expect(mummy.hp).toBe(0);
  });

  it('projette les zones persistantes et les boucliers dans le snapshot lockstep', () => {
    const zones = new TowerSimulation('torri-persistent-zones');
    zones.start();
    const player = internals(zones).players[0];
    if (player === undefined) throw new Error('Joueur de test absent.');
    player.position = { x: 250, y: 0 };
    zones.spawnMonster('scorpion', { x: 0, y: 0 });
    for (let tick = 1; tick <= 80; tick += 1) {
      zones.step({ 'player-1': input(tick) });
    }
    expect(zones.createSnapshot().monsterZones.some((zone) => zone.kind === 'poison')).toBe(true);

    const shields = new TowerSimulation('torri-shields');
    shields.start();
    shields.spawnMonster('protector', { x: 900, y: 900 });
    shields.spawnMonster('slime', { x: 930, y: 900 });
    for (let tick = 1; tick <= 65; tick += 1) {
      shields.step({ 'player-1': input(tick) });
    }
    expect(
      shields.createSnapshot().monsters.some((monster) => monster.shieldRatio !== undefined),
    ).toBe(true);
  });

  it('reste strictement dÃ©terministe avec mouvements, invocations et tÃ©lÃ©graphes', () => {
    const first = new TowerSimulation('torri-abilities-lockstep', {
      playerIds: ['alpha', 'bravo'],
    });
    const second = new TowerSimulation('torri-abilities-lockstep', {
      playerIds: ['alpha', 'bravo'],
    });
    first.start();
    second.start();
    const roster: readonly TowerMonsterKind[] = [
      'goblin',
      'wolf',
      'sniper',
      'summoner',
      'healer',
      'super-looter',
      'ancient-guardian',
    ];
    roster.forEach((kind, index) => {
      const position = { x: 350 + index * 45, y: 280 - index * 30 };
      first.spawnMonster(kind, position);
      second.spawnMonster(kind, position);
    });

    for (let tick = 1; tick <= 240; tick += 1) {
      const inputs = { alpha: input(tick), bravo: input(tick) };
      first.step(inputs);
      second.step(inputs);
      expect(createTowerStateFingerprint(second.createSnapshot())).toBe(
        createTowerStateFingerprint(first.createSnapshot()),
      );
    }
  });

  it('borne une partie Ã  dix joueurs sous forte densitÃ©', () => {
    const playerIds = Array.from({ length: 10 }, (_, index) => `player-${index + 1}`);
    const simulation = new TowerSimulation('torri-ten-player-density', { playerIds });
    simulation.start();
    const roster: readonly TowerMonsterKind[] = [
      'bat',
      'goblin',
      'wolf',
      'spider',
      'sniper',
      'healer',
      'summoner',
      'grenadier',
      'blizzard-spirit',
      'explosive-robot',
    ];
    for (let index = 0; index < 160; index += 1) {
      const angle = (index / 160) * Math.PI * 2;
      const radius = 650 + (index % 8) * 26;
      simulation.spawnMonster(roster[index % roster.length] ?? 'goblin', {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }
    for (let tick = 1; tick <= 120; tick += 1) {
      const inputs = Object.fromEntries(playerIds.map((id) => [id, input(tick)]));
      simulation.step(inputs);
    }
    const snapshot = simulation.createSnapshot();
    expect(snapshot.players).toHaveLength(10);
    expect(snapshot.monsters.filter((monster) => monster.hp > 0).length).toBeLessThanOrEqual(160);
    expect(snapshot.monsterZones.length).toBeLessThanOrEqual(48);
    expect(
      snapshot.monsters.every(
        (monster) => Number.isFinite(monster.position.x) && Number.isFinite(monster.position.y),
      ),
    ).toBe(true);
  });
});
