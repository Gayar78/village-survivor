import type { TowerGameState, TowerInput, Vector2 } from '@village-survivor/protocol';

import type { TowerRenderableSession } from './TowerRenderableSession.js';
import { gameServerEndpoint } from './TowerServerSession.js';

const HEALTH_TIMEOUT_MS = 1_500;

/** Une page HTML Vercel répondant 200 ne doit jamais être prise pour un serveur de jeu. */
export async function isTowerGameServerHealthy(
  endpoint = gameServerEndpoint(),
  fetcher: typeof fetch = fetch,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(`${endpoint}/health`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const body: unknown = await response.json().catch(() => null);
    return (
      typeof body === 'object' &&
      body !== null &&
      Object.keys(body).length === 1 &&
      (body as { status?: unknown }).status === 'ok'
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

type SoloFallbackDependencies = Readonly<{
  server: TowerRenderableSession;
  local: TowerRenderableSession;
  serverHealthy?: () => Promise<boolean>;
}>;

/** Choisit le serveur quand il existe, sinon la simulation locale, avant le premier état solo. */
export class TowerSoloFallbackSession implements TowerRenderableSession {
  private readonly subscriptions = new Map<(state: TowerGameState) => void, () => void>();
  private readonly issueSubscriptions = new Map<
    (message: string, terminal?: boolean) => void,
    () => void
  >();
  private readonly serverHealthy: () => Promise<boolean>;
  private active: TowerRenderableSession | undefined;
  private latestInput: TowerInput | undefined;
  private startPromise: Promise<void> | undefined;
  private stopped = false;

  public constructor(private readonly dependencies: SoloFallbackDependencies) {
    this.serverHealthy = dependencies.serverHealthy ?? (() => isTowerGameServerHealthy());
  }

  public start(): Promise<void> {
    this.startPromise ??= this.selectAndStart();
    return this.startPromise;
  }

  public async stop(): Promise<void> {
    this.stopped = true;
    for (const unsubscribe of this.subscriptions.values()) unsubscribe();
    for (const unsubscribe of this.issueSubscriptions.values()) unsubscribe();
    this.subscriptions.clear();
    this.issueSubscriptions.clear();
    await this.active?.stop();
  }

  public sendInput(input: TowerInput): void {
    this.latestInput = input;
    this.active?.sendInput(input);
  }

  public getRenderAlpha(): number {
    return this.active?.getRenderAlpha() ?? 0;
  }

  public getLocalRenderPosition(): Vector2 | undefined {
    return this.active?.getLocalRenderPosition();
  }

  public onConnectionIssue(listener: (message: string, terminal?: boolean) => void): () => void {
    this.issueSubscriptions.set(
      listener,
      this.active?.onConnectionIssue(listener) ?? (() => undefined),
    );
    return () => {
      this.issueSubscriptions.get(listener)?.();
      this.issueSubscriptions.delete(listener);
    };
  }

  public subscribe(listener: (state: TowerGameState) => void): () => void {
    this.subscriptions.set(listener, this.active?.subscribe(listener) ?? (() => undefined));
    return () => {
      this.subscriptions.get(listener)?.();
      this.subscriptions.delete(listener);
    };
  }

  private async selectAndStart(): Promise<void> {
    const active = (await this.serverHealthy())
      ? this.dependencies.server
      : this.dependencies.local;
    if (this.stopped) return;
    this.active = active;
    for (const listener of this.subscriptions.keys()) {
      this.subscriptions.set(listener, active.subscribe(listener));
    }
    for (const listener of this.issueSubscriptions.keys()) {
      this.issueSubscriptions.set(listener, active.onConnectionIssue(listener));
    }
    if (this.latestInput !== undefined) active.sendInput(this.latestInput);
    await active.start();
  }
}
