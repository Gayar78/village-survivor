import { TowerSimulation } from '@village-survivor/game-core';
import type { TowerGameState } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { syncTowerState, TowerStateSchema } from './towerState.js';

describe('Schema Colyseus Tower', () => {
  it('partage players et les entités, jamais player ni events', () => {
    const simulation = new TowerSimulation('schema-test', { playerIds: ['local-user'] });
    simulation.start();
    simulation.step({});
    const schema = new TowerStateSchema();
    syncTowerState(schema, simulation.createSnapshot(), 'running');
    const json = schema.toJSON() as Record<string, unknown>;
    expect(json.phase).toBe('running');
    expect(json.tick).toBe(1);
    expect(json.players).toMatchObject({ 'local-user': { id: 'local-user' } });
    expect(json).not.toHaveProperty('seed');
    expect(json).not.toHaveProperty('player');
    expect(json).not.toHaveProperty('events');
  });

  it('projette les zones, télégraphes et états visuels ajoutés au roster Torri', () => {
    const simulation = new TowerSimulation('schema-torri-state', { playerIds: ['local-user'] });
    simulation.spawnMonster('sniper', { x: 120, y: -80 });
    const snapshot = simulation.createSnapshot();
    const monster = snapshot.monsters[0];
    expect(monster).toBeDefined();
    if (monster === undefined) return;
    const source: TowerGameState = {
      ...snapshot,
      monsters: [
        {
          ...monster,
          shieldRatio: 0.5,
          camouflaged: true,
          empowered: true,
          temporal: { status: 'frozen' },
          ability: {
            kind: 'ranged',
            phase: 'telegraph',
            remainingMs: 300,
            totalMs: 600,
            radius: 42,
            targetPosition: { x: 300, y: 400 },
          },
        },
      ],
      monsterZones: [
        {
          id: 'zone-ray-1',
          kind: 'ray',
          position: { x: 10, y: 20 },
          radius: 8,
          remainingMs: 400,
          durationMs: 800,
          endPosition: { x: 80, y: 90 },
        },
      ],
    };
    const schema = new TowerStateSchema();
    syncTowerState(schema, source, 'running');
    const json = schema.toJSON() as Record<string, unknown>;
    expect(json.monsterZones).toMatchObject({
      'zone-ray-1': {
        kind: 'ray',
        endPosition: { x: 80, y: 90 },
      },
    });
    expect(json.monsters).toMatchObject({
      [monster.id]: {
        shieldRatio: 0.5,
        camouflaged: true,
        empowered: true,
        temporal: { status: 'frozen' },
        ability: {
          kind: 'ranged',
          targetPosition: { x: 300, y: 400 },
        },
      },
    });
    expect(json).toHaveProperty('timelands');
    expect(json).toHaveProperty('endgame');
  });
});
