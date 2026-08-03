import { createHmac } from 'node:crypto';

import { expect, test } from '@playwright/test';

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

function createAccessToken(): string {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url',
  );
  const encodedPayload = Buffer.from(
    JSON.stringify({
      sub: 'smoke-user',
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
