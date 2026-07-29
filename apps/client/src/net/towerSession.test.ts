import { describe, expect, it } from 'vitest';

import { acceptTowerInputMessage } from './towerSession.js';

const roster = new Set(['host', 'guest']);

function command(sequence: number): unknown {
  return {
    id: 'guest',
    input: { sequence, moveX: 1, moveY: -1, aimX: 42, aimY: 0, fire: true },
  };
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
});
