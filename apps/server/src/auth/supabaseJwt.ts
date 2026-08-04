import { createHmac, timingSafeEqual } from 'node:crypto';

export type AuthenticatedAccount = Readonly<{ userId: string }>;

interface JwtHeader {
  alg?: unknown;
  typ?: unknown;
}

interface JwtPayload {
  sub?: unknown;
  exp?: unknown;
  nbf?: unknown;
  aud?: unknown;
  role?: unknown;
}

export class InvalidJwtError extends Error {
  public constructor() {
    super('Jeton d’accès invalide ou expiré.');
    this.name = 'InvalidJwtError';
  }
}

function decodeJsonPart<T>(part: string): T {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
  } catch {
    throw new InvalidJwtError();
  }
}

function hasAuthenticatedAudience(audience: unknown): boolean {
  return (
    audience === 'authenticated' || (Array.isArray(audience) && audience.includes('authenticated'))
  );
}

/**
 * Vérifie localement un JWT Supabase HS256. Le jeton n'est jamais renvoyé ni inclus
 * dans les erreurs afin qu'un appelant puisse journaliser l'échec sans fuite de secret.
 */
export function verifySupabaseJwt(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): AuthenticatedAccount {
  if (token.length === 0 || token.length > 16_384 || secret.length < 16) {
    throw new InvalidJwtError();
  }

  const parts = token.split('.');
  if (parts.length !== 3) throw new InvalidJwtError();
  const [encodedHeader, encodedPayload, signature] = parts;
  if (encodedHeader === undefined || encodedPayload === undefined || signature === undefined) {
    throw new InvalidJwtError();
  }

  const header = decodeJsonPart<JwtHeader>(encodedHeader);
  if (header.alg !== 'HS256' || (header.typ !== undefined && header.typ !== 'JWT')) {
    throw new InvalidJwtError();
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(signature, 'base64url');
  } catch {
    throw new InvalidJwtError();
  }
  if (
    expectedSignature.length !== providedSignature.length ||
    !timingSafeEqual(expectedSignature, providedSignature)
  ) {
    throw new InvalidJwtError();
  }

  const payload = decodeJsonPart<JwtPayload>(encodedPayload);
  if (
    typeof payload.sub !== 'string' ||
    payload.sub.length === 0 ||
    payload.sub.length > 128 ||
    typeof payload.exp !== 'number' ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= nowSeconds ||
    (payload.nbf !== undefined &&
      (typeof payload.nbf !== 'number' ||
        !Number.isFinite(payload.nbf) ||
        payload.nbf > nowSeconds)) ||
    !hasAuthenticatedAudience(payload.aud) ||
    payload.role !== 'authenticated'
  ) {
    throw new InvalidJwtError();
  }

  return { userId: payload.sub };
}

export function readBearerToken(authorization: string | undefined): string {
  if (authorization === undefined) throw new InvalidJwtError();
  const match = /^Bearer ([^\s]+)$/u.exec(authorization);
  if (match?.[1] === undefined) throw new InvalidJwtError();
  return match[1];
}
