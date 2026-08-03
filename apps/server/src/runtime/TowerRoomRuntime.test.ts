import { describe, expect, it } from 'vitest';
import type { MetaBuildModifiers, TowerActionMessage } from '@village-survivor/protocol';

import { CONTROL_HOLD_MS, TowerRoomRuntime } from './TowerRoomRuntime.js';

const NEUTRAL_BUILD: MetaBuildModifiers = {
  damageMultiplier: 1,
  fireRateMultiplier: 1,
  moveSpeedMultiplier: 1,
  maxHealthMultiplier: 1,
  heartMaxHealthMultiplier: 1,
  pickupRadiusMultiplier: 1,
};

function runtime(): TowerRoomRuntime {
  return new TowerRoomRuntime({
    seed: 'runtime-test',
    expectedUserIds: ['user-1'],
    metaBuildsByPlayerId: { 'user-1': NEUTRAL_BUILD },
  });
}

function levelAction(index: number): TowerActionMessage {
  return { type: 'level', actionId: `action-${index}`, offerId: `offer-${index}` };
}

describe('frontière autoritaire Tower', () => {
  it('ne démarre qu’après admission exacte et avance une simulation unique', () => {
    const room = runtime();
    expect(room.phase).toBe('waiting');
    expect(room.admit('intruder', 0)).toBe(false);
    expect(room.admit('user-1', 0)).toBe(true);
    expect(room.phase).toBe('running');
    expect(room.step(50).state.tick).toBe(1);
    expect(room.step(100).state.tick).toBe(2);
  });

  it('refuse les nombres non finis, les bornes dépassées et les séquences anciennes', () => {
    const room = runtime();
    room.admit('user-1', 0);
    expect(
      room.submitControl(
        'user-1',
        { sequence: 1, moveX: Number.NaN, moveY: 0, aimX: 0, aimY: 0 },
        0,
      ),
    ).toEqual({ accepted: false, code: 'malformed' });
    expect(
      room.submitControl('user-1', { sequence: 1, moveX: 2, moveY: 0, aimX: 0, aimY: 0 }, 0),
    ).toEqual({ accepted: false, code: 'malformed' });
    expect(
      room.submitControl(
        'user-1',
        { sequence: 1, moveX: 0, moveY: 0, aimX: 0, aimY: 0, position: { x: 99, y: 99 } },
        0,
      ),
    ).toEqual({ accepted: false, code: 'malformed' });
    expect(
      room.submitControl('user-1', { sequence: 1, moveX: 1, moveY: 0, aimX: 0, aimY: 0 }, 0),
    ).toEqual({ accepted: true });
    expect(
      room.submitControl('user-1', { sequence: 1, moveX: 0, moveY: 0, aimX: 0, aimY: 0 }, 1),
    ).toEqual({ accepted: false, code: 'stale-sequence' });
  });

  it('neutralise la commande continue après 250 ms, pas au tick limite', () => {
    const room = runtime();
    room.admit('user-1', 0);
    room.submitControl('user-1', { sequence: 1, moveX: 1, moveY: 0, aimX: 1, aimY: 0 }, 0);
    const initialX = room.snapshot().player.position.x;
    const atLimitX = room.step(CONTROL_HOLD_MS).state.player.position.x;
    const afterLimitX = room.step(CONTROL_HOLD_MS + 1).state.player.position.x;
    expect(atLimitX).toBeGreaterThan(initialX);
    expect(afterLimitX).toBe(atLimitX);
  });

  it('borne les contrôles à 30 par seconde et les actions à 10 par seconde', () => {
    const room = runtime();
    room.admit('user-1', 0);
    for (let index = 0; index < 30; index += 1) {
      expect(
        room.submitControl(
          'user-1',
          { sequence: index, moveX: 0, moveY: 0, aimX: 0, aimY: 0 },
          index,
        ),
      ).toEqual({ accepted: true });
    }
    expect(
      room.submitControl('user-1', { sequence: 31, moveX: 0, moveY: 0, aimX: 0, aimY: 0 }, 30),
    ).toEqual({ accepted: false, code: 'rate-limited' });
    for (let index = 0; index < 10; index += 1)
      expect(room.submitAction('user-1', levelAction(index), index)).toEqual({ accepted: true });
    expect(room.submitAction('user-1', levelAction(10), 10)).toEqual({
      accepted: false,
      code: 'rate-limited',
    });
  });

  it('déduplique les actions fiables et borne leur file à seize', () => {
    const room = runtime();
    room.admit('user-1', 0);
    expect(room.submitAction('user-1', levelAction(0), 0)).toEqual({ accepted: true });
    expect(room.submitAction('user-1', levelAction(0), 1)).toEqual({
      accepted: false,
      code: 'duplicate-action',
    });
    for (let index = 1; index < 16; index += 1) {
      expect(room.submitAction('user-1', levelAction(index), index * 110)).toEqual({
        accepted: true,
      });
    }
    expect(room.submitAction('user-1', levelAction(16), 1_760)).toEqual({
      accepted: false,
      code: 'queue-full',
    });
  });
});
