import type { EnemyState, Vector2 } from '@village-survivor/protocol';

export const HIT_FLASH_DURATION_MS = 130;

/**
 * Les événements de simulation ne transportent pas d'identifiant d'entité : ils
 * sont rattachés à l'ennemi le plus proche de la position publiée. Un ennemi se
 * déplace au plus de quelques pixels par tick, la correspondance est donc fiable.
 */
export const EVENT_MATCH_RADIUS = 24;

export function matchEnemyAt(
  enemies: readonly EnemyState[],
  position: Vector2,
  maximumDistance = EVENT_MATCH_RADIUS,
): EnemyState | undefined {
  let nearest: EnemyState | undefined;
  let nearestDistance = maximumDistance * maximumDistance;
  for (const enemy of enemies) {
    const deltaX = enemy.position.x - position.x;
    const deltaY = enemy.position.y - position.y;
    const candidate = deltaX * deltaX + deltaY * deltaY;
    if (candidate <= nearestDistance) {
      nearest = enemy;
      nearestDistance = candidate;
    }
  }
  return nearest;
}

/** Mémorise les impacts récents pour en dériver une intensité décroissante. */
export class HitFlashTracker {
  private readonly hitAt = new Map<string, number>();
  private readonly durationMs: number;

  public constructor(durationMs: number = HIT_FLASH_DURATION_MS) {
    this.durationMs = durationMs;
  }

  public register(enemyId: string, now: number): void {
    this.hitAt.set(enemyId, now);
  }

  /** 1 juste après l'impact, 0 une fois la durée écoulée. */
  public intensity(enemyId: string, now: number): number {
    const hitAt = this.hitAt.get(enemyId);
    if (hitAt === undefined) {
      return 0;
    }
    const elapsed = now - hitAt;
    if (elapsed >= this.durationMs || elapsed < 0) {
      return 0;
    }
    return 1 - elapsed / this.durationMs;
  }

  /** Évite que la table ne grossisse indéfiniment au fil des vagues. */
  public prune(now: number): void {
    for (const [enemyId, hitAt] of this.hitAt) {
      if (now - hitAt >= this.durationMs) {
        this.hitAt.delete(enemyId);
      }
    }
  }
}
