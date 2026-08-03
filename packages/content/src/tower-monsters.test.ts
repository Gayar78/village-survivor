import { describe, expect, it } from 'vitest';

import {
  TOWER_ACTIVE_MONSTERS,
  TOWER_MONSTER_CATALOG,
  TOWER_NATURAL_MONSTERS,
  findTowerMonster,
} from './tower-monsters.js';

describe('catalogue Tower des monstres Torri', () => {
  it('documente les 80 entrées Torri et le Gardien Ancien sans identifiant dupliqué', () => {
    expect(TOWER_MONSTER_CATALOG).toHaveLength(81);
    expect(new Set(TOWER_MONSTER_CATALOG.map((monster) => monster.id)).size).toBe(81);
    expect(new Set(TOWER_MONSTER_CATALOG.map((monster) => monster.sourceId)).size).toBe(81);
    expect(findTowerMonster('ancient-guardian')?.spawnMode).toBe('boss');
  });

  it('exclut les cinq entités refusées et traite les bandelettes comme un état', () => {
    const excluded = TOWER_MONSTER_CATALOG.filter(
      (monster) => monster.spawnMode === 'excluded',
    ).map((monster) => monster.id);
    expect(excluded).toEqual(['monster-camp', 'statue', 'cannon', 'mortar', 'time-deer']);
    expect(findTowerMonster('mummy-bandages')?.spawnMode).toBe('transient');
    expect(TOWER_ACTIVE_MONSTERS).toHaveLength(75);
  });

  it('ne propose au tirage naturel que des entrées dotées d’un coût de menace', () => {
    expect(TOWER_NATURAL_MONSTERS.length).toBeGreaterThan(50);
    expect(TOWER_NATURAL_MONSTERS.every((monster) => monster.threatCost > 0)).toBe(true);
    expect(TOWER_NATURAL_MONSTERS.every((monster) => monster.spawnMode === 'natural')).toBe(true);
  });
});
