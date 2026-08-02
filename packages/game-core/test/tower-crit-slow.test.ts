import { describe, expect, it } from 'vitest';

import { TowerSimulation } from '../src/tower/index.js';
import { CRIT_SLOW, MONSTERS } from '../src/tower/tuning.js';

/**
 * « Fracture glaciale » est l'amélioration la plus rare du catalogue — 0,9 % de chance d'être
 * proposée. Son effet n'était pas implémenté : elle incrémentait un compteur que la simulation
 * ne lisait jamais. Tirer la carte la plus rare du jeu et n'obtenir aucun effet était le pire
 * retour possible pour un joueur.
 */
describe('Fracture glaciale', () => {
  const NEUTRAL = { sequence: 0, moveX: 0, moveY: 0, aimX: 1, aimY: 0 } as const;

  type TestMonster = { id: string; position: { x: number; y: number }; slowStacks: number };
  type TestPlayer = { critChance: number; critSlowStacks: number };
  type Internals = { monsters: TestMonster[]; players: TestPlayer[] };

  function access(simulation: TowerSimulation): Internals {
    return simulation as unknown as Internals;
  }

  /** Joueur au tir systématiquement critique, porteur de l'amélioration. */
  function armedWithCritSlow(seed: string, stacks = 1): TowerSimulation {
    const simulation = new TowerSimulation(seed);
    simulation.start();
    const player = access(simulation).players[0];
    expect(player).toBeDefined();
    player!.critChance = 1;
    player!.critSlowStacks = stacks;
    return simulation;
  }

  function fireAt(simulation: TowerSimulation, ticks: number): void {
    for (let tick = 0; tick < ticks; tick += 1) {
      simulation.step({ 'player-1': { ...NEUTRAL, sequence: tick + 1, fire: true } });
    }
  }

  it('ralentit un monstre touché par un coup critique', () => {
    const simulation = armedWithCritSlow('crit-slow-applies');
    const shooter = simulation.createSnapshot().player.position;
    simulation.spawnMonster('chaser', { x: shooter.x + 120, y: shooter.y });

    fireAt(simulation, 5);

    const monster = access(simulation).monsters[0];
    expect(monster).toBeDefined();
    expect(monster!.slowStacks).toBeGreaterThan(0);
  });

  it('fait avancer un monstre ralenti moins vite qu’un monstre intact', () => {
    // Deux parties identiques, la seule différence étant le port de l'amélioration.
    const distanceCovered = (withUpgrade: boolean): number => {
      const simulation = withUpgrade
        ? armedWithCritSlow('crit-slow-speed', CRIT_SLOW.maxStacks)
        : (() => {
            const plain = new TowerSimulation('crit-slow-speed');
            plain.start();
            const player = access(plain).players[0];
            player!.critChance = 1;
            return plain;
          })();

      const shooter = simulation.createSnapshot().player.position;
      const start = { x: shooter.x + 150, y: shooter.y };
      // Une brute survit à la durée de mesure : un poursuivant mourrait avant la fin, et il n'y
      // aurait plus de position à comparer.
      simulation.spawnMonster('brute', start);
      fireAt(simulation, 12);

      const monster = access(simulation).monsters[0];
      expect(monster).toBeDefined();
      return start.x - monster!.position.x;
    };

    const slowed = distanceCovered(true);
    const intact = distanceCovered(false);
    expect(slowed).toBeLessThan(intact);
  });

  it('plafonne les piles et laisse toujours le monstre avancer', () => {
    const simulation = armedWithCritSlow('crit-slow-cap', 99);
    const shooter = simulation.createSnapshot().player.position;
    simulation.spawnMonster('chaser', { x: shooter.x + 120, y: shooter.y });
    fireAt(simulation, 10);

    const monster = access(simulation).monsters[0];
    expect(monster).toBeDefined();
    expect(monster!.slowStacks).toBeLessThanOrEqual(CRIT_SLOW.maxStacks);
    // Le facteur de vitesse reste strictement positif : un monstre ralenti n'est jamais figé.
    expect(CRIT_SLOW.perStack * CRIT_SLOW.maxStacks).toBeLessThan(1);
    expect(MONSTERS.chaser.speed).toBeGreaterThan(0);
  });

  it('n’applique aucun ralentissement sans l’amélioration', () => {
    const simulation = new TowerSimulation('crit-slow-absent');
    simulation.start();
    const player = access(simulation).players[0];
    player!.critChance = 1;

    const shooter = simulation.createSnapshot().player.position;
    simulation.spawnMonster('chaser', { x: shooter.x + 120, y: shooter.y });
    fireAt(simulation, 5);

    const monster = access(simulation).monsters[0];
    expect(monster).toBeDefined();
    expect(monster!.slowStacks).toBe(0);
  });
});
