import type { TowerInput } from '@village-survivor/protocol';
import { TOWER_ENDGAME_TIERS } from '@village-survivor/content';
import { describe, expect, it } from 'vitest';

import { TowerSimulation } from '../src/index.js';

const idle: TowerInput = { sequence: 0, moveX: 0, moveY: 0, aimX: 1, aimY: 0 };

describe('Tower Timelands authoritative simulation', () => {
  it('entre une seule fois, invoque un Warden unique et gele les monstres existants', () => {
    const simulation = new TowerSimulation('timelands-entry');
    simulation.start();
    const player = simulation.createSnapshot().player;
    const frozenId = simulation.spawnMonster('chaser', { ...player.position });
    simulation.enterTimelands();
    simulation.enterTimelands();

    const entered = simulation.createSnapshot();
    const frozen = entered.monsters.find((monster) => monster.id === frozenId);
    expect(entered.timelands.arrival.status).toBe('announcing');
    expect(entered.endgame.activeTiers.map((tier) => tier.id)).toEqual([1]);
    expect(entered.monsters.filter((monster) => monster.kind === 'time-warden')).toHaveLength(1);
    expect(frozen?.temporal).toEqual({ status: 'frozen' });

    const hp = frozen?.hp;
    const position = frozen?.position;
    simulation.step({ 'player-1': { ...idle, fire: true } });
    const after = simulation.createSnapshot();
    expect(after.player.hp).toBe(player.hp);
    expect(after.monsters.find((monster) => monster.id === frozenId)?.hp).toBe(hp);
    expect(after.monsters.find((monster) => monster.id === frozenId)?.position).toEqual(position);
  });

  it('conserve la parite seed et inputs pendant les releases du Warden', () => {
    const first = new TowerSimulation('timelands-parity');
    const second = new TowerSimulation('timelands-parity');
    for (const simulation of [first, second]) {
      simulation.start();
      simulation.spawnMonster('brute', { x: 500, y: 500 });
      simulation.enterTimelands();
    }
    for (let tick = 0; tick < 320; tick += 1) {
      first.step({ 'player-1': idle });
      second.step({ 'player-1': idle });
    }
    expect(second.createSnapshot()).toEqual(first.createSnapshot());
  });

  it('active les quatre paliers effectifs et garde le scaling du dernier sans plafond', () => {
    const simulation = new TowerSimulation('timelands-tiers');
    simulation.start();
    simulation.enterTimelands();
    const mutableClock = simulation as unknown as { tick: number };

    expect(TOWER_ENDGAME_TIERS.map((tier) => tier.id)).toEqual([1, 2, 3, 4]);
    expect(TOWER_ENDGAME_TIERS[0]?.description).toContain('plafond de budget');

    for (const tier of TOWER_ENDGAME_TIERS.slice(1)) {
      mutableClock.tick = tier.triggerOffsetTicks - 1;
      simulation.step({ 'player-1': idle });
      expect(simulation.createSnapshot().endgame.activeTiers.at(-1)?.id).toBe(tier.id);
    }

    const baselineId = simulation.spawnMonster('time-watch', { x: 2_000, y: 0 });
    const baseline = simulation
      .createSnapshot()
      .monsters.find((monster) => monster.id === baselineId);
    mutableClock.tick += 120_000;
    simulation.step({ 'player-1': idle });
    const scaledId = simulation.spawnMonster('time-watch', { x: 2_000, y: 0 });
    const scaled = simulation.createSnapshot().monsters.find((monster) => monster.id === scaledId);
    expect(scaled?.maxHp ?? 0).toBeGreaterThan((baseline?.maxHp ?? 0) * 5);
  });
});
