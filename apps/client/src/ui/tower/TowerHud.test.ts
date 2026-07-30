import type { TowerGameState, TowerMonsterState } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { TowerHud } from './TowerHud.js';

function createState(monsters: readonly TowerMonsterState[] = []): TowerGameState {
  const player: TowerGameState['player'] = {
    id: 'local',
    position: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    hp: 90,
    maxHp: 100,
    level: 3,
    experience: 30,
    experienceToNext: 100,
    gold: 14,
    activeWeaponId: 'rifle',
    weapons: [
      { id: 'rifle', level: 2, fireRate: 0.2, bulletDamage: 12, projectileCount: 1 },
      { id: 'shotgun', level: 1, fireRate: 0.8, bulletDamage: 25, projectileCount: 4 },
      { id: 'marksman', level: 1, fireRate: 1.1, bulletDamage: 48, projectileCount: 1 },
    ],
    fireRate: 0.2,
    bulletDamage: 12,
    pendingUpgrades: 0,
    upgradeChoices: [],
    downedRemainingMs: 0,
  };

  return {
    tick: 0,
    elapsedMs: 0,
    status: 'running',
    seed: 'hud-world',
    world: { width: 3200, height: 3200, spawnZoneRadius: 1200 },
    biome: { id: 'badlands', affinity: 'fire', cycle: 1, startsAtWave: 4, durationWaves: 3 },
    wave: 5,
    scrapFund: 20,
    globalDefenseUpgrades: [],
    globalDefenseShop: {
      rotationId: 0,
      offerIds: ['fortify-heart', 'network-damage', 'network-range'],
    },
    sharedQuest: {
      rotationId: 0,
      id: 'cull-the-horde',
      objective: 'kill-monsters',
      progress: 3,
      target: 5,
      rewardScrap: 18,
      completedCount: 0,
    },
    merchantShop: {
      rotationId: 1,
      offerIds: ['super-rail', 'super-battery'],
    },
    player,
    players: [player],
    heart: { position: { x: 0, y: 0 }, hp: 400, maxHp: 400, radius: 36 },
    turrets: [],
    monsters,
    projectiles: [],
    scraps: [],
    events: [],
  };
}

describe('TowerHud living-world projection', () => {
  it('shows the current biome, affinity, and wave objective from the snapshot', () => {
    const root = { innerHTML: '' } as HTMLElement;
    const hud = new TowerHud(root);

    hud.render(createState());

    expect(root.innerHTML).toContain('Biome actif');
    expect(root.innerHTML).toContain('Terres arides');
    expect(root.innerHTML).toContain('Affinité');
    expect(root.innerHTML).toContain('Feu');
    expect(root.innerHTML).toContain('Défendre la vague 5');
  });

  it('raises an explicit boss objective when a boss is present in the snapshot', () => {
    const root = { innerHTML: '' } as HTMLElement;
    const hud = new TowerHud(root);
    const boss: TowerMonsterState = {
      id: 'boss-1',
      kind: 'brute',
      rarity: 'boss',
      affinity: 'fire',
      trait: 'colossus',
      position: { x: 200, y: 0 },
      hp: 900,
      maxHp: 900,
      radius: 27,
    };

    hud.render(createState([boss]));

    expect(root.innerHTML).toContain('tower-hud-objective--boss');
    expect(root.innerHTML).toContain('BOSS');
    expect(root.innerHTML).toContain('Colosse Feu');
  });

  it('projects the current shared quest, including bounded progress and the server reward', () => {
    const root = { innerHTML: '' } as HTMLElement;
    const hud = new TowerHud(root);
    const state = createState();
    const completedQuest: TowerGameState = {
      ...state,
      sharedQuest: {
        ...state.sharedQuest,
        rotationId: 1,
        id: 'elite-bounty',
        objective: 'kill-elite-or-boss',
        progress: 7,
        target: 1,
        rewardScrap: 25,
        completedCount: 4,
      },
    };

    hud.render(completedQuest);

    expect(root.innerHTML).toContain('Objectif partagé');
    expect(root.innerHTML).toContain('Rotation 2');
    expect(root.innerHTML).toContain('Prime d’élite');
    expect(root.innerHTML).toContain('Progression 1 / 1');
    expect(root.innerHTML).toContain('+25 ferraille');
    expect(root.innerHTML).toContain('width:100%');
  });
});
