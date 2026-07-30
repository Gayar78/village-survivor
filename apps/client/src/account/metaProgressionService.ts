import {
  META_CATALOG,
  META_GEM_SLOT_COUNT,
  META_SKILL_SLOT_COUNT,
  type BlessingId,
  type BlessingPathId,
  type ForgeRecipeId,
  type MetaCharacterProfile,
  type MetaGemId,
  type MetaSkillId,
} from '@village-survivor/protocol';

import { supabase } from './supabaseClient.js';
import type {
  BlessingPurchaseResult,
  ForgeResult,
  MetaProfileDraft,
  MetaProgressionSnapshot,
  SkillPurchaseResult,
} from './types.js';

interface ProfileRow {
  id: string;
  name: string;
  blessing_path_id: string;
  blessing_budget: number;
  blessing_ranks: unknown;
  skill_slots: unknown;
  gem_slots: unknown;
  is_default: boolean;
  is_active: boolean;
}

interface SkillRow {
  skill_id: string;
  rank: number;
}

interface GemRow {
  gem_id: string;
  quantity: number;
}

interface WalletRow {
  balance: number;
}

const PATH_IDS = new Set(META_CATALOG.paths.map(({ id }) => id));
const BLESSING_IDS = new Set(META_CATALOG.blessings.map(({ id }) => id));
const SKILL_IDS = new Set(META_CATALOG.skills.map(({ id }) => id));
const GEM_IDS = new Set(META_CATALOG.gems.map(({ id }) => id));
const RECIPE_IDS = new Set(META_CATALOG.forgeRecipes.map(({ id }) => id));

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return '';
}

function frenchError(context: string, error: unknown): Error {
  const raw = errorMessage(error);
  const known = [
    ['insufficient account gold', "Vous n'avez pas assez d'or."],
    ['profile limit reached', 'Vous avez déjà atteint la limite de trois personnages.'],
    ['blessing budget exceeded', 'Le budget de bénédictions est épuisé.'],
    ['maximum rank', 'Cette amélioration a déjà atteint son rang maximal.'],
    ['missing forge ingredients', 'Il manque des gemmes pour cette recette.'],
    ['not enough owned gems', 'Vous ne possédez pas assez de gemmes pour ce build.'],
    ['skill is not owned', "Une compétence équipée n'est pas débloquée."],
    ['profile not found', 'Ce personnage est introuvable.'],
  ] as const;
  const translated = known.find(([needle]) => raw.toLowerCase().includes(needle))?.[1];
  return new Error(translated ?? (raw ? `${context} : ${raw}` : context));
}

function isSafeQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function requireUuidLikeId(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 128) {
    throw new Error(`${label} est invalide.`);
  }
}

/** Validation synchrone pour les formulaires ; la RPC répète toutes les règles. */
export function validateMetaProfileDraft(
  draft: MetaProfileDraft,
  ownedSkills?: Readonly<Partial<Record<MetaSkillId, number>>>,
  ownedGems?: Readonly<Partial<Record<MetaGemId, number>>>,
): void {
  if (
    typeof draft.name !== 'string' ||
    draft.name.trim().length < 1 ||
    draft.name.trim().length > 32
  ) {
    throw new Error('Le nom du personnage doit contenir entre 1 et 32 caractères.');
  }
  if (!PATH_IDS.has(draft.blessingPathId)) {
    throw new Error('La voie de bénédiction choisie est inconnue.');
  }
  if (!Array.isArray(draft.skillSlots) || draft.skillSlots.length !== META_SKILL_SLOT_COUNT) {
    throw new Error('Le build doit contenir exactement trois emplacements de compétence.');
  }
  if (!Array.isArray(draft.gemSlots) || draft.gemSlots.length !== META_GEM_SLOT_COUNT) {
    throw new Error('Le build doit contenir exactement trois emplacements de gemme.');
  }

  const skills = draft.skillSlots.filter((id): id is MetaSkillId => id !== null);
  if (skills.some((id) => !SKILL_IDS.has(id))) {
    throw new Error('Une compétence choisie est inconnue.');
  }
  if (new Set(skills).size !== skills.length) {
    throw new Error('Une compétence ne peut pas occuper plusieurs emplacements.');
  }
  if (
    ownedSkills &&
    skills.some((id) => !isSafeQuantity(ownedSkills[id]) || ownedSkills[id] === 0)
  ) {
    throw new Error("Une compétence choisie n'est pas débloquée.");
  }

  const equippedGemCounts = new Map<MetaGemId, number>();
  for (const id of draft.gemSlots) {
    if (id === null) continue;
    if (!GEM_IDS.has(id)) throw new Error('Une gemme choisie est inconnue.');
    equippedGemCounts.set(id, (equippedGemCounts.get(id) ?? 0) + 1);
  }
  if (
    ownedGems &&
    [...equippedGemCounts].some(
      ([id, count]) => !isSafeQuantity(ownedGems[id]) || ownedGems[id]! < count,
    )
  ) {
    throw new Error('Vous ne possédez pas assez de gemmes pour ce build.');
  }
}

export function validateForgeRecipeId(recipeId: string): asserts recipeId is ForgeRecipeId {
  if (!RECIPE_IDS.has(recipeId as ForgeRecipeId)) {
    throw new Error('Cette recette de forge est inconnue.');
  }
}

function parsePath(value: string): BlessingPathId {
  if (!PATH_IDS.has(value as BlessingPathId)) throw new Error('voie de bénédiction invalide');
  return value as BlessingPathId;
}

function parseSkillId(value: string): MetaSkillId {
  if (!SKILL_IDS.has(value as MetaSkillId)) throw new Error('compétence invalide');
  return value as MetaSkillId;
}

function parseGemId(value: string): MetaGemId {
  if (!GEM_IDS.has(value as MetaGemId)) throw new Error('gemme invalide');
  return value as MetaGemId;
}

function parseStringSlots<T extends string>(
  value: unknown,
  count: number,
  parse: (id: string) => T,
): readonly (T | null)[] {
  if (!Array.isArray(value) || value.length !== count)
    throw new Error('nombre d’emplacements invalide');
  return value.map((id) => {
    if (id === null) return null;
    if (typeof id !== 'string') throw new Error('contenu d’emplacement invalide');
    return parse(id);
  });
}

function parseBlessingRanks(value: unknown): Partial<Record<BlessingId, number>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('rangs de bénédiction invalides');
  }
  const result: Partial<Record<BlessingId, number>> = {};
  for (const [id, rank] of Object.entries(value)) {
    if (!BLESSING_IDS.has(id as BlessingId) || !isSafeQuantity(rank)) {
      throw new Error('rang de bénédiction invalide');
    }
    result[id as BlessingId] = rank;
  }
  return result;
}

function parseRpcObject(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${context} : réponse serveur invalide.`);
  }
  return value as Record<string, unknown>;
}

function parseGold(value: unknown, context: string): number {
  if (!isSafeQuantity(value)) throw new Error(`${context} : solde d'or invalide.`);
  return value;
}

export interface MetaProgressionService {
  loadMetaProgression(): Promise<MetaProgressionSnapshot>;
  createProfile(name: string, blessingPathId: BlessingPathId): Promise<string>;
  saveProfile(profileId: string, draft: MetaProfileDraft): Promise<void>;
  activateProfile(profileId: string): Promise<void>;
  deleteProfile(profileId: string): Promise<void>;
  purchaseBlessing(profileId: string, blessingId: BlessingId): Promise<BlessingPurchaseResult>;
  purchaseSkill(skillId: MetaSkillId): Promise<SkillPurchaseResult>;
  forge(recipeId: ForgeRecipeId): Promise<ForgeResult>;
}

class SupabaseMetaProgressionService implements MetaProgressionService {
  async loadMetaProgression(): Promise<MetaProgressionSnapshot> {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('Vous devez être connecté pour charger votre progression.');
    }
    const userId = authData.user.id;
    const [profilesResult, skillsResult, gemsResult, walletResult] = await Promise.all([
      supabase
        .from('meta_character_profiles')
        .select(
          'id, name, blessing_path_id, blessing_budget, blessing_ranks, skill_slots, gem_slots, is_default, is_active',
        )
        .eq('user_id', userId)
        .order('created_at'),
      supabase.from('meta_owned_skills').select('skill_id, rank').eq('user_id', userId),
      supabase.from('meta_owned_gems').select('gem_id, quantity').eq('user_id', userId),
      supabase.from('account_gold_wallets').select('balance').eq('user_id', userId).single(),
    ]);
    const firstError =
      profilesResult.error ?? skillsResult.error ?? gemsResult.error ?? walletResult.error;
    if (firstError) throw frenchError('Impossible de charger la progression', firstError);

    try {
      const ownedSkills: Partial<Record<MetaSkillId, number>> = {};
      for (const row of (skillsResult.data ?? []) as SkillRow[]) {
        const id = parseSkillId(row.skill_id);
        if (!isSafeQuantity(row.rank) || row.rank < 1 || row.rank > 3)
          throw new Error('rang invalide');
        ownedSkills[id] = row.rank;
      }
      const ownedGems: Record<MetaGemId, number> = { ember: 0, swift: 0, vital: 0, prism: 0 };
      for (const row of (gemsResult.data ?? []) as GemRow[]) {
        const id = parseGemId(row.gem_id);
        if (!isSafeQuantity(row.quantity)) throw new Error('quantité invalide');
        ownedGems[id] = row.quantity;
      }
      const profiles = ((profilesResult.data ?? []) as ProfileRow[]).map(
        (row): MetaCharacterProfile => {
          const skillIds = parseStringSlots(row.skill_slots, META_SKILL_SLOT_COUNT, parseSkillId);
          return {
            id: row.id,
            name: row.name,
            blessingPathId: parsePath(row.blessing_path_id),
            blessingBudget: row.blessing_budget,
            blessingRanks: parseBlessingRanks(row.blessing_ranks),
            skillSlots: skillIds.map((id) => (id ? { id, rank: ownedSkills[id] ?? 0 } : null)),
            gemSlots: parseStringSlots(row.gem_slots, META_GEM_SLOT_COUNT, parseGemId),
            isDefault: row.is_default,
            isActive: row.is_active,
          };
        },
      );
      const wallet = walletResult.data as WalletRow | null;
      return {
        profiles,
        ownedSkills,
        ownedGems,
        goldBalance: parseGold(wallet?.balance, 'Impossible de charger la progression'),
      };
    } catch (error) {
      throw frenchError('Les données de progression reçues sont invalides', error);
    }
  }

  async createProfile(name: string, blessingPathId: BlessingPathId): Promise<string> {
    validateMetaProfileDraft({
      name,
      blessingPathId,
      skillSlots: [null, null, null],
      gemSlots: [null, null, null],
    });
    const { data, error } = await supabase.rpc('create_meta_character_profile', {
      p_name: name.trim(),
      p_blessing_path_id: blessingPathId,
    });
    if (error) throw frenchError('Impossible de créer le personnage', error);
    if (typeof data !== 'string' || data.length === 0)
      throw new Error('Identifiant de personnage invalide.');
    return data;
  }

  async saveProfile(profileId: string, draft: MetaProfileDraft): Promise<void> {
    requireUuidLikeId(profileId, "L'identifiant du personnage");
    validateMetaProfileDraft(draft);
    const { error } = await supabase.rpc('save_meta_character_build', {
      p_profile_id: profileId,
      p_name: draft.name.trim(),
      p_blessing_path_id: draft.blessingPathId,
      p_skill_slots: [...draft.skillSlots],
      p_gem_slots: [...draft.gemSlots],
    });
    if (error) throw frenchError('Impossible de sauvegarder le build', error);
  }

  async activateProfile(profileId: string): Promise<void> {
    requireUuidLikeId(profileId, "L'identifiant du personnage");
    const { error } = await supabase.rpc('activate_meta_character_profile', {
      p_profile_id: profileId,
    });
    if (error) throw frenchError("Impossible d'activer le personnage", error);
  }

  async deleteProfile(profileId: string): Promise<void> {
    requireUuidLikeId(profileId, "L'identifiant du personnage");
    const { error } = await supabase.rpc('delete_meta_character_profile', {
      p_profile_id: profileId,
    });
    if (error) throw frenchError('Impossible de supprimer le personnage', error);
  }

  async purchaseBlessing(
    profileId: string,
    blessingId: BlessingId,
  ): Promise<BlessingPurchaseResult> {
    requireUuidLikeId(profileId, "L'identifiant du personnage");
    if (!BLESSING_IDS.has(blessingId)) throw new Error('Cette bénédiction est inconnue.');
    const { data, error } = await supabase.rpc('purchase_meta_blessing_upgrade', {
      p_profile_id: profileId,
      p_blessing_id: blessingId,
    });
    if (error) throw frenchError("Impossible d'acheter la bénédiction", error);
    const result = parseRpcObject(data, "Impossible d'acheter la bénédiction");
    if (!isSafeQuantity(result.rank) || !isSafeQuantity(result.budgetSpent)) {
      throw new Error("Impossible d'acheter la bénédiction : réponse serveur invalide.");
    }
    return {
      profileId,
      blessingId,
      rank: result.rank,
      budgetSpent: result.budgetSpent,
      goldBalance: parseGold(result.goldBalance, "Impossible d'acheter la bénédiction"),
    };
  }

  async purchaseSkill(skillId: MetaSkillId): Promise<SkillPurchaseResult> {
    if (!SKILL_IDS.has(skillId)) throw new Error('Cette compétence est inconnue.');
    const { data, error } = await supabase.rpc('purchase_meta_skill_upgrade', {
      p_skill_id: skillId,
    });
    if (error) throw frenchError("Impossible d'acheter la compétence", error);
    const result = parseRpcObject(data, "Impossible d'acheter la compétence");
    if (!isSafeQuantity(result.rank))
      throw new Error("Impossible d'acheter la compétence : réponse invalide.");
    return {
      skillId,
      rank: result.rank,
      goldBalance: parseGold(result.goldBalance, "Impossible d'acheter la compétence"),
    };
  }

  async forge(recipeId: ForgeRecipeId): Promise<ForgeResult> {
    validateForgeRecipeId(recipeId);
    const { data, error } = await supabase.rpc('forge_meta_recipe', { p_recipe_id: recipeId });
    if (error) throw frenchError('La forge a échoué', error);
    const result = parseRpcObject(data, 'La forge a échoué');
    if (!isSafeQuantity(result.outputQuantity) || result.outputGemId !== 'prism') {
      throw new Error('La forge a échoué : réponse serveur invalide.');
    }
    return {
      recipeId,
      outputGemId: 'prism',
      outputQuantity: result.outputQuantity,
      goldBalance: parseGold(result.goldBalance, 'La forge a échoué'),
    };
  }
}

export const metaProgressionService: MetaProgressionService = new SupabaseMetaProgressionService();
