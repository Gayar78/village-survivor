import { defineRoom, defineServer, matchMaker } from 'colyseus';
import express from 'express';

import { verifySupabaseJwt } from './auth/supabaseJwt.js';
import { readServerConfig } from './config.js';
import { createTowerRoomHandler } from './http/createRoom.js';
import { PostgrestMetaBuildRepository } from './meta/postgrestMetaBuild.js';
import { configureTowerRoom, TowerRoom } from './rooms/TowerRoom.js';
import { RoomReservationRegistry } from './rooms/RoomReservationRegistry.js';

const config = readServerConfig();
const verifyToken = (token: string) => verifySupabaseJwt(token, config.jwtSecret);
const metaBuilds = new PostgrestMetaBuildRepository(config.postgrestUrl, config.serviceRoleKey);
const reservations = new RoomReservationRegistry();
configureTowerRoom({ verifyToken, consumeReservation: (options) => reservations.consume(options) });

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
        createRoom: async (options) => {
          const room = await matchMaker.createRoom('tower', reservations.issue(options));
          return { roomId: room.roomId };
        },
      }),
    );
  },
});

await gameServer.listen(config.port);
