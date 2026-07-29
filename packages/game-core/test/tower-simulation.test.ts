import type { TowerInput } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { TowerSimulation } from '../src/tower/index.js';

function input(overrides: Partial<TowerInput> = {}): TowerInput {
  return {
    sequence: 0,
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    ...overrides,
  };
}

/** Avance N ticks en appliquant le même input à `player-1`. */
function run(
  simulation: TowerSimulation,
  ticks: number,
  overrides: Partial<TowerInput> = {},
): void {
  for (let index = 0; index < ticks; index += 1) {
    simulation.step({ 'player-1': input(overrides) });
  }
}

describe('TowerSimulation', () => {
  it('change d’arme par action bornée et conserve un arsenal personnel en co-op', () => {
    const simulation = new TowerSimulation('seed-arsenal-coop', {
      playerIds: ['player-1', 'player-2'],
    });
    simulation.start();

    simulation.step({
      'player-1': input({ selectUpgradeId: 'weapon:shotgun' }),
      'player-2': input({ selectUpgradeId: 'weapon:marksman' }),
    });
    const snapshot = simulation.createSnapshot();
    expect(snapshot.players.find((player) => player.id === 'player-1')?.activeWeaponId).toBe(
      'shotgun',
    );
    expect(snapshot.players.find((player) => player.id === 'player-2')?.activeWeaponId).toBe(
      'marksman',
    );
    expect(snapshot.players.every((player) => player.weapons.length === 3)).toBe(true);

    simulation.step({ 'player-1': input({ selectUpgradeId: 'weapon:invalid' }) });
    expect(simulation.createSnapshot().player.activeWeaponId).toBe('shotgun');
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('produit des tirs distincts pour fusil, tromblon et arme de précision', () => {
    const fireWith = (weapon: 'rifle' | 'shotgun' | 'marksman') => {
      const simulation = new TowerSimulation(`seed-fire-${weapon}`);
      simulation.start();
      simulation.step({ 'player-1': input({ selectUpgradeId: `weapon:${weapon}` }) });
      simulation.step({ 'player-1': input({ fire: true, aimX: 1 }) });
      return simulation.createSnapshot();
    };

    const rifle = fireWith('rifle');
    const shotgun = fireWith('shotgun');
    const marksman = fireWith('marksman');
    expect(rifle.projectiles.filter((shot) => shot.weaponId === 'rifle')).toHaveLength(1);
    expect(shotgun.projectiles.filter((shot) => shot.weaponId === 'shotgun')).toHaveLength(5);
    expect(marksman.projectiles.filter((shot) => shot.weaponId === 'marksman')).toHaveLength(1);
    expect(marksman.player.bulletDamage).toBeGreaterThan(rifle.player.bulletDamage);
    expect(marksman.player.fireRate).toBeGreaterThan(shotgun.player.fireRate);
  });

  it('ne propose que des cartes compatibles et applique une progression propre au tromblon', () => {
    const simulation = new TowerSimulation('seed-shotgun-upgrade');
    simulation.start();
    simulation.step({ 'player-1': input({ selectUpgradeId: 'weapon:shotgun' }) });
    simulation.giveExperience('player-1', 100_000);

    let shotgunOffer = simulation
      .createSnapshot()
      .player.upgradeChoices.find((card) => card.upgradeId === 'shotgun-choke');
    for (let index = 0; index < 80 && shotgunOffer === undefined; index += 1) {
      const state = simulation.createSnapshot();
      expect(state.player.upgradeChoices.every((card) => card.weaponId !== 'rifle')).toBe(true);
      expect(state.player.upgradeChoices.every((card) => card.weaponId !== 'marksman')).toBe(true);
      const fallback = state.player.upgradeChoices[0];
      expect(fallback).toBeDefined();
      if (fallback === undefined) {
        throw new Error('Une offre était attendue.');
      }
      simulation.step({ 'player-1': input({ selectUpgradeId: fallback.offerId }) });
      shotgunOffer = simulation
        .createSnapshot()
        .player.upgradeChoices.find((card) => card.upgradeId === 'shotgun-choke');
    }
    expect(shotgunOffer).toBeDefined();

    const before = simulation.createSnapshot().player;
    const shotgunBefore = before.weapons.find((weapon) => weapon.id === 'shotgun');
    const rifleBefore = before.weapons.find((weapon) => weapon.id === 'rifle');
    if (shotgunOffer === undefined) {
      throw new Error('La carte du tromblon était attendue.');
    }
    simulation.step({ 'player-1': input({ selectUpgradeId: shotgunOffer.offerId }) });
    const after = simulation.createSnapshot().player;
    const shotgunAfter = after.weapons.find((weapon) => weapon.id === 'shotgun');
    const rifleAfter = after.weapons.find((weapon) => weapon.id === 'rifle');
    expect(shotgunAfter?.level).toBe((shotgunBefore?.level ?? 0) + 1);
    expect(shotgunAfter?.bulletDamage).toBeCloseTo((shotgunBefore?.bulletDamage ?? 0) * 1.12);
    expect(rifleAfter?.level).toBe(rifleBefore?.level);
  });

  it('une balle tue un monstre proche et lâche une ferraille ramassable qui alimente scrapFund', () => {
    const simulation = new TowerSimulation('seed-bullet');
    simulation.start();
    // Monstre au loin en diagonale : hors de portée des tourelles (240 px, portée 320),
    // c'est donc bien une balle DU JOUEUR qui le tue, et la ferraille tombe loin du joueur.
    const monsterPosition = { x: 400, y: 400 };
    simulation.spawnMonster('chaser', monsterPosition);
    const playerPosition = simulation.createSnapshot().player.position;
    const aimX = monsterPosition.x - playerPosition.x;
    const aimY = monsterPosition.y - playerPosition.y;

    expect(simulation.getScrapFund()).toBe(0);

    let killed = false;
    // Tire (sans bouger) vers le monstre : 3 balles suffisent (40 PV, 15 dégâts/balle).
    for (let index = 0; index < 60 && !killed; index += 1) {
      simulation.step({ 'player-1': input({ fire: true, aimX, aimY }) });
      killed = simulation.createSnapshot().monsters.length === 0;
    }
    expect(killed).toBe(true);

    const afterKill = simulation.createSnapshot();
    expect(afterKill.scraps.length).toBeGreaterThan(0);

    // La ferraille est à la position du monstre : le joueur s'y rend pour la ramasser.
    // Le pickupRadius (60) capte la pièce à courte distance ; on approche par pas.
    let collected = false;
    for (let index = 0; index < 400 && !collected; index += 1) {
      const scrap = simulation.createSnapshot().scraps[0];
      if (scrap === undefined) {
        collected = true;
        break;
      }
      const player = simulation.createSnapshot().player.position;
      simulation.step({
        'player-1': input({
          moveX: scrap.position.x - player.x,
          moveY: scrap.position.y - player.y,
        }),
      });
      collected = simulation.getScrapFund() > 0;
    }
    expect(collected).toBe(true);
    expect(simulation.getScrapFund()).toBeGreaterThan(0);
  });

  it('une tourelle tire sur un monstre dans son arc et le blesse (énergie diminue)', () => {
    const simulation = new TowerSimulation('seed-turret');
    simulation.start();
    // Tourelle Est (angle 0°) à (240, 0). Monstre dans son arc et sa portée.
    simulation.spawnMonster('brute', { x: 430, y: 0 });
    const turretBefore = simulation.createSnapshot().turrets.find((turret) => turret.dir === 'E');
    expect(turretBefore).toBeDefined();
    const energyBefore = turretBefore?.energy ?? 0;
    const monsterHpBefore = simulation.createSnapshot().monsters[0]?.hp ?? 0;

    // Assez de ticks pour au moins un tir (fireRate 1.2 s) et l'impact de la balle.
    run(simulation, 40);

    const snapshot = simulation.createSnapshot();
    const turretAfter = snapshot.turrets.find((turret) => turret.dir === 'E');
    const monsterAfter = snapshot.monsters[0];
    expect(turretAfter?.energy).toBeLessThan(energyBefore);
    // Le monstre a été touché : soit encore là avec moins de PV, soit déjà tué.
    if (monsterAfter !== undefined) {
      expect(monsterAfter.hp).toBeLessThan(monsterHpBefore);
    } else {
      expect(snapshot.monsters.length).toBe(0);
    }
  });

  it('giveExperience fait monter de niveau et remplit upgradeChoices ; selectUpgradeId applique et vide (offre personnelle en co-op)', () => {
    const simulation = new TowerSimulation('seed-xp', {
      playerIds: ['player-1', 'player-2'],
    });
    simulation.start();

    simulation.giveExperience('player-1', 1_000);
    const snapshot = simulation.createSnapshot();
    const first = snapshot.players.find((player) => player.id === 'player-1');
    const second = snapshot.players.find((player) => player.id === 'player-2');
    expect(first?.level ?? 1).toBeGreaterThan(1);
    expect(first?.upgradeChoices.length).toBe(3);
    // L'autre joueur n'a rien reçu : progression et offre PERSONNELLES.
    expect(second?.level).toBe(1);
    expect(second?.upgradeChoices.length).toBe(0);

    const pendingBefore = first?.pendingUpgrades ?? 0;
    const offerId = first?.upgradeChoices[0]?.offerId ?? '';
    expect(offerId).not.toBe('');

    simulation.step({ 'player-1': input({ selectUpgradeId: offerId }) });
    const afterSelect = simulation.createSnapshot();
    const firstAfter = afterSelect.players.find((player) => player.id === 'player-1');
    // L'offre courante a été appliquée puis re-tirée (pending>0) OU vidée (pending=0).
    if ((firstAfter?.pendingUpgrades ?? 0) > 0) {
      expect(firstAfter?.upgradeChoices.length).toBe(3);
      expect(firstAfter?.upgradeChoices[0]?.offerId).not.toBe(offerId);
    } else {
      expect(firstAfter?.upgradeChoices.length).toBe(0);
    }
    expect(firstAfter?.pendingUpgrades ?? 0).toBeLessThan(pendingBefore);
    // Le joueur 2 n'est toujours pas concerné.
    const secondAfter = afterSelect.players.find((player) => player.id === 'player-2');
    expect(secondAfter?.upgradeChoices.length).toBe(0);
  });

  it('damageHeart jusqu’à 0 déclenche la défaite', () => {
    const simulation = new TowerSimulation('seed-defeat');
    simulation.start();
    expect(simulation.createSnapshot().status).toBe('running');
    simulation.damageHeart(2_000);
    const snapshot = simulation.createSnapshot();
    expect(snapshot.heart.hp).toBe(0);
    expect(snapshot.status).toBe('defeat');
  });

  it('co-op : un avatar à 0 PV passe à terre puis réapparaît, sans défaite ; la défaite vient du Cœur', () => {
    const simulation = new TowerSimulation('seed-downed', {
      playerIds: ['player-1', 'player-2'],
    });
    simulation.start();

    // Un monstre en contact direct du joueur 2 (positionné au départ près du Cœur).
    const target = simulation.createSnapshot().players.find((player) => player.id === 'player-2');
    expect(target).toBeDefined();
    const targetPosition = target?.position ?? { x: 0, y: 0 };
    // Une brute (25 dégâts/contact) collée : elle abat progressivement l'avatar 2.
    simulation.spawnMonster('brute', { x: targetPosition.x, y: targetPosition.y });

    // player-1 s'éloigne en −X : il reste hors de portée (bien plus rapide que la brute)
    // et, une fois player-2 à terre, il attire la brute loin du Cœur (qui reste sauf).
    const flee: Record<string, TowerInput> = { 'player-1': input({ moveX: -1 }) };

    let downed = false;
    for (let index = 0; index < 2_000 && !downed; index += 1) {
      simulation.step(flee);
      const player = simulation
        .createSnapshot()
        .players.find((candidate) => candidate.id === 'player-2');
      downed = (player?.downedRemainingMs ?? 0) > 0;
    }
    expect(downed).toBe(true);
    // Pas de défaite : le co-op survit à la chute d'un seul avatar.
    expect(simulation.createSnapshot().status).toBe('running');

    // Après la fenêtre de K.O. (30 s), l'avatar réapparaît avec des PV.
    let respawned = false;
    for (let index = 0; index < 700 && !respawned; index += 1) {
      simulation.step(flee);
      const player = simulation
        .createSnapshot()
        .players.find((candidate) => candidate.id === 'player-2');
      respawned = (player?.downedRemainingMs ?? 1) <= 0 && (player?.hp ?? 0) > 0;
    }
    expect(respawned).toBe(true);
    expect(simulation.createSnapshot().status).toBe('running');

    // La défaite ne vient QUE du Cœur.
    simulation.damageHeart(2_000);
    expect(simulation.createSnapshot().status).toBe('defeat');
  });
});
