import { createHmac } from 'node:crypto';

import { Client, type Room } from '@colyseus/sdk';
import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Smoke test du build de production.
 *
 * Il vise `play.html` et non `/`, avec un JWT de test en mémoire navigateur, un faux PostgREST
 * et le vrai serveur Colyseus. Aucun contournement d'authentification n'entre dans le build.
 *
 * Ce que ce test garantit : le jeu démarre réellement dans un navigateur, le build de
 * production n'expose aucune API de débogage, et la graine reçue par l'URL n'est jamais
 * interprétée comme du HTML.
 */

/** Graine hostile : si elle était insérée en HTML, elle poserait `window.__seedInjected`. */
const HOSTILE_SEED = '<img src=x onerror=window.__seedInjected=true>';
const JWT_SECRET = 'smoke-jwt-secret-at-least-sixteen-characters';

function createAccessToken(userId = 'smoke-user'): string {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url',
  );
  const encodedPayload = Buffer.from(
    JSON.stringify({
      sub: userId,
      aud: 'authenticated',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1_000) + 3_600,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

const GAME_SERVER_URL = 'http://127.0.0.1:2567';

async function createCoopRoom(
  request: APIRequestContext,
  userIds: readonly string[],
): Promise<string> {
  const response = await request.post(`${GAME_SERVER_URL}/rooms`, {
    data: { mode: 'coop', rosterUserIds: userIds },
    headers: { authorization: `Bearer ${createAccessToken(userIds[0])}` },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { roomId?: unknown };
  expect(typeof body.roomId).toBe('string');
  return body.roomId as string;
}

async function joinRoom(roomId: string, userId: string): Promise<Room> {
  const client = new Client(GAME_SERVER_URL);
  client.auth.token = createAccessToken(userId);
  return client.joinById(roomId);
}

function roomSnapshot(room: Room): Record<string, unknown> {
  return room.state.toJSON() as Record<string, unknown>;
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5_000,
  intervalMs = 10,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  expect(predicate()).toBe(true);
}

function percentile(values: readonly number[], ratio: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * ratio))] ?? 0;
}

test('sert le build de production sans capacité de débogage ni erreur console', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`${message.text()} ${message.location().url}`.trim());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/otel/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  const accessToken = createAccessToken();
  await page.addInitScript(
    ({ token, expiresAt }) => {
      const serializedSession = JSON.stringify({
        access_token: token,
        token_type: 'bearer',
        expires_in: 3_600,
        expires_at: expiresAt,
        refresh_token: 'smoke-refresh-token',
        user: {
          id: 'smoke-user',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'smoke@village.test',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          identities: [],
          created_at: new Date().toISOString(),
        },
      });
      // Le build local peut contenir l'URL Supabase du développeur, tandis que la CI utilise
      // l'URL neutre. On intercepte seulement la clé standard d'auth Supabase pour garder ce
      // scénario hermétique, sans connaître ni lire une configuration réelle.
      const nativeGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function getSmokeSession(key: string): string | null {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) return serializedSession;
        return nativeGetItem.call(this, key);
      };
    },
    { token: accessToken, expiresAt: Math.floor(Date.now() / 1_000) + 3_600 },
  );

  const invalidJwt = await request.post('http://127.0.0.1:2567/rooms', {
    data: { mode: 'solo' },
    headers: { authorization: 'Bearer invalid' },
  });
  expect(invalidJwt.status()).toBe(401);

  // Le matchmaker public ne doit pas permettre de forger roster, seed ou bonus sans le ticket
  // interne émis par POST /rooms.
  const bypass = await request.post('http://127.0.0.1:2567/matchmake/create/tower', {
    data: { expectedUserIds: ['attacker'], seed: 'forged' },
  });
  expect(bypass.ok()).toBe(false);

  await page.goto(`/play.html?seed=${encodeURIComponent(HOSTILE_SEED)}`);

  // Le canvas Phaser prouve que la scène a démarré, le HUD que l'état est bien projeté.
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#hud')).toContainText('Vitalité');

  // Aucune déclaration de type n'est ajoutée pour ce symbole : tout l'intérêt du test est
  // qu'il n'existe pas. On l'interroge donc par indexation, sans le faire entrer au typage.
  const debugType = await page.evaluate(
    () => typeof (window as unknown as Record<string, unknown>).__VILLAGE_SURVIVOR_DEBUG__,
  );
  const seedInjected = await page.evaluate(
    () => (window as unknown as { __seedInjected?: boolean }).__seedInjected,
  );

  expect(debugType).toBe('undefined');
  expect(seedInjected).toBeUndefined();
  expect(errors).toEqual([]);
});

test('affiche une erreur lisible puis revient au lobby sans fallback local', async ({ page }) => {
  await page.route('**/otel/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/play.html');
  await expect(page.locator('#tower-sync-status')).toContainText('Partie indisponible');
  await expect(page.locator('#tower-sync-status')).toContainText('session a expiré');
  await page.waitForURL('**/index.html', { timeout: 6_000 });
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('revient proprement au lobby quand le serveur de jeu est injoignable', async ({ page }) => {
  const accessToken = createAccessToken('server-outage-user');
  await page.addInitScript(
    ({ token, expiresAt }) => {
      const serializedSession = JSON.stringify({
        access_token: token,
        token_type: 'bearer',
        expires_in: 3_600,
        expires_at: expiresAt,
        refresh_token: 'outage-refresh-token',
        user: {
          id: 'server-outage-user',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'outage@village.test',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          identities: [],
          created_at: new Date().toISOString(),
        },
      });
      const nativeGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function getOutageSession(key: string): string | null {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) return serializedSession;
        return nativeGetItem.call(this, key);
      };
    },
    { token: accessToken, expiresAt: Math.floor(Date.now() / 1_000) + 3_600 },
  );
  await page.route(`${GAME_SERVER_URL}/rooms`, (route) => route.abort('failed'));
  await page.goto('/play.html');
  await expect(page.locator('#tower-sync-status')).toContainText('Partie indisponible');
  await page.waitForURL('**/index.html', { timeout: 6_000 });
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('lance le solo local lorsque Vercel ne possède aucun serveur de jeu', async ({ page }) => {
  await page.route('**/otel/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route(`${GAME_SERVER_URL}/health`, (route) => route.abort('failed'));

  await page.goto('/play.html?seed=vercel-static-fallback');

  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#hud')).toContainText('Vitalité');
  await expect(page.locator('#tower-sync-status')).toBeHidden();
  await expect(page).toHaveURL(/play\.html/u);
});

test('synchronise exactement deux puis quatre clients sur la même simulation', async ({
  request,
}) => {
  for (const count of [2, 4]) {
    const userIds = Array.from(
      { length: count },
      (_value, index) => `sync-${count}-user-${index + 1}`,
    );
    const roomId = await createCoopRoom(request, userIds);
    const rooms = await Promise.all(userIds.map((userId) => joinRoom(roomId, userId)));

    let commonSnapshots: Record<string, unknown>[] | undefined;
    await waitFor(() => {
      const snapshots = rooms.map(roomSnapshot);
      const ticks = snapshots.map(({ tick }) => tick);
      const allRunning = snapshots.every(({ phase, players }) => {
        const playerCount =
          typeof players === 'object' && players !== null ? Object.keys(players).length : 0;
        return phase === 'running' && playerCount === count;
      });
      if (allRunning && new Set(ticks).size === 1) {
        commonSnapshots = snapshots;
        return true;
      }
      return false;
    });

    expect(commonSnapshots).toBeDefined();
    for (const snapshot of commonSnapshots?.slice(1) ?? []) {
      expect(snapshot).toEqual(commonSnapshots?.[0]);
      expect(snapshot).not.toHaveProperty('seed');
      expect(snapshot).not.toHaveProperty('player');
      expect(snapshot).not.toHaveProperty('events');
    }

    if (count === 2) {
      const latencies: number[] = [];
      let sequence = 0;
      for (let sample = 0; sample < 20; sample += 1) {
        sequence += 1;
        rooms[0].send('control', {
          sequence,
          moveX: 0,
          moveY: 0,
          aimX: 1,
          aimY: 0,
        });
        // Stabilise l'entrée neutre au-delà de la conservation serveur de 250 ms. La mesure
        // suivante observe ainsi le premier état produit par la nouvelle impulsion, et non le
        // temps nécessaire pour annuler un déplacement de sens opposé.
        await new Promise((resolve) => setTimeout(resolve, 280));
        const before = roomSnapshot(rooms[0]).players as Record<
          string,
          { position: { x: number } }
        >;
        const beforeX = before[userIds[0]]?.position.x ?? 0;
        sequence += 1;
        const sentAt = performance.now();
        rooms[0].send('control', {
          sequence,
          moveX: 1,
          moveY: 0,
          aimX: 1,
          aimY: 0,
        });
        await waitFor(
          () => {
            const players = roomSnapshot(rooms[0]).players as Record<
              string,
              { position: { x: number } }
            >;
            const currentX = players[userIds[0]]?.position.x ?? beforeX;
            return currentX > beforeX;
          },
          1_000,
          2,
        );
        latencies.push(performance.now() - sentAt);
      }
      const p95LatencyMs = percentile(latencies, 0.95);
      console.info(`[server-lan] commande→état p95 ${p95LatencyMs.toFixed(1)} ms`);
      expect(p95LatencyMs).toBeLessThan(150);
    }
    await Promise.all(rooms.map((room) => room.leave(true)));
  }
});

test('annule une room coopérative si le roster reste partiel pendant quinze secondes', async ({
  request,
}) => {
  test.setTimeout(25_000);
  const userIds = ['partial-roster-leader', 'partial-roster-guest'];
  const startedAt = Date.now();
  const roomId = await createCoopRoom(request, userIds);
  const leader = await joinRoom(roomId, userIds[0]);
  await waitFor(() => roomSnapshot(leader).phase === 'waiting');
  expect(roomSnapshot(leader).phase).toBe('waiting');

  await new Promise<void>((resolve) => leader.onLeave(() => resolve()));
  const elapsedMs = Date.now() - startedAt;
  expect(elapsedMs).toBeGreaterThanOrEqual(14_000);
  expect(elapsedMs).toBeLessThan(18_000);
});

test('restaure le même avatar après une coupure réelle de dix secondes', async ({ request }) => {
  test.setTimeout(25_000);
  const userIds = ['reconnect-10-leader', 'reconnect-10-guest'];
  const roomId = await createCoopRoom(request, userIds);
  const leader = await joinRoom(roomId, userIds[0]);
  const guest = await joinRoom(roomId, userIds[1]);
  await waitFor(() => roomSnapshot(leader).phase === 'running');
  const token = leader.reconnectionToken;
  const before = roomSnapshot(leader).players as Record<string, unknown>;
  expect(before).toHaveProperty(userIds[0]);

  leader.reconnection.enabled = false;
  await leader.leave(false);
  await new Promise((resolve) => setTimeout(resolve, 10_000));

  const client = new Client(GAME_SERVER_URL);
  const reconnected = await client.reconnect(token);
  await waitFor(() => roomSnapshot(reconnected).phase === 'running');
  const after = roomSnapshot(reconnected).players as Record<string, unknown>;
  expect(after).toHaveProperty(userIds[0]);
  expect(reconnected.sessionId).toBe(leader.sessionId);
  await Promise.all([reconnected.leave(true), guest.leave(true)]);
});

test('expulse après trente secondes, refuse le retour tardif et conserve les autres joueurs', async ({
  request,
}) => {
  test.setTimeout(48_000);
  const userIds = ['reconnect-31-leader', 'reconnect-31-guest'];
  const roomId = await createCoopRoom(request, userIds);
  const leader = await joinRoom(roomId, userIds[0]);
  const guest = await joinRoom(roomId, userIds[1]);
  await waitFor(() => roomSnapshot(leader).phase === 'running');
  const token = leader.reconnectionToken;

  leader.reconnection.enabled = false;
  await leader.leave(false);
  await new Promise((resolve) => setTimeout(resolve, 31_000));
  await waitFor(() => {
    const players = roomSnapshot(guest).players;
    return typeof players === 'object' && players !== null && !(userIds[0] in players);
  });

  const client = new Client(GAME_SERVER_URL);
  await expect(client.reconnect(token)).rejects.toThrow();
  expect(roomSnapshot(guest).players).toHaveProperty(userIds[1]);
  await guest.leave(true);
});
