import { TowerSimulation } from '@village-survivor/game-core';
import type { TowerGameState, TowerInput, Vector2 } from '@village-survivor/protocol';
import { describe, expect, it, vi } from 'vitest';

import type { TowerRenderableSession } from './TowerRenderableSession.js';
import {
  TowerSoloFallbackSession,
  towerGameServerHealth,
  type TowerServerHealth,
} from './TowerSoloFallbackSession.js';

const STATE = new TowerSimulation('fallback-session-double').createSnapshot();

class SessionDouble implements TowerRenderableSession {
  public startCalls = 0;
  public stopCalls = 0;
  public readonly inputs: TowerInput[] = [];
  private readonly stateListeners = new Set<(state: TowerGameState) => void>();
  private readonly issueListeners = new Set<(message: string, terminal?: boolean) => void>();

  public async start(): Promise<void> {
    this.startCalls += 1;
    this.emitState();
  }

  public async stop(): Promise<void> {
    this.stopCalls += 1;
  }

  public sendInput(input: TowerInput): void {
    this.inputs.push(input);
  }

  public subscribe(listener: (state: TowerGameState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  public onConnectionIssue(listener: (message: string, terminal?: boolean) => void): () => void {
    this.issueListeners.add(listener);
    return () => this.issueListeners.delete(listener);
  }

  public getRenderAlpha(): number {
    return 0;
  }

  public getLocalRenderPosition(): Vector2 | undefined {
    return undefined;
  }

  public emitState(): void {
    for (const listener of this.stateListeners) listener(STATE);
  }

  public emitIssue(message: string, terminal?: boolean): void {
    for (const listener of this.issueListeners) listener(message, terminal);
  }
}

function input(sequence: number): TowerInput {
  return { sequence, moveX: 0, moveY: 0, aimX: 1, aimY: 0 };
}

function fallbackWith(health: TowerServerHealth | boolean): {
  fallback: TowerSoloFallbackSession;
  local: SessionDouble;
  server: SessionDouble;
} {
  const server = new SessionDouble();
  const local = new SessionDouble();
  return {
    fallback: new TowerSoloFallbackSession({
      server,
      local,
      serverHealthy: async () => health,
    }),
    server,
    local,
  };
}

describe('sélection solo serveur ou locale', () => {
  it.each([
    ['serveur sain', 'healthy', 'authoritative-server', 'server'],
    ['réponse HTTP non saine', 'unhealthy', 'local-fallback', 'local'],
  ] as const)('choisit %s', async (_label, health, expectedMode, expectedSession) => {
    const { fallback, server, local } = fallbackWith(health);
    const modes = vi.fn();
    fallback.onExecutionMode(modes);

    await fallback.start();

    expect(fallback.getExecutionMode()).toBe(expectedMode);
    expect(modes).toHaveBeenCalledWith(expectedMode);
    expect(server.startCalls).toBe(expectedSession === 'server' ? 1 : 0);
    expect(local.startCalls).toBe(expectedSession === 'local' ? 1 : 0);
  });

  it('ne bascule pas en local lorsque le transport ne confirme aucune réponse HTTP', async () => {
    const { fallback, server, local } = fallbackWith('unreachable');

    await expect(fallback.start()).rejects.toThrow("n'a pas pu être établie");

    expect(server.startCalls).toBe(0);
    expect(local.startCalls).toBe(0);
  });

  it('rebranche un abonnement antérieur et rejoue la dernière entrée avant le démarrage', async () => {
    const { fallback, server } = fallbackWith('healthy');
    const received = vi.fn();
    const latestInput = input(7);
    fallback.subscribe(received);
    fallback.sendInput(latestInput);

    await fallback.start();

    expect(server.inputs).toEqual([latestInput]);
    expect(received).toHaveBeenCalledWith(STATE);
  });

  it('préserve deux abonnements du même callback et leurs désabonnements indépendants', async () => {
    const { fallback, server } = fallbackWith('healthy');
    const received = vi.fn();
    const unsubscribeFirst = fallback.subscribe(received);
    const unsubscribeSecond = fallback.subscribe(received);

    await fallback.start();
    expect(received).toHaveBeenCalledTimes(2);

    unsubscribeFirst();
    server.emitState();
    expect(received).toHaveBeenCalledTimes(3);

    unsubscribeSecond();
    server.emitState();
    expect(received).toHaveBeenCalledTimes(3);
  });

  it('rebranche aussi les notifications de connexion après la sélection', async () => {
    const { fallback, local } = fallbackWith('unhealthy');
    const received = vi.fn();
    fallback.onConnectionIssue(received);

    await fallback.start();
    local.emitIssue('Mode local — progression non enregistrée');

    expect(received).toHaveBeenCalledWith('Mode local — progression non enregistrée', undefined);
  });

  it('n’active aucune session lorsque stop intervient pendant la sélection', async () => {
    let resolveHealth: ((value: TowerServerHealth) => void) | undefined;
    const server = new SessionDouble();
    const local = new SessionDouble();
    const fallback = new TowerSoloFallbackSession({
      server,
      local,
      serverHealthy: () =>
        new Promise<TowerServerHealth>((resolve) => {
          resolveHealth = resolve;
        }),
    });

    const starting = fallback.start();
    await fallback.stop();
    resolveHealth?.('healthy');
    await starting;

    expect(server.startCalls).toBe(0);
    expect(local.startCalls).toBe(0);
  });
});

describe('healthcheck solo', () => {
  it('refait une tentative puis reconnaît le serveur démarré à froid', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('temporary network failure'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    await expect(towerGameServerHealth('https://game.test', fetcher)).resolves.toBe('healthy');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('garde l’incertitude réseau hors du chemin local après deux aborts', async () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(aborted);

    await expect(towerGameServerHealth('https://game.test', fetcher)).resolves.toBe('unreachable');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
