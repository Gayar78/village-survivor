import { describe, expect, it } from 'vitest';

import { TowerSimulation } from '../src/tower/index.js';
import { PLAYER, WORLD } from '../src/tower/tuning.js';

import type { TowerInput } from '@village-survivor/protocol';

/**
 * `predictPlayerPosition` sert au rendu de l'avatar local en coopératif : elle dit où le joueur
 * sera une fois jouées les entrées qu'il a déjà émises. Deux propriétés la rendent utilisable —
 * elle doit donner exactement ce que donnera `step`, et elle ne doit rien modifier.
 */
describe('prédiction de position pour le rendu', () => {
  const MOVE_RIGHT: TowerInput = { sequence: 1, moveX: 1, moveY: 0, aimX: 1, aimY: 0 };
  const MOVE_DIAGONAL: TowerInput = { sequence: 1, moveX: 1, moveY: 1, aimX: 1, aimY: 0 };
  /** Un tick de 50 ms à 260 px/s. */
  const STEP_DISTANCE = PLAYER.speed * 0.05;

  type Internals = {
    players: {
      position: { x: number; y: number };
      downedRemainingMs: number;
      hostileSlowRemainingMs: number;
    }[];
    addTemporalEffect(
      kind: 'slow' | 'haste' | 'freeze',
      scale: number,
      durationTicks: number,
      sourceMonsterId: string | null,
      playerId?: string,
    ): void;
  };

  function internals(simulation: TowerSimulation): Internals {
    return simulation as unknown as Internals;
  }

  function started(seed: string): TowerSimulation {
    const simulation = new TowerSimulation(seed);
    simulation.start();
    return simulation;
  }

  it('donne exactement la position que la simulation atteindra', () => {
    const predicted = started('prediction-matches-step').predictPlayerPosition('player-1', [
      MOVE_DIAGONAL,
      MOVE_RIGHT,
      MOVE_DIAGONAL,
    ]);

    const played = started('prediction-matches-step');
    for (const input of [MOVE_DIAGONAL, MOVE_RIGHT, MOVE_DIAGONAL]) {
      played.step({ 'player-1': input });
    }

    // Égalité stricte, pas approchée : c'est ce qui garantit qu'aucun recalage ne sera visible
    // quand la simulation rattrapera la prédiction.
    expect(predicted).toEqual(played.createSnapshot().player.position);
  });

  it('rejoue exactement plusieurs ticks sous ralentissement hostile et temporel', () => {
    const inputs = [MOVE_RIGHT, MOVE_DIAGONAL, MOVE_RIGHT, MOVE_DIAGONAL];
    const predictedSimulation = started('prediction-hostile-slow');
    const predictedPlayer = internals(predictedSimulation).players[0];
    if (predictedPlayer === undefined) throw new Error('Joueur de test absent.');
    predictedPlayer.hostileSlowRemainingMs = 2_000;
    internals(predictedSimulation).addTemporalEffect('slow', 0.5, 100, null, 'player-1');

    const predicted = predictedSimulation.predictPlayerPosition('player-1', inputs);

    const played = started('prediction-hostile-slow');
    const playedPlayer = internals(played).players[0];
    if (playedPlayer === undefined) throw new Error('Joueur de test absent.');
    playedPlayer.hostileSlowRemainingMs = 2_000;
    internals(played).addTemporalEffect('slow', 0.5, 100, null, 'player-1');
    for (const input of inputs) {
      played.step({ 'player-1': input });
    }

    // La suppression du facteur de ralentissement dans la prédiction rendrait cette égalité
    // strictement fausse dès le premier tick.
    expect(predicted).toEqual(played.createSnapshot().player.position);
  });

  it('retire un effet temporel expiré à la même frontière que le pas autoritaire', () => {
    const inputs = [MOVE_RIGHT, MOVE_RIGHT];
    const predictedSimulation = started('prediction-temporal-expiry');
    internals(predictedSimulation).addTemporalEffect('slow', 0.5, 2, null, 'player-1');
    const predicted = predictedSimulation.predictPlayerPosition('player-1', inputs);

    const played = started('prediction-temporal-expiry');
    internals(played).addTemporalEffect('slow', 0.5, 2, null, 'player-1');
    for (const input of inputs) {
      played.step({ 'player-1': input });
    }

    expect(predicted).toEqual(played.createSnapshot().player.position);
  });

  it('applique la dernière entrée au prorata du tick', () => {
    const simulation = started('prediction-fraction');
    const origin = simulation.createSnapshot().player.position;

    const half = simulation.predictPlayerPosition('player-1', [MOVE_RIGHT], 0.5);
    const whole = simulation.predictPlayerPosition('player-1', [MOVE_RIGHT], 1);

    expect(half?.x).toBeCloseTo(origin.x + STEP_DISTANCE / 2, 10);
    expect(whole?.x).toBeCloseTo(origin.x + STEP_DISTANCE, 10);
  });

  it('normalise une entrée diagonale comme la simulation', () => {
    const simulation = started('prediction-diagonal');
    const origin = simulation.createSnapshot().player.position;

    const predicted = simulation.predictPlayerPosition('player-1', [MOVE_DIAGONAL]);
    const dx = (predicted?.x ?? 0) - origin.x;
    const dy = (predicted?.y ?? 0) - origin.y;

    // Une diagonale ne va pas plus vite qu'une ligne droite.
    expect(Math.sqrt(dx * dx + dy * dy)).toBeCloseTo(STEP_DISTANCE, 10);
  });

  it('ne modifie ni l’état ni la trace de déterminisme', () => {
    const withPredictions = started('prediction-is-pure');
    const without = started('prediction-is-pure');

    for (let tick = 0; tick < 40; tick += 1) {
      withPredictions.predictPlayerPosition('player-1', [MOVE_DIAGONAL, MOVE_RIGHT], 0.3);
      withPredictions.step({ 'player-1': MOVE_RIGHT });
      without.step({ 'player-1': MOVE_RIGHT });
    }

    expect(withPredictions.createSnapshot()).toEqual(without.createSnapshot());
  });

  it('immobilise un avatar à terre', () => {
    const simulation = started('prediction-downed');
    const player = internals(simulation).players[0];
    expect(player).toBeDefined();
    player!.downedRemainingMs = 3_000;
    const before = { ...player!.position };

    expect(simulation.predictPlayerPosition('player-1', [MOVE_RIGHT, MOVE_RIGHT])).toEqual(before);
  });

  it('reste dans les limites du monde', () => {
    const simulation = started('prediction-bounds');
    const player = internals(simulation).players[0];
    expect(player).toBeDefined();
    player!.position = { x: WORLD.bound - 1, y: 0 };

    const predicted = simulation.predictPlayerPosition('player-1', [MOVE_RIGHT, MOVE_RIGHT]);

    expect(predicted?.x).toBe(WORLD.bound);
  });

  it('ignore un joueur inconnu', () => {
    expect(started('prediction-unknown').predictPlayerPosition('absent', [MOVE_RIGHT])).toBe(
      undefined,
    );
  });
});
