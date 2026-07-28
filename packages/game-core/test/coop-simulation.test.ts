import { defaultContent } from '@village-survivor/content';
import type { PlayerInput } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { GameSimulation } from '../src/index.js';

function move(sequence: number, moveX: number, moveY: number): PlayerInput {
  return { sequence, moveX, moveY };
}

const COOP_IDS = ['player-1', 'player-2'] as const;

describe('GameSimulation co-op (N avatars, progression partagée)', () => {
  it('déplace chaque avatar indépendamment selon son propre input via stepMulti', () => {
    const simulation = new GameSimulation(defaultContent, 'coop-move', {
      playerIds: [...COOP_IDS],
    });
    simulation.start();

    const before = simulation.createSnapshot().players;
    const p1Before = before.find((player) => player.id === 'player-1')!;
    const p2Before = before.find((player) => player.id === 'player-2')!;

    // player-1 part vers la droite, player-2 vers la gauche : trajectoires opposées.
    for (let tick = 0; tick < 5; tick += 1) {
      simulation.stepMulti({
        'player-1': move(tick, 1, 0),
        'player-2': move(tick, -1, 0),
      });
    }

    const after = simulation.createSnapshot().players;
    const p1After = after.find((player) => player.id === 'player-1')!;
    const p2After = after.find((player) => player.id === 'player-2')!;

    expect(p1After.position.x).toBeGreaterThan(p1Before.position.x);
    expect(p2After.position.x).toBeLessThan(p2Before.position.x);
    // Les deux avatars occupent des positions distinctes : le mouvement est bien indépendant.
    expect(p1After.position).not.toEqual(p2After.position);
  });

  it('expose exactement deux avatars avec les bons identifiants dans le snapshot', () => {
    const simulation = new GameSimulation(defaultContent, 'coop-players', {
      playerIds: [...COOP_IDS],
    });
    simulation.start();

    const snapshot = simulation.createSnapshot();
    expect(snapshot.players).toHaveLength(2);
    expect(snapshot.players.map((player) => player.id)).toEqual(['player-1', 'player-2']);
    // L'avatar « local » du snapshot est bien le primaire (aucun localPlayerId → players[0]).
    expect(snapshot.player.id).toBe('player-1');
  });

  it("partage la progression : l'XP d'un avatar élève le niveau de TOUS les avatars", () => {
    const simulation = new GameSimulation(defaultContent, 'coop-xp', { playerIds: [...COOP_IDS] });
    simulation.start();

    const firstThreshold = defaultContent.progression.experiencePerLevel[0]!;
    simulation.giveExperience(firstThreshold + 25);
    // Un tick propage la progression canonique vers tous les avatars (syncSharedProgression).
    simulation.stepMulti({});

    const [primary, secondary] = simulation.createSnapshot().players;
    expect(primary!.level).toBeGreaterThanOrEqual(2);
    expect(secondary!.level).toBe(primary!.level);
    expect(secondary!.experience).toBe(primary!.experience);
    expect(secondary!.experienceToNext).toBe(primary!.experienceToNext);
  });

  it('ne perd la partie que lorsque TOUS les avatars sont à terre', () => {
    // Avatars fragiles (1 PV, aucun bouclier) pour rendre les morts déterministes.
    const fragile = {
      ...defaultContent,
      player: { ...defaultContent.player, maxHp: 1 },
      barrier: { ...defaultContent.barrier, maxWard: 0 },
    };
    const simulation = new GameSimulation(fragile, 'coop-defeat', { playerIds: [...COOP_IDS] });
    simulation.start();

    // Met l'avatar primaire à 0 PV ; le second reste vivant → la partie continue.
    simulation.damagePlayer(10);
    let snapshot = simulation.createSnapshot();
    expect(snapshot.players.find((player) => player.id === 'player-1')!.hp).toBe(0);
    expect(snapshot.players.find((player) => player.id === 'player-2')!.hp).toBeGreaterThan(0);
    expect(snapshot.status).toBe('running');

    // Achève le second avatar via un assaillant posé sur lui : la défaite se déclenche alors.
    const secondPosition = snapshot.players.find((player) => player.id === 'player-2')!.position;
    simulation.spawnEnemy('raider', secondPosition);
    let guard = 0;
    while (simulation.createSnapshot().status === 'running' && guard < 500) {
      simulation.stepMulti({});
      guard += 1;
    }

    snapshot = simulation.createSnapshot();
    expect(snapshot.players.every((player) => player.hp <= 0)).toBe(true);
    expect(snapshot.status).toBe('defeat');
  });

  it('conserve le comportement solo : step applique tout à player-1', () => {
    const simulation = new GameSimulation(defaultContent, 'coop-solo-compat');
    simulation.start();
    const snapshot = simulation.createSnapshot();
    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.players[0]!.id).toBe('player-1');
    // step reste un point d'entrée valide et applique bien l'input à l'avatar primaire.
    simulation.step(move(1, 1, 0));
    expect(simulation.createSnapshot().players[0]!.position.x).toBeGreaterThan(
      snapshot.players[0]!.position.x,
    );
  });
});
