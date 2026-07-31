import { META_BLESSING_BUDGET, META_CATALOG } from '@village-survivor/protocol';
import type { MetaCharacterProfile } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { spentBlessingBudget } from './blessingBudget.js';

function profile(overrides: Partial<MetaCharacterProfile> = {}): MetaCharacterProfile {
  return {
    id: 'profil-1',
    name: 'Test',
    blessingPathId: 'bastion',
    // Capacité allouée, constante en base : jamais un montant dépensé.
    blessingBudget: META_BLESSING_BUDGET,
    blessingRanks: {},
    skillSlots: [],
    gemSlots: [],
    isDefault: true,
    isActive: true,
    ...overrides,
  };
}

describe('budget de bénédictions dépensé', () => {
  it('ne compte rien pour un profil neuf, malgré une capacité déjà renseignée', () => {
    // Le défaut corrigé : `blessingBudget` valant 4 dès la création, l'écran annonçait
    // « 4 / 4 investis » à un joueur qui n'avait rien acheté.
    expect(profile().blessingBudget).toBe(META_BLESSING_BUDGET);
    expect(spentBlessingBudget(profile())).toBe(0);
  });

  it('additionne les rangs acquis dans la voie du profil', () => {
    const bastion = META_CATALOG.blessings.filter((blessing) => blessing.pathId === 'bastion');
    const [first, second] = bastion;
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    const spent = spentBlessingBudget(
      profile({ blessingRanks: { [first!.id]: 2, [second!.id]: 1 } }),
    );
    expect(spent).toBe(2 * first!.budgetPerRank + second!.budgetPerRank);
  });

  it('ignore les rangs acquis dans une autre voie', () => {
    const other = META_CATALOG.blessings.find((blessing) => blessing.pathId !== 'bastion');
    expect(other).toBeDefined();
    expect(spentBlessingBudget(profile({ blessingRanks: { [other!.id]: 2 } }))).toBe(0);
  });

  it('ignore un rang non fini, comme le fait la résolution du build', () => {
    // Cohérence avec `resolveMetaBuildEffects`, qui saute les rangs non finis : une valeur
    // illisible ne doit rien accorder, et surtout pas le rang maximal.
    const blessing = META_CATALOG.blessings.find((candidate) => candidate.pathId === 'bastion');
    expect(blessing).toBeDefined();
    const absurd = profile({ blessingRanks: { [blessing!.id]: Number.POSITIVE_INFINITY } });
    expect(spentBlessingBudget(absurd)).toBe(0);
  });

  it('borne un rang supérieur au maximum du catalogue', () => {
    const blessing = META_CATALOG.blessings.find((candidate) => candidate.pathId === 'bastion');
    expect(blessing).toBeDefined();
    const inflated = profile({ blessingRanks: { [blessing!.id]: 99 } });
    expect(spentBlessingBudget(inflated)).toBe(blessing!.maxRank * blessing!.budgetPerRank);
  });

  it('renvoie zéro sans profil actif', () => {
    expect(spentBlessingBudget(null)).toBe(0);
  });

  it('permet de saturer exactement une voie avec le catalogue courant', () => {
    // Invariant d'équilibrage : une voie complète coûte tout le budget, ni plus ni moins.
    // S'il venait à être rompu, soit une voie deviendrait impossible à terminer, soit le
    // budget cesserait d'être une contrainte.
    const maxed: Record<string, number> = {};
    for (const blessing of META_CATALOG.blessings) {
      maxed[blessing.id] = blessing.maxRank;
    }
    expect(spentBlessingBudget(profile({ blessingRanks: maxed }))).toBe(META_BLESSING_BUDGET);
  });
});
