import { describe, expect, it } from 'vitest';

import {
  META_BLESSING_BUDGET,
  META_CATALOG,
  resolveMetaBuildEffects,
  type MetaCharacterProfile,
} from '@village-survivor/protocol';

import { validateForgeRecipeId, validateMetaProfileDraft } from './metaProgressionService.js';

const emptyDraft = {
  name: 'Éclaireuse',
  blessingPathId: 'wayfarer' as const,
  skillSlots: [null, null, null] as const,
  gemSlots: [null, null, null] as const,
};

describe('catalogue de méta-progression', () => {
  it('reste compact, cohérent et sans identifiants dupliqués', () => {
    expect(META_CATALOG.paths).toHaveLength(3);
    expect(META_CATALOG.blessings).toHaveLength(6);
    expect(META_CATALOG.skills).toHaveLength(4);
    expect(META_CATALOG.gems).toHaveLength(4);
    expect(META_CATALOG.forgeRecipes).toHaveLength(3);

    for (const entries of [
      META_CATALOG.paths,
      META_CATALOG.blessings,
      META_CATALOG.skills,
      META_CATALOG.gems,
      META_CATALOG.forgeRecipes,
    ]) {
      expect(new Set(entries.map(({ id }) => id)).size).toBe(entries.length);
    }
    for (const blessing of META_CATALOG.blessings) {
      expect(blessing.goldCosts).toHaveLength(blessing.maxRank);
      expect(blessing.maxRank * blessing.budgetPerRank).toBeLessThanOrEqual(META_BLESSING_BUDGET);
    }
    for (const skill of META_CATALOG.skills) expect(skill.goldCosts).toHaveLength(skill.maxRank);
    for (const recipe of META_CATALOG.forgeRecipes) {
      expect(recipe.goldCost).toBeGreaterThan(0);
      expect(recipe.ingredients.length).toBeGreaterThan(0);
      expect(recipe.ingredients.every(({ quantity }) => quantity > 0)).toBe(true);
    }
  });
});

describe('validation des builds et de la forge', () => {
  it('accepte un build possédé et complet', () => {
    expect(() =>
      validateMetaProfileDraft(
        {
          ...emptyDraft,
          skillSlots: ['field-sprint', null, null],
          gemSlots: ['swift', 'swift', null],
        },
        { 'field-sprint': 1 },
        { swift: 2 },
      ),
    ).not.toThrow();
  });

  it.each(['', 'x'.repeat(33)])('refuse un nom invalide', (name) => {
    expect(() => validateMetaProfileDraft({ ...emptyDraft, name })).toThrow('nom');
  });

  it('refuse les tailles de slots, doublons et possessions insuffisantes', () => {
    expect(() => validateMetaProfileDraft({ ...emptyDraft, skillSlots: [null] })).toThrow('trois');
    expect(() =>
      validateMetaProfileDraft({
        ...emptyDraft,
        skillSlots: ['field-sprint', 'field-sprint', null],
      }),
    ).toThrow('plusieurs');
    expect(() =>
      validateMetaProfileDraft({ ...emptyDraft, gemSlots: ['swift', 'swift', null] }, undefined, {
        swift: 1,
      }),
    ).toThrow('assez');
  });

  it('refuse une recette absente du catalogue', () => {
    expect(() => validateForgeRecipeId('random-recipe')).toThrow('inconnue');
  });
});

describe('résolution pure des effets', () => {
  it('additionne bénédictions, compétences et gemmes sur une base de 1', () => {
    const profile: MetaCharacterProfile = {
      id: 'profile-1',
      name: 'Chasseuse',
      blessingPathId: 'hunter',
      blessingBudget: 4,
      blessingRanks: { 'keen-rounds': 2, 'rapid-drill': 1 },
      skillSlots: [{ id: 'suppressive-fire', rank: 2 }, null, null],
      gemSlots: ['ember', 'prism', null],
      isDefault: true,
      isActive: true,
    };
    const effects = resolveMetaBuildEffects(profile, META_CATALOG);
    expect(effects.damageMultiplier).toBeCloseTo(1.18);
    expect(effects.fireRateMultiplier).toBeCloseTo(1.03);
    expect(effects.heartMaxHealthMultiplier).toBeCloseTo(1.02);
    expect(effects.moveSpeedMultiplier).toBe(1);
  });

  it('borne les rangs altérés et ignore les bénédictions hors voie', () => {
    const profile: MetaCharacterProfile = {
      id: 'profile-2',
      name: 'Robuste',
      blessingPathId: 'bastion',
      blessingBudget: 4,
      blessingRanks: { 'iron-heart': 999, 'keen-rounds': 2 },
      skillSlots: [{ id: 'combat-medic', rank: Number.POSITIVE_INFINITY }, null, null],
      gemSlots: ['vital', null, null],
      isDefault: false,
      isActive: false,
    };
    const effects = resolveMetaBuildEffects(profile);
    expect(effects.heartMaxHealthMultiplier).toBeCloseTo(1.1);
    expect(effects.damageMultiplier).toBe(1);
    expect(effects.maxHealthMultiplier).toBeCloseTo(1.02);
    expect(Object.values(effects).every(Number.isFinite)).toBe(true);
  });
});
