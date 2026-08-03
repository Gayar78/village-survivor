import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';
import type {
  CreateTowerRoomRequest,
  CreateTowerRoomResponse,
  MetaBuildModifiers,
  TowerRoomError,
} from '@village-survivor/protocol';
import { TOWER_MAX_ACTIVE_PLAYERS } from '@village-survivor/protocol';

import {
  InvalidJwtError,
  readBearerToken,
  type AuthenticatedAccount,
} from '../auth/supabaseJwt.js';
import { MetaBuildDependencyError, type MetaBuildRepository } from '../meta/postgrestMetaBuild.js';

const ROOM_ADMISSION_WINDOW_MS = 15_000;

export interface InternalTowerRoomOptions {
  mode: 'solo' | 'coop';
  runId: string;
  seed: string;
  expectedUserIds: readonly string[];
  metaBuildsByPlayerId: Readonly<Record<string, MetaBuildModifiers>>;
  expiresAtMs: number;
}

export interface CreatedRoom {
  roomId: string;
}

export interface CreateRoomDependencies {
  verifyToken(token: string): AuthenticatedAccount;
  metaBuilds: MetaBuildRepository;
  createRoom(options: InternalTowerRoomOptions): Promise<CreatedRoom>;
  now?(): number;
  createId?(): string;
}

function errorBody(code: TowerRoomError['code'], message: string): TowerRoomError {
  return { code, message };
}

function validUserId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function parseRequest(
  body: unknown,
  creatorUserId: string,
): Readonly<{
  request: CreateTowerRoomRequest;
  roster: readonly string[];
}> {
  if (typeof body !== 'object' || body === null || Array.isArray(body) || !('mode' in body)) {
    throw new TypeError('Requête de création invalide.');
  }
  const record = body as Record<string, unknown>;
  if (record.mode === 'solo') {
    if (Object.keys(record).some((key) => key !== 'mode'))
      throw new TypeError('Requête solo invalide.');
    return { request: { mode: 'solo' }, roster: [creatorUserId] };
  }
  if (record.mode !== 'coop' || !Array.isArray(record.rosterUserIds)) {
    throw new TypeError('Mode de partie invalide.');
  }
  const roster = record.rosterUserIds;
  if (
    roster.length < 2 ||
    roster.length > TOWER_MAX_ACTIVE_PLAYERS ||
    roster.some((id) => !validUserId(id)) ||
    new Set(roster).size !== roster.length ||
    !roster.includes(creatorUserId)
  ) {
    throw new RangeError('Le roster coopératif réservé est invalide.');
  }
  if (Object.keys(record).some((key) => key !== 'mode' && key !== 'rosterUserIds')) {
    throw new TypeError('Requête coopérative invalide.');
  }
  return { request: { mode: 'coop', rosterUserIds: roster }, roster };
}

export function createTowerRoomHandler(dependencies: CreateRoomDependencies): RequestHandler {
  return async (request, response) => {
    let account: AuthenticatedAccount;
    try {
      account = dependencies.verifyToken(readBearerToken(request.header('authorization')));
    } catch {
      response.status(401).json(errorBody('unauthorized', 'Authentification requise.'));
      return;
    }

    let parsed: ReturnType<typeof parseRequest>;
    try {
      parsed = parseRequest(request.body, account.userId);
    } catch (error) {
      const invalidRoster = error instanceof RangeError;
      response
        .status(400)
        .json(
          errorBody(
            invalidRoster ? 'invalid-roster' : 'invalid-request',
            invalidRoster ? 'Le roster réservé est invalide.' : 'La demande de room est invalide.',
          ),
        );
      return;
    }

    try {
      const builds = await Promise.all(
        parsed.roster.map(
          async (userId) =>
            [userId, await dependencies.metaBuilds.loadActiveBuild(userId)] as const,
        ),
      );
      const now = dependencies.now?.() ?? Date.now();
      const createId = dependencies.createId ?? randomUUID;
      const expiresAtMs = now + ROOM_ADMISSION_WINDOW_MS;
      const created = await dependencies.createRoom({
        mode: parsed.request.mode,
        runId: createId(),
        seed: createId(),
        expectedUserIds: parsed.roster,
        metaBuildsByPlayerId: Object.fromEntries(builds),
        expiresAtMs,
      });
      const result: CreateTowerRoomResponse = {
        roomId: created.roomId,
        expiresAt: new Date(expiresAtMs).toISOString(),
      };
      response.status(201).json(result);
    } catch (error) {
      const dependencyUnavailable = error instanceof MetaBuildDependencyError;
      response
        .status(503)
        .json(
          errorBody(
            dependencyUnavailable ? 'dependency-unavailable' : 'server-unavailable',
            dependencyUnavailable
              ? 'La progression persistante est indisponible.'
              : 'Le serveur de jeu ne peut pas créer la partie.',
          ),
        );
    }
  };
}

export function isAuthenticationError(error: unknown): error is InvalidJwtError {
  return error instanceof InvalidJwtError;
}
