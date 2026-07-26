import type { EnemyState } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { HitFlashTracker, matchEnemyAt } from './hit-flash.js';

function enemy(id: string, x: number, y: number): EnemyState {
  return {
    id,
    kind: 'raider',
    position: { x, y },
    home: { x, y },
    hp: 10,
    maxHp: 10,
    awake: true,
    attackCooldownRemainingMs: 0,
  };
}

describe('matchEnemyAt', () => {
  it('attributes an event to the closest enemy', () => {
    const enemies = [enemy('a', 0, 0), enemy('b', 30, 0)];
    expect(matchEnemyAt(enemies, { x: 26, y: 0 })?.id).toBe('b');
  });

  it('ignores enemies beyond the matching radius', () => {
    expect(matchEnemyAt([enemy('a', 500, 500)], { x: 0, y: 0 })).toBeUndefined();
  });

  it('returns nothing when the enemy already left the snapshot', () => {
    expect(matchEnemyAt([], { x: 0, y: 0 })).toBeUndefined();
  });
});

describe('HitFlashTracker', () => {
  it('decays from one to zero over the flash duration', () => {
    const tracker = new HitFlashTracker(100);
    tracker.register('a', 1_000);
    expect(tracker.intensity('a', 1_000)).toBe(1);
    expect(tracker.intensity('a', 1_050)).toBeCloseTo(0.5);
    expect(tracker.intensity('a', 1_100)).toBe(0);
  });

  it('reports nothing for an enemy that was never hit', () => {
    expect(new HitFlashTracker().intensity('ghost', 0)).toBe(0);
  });

  it('restarts the flash on a second hit', () => {
    const tracker = new HitFlashTracker(100);
    tracker.register('a', 1_000);
    tracker.register('a', 1_080);
    expect(tracker.intensity('a', 1_080)).toBe(1);
  });

  it('prunes expired entries only', () => {
    const tracker = new HitFlashTracker(100);
    tracker.register('old', 1_000);
    tracker.register('fresh', 1_090);
    tracker.prune(1_100);
    expect(tracker.intensity('old', 1_100)).toBe(0);
    expect(tracker.intensity('fresh', 1_100)).toBeCloseTo(0.9);
  });
});
