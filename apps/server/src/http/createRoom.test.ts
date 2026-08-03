import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { createTowerRoomHandler } from './createRoom.js';

const BUILD = {
  damageMultiplier: 1,
  fireRateMultiplier: 1,
  moveSpeedMultiplier: 1,
  maxHealthMultiplier: 1,
  heartMaxHealthMultiplier: 1,
  pickupRadiusMultiplier: 1,
} as const;

function responseRecorder(): Readonly<{
  response: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}> {
  const status = vi.fn();
  const json = vi.fn();
  const response = { status, json } as unknown as Response;
  status.mockReturnValue(response);
  json.mockReturnValue(response);
  return { response, status, json };
}

async function invoke(
  body: unknown,
  authorization = 'Bearer valid',
): Promise<ReturnType<typeof responseRecorder>> {
  const recorded = responseRecorder();
  const handler = createTowerRoomHandler({
    verifyToken: (token) => {
      if (token !== 'valid') throw new Error('bad token');
      return { userId: 'user-1' };
    },
    metaBuilds: { loadActiveBuild: vi.fn().mockResolvedValue(BUILD) },
    rateLimiter: { allow: vi.fn().mockReturnValue(true) },
    createRoom: vi.fn().mockResolvedValue({ roomId: 'room-1' }),
    now: () => 1_000,
    createId: () => 'generated-id',
  });
  const request = { body, header: () => authorization } as unknown as Request;
  await handler(request, recorded.response, vi.fn());
  return recorded;
}

describe('POST /rooms', () => {
  it('crée une réservation solo de quinze secondes sans accepter de seed cliente', async () => {
    const result = await invoke({ mode: 'solo' });
    expect(result.status).toHaveBeenCalledWith(201);
    expect(result.json).toHaveBeenCalledWith({
      roomId: 'room-1',
      expiresAt: new Date(16_000).toISOString(),
    });
    const invalid = await invoke({ mode: 'solo', seed: 'client-seed' });
    expect(invalid.status).toHaveBeenCalledWith(400);
  });

  it('refuse JWT invalide et roster qui ne contient pas le chef', async () => {
    const unauthorized = await invoke({ mode: 'solo' }, 'Bearer invalid');
    expect(unauthorized.status).toHaveBeenCalledWith(401);
    const invalidRoster = await invoke({ mode: 'coop', rosterUserIds: ['user-2', 'user-3'] });
    expect(invalidRoster.status).toHaveBeenCalledWith(400);
    expect(invalidRoster.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'invalid-roster' }),
    );
  });

  it('répond 429 lorsque le débit de création de l’identité est dépassé', async () => {
    const recorded = responseRecorder();
    const handler = createTowerRoomHandler({
      verifyToken: () => ({ userId: 'user-1' }),
      metaBuilds: { loadActiveBuild: vi.fn().mockResolvedValue(BUILD) },
      rateLimiter: { allow: vi.fn().mockReturnValue(false) },
      createRoom: vi.fn(),
    });
    await handler(
      { body: { mode: 'solo' }, header: () => 'Bearer valid' } as unknown as Request,
      recorded.response,
      vi.fn(),
    );
    expect(recorded.status).toHaveBeenCalledWith(429);
    expect(recorded.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'rate-limited' }));
  });

  it('propage uniquement un traceparent W3C valide vers la room', async () => {
    const traceParent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const createRoom = vi.fn().mockResolvedValue({ roomId: 'room-traced' });
    const recorded = responseRecorder();
    const handler = createTowerRoomHandler({
      verifyToken: () => ({ userId: 'user-1' }),
      metaBuilds: { loadActiveBuild: vi.fn().mockResolvedValue(BUILD) },
      rateLimiter: { allow: vi.fn().mockReturnValue(true) },
      createRoom,
      now: () => 1_000,
      createId: () => 'generated-id',
    });
    await handler(
      {
        body: { mode: 'solo' },
        header: (name: string) => (name === 'traceparent' ? traceParent : 'Bearer valid'),
      } as unknown as Request,
      recorded.response,
      vi.fn(),
    );
    expect(createRoom).toHaveBeenCalledWith(expect.objectContaining({ traceParent }));

    createRoom.mockClear();
    await handler(
      {
        body: { mode: 'solo' },
        header: (name: string) =>
          name === 'traceparent' ? 'identity@example.test' : 'Bearer valid',
      } as unknown as Request,
      recorded.response,
      vi.fn(),
    );
    expect(createRoom).toHaveBeenCalledWith(
      expect.not.objectContaining({ traceParent: expect.anything() }),
    );
  });
});
