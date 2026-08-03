import { TowerSimulation } from '@village-survivor/game-core';
import { describe, expect, it } from 'vitest';

import {
  predictTowerLocalPosition,
  towerActionsFromInput,
  towerGameStateFromWire,
} from './TowerServerSession.js';

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
      projectiles: Object.fromEntries(projectiles.map((entry) => [entry.id, entry])),
      scraps: Object.fromEntries(scraps.map((entry) => [entry.id, entry])),
      globalDefenseUpgrades: Object.fromEntries(
        globalDefenseUpgrades.map((entry) => [entry.id, entry]),
      ),
    };
    const state = towerGameStateFromWire(wire, 'user-2');
    expect(state.players).toHaveLength(2);
    expect(state.player.id).toBe('user-2');
    expect(state.events).toEqual([]);
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
});
