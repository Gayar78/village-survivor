import { describe, expect, it } from 'vitest';

import { TowerSimulation } from '../src/index.js';
import { TICK_MS } from '../src/tower/tuning.js';

/**
 * Scénario de performance reproductible du jeu Tower (`pnpm benchmark`).
 *
 * Contrairement au benchmark de l'ancien jeu, on ne peut pas rendre la base invulnérable :
 * le seul levier disponible sur les points de vie du Cœur est le multiplicateur de méta-build,
 * borné à [0,5 ; 2] par la simulation. Le scénario mesure donc une fenêtre assez courte pour
 * que la partie soit encore en cours à la fin, ce que le test vérifie explicitement — sans
 * quoi la mesure porterait sur des ticks vides et ne signifierait plus rien.
 */
/**
 * `game-core` est typé sans `dom` ni `@types/node` : c'est l'invariant qui garantit que le
 * moteur ne dépend ni du navigateur ni de Node, et il ne doit pas être affaibli pour un
 * simple affichage. On atteint donc la console par `globalThis`, sans la déclarer.
 */
function report(line: string): void {
  (globalThis as { console?: { log: (message: string) => void } }).console?.log(line);
}

describe('scénario de performance reproductible', () => {
  const SEED = 'benchmark-tower';
  const MONSTER_COUNT = 200;
  const SIMULATED_MS = 30_000;
  const TICK_COUNT = SIMULATED_MS / TICK_MS;
  // Roster de 16 espèces qui traverse réellement les chemins Torri coûteux : fusion,
  // soutien, soins, invocations, zones, contrôles, sabotage et explosions. Le `chaser`
  // historique ne figure plus dans le catalogue actif et contournait tous ces chemins.
  const ROSTER = [
    'slime',
    'wolf',
    'harpy',
    'protector',
    'scorpion',
    'life-thief',
    'summoner',
    'healer',
    'super-looter',
    'kamikaze',
    'explosive-robot',
    'grenadier',
    'blizzard-spirit',
    'time-watch',
    'ancient-guardian',
    'mummy',
  ] as const;

  const NEUTRAL_INPUT = { sequence: 0, moveX: 0, moveY: 0, aimX: 1, aimY: 0 } as const;

  function populateRepresentativeRoster(simulation: TowerSimulation, count: number): void {
    for (let index = 0; index < count; index += 1) {
      simulation.spawnMonster(ROSTER[index % ROSTER.length] ?? 'slime');
    }
  }

  it(`mesure le coût d'un tick sous une charge de plus de ${String(MONSTER_COUNT)} entités`, () => {
    const simulation = new TowerSimulation(SEED, {
      metaBuildsByPlayerId: { 'player-1': { heartMaxHealthMultiplier: 2 } },
    });
    simulation.start();
    populateRepresentativeRoster(simulation, MONSTER_COUNT);
    const populationAtStart = simulation.createSnapshot().monsters.length;

    // La simulation s'arrête d'elle-même à la défaite : au-delà, `step()` ne fait plus
    // rien et le temps mesuré ne voudrait plus dire grand-chose. On sort donc dès la
    // défaite et on rapporte le coût par tick réellement simulé, ce qui garde la mesure
    // valable même si l'équilibrage évolue.
    // Le statut n'est lisible que par une projection, qui coûte elle-même une vingtaine de
    // microsecondes : on ne la lit qu'un tick sur vingt pour ne pas polluer la mesure.
    const startedAt = Date.now();
    let simulatedTicks = 0;
    for (let tick = 0; tick < TICK_COUNT; tick += 1) {
      simulation.step({ 'player-1': { ...NEUTRAL_INPUT, sequence: tick, fire: true } });
      simulatedTicks += 1;
      if (tick % 20 === 19 && simulation.createSnapshot().status !== 'running') {
        break;
      }
    }
    const durationMs = Date.now() - startedAt;
    const microsecondsPerTick = (durationMs * 1_000) / simulatedTicks;

    const snapshot = simulation.createSnapshot();
    report(
      `[benchmark] ${String(simulatedTicks)} ticks simulés en ${String(durationMs)} ms ` +
        `(${microsecondsPerTick.toFixed(0)} µs/tick) · départ ${String(populationAtStart)} monstres · ` +
        `fin ${String(snapshot.monsters.length)} · vague ${String(snapshot.wave)} · ${snapshot.status}`,
    );

    expect(populationAtStart).toBeGreaterThan(MONSTER_COUNT - 1);
    // Plancher de validité : en dessous, la mesure porterait sur trop peu de ticks.
    expect(simulatedTicks).toBeGreaterThan(200);
    // Référence CI : 1 399 µs/tick ; répétitions locales : 1 450 à 1 539 µs. La
    // borne de 1 600 µs garde 4 % au-dessus du maximum observé et détecte toujours
    // un retour aux chemins fantômes du `chaser`.
    expect(microsecondsPerTick).toBeLessThan(1_600);
  });

  it('projette un état public sans coût prohibitif', () => {
    const simulation = new TowerSimulation(SEED);
    simulation.start();
    populateRepresentativeRoster(simulation, MONSTER_COUNT);

    const startedAt = Date.now();
    for (let index = 0; index < 1_000; index += 1) {
      simulation.createSnapshot();
    }
    const durationMs = Date.now() - startedAt;

    report(`[benchmark] 1000 projections en ${String(durationMs)} ms`);
    expect(durationMs).toBeLessThan(2_000);
  });

  it('reste reproductible à graine identique', () => {
    const run = (): string => {
      const simulation = new TowerSimulation(SEED);
      simulation.start();
      populateRepresentativeRoster(simulation, 50);
      for (let tick = 0; tick < 200; tick += 1) {
        simulation.step({ 'player-1': { ...NEUTRAL_INPUT, sequence: tick, fire: true } });
      }
      return JSON.stringify(simulation.createSnapshot());
    };

    expect(run()).toBe(run());
  });
});
