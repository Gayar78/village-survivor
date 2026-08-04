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

function cooperativeRuntime(userIds: readonly string[]): TowerRoomRuntime {
  return new TowerRoomRuntime({
    seed: 'coop-runtime-test',
    expectedUserIds: userIds,
    metaBuildsByPlayerId: Object.fromEntries(userIds.map((id) => [id, NEUTRAL_BUILD])),
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

  it.each([2, 4])('attend exactement les %i membres du roster avant de démarrer', (count) => {
    const ids = Array.from({ length: count }, (_value, index) => `user-${index + 1}`);
    const room = cooperativeRuntime(ids);
    for (const [index, id] of ids.entries()) {
      expect(room.admit(id, index)).toBe(true);
      expect(room.phase).toBe(index === ids.length - 1 ? 'running' : 'waiting');
    }
    expect(room.snapshot().players.map(({ id }) => id)).toEqual(ids);
  });

  it('neutralise immédiatement un joueur coupé puis restaure le même avatar à 10 secondes', () => {
    const room = cooperativeRuntime(['user-1', 'user-2']);
    room.admit('user-1', 0);
    room.admit('user-2', 0);
    room.submitControl('user-1', { sequence: 1, moveX: 1, moveY: 0, aimX: 1, aimY: 0 }, 0);
    const before = room.snapshot().players.find(({ id }) => id === 'user-1');
    expect(room.disconnect('user-1', 100)).toBe(true);
    const neutral = room.step(150).state.players.find(({ id }) => id === 'user-1');
    expect(neutral?.position).toEqual(before?.position);
    expect(room.reconnect('user-1', 10_100)).toBe(true);
    expect(room.snapshot().players.find(({ id }) => id === 'user-1')).toEqual(neutral);
  });

  it('expulse à 30 secondes, refuse le retour tardif et abandonne quand la room est vide', () => {
    const room = cooperativeRuntime(['user-1', 'user-2']);
    room.admit('user-1', 0);
    room.admit('user-2', 0);
    room.disconnect('user-1', 0);
    const afterExpiry = room.step(30_000).state;
    expect(afterExpiry.players.some(({ id }) => id === 'user-1')).toBe(false);
    expect(room.reconnect('user-1', 31_000)).toBe(false);
    expect(room.leaveVoluntarily('user-2')).toBe(true);
    expect(room.phase).toBe('abandoned');
  });

  it('retire immédiatement une sortie volontaire sans abandonner les joueurs restants', () => {
    const room = cooperativeRuntime(['user-1', 'user-2']);
    room.admit('user-1', 0);
    room.admit('user-2', 0);
    const internal = room as unknown as {
      simulation: { players: Array<{ id: string; gold: number }> };
    };
    const departingPlayer = internal.simulation.players.find(({ id }) => id === 'user-1');
    if (departingPlayer === undefined) throw new Error('Joueur de test absent.');
    departingPlayer.gold = 41;
    expect(room.leaveVoluntarily('user-1')).toBe(true);
    expect(room.phase).toBe('running');
    expect(room.snapshot().players.map(({ id }) => id)).toEqual(['user-2']);
    expect(room.rewards()).toEqual([
      { userId: 'user-1', amount: 41 },
      { userId: 'user-2', amount: 0 },
    ]);
  });
});
