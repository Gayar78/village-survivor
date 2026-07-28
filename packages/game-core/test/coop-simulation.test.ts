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

  it('met un avatar « à terre » à 0 PV puis le fait réapparaître, sans défaite en co-op', () => {
    // Avatars fragiles (1 PV) pour rendre la chute déterministe.
    const fragile = {
      ...defaultContent,
      player: { ...defaultContent.player, maxHp: 1 },
      barrier: { ...defaultContent.barrier, maxWard: 0 },
    };
    const simulation = new GameSimulation(fragile, 'coop-downed', { playerIds: [...COOP_IDS] });
    simulation.start();

    // Met l'avatar primaire à 0 PV : il passe « à terre » (pas de défaite en co-op).
    simulation.damagePlayer(10);
    let snapshot = simulation.createSnapshot();
    const downed = snapshot.players.find((player) => player.id === 'player-1')!;
    expect(downed.hp).toBe(0);
    expect(downed.downedRemainingMs).toBeGreaterThan(0);
    expect(snapshot.status).toBe('running');

    // Avance jusqu'à la réapparition (les avatars restent immobiles, le village est sûr).
    let guard = 0;
    while (
      guard < 4000 &&
      (simulation.createSnapshot().players.find((player) => player.id === 'player-1')?.hp ?? 0) <= 0
    ) {
      simulation.stepMulti({});
      guard += 1;
    }

    snapshot = simulation.createSnapshot();
    const revived = snapshot.players.find((player) => player.id === 'player-1')!;
    expect(revived.hp).toBeGreaterThan(0);
    expect(revived.downedRemainingMs).toBe(0);
    expect(snapshot.status).toBe('running');
  });

  it('donne à chaque avatar ses PROPRES améliorations (choix personnels)', () => {
    const simulation = new GameSimulation(defaultContent, 'coop-upg', { playerIds: [...COOP_IDS] });
    simulation.start();

    // Un niveau gagné en commun ⇒ chaque avatar reçoit une offre d'amélioration.
    const firstThreshold = defaultContent.progression.experiencePerLevel[0]!;
    simulation.giveExperience(firstThreshold + 5);
    simulation.stepMulti({});

    const offer = simulation.createSnapshot().players;
    const p1Offer = offer.find((player) => player.id === 'player-1')!;
    const p2Offer = offer.find((player) => player.id === 'player-2')!;
    expect(p1Offer.upgradeChoices.length).toBeGreaterThan(0);
    expect(p2Offer.upgradeChoices.length).toBeGreaterThan(0);

    // player-1 choisit une amélioration ; player-2 n'y touche pas.
    const chosen = p1Offer.upgradeChoices[0]!.id;
    simulation.stepMulti({
      'player-1': { sequence: 1, moveX: 0, moveY: 0, selectUpgradeId: chosen },
    });

    const after = simulation.createSnapshot().players;
    const p1 = after.find((player) => player.id === 'player-1')!;
    const p2 = after.find((player) => player.id === 'player-2')!;
    // Le choix est PERSONNEL : seul player-1 l'a enregistré, player-2 garde son offre.
    expect(p1.selectedUpgrades).toContain(chosen);
    expect(p2.selectedUpgrades).not.toContain(chosen);
    expect(p2.upgradeChoices.length).toBeGreaterThan(0);
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
