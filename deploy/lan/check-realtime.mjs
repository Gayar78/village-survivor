#!/usr/bin/env node
// Vérifie que le transport de la coopération fonctionne de bout en bout sur le déploiement LAN.
//
// C'est le point le plus fragile de cette architecture : la coopération est un lockstep
// pair-à-pair dont tous les messages transitent par un canal de diffusion Realtime. Si ce canal
// ne s'établit pas, le jeu se lance mais aucune partie à plusieurs ne peut démarrer.
//
// Le script parle directement le protocole Phoenix Channels attendu par Realtime, sans
// dépendance : deux connexions rejoignent le même sujet, l'une diffuse, l'autre doit recevoir.
// C'est exactement ce que fait `apps/client/src/net/towerSession.ts` avec les lots d'entrées.
//
// Lancement : node deploy/lan/check-realtime.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(here, '.env'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const publicUrl = env.PUBLIC_URL;
const anonKey = env.ANON_KEY;
if (!publicUrl || !anonKey) {
  console.error('PUBLIC_URL ou ANON_KEY manquant dans deploy/lan/.env');
  process.exit(1);
}

const socketUrl = `${publicUrl.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${anonKey}&vsn=1.0.0`;
const topic = `realtime:tower:check-${Date.now().toString(36)}`;
const TIMEOUT_MS = 15_000;

/** Ouvre une connexion, rejoint le sujet, et résout une fois la jonction confirmée. */
function connect(label) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl);
    const received = [];
    const timer = setTimeout(
      () => reject(new Error(`${label} : pas de réponse de jonction`)),
      TIMEOUT_MS,
    );

    socket.addEventListener('open', () => {
      // Protocole Phoenix `vsn=1.0.0` : les trames sont des objets. La forme en tableau
      // n'apparaît qu'en 2.0.0, et Realtime la rejette avec « expected a map ».
      socket.send(
        JSON.stringify({
          topic,
          event: 'phx_join',
          payload: { config: { broadcast: { self: false }, presence: { key: '' } } },
          ref: '1',
          join_ref: '1',
        }),
      );
      // Realtime ferme un socket silencieux : on entretient la connexion comme le fait le jeu.
      const heartbeat = setInterval(() => {
        socket.send(
          JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb' }),
        );
      }, 5_000);
      socket.addEventListener('close', () => clearInterval(heartbeat));
    });

    socket.addEventListener('message', (event) => {
      const frame = JSON.parse(event.data);
      if (frame.topic === topic && frame.event === 'phx_reply') {
        if (frame.payload?.status === 'ok') {
          clearTimeout(timer);
          resolve({ socket, received });
        } else {
          clearTimeout(timer);
          reject(new Error(`${label} : jonction refusée — ${JSON.stringify(frame.payload)}`));
        }
        return;
      }
      if (frame.topic === topic && frame.event === 'broadcast') {
        received.push(frame.payload);
      }
    });

    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`${label} : échec de connexion à ${socketUrl}`));
    });
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  console.log(`Sujet de test : ${topic}`);
  const alice = await connect('pair A');
  console.log('pair A : canal rejoint');
  const bob = await connect('pair B');
  console.log('pair B : canal rejoint');

  const sentAt = Date.now();
  alice.socket.send(
    JSON.stringify({
      topic,
      event: 'broadcast',
      payload: { type: 'broadcast', event: 'input-batch', payload: { tick: 42, from: 'A' } },
      ref: '2',
      join_ref: '1',
    }),
  );
  console.log('pair A : lot d’entrées diffusé');

  const deadline = Date.now() + TIMEOUT_MS;
  while (bob.received.length === 0 && Date.now() < deadline) {
    await wait(100);
  }

  alice.socket.close();
  bob.socket.close();

  if (bob.received.length === 0) {
    console.error('ÉCHEC : le pair B n’a rien reçu. La coopération ne fonctionnera pas.');
    process.exit(1);
  }

  const message = bob.received[0];
  console.log(
    `pair B : reçu en ${String(Date.now() - sentAt)} ms — ${JSON.stringify(message.payload)}`,
  );
  if (message.payload?.tick !== 42) {
    console.error('ÉCHEC : charge utile altérée.');
    process.exit(1);
  }
  console.log('\nOK : le transport du lockstep coopératif fonctionne sur le déploiement LAN.');
} catch (error) {
  console.error(`ÉCHEC : ${error.message}`);
  process.exit(1);
}
