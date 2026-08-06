import { Encoder } from '@colyseus/schema';
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

/**
 * Le tampon d'encodage de Colyseus vaut 8 Kio par défaut, et ce défaut a été dépassé en vrai :
 * le serveur LAN a émis `@colyseus/schema buffer overflow` le 4 août 2026 en servant le
 * bestiaire Torri. Le dépassement n'est pas fatal — l'encodeur avertit, agrandit le tampon puis
 * **ré-encode l'état entier** — mais ce second encodage est du travail pur perte.
 *
 * La valeur retenue se cale sur le budget réseau de 64 Kio par client documenté dans
 * `docs/observabilite.md`, avec une marge. Elle ne se déduit pas du « patch p95 53 Kio » du test
 * de charge : ce chiffre est une projection JSON, borne supérieure de l'état, et non la taille
 * du patch binaire réellement encodé.
 *
 * À régler avant toute création de room, donc avant `defineServer`.
 */
Encoder.BUFFER_SIZE = 96 * 1024;

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
