import {
  TOWER_MAX_ACTIVE_PLAYERS,
  type TowerInput,
  type TowerRosterEvent,
} from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { TowerSimulation } from '../src/tower/index.js';
import { MONSTERS } from '../src/tower/tuning.js';

const NEUTRAL_INPUT: TowerInput = {
  sequence: 0,
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
};

function runNeutral(simulation: TowerSimulation, ticks: number): void {
  for (let index = 0; index < ticks; index += 1) {
    simulation.step({});
  }
}

describe('Tower dynamic roster', () => {
  it('appends a standard active player, preserves order and guards invalid transitions and the cap', () => {
    const initialIds = Array.from(
      { length: TOWER_MAX_ACTIVE_PLAYERS - 1 },
      (_, index) => `player-${index + 1}`,
    );
    const simulation = new TowerSimulation('roster-transitions', { playerIds: initialIds });

    const join: TowerRosterEvent = { type: 'join', tick: 0, playerId: 'player-10' };
    expect(simulation.applyRosterEvent(join)).toBe(true);
    expect(simulation.applyRosterEvent(join)).toBe(false);
    expect(simulation.applyRosterEvent({ type: 'join', tick: 0, playerId: 'player-11' })).toBe(
      false,
    );
    expect(simulation.applyRosterEvent({ type: 'leave', tick: 1, playerId: 'player-2' })).toBe(
      false,
    );

    const snapshot = simulation.createSnapshot();
    expect(snapshot.players.map((player) => player.id)).toEqual([...initialIds, 'player-10']);
    expect(snapshot.players).toHaveLength(TOWER_MAX_ACTIVE_PLAYERS);
    const joined = snapshot.players.at(-1);
    expect(joined).toMatchObject({
      id: 'player-10',
      hp: 300,
      maxHp: 300,
      level: 1,
      activeWeaponId: 'rifle',
      pendingUpgrades: 0,
    });
    expect(joined?.weapons).toHaveLength(3);

    expect(simulation.applyRosterEvent({ type: 'leave', tick: 0, playerId: 'player-2' })).toBe(
      true,
    );
    expect(simulation.applyRosterEvent({ type: 'leave', tick: 0, playerId: 'player-2' })).toBe(
      false,
    );
    expect(simulation.createSnapshot().players.map((player) => player.id)).toEqual([
      'player-1',
      ...initialIds.slice(2),
      'player-10',
    ]);
  });

  it('stops requiring a departed player input without causing defeat', () => {
    const simulation = new TowerSimulation('roster-leave', {
      playerIds: ['alpha', 'bravo'],
    });
    simulation.start();

    const alphaPosition = simulation.createSnapshot().players[0]?.position;
    if (alphaPosition === undefined) {
      throw new Error('Expected alpha in the active roster.');
    }
    // In co-op, alpha is knocked down instead of ending the game.
    for (let index = 0; index < 12; index += 1) {
      simulation.spawnMonster('brute', alphaPosition);
    }
    simulation.step({ alpha: NEUTRAL_INPUT, bravo: NEUTRAL_INPUT });
    expect(simulation.createSnapshot().players[0]?.downedRemainingMs).toBeGreaterThan(0);

    // Removing the only standing teammate must not reinterpret alpha's existing K.O.
    // as a solo death. The departed id is no longer required in the next input set.
    expect(simulation.applyRosterEvent({ type: 'leave', tick: 1, playerId: 'bravo' })).toBe(true);
    simulation.step({});

    const snapshot = simulation.createSnapshot();
    expect(snapshot.players.map((player) => player.id)).toEqual(['alpha']);
    expect(snapshot.player.id).toBe('alpha');
    expect(snapshot.status).toBe('running');
    expect(snapshot.players[0]?.downedRemainingMs).toBeGreaterThan(0);
    expect(simulation.applyRosterEvent({ type: 'leave', tick: 2, playerId: 'alpha' })).toBe(false);
  });

  it('keeps simulations identical through scheduled joins and leaves over many ticks', () => {
    const first = new TowerSimulation('dynamic-roster-parity');
    const second = new TowerSimulation('dynamic-roster-parity');
    first.start();
    second.start();

    const scheduled = new Map<number, readonly TowerRosterEvent[]>([
      [0, [{ type: 'join', tick: 0, playerId: 'bravo' }]],
      [43, [{ type: 'join', tick: 43, playerId: 'charlie' }]],
      [137, [{ type: 'leave', tick: 137, playerId: 'bravo' }]],
    ]);

    for (let boundary = 0; boundary < 360; boundary += 1) {
      for (const event of scheduled.get(boundary) ?? []) {
        expect(first.applyRosterEvent(event)).toBe(true);
        expect(second.applyRosterEvent(event)).toBe(true);
      }
      const inputs = Object.fromEntries(
        first.createSnapshot().players.map((player, index) => [
          player.id,
          {
            ...NEUTRAL_INPUT,
            sequence: boundary,
            moveX: index % 2 === 0 ? 0.25 : -0.25,
            aimX: index % 2 === 0 ? 1 : -1,
            fire: boundary % 4 === 0,
          },
        ]),
      );
      first.step(inputs);
      second.step(inputs);
    }

    const firstState = first.createSnapshot();
    const secondState = second.createSnapshot();
    expect(firstState.players.map((player) => player.id)).toEqual(['player-1', 'charlie']);
    expect(secondState).toEqual(firstState);
  });

  it('uses the live roster for the next wave budget and power while retaining the solo baseline', () => {
    const solo = new TowerSimulation('live-wave-scaling');
    const joined = new TowerSimulation('live-wave-scaling');
    const leftToSolo = new TowerSimulation('live-wave-scaling', {
      playerIds: ['alpha', 'bravo'],
    });
    for (const simulation of [solo, joined, leftToSolo]) {
      simulation.start();
    }
    expect(joined.applyRosterEvent({ type: 'join', tick: 0, playerId: 'bravo' })).toBe(true);
    expect(leftToSolo.applyRosterEvent({ type: 'leave', tick: 0, playerId: 'bravo' })).toBe(true);

    runNeutral(solo, 200);
    runNeutral(joined, 200);
    runNeutral(leftToSolo, 200);

    const soloWave = solo.createSnapshot().monsters;
    const joinedWave = joined.createSnapshot().monsters;
    const leftWave = leftToSolo.createSnapshot().monsters;
    expect(solo.createSnapshot().wave).toBe(1);
    expect(joined.createSnapshot().wave).toBe(1);
    expect(joinedWave.length).toBeGreaterThan(soloWave.length);
    expect(soloWave.every((monster) => monster.maxHp === MONSTERS[monster.kind].hp)).toBe(true);
    expect(leftWave.every((monster) => monster.maxHp === MONSTERS[monster.kind].hp)).toBe(true);
    expect(
      joinedWave.every((monster) => monster.maxHp === Math.round(MONSTERS[monster.kind].hp * 1.12)),
    ).toBe(true);
  });
});
