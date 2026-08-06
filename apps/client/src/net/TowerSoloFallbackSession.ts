import type { TowerGameState, TowerInput, Vector2 } from '@village-survivor/protocol';

import type { TowerRenderableSession } from './TowerRenderableSession.js';
import { gameServerEndpoint } from './TowerServerSession.js';

const HEALTH_TIMEOUT_MS = 3_000;
const HEALTH_ATTEMPTS = 2;

/**
 * Résultat du sondage du serveur de jeu.
 *
 * `timeout` et `transport-error` conduisent tous deux au même refus de démarrer, mais ils ne se
 * diagnostiquent pas de la même façon : le premier dit que le serveur est joignable et trop lent,
 * le second que la requête n'a jamais abouti. Les confondre a déjà coûté un diagnostic.
 */
export type TowerServerHealth = 'healthy' | 'unhealthy' | 'timeout' | 'transport-error';
export type TowerSoloExecutionMode = 'authoritative-server' | 'local-fallback';

/** Les deux issues qui interdisent de démarrer une partie, faute de preuve sur le serveur. */
export function isTowerServerUnreachable(health: TowerServerHealth): boolean {
  return health === 'timeout' || health === 'transport-error';
}

const HEALTH_REASON_LABELS: Readonly<Record<TowerServerHealth, string>> = {
  healthy: 'serveur sain',
  unhealthy: 'le serveur a répondu, mais pas comme un serveur de jeu',
  timeout: `le serveur n'a pas répondu en moins de ${HEALTH_TIMEOUT_MS / 1_000} secondes`,
  'transport-error': "la requête n'a jamais abouti (réseau, adresse ou origine)",
};

/** Erreur de démarrage portant la cause exacte, pour la télémétrie comme pour le joueur. */
export class TowerServerUnavailableError extends Error {
  public constructor(public readonly health: TowerServerHealth) {
    super(
      `La disponibilité du serveur de jeu n'a pas pu être établie : ${HEALTH_REASON_LABELS[health]}. ` +
        "La partie locale n'est pas lancée pour éviter une progression non enregistrée.",
    );
    this.name = 'TowerServerUnavailableError';
  }
}

async function inspectTowerGameServerHealth(
  endpoint: string,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<TowerServerHealth> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetcher(`${endpoint}/health`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return 'unhealthy';
    const body: unknown = await response.json().catch(() => null);
    return typeof body === 'object' &&
      body !== null &&
      Object.keys(body).length === 1 &&
      (body as { status?: unknown }).status === 'ok'
      ? 'healthy'
      : 'unhealthy';
  } catch {
    // Ni un abandon ni une panne réseau ne prouvent l'absence du serveur : démarrer alors
    // une partie non persistée ferait perdre silencieusement la voie autoritaire. Seule la
    // cause diffère, et c'est elle qui rend l'incident diagnosticable après coup.
    return timedOut ? 'timeout' : 'transport-error';
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Vérifie deux fois le serveur. Seule une réponse HTTP effectivement reçue et non saine
 * autorise le repli local ; deux échecs de transport restent une indisponibilité à signaler.
 */
export async function towerGameServerHealth(
  endpoint = gameServerEndpoint(),
  fetcher: typeof fetch = fetch,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<TowerServerHealth> {
  let receivedUnhealthyResponse = false;
  let lastUnreachable: TowerServerHealth = 'transport-error';
  for (let attempt = 0; attempt < HEALTH_ATTEMPTS; attempt += 1) {
    const result = await inspectTowerGameServerHealth(endpoint, fetcher, timeoutMs);
    if (result === 'healthy') return result;
    if (result === 'unhealthy') receivedUnhealthyResponse = true;
    else lastUnreachable = result;
  }
  return receivedUnhealthyResponse ? 'unhealthy' : lastUnreachable;
}

/** Une page HTML Vercel répondant 200 ne doit jamais être prise pour un serveur de jeu. */
export async function isTowerGameServerHealthy(
  endpoint = gameServerEndpoint(),
  fetcher: typeof fetch = fetch,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<boolean> {
  return (await towerGameServerHealth(endpoint, fetcher, timeoutMs)) === 'healthy';
}

type SoloFallbackDependencies = Readonly<{
  server: TowerRenderableSession;
  local: TowerRenderableSession;
  serverHealthy?: () => Promise<TowerServerHealth | boolean>;
}>;

type StateSubscription = {
  relay: (state: TowerGameState) => void;
  unsubscribe: () => void;
};

type IssueSubscription = {
  relay: (message: string, terminal?: boolean) => void;
  unsubscribe: () => void;
};

const NOOP_UNSUBSCRIBE = (): void => undefined;

/** Choisit le serveur quand il existe, sinon la simulation locale, avant le premier état solo. */
export class TowerSoloFallbackSession implements TowerRenderableSession {
  private readonly subscriptions = new Set<StateSubscription>();
  private readonly issueSubscriptions = new Set<IssueSubscription>();
  private readonly executionListeners = new Set<(mode: TowerSoloExecutionMode) => void>();
  private readonly serverHealthy: () => Promise<TowerServerHealth | boolean>;
  private active: TowerRenderableSession | undefined;
  private executionMode: TowerSoloExecutionMode | undefined;
  private latestInput: TowerInput | undefined;
  private startPromise: Promise<void> | undefined;
  private stopped = false;

  public constructor(private readonly dependencies: SoloFallbackDependencies) {
    this.serverHealthy = dependencies.serverHealthy ?? (() => towerGameServerHealth());
  }

  public start(): Promise<void> {
    this.startPromise ??= this.selectAndStart();
    return this.startPromise;
  }

  public async stop(): Promise<void> {
    this.stopped = true;
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    for (const subscription of this.issueSubscriptions) subscription.unsubscribe();
    this.subscriptions.clear();
    this.issueSubscriptions.clear();
    this.executionListeners.clear();
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
    const subscription: IssueSubscription = {
      // Un relais propre à l'abonnement préserve deux inscriptions du même callback.
      relay: (message, terminal) => listener(message, terminal),
      unsubscribe: NOOP_UNSUBSCRIBE,
    };
    if (this.active !== undefined) {
      subscription.unsubscribe = this.active.onConnectionIssue(subscription.relay);
    }
    this.issueSubscriptions.add(subscription);
    return () => {
      subscription.unsubscribe();
      this.issueSubscriptions.delete(subscription);
    };
  }

  public onExecutionMode(listener: (mode: TowerSoloExecutionMode) => void): () => void {
    this.executionListeners.add(listener);
    if (this.executionMode !== undefined) listener(this.executionMode);
    return () => this.executionListeners.delete(listener);
  }

  public getExecutionMode(): TowerSoloExecutionMode | undefined {
    return this.executionMode;
  }

  public subscribe(listener: (state: TowerGameState) => void): () => void {
    const subscription: StateSubscription = {
      // Un relais propre à l'abonnement préserve deux inscriptions du même callback.
      relay: (state) => listener(state),
      unsubscribe: NOOP_UNSUBSCRIBE,
    };
    if (this.active !== undefined) {
      subscription.unsubscribe = this.active.subscribe(subscription.relay);
    }
    this.subscriptions.add(subscription);
    return () => {
      subscription.unsubscribe();
      this.subscriptions.delete(subscription);
    };
  }

  private async selectAndStart(): Promise<void> {
    const health = await this.serverHealthResult();
    if (this.stopped) return;
    if (isTowerServerUnreachable(health)) {
      throw new TowerServerUnavailableError(health);
    }
    const executionMode: TowerSoloExecutionMode =
      health === 'healthy' ? 'authoritative-server' : 'local-fallback';
    const active =
      executionMode === 'authoritative-server' ? this.dependencies.server : this.dependencies.local;
    this.active = active;
    this.executionMode = executionMode;
    for (const listener of this.executionListeners) listener(executionMode);
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
      subscription.unsubscribe = active.subscribe(subscription.relay);
    }
    for (const subscription of this.issueSubscriptions) {
      subscription.unsubscribe();
      subscription.unsubscribe = active.onConnectionIssue(subscription.relay);
    }
    if (this.latestInput !== undefined) active.sendInput(this.latestInput);
    await active.start();
  }

  private async serverHealthResult(): Promise<TowerServerHealth> {
    const result = await this.serverHealthy();
    if (typeof result === 'boolean') return result ? 'healthy' : 'unhealthy';
    return result;
  }
}
