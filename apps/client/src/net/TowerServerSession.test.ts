import { TowerSimulation } from '@village-survivor/game-core';
import { describe, expect, it, vi } from 'vitest';

import {
  appendUnseenTowerEvents,
  predictTowerLocalPosition,
  towerActionsFromInput,
  towerGameStateFromWire,
} from './TowerServerSession.js';
import { isTowerGameServerHealthy } from './TowerSoloFallbackSession.js';

describe('adaptateur de rendu du serveur autoritaire', () => {
  it('reconstruit player depuis l’identité locale sans le recevoir comme champ partagé', () => {
    const simulation = new TowerSimulation('wire-test', { playerIds: ['user-1', 'user-2'] });
    const snapshot = simulation.createSnapshot();
    const { players, turrets, monsters, projectiles, scraps, globalDefenseUpgrades } = snapshot;
    const shared = { ...snapshot } as Record<string, unknown>;
    delete shared.player;
    delete shared.events;
    delete shared.players;
    delete shared.turrets;
    delete shared.monsters;
    delete shared.projectiles;
    delete shared.scraps;
    delete shared.globalDefenseUpgrades;
    const wire = {
      ...shared,
      phase: 'running',
      players: Object.fromEntries(players.map((entry) => [entry.id, entry])),
      turrets: Object.fromEntries(turrets.map((entry) => [entry.dir, entry])),
      monsters: Object.fromEntries(monsters.map((entry) => [entry.id, entry])),
      monsterZones: {
        'zone-1': {
          id: 'zone-1',
          kind: 'ray',
          position: { x: 10, y: 20 },
          radius: 8,
          remainingMs: 400,
          durationMs: 800,
          hasEndPosition: true,
          endPosition: { x: 80, y: 90 },
        },
      },
      projectiles: Object.fromEntries(projectiles.map((entry) => [entry.id, entry])),
      scraps: Object.fromEntries(scraps.map((entry) => [entry.id, entry])),
      globalDefenseUpgrades: Object.fromEntries(
        globalDefenseUpgrades.map((entry) => [entry.id, entry]),
      ),
    };
    const state = towerGameStateFromWire(wire, 'user-2');
    expect(state.seed).toBe('server-authoritative');
    expect(state.players).toHaveLength(2);
    expect(state.player.id).toBe('user-2');
    expect(state.monsterZones).toEqual([
      {
        id: 'zone-1',
        kind: 'ray',
        position: { x: 10, y: 20 },
        radius: 8,
        remainingMs: 400,
        durationMs: 800,
        endPosition: { x: 80, y: 90 },
      },
    ]);
    expect(state.events).toEqual([]);
  });

  it('tolère un ancien état serveur sans zones de monstres', () => {
    const simulation = new TowerSimulation('wire-legacy', { playerIds: ['user-1'] });
    const snapshot = simulation.createSnapshot();
    const legacyWire = {
      ...snapshot,
      phase: 'running',
      players: { 'user-1': snapshot.players[0] },
      turrets: {},
      monsters: {},
      projectiles: {},
      scraps: {},
      globalDefenseUpgrades: {},
      monsterZones: undefined,
    };
    expect(towerGameStateFromWire(legacyWire, 'user-1').monsterZones).toEqual([]);
  });

  it('sépare les actions fiables du contrôle continu et conserve leur identifiant', () => {
    const actions = towerActionsFromInput(
      {
        sequence: 4,
        moveX: 1,
        moveY: 0,
        aimX: 12,
        aimY: 0,
        selectUpgradeId: 'offer-1',
        discreteActionId: 'choice-1',
      },
      () => 'generated',
    );
    expect(actions).toEqual([{ type: 'level', actionId: 'choice-1', offerId: 'offer-1' }]);
  });

  it('borne la prédiction visuelle locale à deux ticks et aux limites du monde', () => {
    expect(
      predictTowerLocalPosition(
        { x: 0, y: 0 },
        { width: 2_000, height: 2_000 },
        { moveX: 1, moveY: 0 },
        99,
      ),
    ).toEqual({ x: 26, y: 0 });
    expect(
      predictTowerLocalPosition(
        { x: 980, y: 0 },
        { width: 2_000, height: 2_000 },
        { moveX: 1, moveY: 0 },
        2,
      ),
    ).toEqual({ x: 984, y: 0 });
  });

  it('accumule deux lots fiables entre deux états et déduplique leurs identifiants', () => {
    const knownIds = new Set<number>();
    const first = appendUnseenTowerEvents([], knownIds, [
      { id: 1, tick: 2, type: 'monster-killed' },
    ]);
    const second = appendUnseenTowerEvents(first, knownIds, [
      { id: 1, tick: 2, type: 'monster-killed' },
      { id: 2, tick: 3, type: 'scrap-collected' },
    ]);
    expect(second.map(({ id }) => id)).toEqual([1, 2]);
  });
});

describe('détection du serveur pour le solo', () => {
  it('reconnaît uniquement le healthcheck JSON exact du serveur Tower', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(isTowerGameServerHealthy('https://game.test', fetcher)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      'https://game.test/health',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
  });

  it.each([
    ['page Vercel réécrite', new Response('<html>Village Survivor</html>', { status: 200 })],
    ['route absente', new Response(null, { status: 404 })],
  ])('refuse une %s', async (_label, response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(isTowerGameServerHealthy('https://static.test/game', fetcher)).resolves.toBe(
      false,
    );
  });

  it('retombe proprement en local lorsque le réseau échoue', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network failed'));
    await expect(isTowerGameServerHealthy('https://offline.test', fetcher)).resolves.toBe(false);
  });
});
