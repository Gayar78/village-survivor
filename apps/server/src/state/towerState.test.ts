import { TowerSimulation } from '@village-survivor/game-core';
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
    expect(json).not.toHaveProperty('player');
    expect(json).not.toHaveProperty('events');
  });
});
