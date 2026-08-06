import type { TowerGameState } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { TurretShop } from './TurretShop.js';

function createState(): TowerGameState {
  const player: TowerGameState['player'] = {
    id: 'local',
    position: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    hp: 100,
    maxHp: 100,
    level: 1,
    experience: 0,
    experienceToNext: 100,
    gold: 0,
    activeWeaponId: 'rifle',
    weapons: [
      { id: 'rifle', level: 1, fireRate: 0.2, bulletDamage: 12, projectileCount: 1 },
      { id: 'shotgun', level: 1, fireRate: 0.8, bulletDamage: 25, projectileCount: 4 },
      { id: 'marksman', level: 1, fireRate: 1.1, bulletDamage: 48, projectileCount: 1 },
    ],
    fireRate: 0.2,
    bulletDamage: 12,
    pendingUpgrades: 0,
    upgradeChoices: [],
    downedRemainingMs: 0,
    hostileSlowRemainingMs: 0,
    nearTurret: 'N',
  };

  return {
    tick: 0,
    elapsedMs: 0,
    status: 'running',
    seed: 'merchant-ui',
    world: { width: 3200, height: 3200, spawnZoneRadius: 1200 },
    biome: { id: 'grove', affinity: 'nature', cycle: 0, startsAtWave: 1, durationWaves: 3 },
    timelands: {
      arrival: { status: 'pending' },
      activeEffects: [],
      warden: { status: 'not-spawned' },
    },
    endgame: { phaseStartedAtTick: null, activeTiers: [], nextTier: null, announcement: null },
    wave: 2,
    scrapFund: 100,
    globalDefenseUpgrades: [],
    globalDefenseShop: {
      rotationId: 0,
      offerIds: ['fortify-heart', 'network-damage', 'network-range'],
    },
    sharedQuest: {
      rotationId: 0,
      id: 'cull-the-horde',
      objective: 'kill-monsters',
      progress: 0,
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
    turrets: [
      {
        dir: 'N',
        position: { x: 0, y: -100 },
        angle: 0,
        hp: 100,
        maxHp: 100,
        energy: 50,
        maxEnergy: 100,
        range: 240,
        modules: [],
        targetPriority: 'nearest',
        alive: true,
      },
    ],
    monsters: [],
    monsterZones: [],
    projectiles: [],
    scraps: [],
    events: [],
  };
}

function createRoot(): HTMLElement {
  return {
    innerHTML: '',
    addEventListener: () => undefined,
  } as unknown as HTMLElement;
}

describe('TurretShop merchant offers', () => {
  it('renders only the super-modules in the authoritative merchant rotation', () => {
    const root = createRoot();
    const shop = new TurretShop(root, () => undefined);
    shop.open();

    shop.render(createState());

    expect(root.innerHTML).toContain('Marchand itinérant');
    expect(root.innerHTML).toContain('Rotation 2');
    expect(root.innerHTML).toContain('Rail spectral');
    expect(root.innerHTML).toContain('Batterie quantique');
    expect(root.innerHTML).toContain('module:super-rail');
    expect(root.innerHTML).toContain('module:super-battery');
    expect(root.innerHTML).not.toContain('Surmultiplicateur');
    expect(root.innerHTML).not.toContain('module:super-overdrive');
  });

  it('delegates a merchant module action once while the existing double-click lock is pending', () => {
    const listeners = new Map<string, (event: Event) => void>();
    const actions: string[] = [];
    const button = {
      dataset: { action: 'module:super-rail' },
      disabled: false,
      closest: () => button,
    };
    const root = {
      innerHTML: '',
      addEventListener: (type: string, listener: (event: Event) => void) =>
        listeners.set(type, listener),
      querySelectorAll: () => [button],
    } as unknown as HTMLElement;
    const originalElement = Object.getOwnPropertyDescriptor(globalThis, 'Element');
    class TestElement {}

    Object.defineProperty(globalThis, 'Element', { configurable: true, value: TestElement });
    Object.setPrototypeOf(button, TestElement.prototype);
    try {
      const shop = new TurretShop(root, (_turret, action) => actions.push(action));
      shop.open();
      shop.render(createState());

      const event = { target: button } as unknown as Event;
      listeners.get('pointerdown')?.(event);
      listeners.get('click')?.(event);

      expect(actions).toEqual(['module:super-rail']);
      expect(button.disabled).toBe(true);
    } finally {
      if (originalElement === undefined) {
        delete (globalThis as { Element?: unknown }).Element;
      } else {
        Object.defineProperty(globalThis, 'Element', originalElement);
      }
    }
  });
});
