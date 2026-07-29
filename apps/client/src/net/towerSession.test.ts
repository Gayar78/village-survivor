import type { TowerInput } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import {
  parseTowerInputBatch,
  TOWER_INPUT_BATCH_TICKS,
  TOWER_INPUT_DELAY_TICKS,
  TOWER_LOCKSTEP_EVENTS,
  towerFingerprintBroadcast,
  towerInputBatchBroadcast,
  towerReadyBroadcast,
  TowerFingerprintMonitor,
  TowerLockstepInputBuffer,
  TowerReadyBarrier,
  type TowerInputBatchMessage,
} from './towerSession.js';

const roster = new Set(['host', 'guest']);

function input(sequence: number, actionId?: string): TowerInput {
  return {
    sequence,
    moveX: 1,
    moveY: -1,
    aimX: 42,
    aimY: 0,
    fire: true,
    ...(actionId === undefined ? {} : { discreteActionId: actionId, selectUpgradeId: 'offer-1' }),
  };
}

function batch(senderId: string, ...ticks: number[]): TowerInputBatchMessage {
  return { senderId, frames: ticks.map((tick) => ({ tick, input: input(tick) })) };
}

describe('barrière de démarrage lockstep', () => {
  it('attend chaque membre unique du roster et ignore les inconnus', () => {
    const barrier = new TowerReadyBarrier(roster);

    expect(barrier.markLocalReady('host')).toBe(true);
    expect(barrier.complete).toBe(false);
    expect(barrier.missingIds).toEqual(['guest']);
    expect(barrier.accept({ senderId: 'outsider' })).toBe(false);
    expect(barrier.accept({ senderId: 'host' })).toBe(true);
    expect(barrier.complete).toBe(false);
    expect(barrier.accept({ senderId: 'guest' })).toBe(true);
    expect(barrier.complete).toBe(true);
  });
});

describe('frames d’entrée par tick', () => {
  it('ne simule pas lorsqu’une frame joueur manque', () => {
    const buffer = new TowerLockstepInputBuffer(roster);

    expect(buffer.acceptBatch(batch('host', 0))).toBe(1);
    expect(buffer.takeNextTick()).toBeNull();
    expect(buffer.nextTick).toBe(0);
  });

  it('récupère une frame Broadcast perdue grâce à la fenêtre du batch suivant', () => {
    const buffer = new TowerLockstepInputBuffer(roster);

    buffer.acceptBatch(batch('host', 0, 1));
    // Le premier paquet guest (qui contenait le tick 0) est perdu.
    buffer.acceptBatch(batch('guest', 1));
    expect(buffer.takeNextTick()).toBeNull();

    // Le paquet suivant répète la fenêtre récente, dont le tick 0 manquant.
    expect(buffer.acceptBatch(batch('guest', 0, 1))).toBe(1);
    expect(buffer.takeNextTick()).toEqual({ host: input(0), guest: input(0) });
    expect(buffer.takeNextTick()).toEqual({ host: input(1), guest: input(1) });
    expect(TOWER_INPUT_BATCH_TICKS).toBeGreaterThanOrEqual(8);
    expect(TOWER_INPUT_DELAY_TICKS).toBe(4);
  });

  it('accepte les nouvelles frames d’un batch qui répète aussi des ticks déjà joués', () => {
    const buffer = new TowerLockstepInputBuffer(roster);

    buffer.acceptBatch(batch('host', 0));
    buffer.acceptBatch(batch('guest', 0));
    expect(buffer.takeNextTick()).not.toBeNull();

    expect(buffer.acceptBatch(batch('host', 0, 1))).toBe(1);
    expect(buffer.acceptBatch(batch('guest', 0, 1))).toBe(1);
    expect(buffer.takeNextTick()).toEqual({ host: input(1), guest: input(1) });
  });

  it('déduplique une frame et n’applique son action discrète qu’une fois', () => {
    const buffer = new TowerLockstepInputBuffer(roster);
    const guestAction: TowerInputBatchMessage = {
      senderId: 'guest',
      frames: [{ tick: 0, input: input(10, 'action-10') }],
    };

    expect(buffer.acceptBatch(batch('host', 0))).toBe(1);
    expect(buffer.acceptBatch(guestAction)).toBe(1);
    expect(buffer.acceptBatch(guestAction)).toBe(0);
    expect(buffer.takeNextTick()?.guest).toMatchObject({
      discreteActionId: 'action-10',
      selectUpgradeId: 'offer-1',
    });
    expect(buffer.takeNextTick()).toBeNull();
  });

  it('rejette roster usurpé, tick hors bornes, input invalide et batch surdimensionné', () => {
    expect(parseTowerInputBatch(batch('outsider', 0), roster, 0, 10)).toBeNull();
    expect(parseTowerInputBatch(batch('guest', 11), roster, 0, 10)).toBeNull();
    expect(
      parseTowerInputBatch(
        {
          senderId: 'guest',
          frames: [{ tick: 0, input: { ...input(0), moveX: 2 } }],
        },
        roster,
        0,
        10,
      ),
    ).toBeNull();
    expect(
      parseTowerInputBatch(
        {
          senderId: 'guest',
          frames: Array.from({ length: 17 }, (_, tick) => ({ tick, input: input(tick) })),
        },
        roster,
        0,
        20,
      ),
    ).toBeNull();
  });
});

describe('protocole Broadcast minimal', () => {
  it('n’émet que ready, input-batch et fingerprint, jamais un état de jeu', () => {
    const packets = [
      towerReadyBroadcast('host'),
      towerInputBatchBroadcast(batch('host', 0)),
      towerFingerprintBroadcast({ senderId: 'host', tick: 20, fingerprint: 'abc' }),
    ];

    expect(packets.map((packet) => packet.event)).toEqual([
      TOWER_LOCKSTEP_EVENTS.ready,
      TOWER_LOCKSTEP_EVENTS.inputBatch,
      TOWER_LOCKSTEP_EVENTS.fingerprint,
    ]);
    expect(packets.some((packet) => packet.event === ('state' as never))).toBe(false);
    expect(JSON.stringify(packets)).not.toContain('monsters');
    expect(JSON.stringify(packets)).not.toContain('projectiles');
  });
});

describe('empreintes d’intégrité', () => {
  it('détecte clairement un mismatch, y compris si l’empreinte distante arrive avant la locale', () => {
    const monitor = new TowerFingerprintMonitor(roster, 'host');

    expect(monitor.accept({ senderId: 'guest', tick: 20, fingerprint: 'remote-hash' })).toEqual({
      status: 'pending',
    });
    expect(monitor.recordLocal(20, 'local-hash')).toContainEqual({
      status: 'mismatch',
      playerId: 'guest',
      tick: 20,
    });
  });

  it('accepte une empreinte identique et ignore les expéditeurs hors roster', () => {
    const monitor = new TowerFingerprintMonitor(roster, 'host');

    expect(monitor.recordLocal(40, 'same-hash')).toEqual([]);
    expect(monitor.accept({ senderId: 'guest', tick: 40, fingerprint: 'same-hash' })).toEqual({
      status: 'match',
    });
    expect(monitor.accept({ senderId: 'outsider', tick: 40, fingerprint: 'evil' })).toEqual({
      status: 'ignored',
    });
  });
});
