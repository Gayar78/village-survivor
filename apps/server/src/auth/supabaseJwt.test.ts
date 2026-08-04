import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { InvalidJwtError, readBearerToken, verifySupabaseJwt } from './supabaseJwt.js';

const SECRET = 'test-secret-at-least-sixteen-characters';

function token(
  payload: Record<string, unknown>,
  secret = SECRET,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' },
): string {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

describe('JWT Supabase côté serveur', () => {
  it('accepte uniquement une identité authenticated non expirée', () => {
    const jwt = token({ sub: 'user-1', exp: 2_000, aud: 'authenticated', role: 'authenticated' });
    expect(verifySupabaseJwt(jwt, SECRET, 1_000)).toEqual({ userId: 'user-1' });
    expect(readBearerToken(`Bearer ${jwt}`)).toBe(jwt);
  });

  it.each([
    token({ sub: 'user-1', exp: 999, aud: 'authenticated', role: 'authenticated' }),
    token({ sub: 'user-1', exp: 2_000, aud: 'anon', role: 'authenticated' }),
    token({ sub: 'user-1', exp: 2_000, aud: 'authenticated', role: 'anon' }),
    token({ sub: '', exp: 2_000, aud: 'authenticated', role: 'authenticated' }),
    token(
      { sub: 'user-1', exp: 2_000, aud: 'authenticated', role: 'authenticated' },
      'different-secret-at-least-sixteen',
    ),
    token({ sub: 'user-1', exp: 2_000, aud: 'authenticated', role: 'authenticated' }, SECRET, {
      alg: 'none',
    }),
  ])('refuse signature, claims ou algorithme invalides sans exposer le jeton', (jwt) => {
    expect(() => verifySupabaseJwt(jwt, SECRET, 1_000)).toThrow(InvalidJwtError);
    try {
      verifySupabaseJwt(jwt, SECRET, 1_000);
    } catch (error) {
      expect(String(error)).not.toContain(jwt);
    }
  });
});
