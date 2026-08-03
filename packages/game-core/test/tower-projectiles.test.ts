import { describe, expect, it } from 'vitest';

import { TowerSimulation } from '../src/tower/index.js';

/**
 * Collision des projectiles sur le trajet parcouru.
 *
 * La Longue-vue tire à 950 unités par seconde, soit 47,5 unités par tick de 50 ms. Un coureur
 * offre 9 unités de rayon et la balle 3 : la fenêtre de contact ne fait que 12 unités. Tant que
 * seule la position d'arrivée était testée, la balle sautait par-dessus sa cible sans jamais la
 * toucher — l'arme de précision ratait visiblement ce qu'elle visait.
 */
describe('collision des projectiles', () => {
  const NEUTRAL = { sequence: 0, moveX: 0, moveY: 0, aimX: 1, aimY: 0 } as const;

  function armedWithMarksman(seed: string): TowerSimulation {
    const simulation = new TowerSimulation(seed);
    simulation.start();
    simulation.step({
      'player-1': { ...NEUTRAL, sequence: 1, selectUpgradeId: 'weapon:marksman' },
    });
    return simulation;
  }

  function playerPosition(simulation: TowerSimulation): { x: number; y: number } {
    const player = simulation.createSnapshot().player;
    return { x: player.position.x, y: player.position.y };
  }

  function monsterHp(simulation: TowerSimulation, id: string): number | undefined {
    return simulation.createSnapshot().monsters.find((monster) => monster.id === id)?.hp;
  }

  it("touche une cible située entre deux positions successives d'un tir rapide", () => {
    const simulation = armedWithMarksman('sweep-hit');
    expect(simulation.createSnapshot().player.activeWeaponId).toBe('marksman');

    const origin = playerPosition(simulation);
    // 30 unités devant : au-delà de la fenêtre de contact autour de la position d'arrivée
    // (47,5), donc invisible pour un test ponctuel, mais bien sur le trajet.
    const id = simulation.spawnMonster('runner', { x: origin.x + 30, y: origin.y });
    const before = monsterHp(simulation, id);
    expect(before).toBeGreaterThan(0);

    for (let tick = 0; tick < 3; tick += 1) {
      simulation.step({ 'player-1': { ...NEUTRAL, sequence: 2 + tick, fire: true } });
    }

    const after = monsterHp(simulation, id);
    // Le monstre est touché : soit il a perdu des points de vie, soit il est mort et a disparu.
    expect(after === undefined || after < (before ?? 0)).toBe(true);
  });

  it('ne touche pas une cible située derrière le tireur', () => {
    const simulation = armedWithMarksman('sweep-behind');
    const origin = playerPosition(simulation);
    const id = simulation.spawnMonster('runner', { x: origin.x - 200, y: origin.y });
    const before = monsterHp(simulation, id);

    // Tir vers +X, cible à −200 : le segment parcouru ne la croise jamais.
    simulation.step({ 'player-1': { ...NEUTRAL, sequence: 2, fire: true } });
    simulation.step({ 'player-1': { ...NEUTRAL, sequence: 3 } });

    expect(monsterHp(simulation, id)).toBe(before);
  });

  it('fait détoner un kamikaze abattu, et pas seulement au contact', () => {
    // Le réglage et les règles de gameplay annoncent une explosion « au contact ou à sa mort ».
    // Seul le contact était implémenté : abattre un kamikaze le désamorçait, ce qui retirait
    // toute tension à cet ennemi — il suffisait de le tirer de loin.
    const simulation = armedWithMarksman('kamikaze-shot');
    const start = simulation.createSnapshot();
    const shooter = playerPosition(simulation);
    const heart = start.heart.position;
    const before = start.heart.hp;

    // Placement contraint par trois bornes : à plus de 70 du Cœur pour ne pas le toucher au
    // contact, à moins de 125 pour que l'explosion l'atteigne (rayon 70 + rayon du Cœur 55),
    // et assez loin du tireur pour être abattu bien avant de l'atteindre. Le joueur ne démarre
    // pas sur le Cœur : la cible se place donc par rapport au Cœur, et la visée est calculée.
    const target = { x: heart.x + 100, y: heart.y };
    const kamikazeId = simulation.spawnMonster('kamikaze', target);
    const internals = simulation as unknown as {
      monsters: Array<{ id: string; speed: number }>;
    };
    const stationaryTarget = internals.monsters.find((monster) => monster.id === kamikazeId);
    if (stationaryTarget !== undefined) stationaryTarget.speed = 0;

    for (let tick = 0; tick < 120; tick += 1) {
      const movingTarget = simulation
        .createSnapshot()
        .monsters.find((monster) => monster.id === kamikazeId)?.position;
      if (movingTarget === undefined) break;
      simulation.step({
        'player-1': {
          sequence: 2 + tick,
          moveX: 0,
          moveY: 0,
          aimX: movingTarget.x - shooter.x,
          aimY: movingTarget.y - shooter.y,
          fire: true,
        },
      });
    }

    const after = simulation.createSnapshot();
    expect(after.monsters).toHaveLength(0);
    expect(after.heart.hp).toBeLessThan(before);
  });

  it('reste déterministe : deux parties identiques touchent identiquement', () => {
    const run = (): string => {
      const simulation = armedWithMarksman('sweep-determinism');
      const origin = playerPosition(simulation);
      simulation.spawnMonster('runner', { x: origin.x + 30, y: origin.y });
      simulation.spawnMonster('chaser', { x: origin.x + 120, y: origin.y });
      for (let tick = 0; tick < 6; tick += 1) {
        simulation.step({ 'player-1': { ...NEUTRAL, sequence: 2 + tick, fire: true } });
      }
      return JSON.stringify(simulation.createSnapshot().monsters);
    };

    expect(run()).toBe(run());
  });
});
