import type { Client } from 'colyseus';
import { describe, expect, it, vi } from 'vitest';

import { TowerStateSchema } from '../state/towerState.js';
import { configureTowerRoom, TowerRoom } from './TowerRoom.js';

describe('mesure des patches Colyseus', () => {
  it('observe les octets réellement transmis par client.raw', () => {
    const room = new TowerRoom();
    (room as unknown as { __init(): void }).__init();
    room.patchRate = null;
    room.setState(new TowerStateSchema());
    const raw = vi.fn();
    const client = { state: 1, raw } as unknown as Client;
    room.clients.push(client);
    (
      room as unknown as {
        _serializer: { getFullState(client: Client): Uint8Array };
      }
    )._serializer.getFullState(client);
    const patch = vi.fn();
    (room as unknown as { roomTelemetry: { patch(bytes: number): void } }).roomTelemetry = {
      patch,
    };

    room.state.tick = 1;
    expect(room.broadcastPatch()).toBe(true);
    expect(raw).toHaveBeenCalledOnce();
    const encoded = raw.mock.calls[0]?.[0] as Uint8Array | undefined;
    expect(encoded?.byteLength).toBeGreaterThan(0);
    expect(patch).toHaveBeenCalledWith(encoded?.byteLength);
  });
});

describe('robustesse du cycle de vie de room', () => {
  it('libère après cinq secondes une authentification interrompue avant onJoin', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    configureTowerRoom({
      verifyToken: () => ({ userId: 'user-1' }),
      consumeReservation: () => undefined,
      gameRuns: { finalize: vi.fn() },
      telemetry: {
        logger: {} as never,
        room: vi.fn(),
        shutdown: vi.fn().mockResolvedValue(undefined),
      },
    });
    const room = new TowerRoom();
    Object.assign(room as object, {
      expiresAtMs: 15_000,
      expectedUserIds: ['user-1'],
      runtime: { phase: 'waiting' },
    });
    const first = { sessionId: 'session-1' } as Client;
    const retry = { sessionId: 'session-2' } as Client;

    expect(room.onAuth(first, {}, { token: 'valid' })).toEqual({ userId: 'user-1' });
    expect(() => room.onAuth(retry, {}, { token: 'valid' })).toThrow('déjà connectée');
    vi.advanceTimersByTime(5_000);
    expect(room.onAuth(retry, {}, { token: 'valid' })).toEqual({ userId: 'user-1' });

    room.onDispose();
    vi.useRealTimers();
  });

  it('signale explicitement une récompense non persistée à la disposition', () => {
    const child = vi.fn();
    const log = vi.fn();
    const dispose = vi.fn();
    const room = new TowerRoom();
    Object.assign(room as object, {
      runtime: { phase: 'defeat' },
      roomTelemetry: { child, log, dispose },
    });

    room.onDispose();

    expect(child).toHaveBeenCalledWith(
      'game.room.persistence',
      { 'game.outcome': 'retention-exhausted' },
      true,
    );
    expect(log).toHaveBeenCalledWith(
      'error',
      'persistance des récompenses abandonnée après rétention',
      { 'game.retention_ms': 60_000 },
    );
    expect(dispose).toHaveBeenCalledOnce();
  });
});
