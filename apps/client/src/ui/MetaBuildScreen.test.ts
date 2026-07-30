import { describe, expect, it, vi } from 'vitest';

import {
  canDeleteProfile,
  canRequestMetaAction,
  defaultReplacementSlot,
  type MetaBuildController,
} from './MetaBuildScreen.js';

const controller: MetaBuildController = {
  load: vi.fn(),
  purchaseSkill: vi.fn(),
};

describe('gardes des actions de méta-progression', () => {
  it('refuse une action absente et bloque les doubles clics pendant une requête', () => {
    expect(canRequestMetaAction(controller, 'purchaseSkill', null)).toBe(true);
    expect(canRequestMetaAction(controller, 'forge', null)).toBe(false);
    expect(
      canRequestMetaAction(controller, 'purchaseSkill', {
        kind: 'purchaseSkill',
        id: 'combat-medic',
      }),
    ).toBe(false);
  });

  it('interdit toujours la suppression du profil par défaut', () => {
    expect(canDeleteProfile({ isDefault: true })).toBe(false);
    expect(canDeleteProfile({ isDefault: false })).toBe(true);
  });
});

describe('sélection des emplacements', () => {
  it('préfère le premier emplacement vide', () => {
    expect(defaultReplacementSlot([0, 2])).toBe(1);
  });

  it('propose un remplacement quand tous les emplacements sont occupés', () => {
    expect(defaultReplacementSlot([0, 1, 2])).toBe(0);
  });

  it('ne propose rien quand aucun emplacement n’existe', () => {
    expect(defaultReplacementSlot([], 0)).toBeNull();
  });
});
