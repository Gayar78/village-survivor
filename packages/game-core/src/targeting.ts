import type { Vector2 } from '@village-survivor/protocol';

import { distanceSquared } from './geometry.js';
import type { MutableDefense, MutableEnemy } from './state.js';

export function findNearestEnemy(
  enemies: readonly MutableEnemy[],
  origin: Vector2,
  maximumDistance: number,
  predicate: (enemy: MutableEnemy) => boolean,
): MutableEnemy | undefined {
  const maximumDistanceSquared = maximumDistance * maximumDistance;
  let nearest: MutableEnemy | undefined;
  let nearestDistance = maximumDistanceSquared;
  for (const enemy of enemies) {
    if (!predicate(enemy)) {
      continue;
    }
    const candidateDistance = distanceSquared(origin, enemy.position);
    if (candidateDistance <= nearestDistance) {
      nearest = enemy;
      nearestDistance = candidateDistance;
    }
  }
  return nearest;
}

export function findNearestDefense(
  defenses: readonly MutableDefense[],
  origin: Vector2,
  maximumDistance: number,
  builtOnly = false,
): MutableDefense | undefined {
  let nearest: MutableDefense | undefined;
  let nearestDistance = maximumDistance * maximumDistance;
  for (const defense of defenses) {
    if (builtOnly && !defense.built) {
      continue;
    }
    const candidateDistance = distanceSquared(origin, defense.position);
    if (candidateDistance <= nearestDistance) {
      nearest = defense;
      nearestDistance = candidateDistance;
    }
  }
  return nearest;
}

export function isEnemyTargetable(enemy: MutableEnemy): boolean {
  return enemy.hp > 0 && (enemy.awake || enemy.kind === 'guardian');
}

export function wakeNearbyEnemies(
  enemies: readonly MutableEnemy[],
  position: Vector2,
  radius: number,
): void {
  const radiusSquared = radius * radius;
  for (const enemy of enemies) {
    if (enemy.kind !== 'guardian' && distanceSquared(position, enemy.position) <= radiusSquared) {
      enemy.awake = true;
    }
  }
}
