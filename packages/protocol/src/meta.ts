/** Contrat sérialisable de la méta-progression Tower (Phase 4). */

export const META_PROFILE_LIMIT = 3;
export const META_BLESSING_BUDGET = 4;
export const META_SKILL_SLOT_COUNT = 3;
export const META_GEM_SLOT_COUNT = 3;

export type BlessingPathId = 'bastion' | 'hunter' | 'wayfarer';
export type BlessingId =
  'iron-heart' | 'guardian-pulse' | 'keen-rounds' | 'rapid-drill' | 'wind-step' | 'far-reach';
export type MetaSkillId = 'suppressive-fire' | 'combat-medic' | 'field-sprint' | 'heart-keeper';
export type MetaGemId = 'ember' | 'swift' | 'vital' | 'prism';
export type ForgeRecipeId = 'temper-ember' | 'cut-swift' | 'fuse-heart';

export type MetaModifierKey =
  | 'damageMultiplier'
  | 'fireRateMultiplier'
  | 'moveSpeedMultiplier'
  | 'maxHealthMultiplier'
  | 'heartMaxHealthMultiplier'
  | 'pickupRadiusMultiplier';

/** Les effets du catalogue sont des bonus additifs appliqués à une base de 1. */
export type MetaEffect = Readonly<Partial<Record<MetaModifierKey, number>>>;

export type BlessingDefinition = Readonly<{
  id: BlessingId;
  pathId: BlessingPathId;
  label: string;
  description: string;
  maxRank: number;
  budgetPerRank: number;
  goldCosts: readonly number[];
  effectPerRank: MetaEffect;
}>;

export type MetaSkillDefinition = Readonly<{
  id: MetaSkillId;
  label: string;
  description: string;
  maxRank: number;
  goldCosts: readonly number[];
  effectPerRank: MetaEffect;
}>;

export type MetaGemDefinition = Readonly<{
  id: MetaGemId;
  label: string;
  description: string;
  effect: MetaEffect;
}>;

export type ForgeIngredient = Readonly<{ gemId: MetaGemId; quantity: number }>;
export type ForgeRecipeDefinition = Readonly<{
  id: ForgeRecipeId;
  label: string;
  goldCost: number;
  ingredients: readonly ForgeIngredient[];
  output: ForgeIngredient;
}>;

export type MetaCatalog = Readonly<{
  paths: readonly Readonly<{ id: BlessingPathId; label: string; description: string }>[];
  blessings: readonly BlessingDefinition[];
  skills: readonly MetaSkillDefinition[];
  gems: readonly MetaGemDefinition[];
  forgeRecipes: readonly ForgeRecipeDefinition[];
}>;

export const META_CATALOG: MetaCatalog = {
  paths: [
    { id: 'bastion', label: 'Bastion', description: 'Résistance du héros et du Cœur.' },
    { id: 'hunter', label: 'Chasseur', description: 'Puissance et cadence de tir.' },
    { id: 'wayfarer', label: 'Éclaireur', description: 'Mobilité et portée de collecte.' },
  ],
  blessings: [
    {
      id: 'iron-heart',
      pathId: 'bastion',
      label: 'Cœur de fer',
      description: '+5 % de vie maximale du Cœur par rang.',
      maxRank: 2,
      budgetPerRank: 1,
      goldCosts: [80, 160],
      effectPerRank: { heartMaxHealthMultiplier: 0.05 },
    },
    {
      id: 'guardian-pulse',
      pathId: 'bastion',
      label: 'Pouls gardien',
      description: '+4 % de vie maximale du héros par rang.',
      maxRank: 2,
      budgetPerRank: 1,
      goldCosts: [80, 160],
      effectPerRank: { maxHealthMultiplier: 0.04 },
    },
    {
      id: 'keen-rounds',
      pathId: 'hunter',
      label: 'Munitions affûtées',
      description: '+4 % de dégâts par rang.',
      maxRank: 2,
      budgetPerRank: 1,
      goldCosts: [80, 160],
      effectPerRank: { damageMultiplier: 0.04 },
    },
    {
      id: 'rapid-drill',
      pathId: 'hunter',
      label: 'Exercice rapide',
      description: '+3 % de cadence de tir par rang.',
      maxRank: 2,
      budgetPerRank: 1,
      goldCosts: [80, 160],
      effectPerRank: { fireRateMultiplier: 0.03 },
    },
    {
      id: 'wind-step',
      pathId: 'wayfarer',
      label: 'Pas du vent',
      description: '+4 % de vitesse de déplacement par rang.',
      maxRank: 2,
      budgetPerRank: 1,
      goldCosts: [80, 160],
      effectPerRank: { moveSpeedMultiplier: 0.04 },
    },
    {
      id: 'far-reach',
      pathId: 'wayfarer',
      label: 'Longue portée',
      description: '+8 % de rayon de collecte par rang.',
      maxRank: 2,
      budgetPerRank: 1,
      goldCosts: [80, 160],
      effectPerRank: { pickupRadiusMultiplier: 0.08 },
    },
  ],
  skills: [
    {
      id: 'suppressive-fire',
      label: 'Tir de suppression',
      description: '+3 % de dégâts par rang.',
      maxRank: 3,
      goldCosts: [120, 240, 360],
      effectPerRank: { damageMultiplier: 0.03 },
    },
    {
      id: 'combat-medic',
      label: 'Médecin de combat',
      description: '+3 % de vie maximale par rang.',
      maxRank: 3,
      goldCosts: [120, 240, 360],
      effectPerRank: { maxHealthMultiplier: 0.03 },
    },
    {
      id: 'field-sprint',
      label: 'Course de terrain',
      description: '+2 % de vitesse par rang.',
      maxRank: 3,
      goldCosts: [120, 240, 360],
      effectPerRank: { moveSpeedMultiplier: 0.02 },
    },
    {
      id: 'heart-keeper',
      label: 'Gardien du Cœur',
      description: '+3 % de vie maximale du Cœur par rang.',
      maxRank: 3,
      goldCosts: [120, 240, 360],
      effectPerRank: { heartMaxHealthMultiplier: 0.03 },
    },
  ],
  gems: [
    {
      id: 'ember',
      label: 'Gemme braise',
      description: '+2 % de dégâts.',
      effect: { damageMultiplier: 0.02 },
    },
    {
      id: 'swift',
      label: 'Gemme véloce',
      description: '+2 % de vitesse.',
      effect: { moveSpeedMultiplier: 0.02 },
    },
    {
      id: 'vital',
      label: 'Gemme vitale',
      description: '+2 % de vie maximale.',
      effect: { maxHealthMultiplier: 0.02 },
    },
    {
      id: 'prism',
      label: 'Gemme prismatique',
      description: '+2 % de dégâts et +2 % de vie du Cœur.',
      effect: { damageMultiplier: 0.02, heartMaxHealthMultiplier: 0.02 },
    },
  ],
  forgeRecipes: [
    {
      id: 'temper-ember',
      label: 'Trempe prismatique',
      goldCost: 100,
      ingredients: [{ gemId: 'ember', quantity: 2 }],
      output: { gemId: 'prism', quantity: 1 },
    },
    {
      id: 'cut-swift',
      label: 'Taille prismatique',
      goldCost: 100,
      ingredients: [{ gemId: 'swift', quantity: 2 }],
      output: { gemId: 'prism', quantity: 1 },
    },
    {
      id: 'fuse-heart',
      label: 'Fusion prismatique',
      goldCost: 120,
      ingredients: [
        { gemId: 'ember', quantity: 1 },
        { gemId: 'vital', quantity: 1 },
      ],
      output: { gemId: 'prism', quantity: 1 },
    },
  ],
};

export type EquippedMetaSkill = Readonly<{ id: MetaSkillId; rank: number }>;

/** Profil hydraté : les rangs de compétences viennent des possessions du compte. */
export type MetaCharacterProfile = Readonly<{
  id: string;
  name: string;
  blessingPathId: BlessingPathId;
  blessingBudget: number;
  blessingRanks: Readonly<Partial<Record<BlessingId, number>>>;
  skillSlots: readonly (EquippedMetaSkill | null)[];
  gemSlots: readonly (MetaGemId | null)[];
  isDefault: boolean;
  isActive: boolean;
}>;

export type MetaBuildModifiers = Readonly<Record<MetaModifierKey, number>>;

const MODIFIER_KEYS: readonly MetaModifierKey[] = [
  'damageMultiplier',
  'fireRateMultiplier',
  'moveSpeedMultiplier',
  'maxHealthMultiplier',
  'heartMaxHealthMultiplier',
  'pickupRadiusMultiplier',
];

/**
 * Résout un build sans I/O. Les ids/rangs inconnus, non finis ou hors limites sont
 * ignorés/bornés : une sauvegarde ancienne ou altérée ne peut produire de NaN.
 */
export function resolveMetaBuildEffects(
  profile: MetaCharacterProfile,
  catalog: MetaCatalog = META_CATALOG,
): MetaBuildModifiers {
  const bonuses: Record<MetaModifierKey, number> = {
    damageMultiplier: 0,
    fireRateMultiplier: 0,
    moveSpeedMultiplier: 0,
    maxHealthMultiplier: 0,
    heartMaxHealthMultiplier: 0,
    pickupRadiusMultiplier: 0,
  };

  const apply = (effect: MetaEffect, rank = 1): void => {
    for (const key of MODIFIER_KEYS) {
      const value = effect[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        bonuses[key] += value * rank;
      }
    }
  };

  for (const blessing of catalog.blessings) {
    if (blessing.pathId !== profile.blessingPathId) continue;
    const rawRank = profile.blessingRanks[blessing.id];
    if (typeof rawRank !== 'number' || !Number.isFinite(rawRank)) continue;
    const rank = Math.max(0, Math.min(blessing.maxRank, Math.floor(rawRank)));
    apply(blessing.effectPerRank, rank);
  }

  for (const equipped of profile.skillSlots.slice(0, META_SKILL_SLOT_COUNT)) {
    if (!equipped) continue;
    const skill = catalog.skills.find(({ id }) => id === equipped.id);
    if (!skill || !Number.isFinite(equipped.rank)) continue;
    apply(skill.effectPerRank, Math.max(0, Math.min(skill.maxRank, Math.floor(equipped.rank))));
  }

  for (const gemId of profile.gemSlots.slice(0, META_GEM_SLOT_COUNT)) {
    const gem = catalog.gems.find(({ id }) => id === gemId);
    if (gem) apply(gem.effect);
  }

  return Object.fromEntries(
    MODIFIER_KEYS.map((key) => [key, Math.max(0.1, Math.min(3, 1 + bonuses[key]))]),
  ) as Record<MetaModifierKey, number>;
}
