import type { TowerSimulation } from '@village-survivor/game-core';
import type { TowerInput, Vector2 } from '@village-survivor/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  sanitizeSoloMetaBuild,
  TowerLocalSession,
  TOWER_LOCAL_MODE_NOTICE,
} from './TowerLocalSession.js';

type SimulationInternals = {
  scrapFund: number;
  players: Array<{ position: Vector2 }>;
  turrets: Array<{ dir: string; position: Vector2; modules: string[] }>;
};

function simulationOf(session: TowerLocalSession): TowerSimulation {
  return (session as unknown as { simulation: TowerSimulation }).simulation;
}

function internals(session: TowerLocalSession): SimulationInternals {
  return simulationOf(session) as unknown as SimulationInternals;
}

function input(sequence: number, turretShop?: TowerInput['turretShop']): TowerInput {
  return {
    sequence,
    moveX: 0,
    moveY: 0,
    aimX: 1,
    aimY: 0,
    ...(turretShop === undefined ? {} : { turretShop }),
  };
}

describe('session Tower locale', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('met en file un achat envoyé entre deux ticks puis le consomme au tick suivant', async () => {
    let nextFrame: ((timestamp: number) => void) | undefined;
    vi.stubGlobal('performance', { now: () => 0 });
    vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void) => {
      nextFrame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);

    const session = new TowerLocalSession({ seed: 'local-discrete-action' });
    const state = internals(session);
    const eastTurret = state.turrets.find((turret) => turret.dir === 'E');
    const player = state.players[0];
    if (eastTurret === undefined || player === undefined) {
      throw new Error('Le harnais local requiert le joueur et la tourelle Est.');
    }
    state.scrapFund = 100;
    player.position = { ...eastTurret.position };
    const snapshots: ReturnType<TowerSimulation['createSnapshot']>[] = [];
    session.subscribe((snapshot) => snapshots.push(snapshot));

    await session.start();
    session.sendInput(input(1, { turret: 'E', action: 'module:overclock' }));
    nextFrame?.(16); // La frame porte l'action, mais les 50 ms du tick ne sont pas atteintes.
    session.sendInput(input(2)); // La frame suivante ne doit pas effacer l'action mise en file.
    nextFrame?.(50);

    expect(snapshots.at(-1)?.turrets.find((turret) => turret.dir === 'E')?.modules).toEqual([
      'overclock',
    ]);
    expect(state.scrapFund).toBe(76);
    await session.stop();
  });

  it('signale sans terminalité que la progression locale ne sera pas enregistrée', async () => {
    vi.stubGlobal('performance', { now: () => 0 });
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);

    const session = new TowerLocalSession({ seed: 'local-notice' });
    const notices = vi.fn();
    session.onConnectionIssue(notices);
    await session.start();

    expect(notices).toHaveBeenCalledWith(TOWER_LOCAL_MODE_NOTICE);
    await session.stop();
  });

  it('ne rattrape jamais plus de cinq ticks après une frame locale plafonnée à 250 ms', async () => {
    let nextFrame: ((timestamp: number) => void) | undefined;
    vi.stubGlobal('performance', { now: () => 0 });
    vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void) => {
      nextFrame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);

    const session = new TowerLocalSession({ seed: 'local-five-ticks-maximum' });
    await session.start();
    nextFrame?.(250);

    expect((simulationOf(session) as unknown as { tick: number }).tick).toBe(5);
    await session.stop();
  });

  it('ferme les clés de méta-build local et borne chaque multiplicateur', () => {
    expect(sanitizeSoloMetaBuild({ damageMultiplier: 9, moveSpeedMultiplier: 0.1 })).toEqual({
      damageMultiplier: 2,
      moveSpeedMultiplier: 0.5,
    });
    expect(sanitizeSoloMetaBuild({ unknownMultiplier: 1 })).toBeUndefined();
    expect(sanitizeSoloMetaBuild({ damageMultiplier: Number.NaN })).toBeUndefined();
  });
});
