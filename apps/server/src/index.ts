import { defineRoom, defineServer, matchMaker } from 'colyseus';
import express from 'express';

import { verifySupabaseJwt } from './auth/supabaseJwt.js';
import { readServerConfig } from './config.js';
import { createTowerRoomHandler } from './http/createRoom.js';
import { SlidingWindowRoomCreationRateLimiter } from './http/RoomCreationRateLimiter.js';
import { PostgrestMetaBuildRepository } from './meta/postgrestMetaBuild.js';
import { initServerTelemetry } from './observability/serverTelemetry.js';
import { PostgrestGameRunFinalizer } from './rewards/postgrestGameRun.js';
import { configureTowerRoom, TowerRoom } from './rooms/TowerRoom.js';
import { RoomReservationRegistry } from './rooms/RoomReservationRegistry.js';

const config = readServerConfig();
const verifyToken = (token: string) => verifySupabaseJwt(token, config.jwtSecret);
const telemetry = initServerTelemetry(config);
const metaBuilds = new PostgrestMetaBuildRepository(config.postgrestUrl, config.serviceRoleKey);
const gameRuns = new PostgrestGameRunFinalizer(config.postgrestUrl, config.serviceRoleKey);
const rateLimiter = new SlidingWindowRoomCreationRateLimiter();
const reservations = new RoomReservationRegistry();
configureTowerRoom({
  verifyToken,
  consumeReservation: (options) => reservations.consume(options),
  gameRuns,
  telemetry,
});

const gameServer = defineServer({
  rooms: {
    tower: defineRoom(TowerRoom),
  },
  express: (app) => {
    app.use(express.json({ limit: '16kb', strict: true }));
    app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }));
    app.post(
      '/rooms',
      createTowerRoomHandler({
        verifyToken,
        metaBuilds,
        rateLimiter,
        createRoom: async (options) => {
          const room = await matchMaker.createRoom('tower', reservations.issue(options));
          return { roomId: room.roomId };
        },
      }),
    );
  },
});

await gameServer.listen(config.port);

telemetry.logger.emit('info', 'serveur de jeu prêt', { 'server.port': config.port });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void telemetry.shutdown());
}
