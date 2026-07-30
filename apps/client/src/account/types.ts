import type {
  BlessingId,
  BlessingPathId,
  ForgeRecipeId,
  MetaCharacterProfile,
  MetaGemId,
  MetaSkillId,
  ResourceType,
} from '@village-survivor/protocol';

export type {
  BlessingId,
  BlessingPathId,
  ForgeRecipeId,
  MetaCharacterProfile,
  MetaGemId,
  MetaSkillId,
} from '@village-survivor/protocol';

export interface AccountSession {
  userId: string;
  email: string;
  displayName: string;
}

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  totalPlayMs: number;
  bestCycle: number;
  maxPlayerLevel: number;
  resourcesGathered: Record<ResourceType, number>;
}

export interface GameRunSummary {
  won: boolean;
  durationMs: number;
  cycleReached: number;
  playerLevel: number;
  resourcesGathered: Record<ResourceType, number>;
}

/** Solde d'or persistant du compte, toujours un entier JavaScript sûr et non négatif. */
export type AccountGoldBalance = number;

export interface MetaProfileDraft {
  name: string;
  blessingPathId: BlessingPathId;
  skillSlots: readonly (MetaSkillId | null)[];
  gemSlots: readonly (MetaGemId | null)[];
}

export interface MetaProgressionSnapshot {
  profiles: readonly MetaCharacterProfile[];
  ownedSkills: Readonly<Partial<Record<MetaSkillId, number>>>;
  ownedGems: Readonly<Record<MetaGemId, number>>;
  goldBalance: AccountGoldBalance;
}

export interface BlessingPurchaseResult {
  profileId: string;
  blessingId: BlessingId;
  rank: number;
  budgetSpent: number;
  goldBalance: AccountGoldBalance;
}

export interface SkillPurchaseResult {
  skillId: MetaSkillId;
  rank: number;
  goldBalance: AccountGoldBalance;
}

export interface ForgeResult {
  recipeId: ForgeRecipeId;
  outputGemId: MetaGemId;
  outputQuantity: number;
  goldBalance: AccountGoldBalance;
}

/** Données d'enrôlement TOTP. `qrCode` est une source prête pour <img src="..."> (data URL SVG renvoyée par Supabase). */
export interface MfaEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}
