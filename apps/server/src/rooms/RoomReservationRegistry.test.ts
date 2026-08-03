import { describe, expect, it } from 'vitest';

import { RoomReservationRegistry } from './RoomReservationRegistry.js';

const OPTIONS = {
  mode: 'solo',
  runId: 'run-1',
  seed: 'seed-1',
  expectedUserIds: ['user-1'],
  metaBuildsByPlayerId: {
    'user-1': {
      damageMultiplier: 1,
      fireRateMultiplier: 1,
      moveSpeedMultiplier: 1,
      maxHealthMultiplier: 1,
      heartMaxHealthMultiplier: 1,
      pickupRadiusMultiplier: 1,
    },
  },
  expiresAtMs: 20_000,
} as const;

describe('ticket interne de création de room', () => {
  it('est nécessaire, opaque et consommable une seule fois', () => {
    const registry = new RoomReservationRegistry();
    const ticket = registry.issue(OPTIONS);
    expect(registry.consume({ expectedUserIds: ['attacker'] }, 1_000)).toBeUndefined();
    expect(registry.consume(ticket, 1_000)).toEqual(OPTIONS);
    expect(registry.consume(ticket, 1_000)).toBeUndefined();
  });

  it('refuse un ticket arrivé à expiration', () => {
    const registry = new RoomReservationRegistry();
    expect(registry.consume(registry.issue(OPTIONS), 20_000)).toBeUndefined();
  });
});
