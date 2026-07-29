import type { TowerGameState, TowerInput } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import {
  acceptTowerInputMessage,
  MAX_PENDING_TOWER_ACTIONS,
  MAX_REMEMBERED_TOWER_ACTION_IDS,
  parseTowerActionAck,
  parseTowerStateMessage,
  TowerGuestActionQueue,
  TowerHostActionLedger,
} from './towerSession.js';

const roster = new Set(['host', 'guest']);

function command(sequence: number): unknown {
  return {
    id: 'guest',
    input: { sequence, moveX: 1, moveY: -1, aimX: 42, aimY: 0, fire: true },
  };
}

function discreteCommand(sequence: number, actionId?: string): TowerInput {
  return {
    sequence,
    moveX: 0,
    moveY: 0,
    aimX: 1,
    aimY: 0,
    selectUpgradeId: 'offer-1',
    ...(actionId === undefined ? {} : { discreteActionId: actionId }),
  };
}

function state(tick: number): TowerGameState {
  return { tick, players: [] } as unknown as TowerGameState;
}

describe('acceptTowerInputMessage', () => {
  it('accepte une enveloppe valide provenant du roster', () => {
    const sequences = new Map<string, number>();

    expect(acceptTowerInputMessage(command(1), roster, sequences, 'host')).toEqual(command(1));
    expect(sequences.get('guest')).toBe(1);
  });

  it('rejette un expéditeur absent du roster ou usurpant l’hôte', () => {
    const sequences = new Map<string, number>();
    const outsider = { ...(command(1) as Record<string, unknown>), id: 'outsider' };
    const spoofedHost = { ...(command(1) as Record<string, unknown>), id: 'host' };

    expect(acceptTowerInputMessage(outsider, roster, sequences, 'host')).toBeNull();
    expect(acceptTowerInputMessage(spoofedHost, roster, sequences, 'host')).toBeNull();
    expect(sequences.size).toBe(0);
  });

  it('ignore les séquences dupliquées et périmées', () => {
    const sequences = new Map<string, number>();

    expect(acceptTowerInputMessage(command(7), roster, sequences, 'host')).not.toBeNull();
    expect(acceptTowerInputMessage(command(7), roster, sequences, 'host')).toBeNull();
    expect(acceptTowerInputMessage(command(6), roster, sequences, 'host')).toBeNull();
    expect(acceptTowerInputMessage(command(8), roster, sequences, 'host')).not.toBeNull();
  });

  it('rejette les commandes malformées sans consommer leur séquence', () => {
    const sequences = new Map<string, number>();
    const malformed = {
      id: 'guest',
      input: { sequence: 2, moveX: 2, moveY: 0, aimX: Number.NaN, aimY: 0 },
    };

    expect(acceptTowerInputMessage(malformed, roster, sequences, 'host')).toBeNull();
    expect(sequences.size).toBe(0);
    expect(acceptTowerInputMessage(command(2), roster, sequences, 'host')).not.toBeNull();
  });

  it('n’accepte une action ponctuelle qu’une fois pour une séquence donnée', () => {
    const sequences = new Map<string, number>();
    const discrete = {
      id: 'guest',
      input: {
        sequence: 12,
        moveX: 0,
        moveY: 0,
        aimX: 1,
        aimY: 0,
        turretShop: { turret: 'N', action: 'repair' },
      },
    };

    expect(acceptTowerInputMessage(discrete, roster, sequences, 'host')).not.toBeNull();
    expect(acceptTowerInputMessage(discrete, roster, sequences, 'host')).toBeNull();
  });

  it('valide un identifiant seulement avec une action et rejette les chaînes démesurées', () => {
    const sequences = new Map<string, number>();
    const valid = { id: 'guest', input: discreteCommand(1, 'action-1') };
    const orphanId = {
      id: 'guest',
      input: { sequence: 2, moveX: 0, moveY: 0, aimX: 1, aimY: 0, discreteActionId: 'x' },
    };
    const oversized = { id: 'guest', input: discreteCommand(2, 'x'.repeat(129)) };

    expect(acceptTowerInputMessage(valid, roster, sequences, 'host')).not.toBeNull();
    expect(acceptTowerInputMessage(orphanId, roster, sequences, 'host')).toBeNull();
    expect(acceptTowerInputMessage(oversized, roster, sequences, 'host')).toBeNull();
    expect(sequences.get('guest')).toBe(1);
  });
});

describe('fiabilité des actions discrètes Tower', () => {
  it('conserve et retransmet une action invitée jusqu’à son ACK', () => {
    const queue = new TowerGuestActionQueue();
    const actionId = queue.enqueue(discreteCommand(4), () => 'generated-1');

    expect(actionId).toBe('generated-1');
    expect(queue.nextForSend(0)).toMatchObject({
      discreteActionId: 'generated-1',
      selectUpgradeId: 'offer-1',
    });
    expect(queue.nextForSend(100)).toBeNull();
    expect(queue.nextForSend(250)).toMatchObject({ discreteActionId: 'generated-1' });
    expect(queue.acknowledge('generated-1')).toBe(true);
    expect(queue.size).toBe(0);
    expect(queue.nextForSend(500)).toBeNull();
  });

  it('ACKe de nouveau une retransmission sans remettre l’action en file', () => {
    const sequences = new Map<string, number>();
    const ledger = new TowerHostActionLedger();
    const first = { id: 'guest', input: discreteCommand(10, 'action-10') };
    const retry = { id: 'guest', input: discreteCommand(11, 'action-10') };
    const acceptedFirst = acceptTowerInputMessage(first, roster, sequences, 'host');
    const acceptedRetry = acceptTowerInputMessage(retry, roster, sequences, 'host');

    expect(acceptedFirst).not.toBeNull();
    expect(acceptedRetry).not.toBeNull();
    expect(ledger.receive('guest', acceptedFirst!.input)).toEqual({
      ackActionId: 'action-10',
      queued: true,
    });
    expect(ledger.receive('guest', acceptedRetry!.input)).toEqual({
      ackActionId: 'action-10',
      queued: false,
    });
    expect(ledger.take('guest')).toMatchObject({ discreteActionId: 'action-10' });
    expect(ledger.take('guest')).toBeNull();
  });

  it('garde la compatibilité des actions anciennes sans identifiant', () => {
    const ledger = new TowerHostActionLedger();

    expect(ledger.receive('guest', discreteCommand(1))).toEqual({ queued: true });
    expect(ledger.take('guest')).toMatchObject({ selectUpgradeId: 'offer-1' });
  });

  it('borne les files invité/hôte et la mémoire de déduplication', () => {
    const queue = new TowerGuestActionQueue();
    const ledger = new TowerHostActionLedger();
    for (let index = 0; index < MAX_PENDING_TOWER_ACTIONS + 5; index += 1) {
      queue.enqueue(discreteCommand(index), () => `guest-${index}`);
    }
    expect(queue.size).toBe(MAX_PENDING_TOWER_ACTIONS);

    for (let index = 0; index < MAX_REMEMBERED_TOWER_ACTION_IDS + 5; index += 1) {
      expect(ledger.receive('guest', discreteCommand(index, `host-${index}`)).queued).toBe(true);
      ledger.take('guest');
    }
    expect(ledger.rememberedCount('guest')).toBe(MAX_REMEMBERED_TOWER_ACTION_IDS);
  });

  it('ignore les ACK malformés ou destinés à un autre joueur', () => {
    const valid = { senderId: 'host', recipientId: 'guest', actionId: 'a-1' };
    expect(parseTowerActionAck(valid, 'guest', 'host')).toBe('a-1');
    expect(parseTowerActionAck({ ...valid, senderId: 'other' }, 'guest', 'host')).toBeNull();
    expect(parseTowerActionAck({ ...valid, recipientId: 'other' }, 'guest', 'host')).toBeNull();
    expect(parseTowerActionAck({ ...valid, actionId: '' }, 'guest', 'host')).toBeNull();
    expect(
      parseTowerActionAck({ ...valid, actionId: 'x'.repeat(129) }, 'guest', 'host'),
    ).toBeNull();
  });
});

describe('ordre des snapshots Tower', () => {
  it('rejette un tick strictement plus ancien mais accepte un tick égal ou plus récent', () => {
    expect(parseTowerStateMessage(state(9), 'guest', 10)).toBeNull();
    expect(parseTowerStateMessage(state(10), 'guest', 10)?.tick).toBe(10);
    expect(parseTowerStateMessage(state(11), 'guest', 10)?.tick).toBe(11);
  });

  it('valide le ciblage et la forme minimale avant d’accepter un état', () => {
    expect(
      parseTowerStateMessage({ recipientId: 'guest', state: state(3) }, 'guest', -1)?.tick,
    ).toBe(3);
    expect(
      parseTowerStateMessage({ recipientId: 'other', state: state(3) }, 'guest', -1),
    ).toBeNull();
    expect(parseTowerStateMessage({ tick: Number.NaN, players: [] }, 'guest', -1)).toBeNull();
  });
});
