import {
  META_CATALOG,
  META_GEM_SLOT_COUNT,
  META_SKILL_SLOT_COUNT,
  resolveMetaBuildEffects,
} from '@village-survivor/protocol';
import type {
  BlessingId,
  BlessingPathId,
  MetaBuildModifiers,
  MetaCharacterProfile,
  MetaGemId,
  MetaSkillId,
} from '@village-survivor/protocol';

interface ProfileRow {
  id: unknown;
  name: unknown;
  blessing_path_id: unknown;
  blessing_budget: unknown;
  blessing_ranks: unknown;
  skill_slots: unknown;
  gem_slots: unknown;
  is_default: unknown;
  is_active: unknown;
}

interface SkillRow {
  skill_id: unknown;
  rank: unknown;
}

export interface MetaBuildRepository {
  loadActiveBuild(userId: string): Promise<MetaBuildModifiers>;
}

export class MetaBuildDependencyError extends Error {
  public constructor() {
    super('La progression persistante est momentanément indisponible.');
    this.name = 'MetaBuildDependencyError';
  }
}

const PATH_IDS = new Set<string>(META_CATALOG.paths.map(({ id }) => id));
const BLESSING_IDS = new Set<string>(META_CATALOG.blessings.map(({ id }) => id));
const SKILL_IDS = new Set<string>(META_CATALOG.skills.map(({ id }) => id));
const GEM_IDS = new Set<string>(META_CATALOG.gems.map(({ id }) => id));

function safeRank(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function parseSlots<T extends string>(
  value: unknown,
  count: number,
  allowed: ReadonlySet<string>,
): readonly (T | null)[] {
  if (!Array.isArray(value) || value.length !== count) throw new MetaBuildDependencyError();
  return value.map((candidate) => {
    if (candidate === null) return null;
    if (typeof candidate !== 'string' || !allowed.has(candidate)) {
      throw new MetaBuildDependencyError();
    }
    return candidate as T;
  });
}

function parseBlessingRanks(value: unknown): Partial<Record<BlessingId, number>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MetaBuildDependencyError();
  }
  const result: Partial<Record<BlessingId, number>> = {};
  for (const [id, rank] of Object.entries(value)) {
    if (BLESSING_IDS.has(id)) result[id as BlessingId] = safeRank(rank);
  }
  return result;
}

function profileFromRows(
  row: ProfileRow,
  ownedSkills: ReadonlyMap<MetaSkillId, number>,
): MetaCharacterProfile {
  if (
    typeof row.id !== 'string' ||
    typeof row.name !== 'string' ||
    typeof row.blessing_path_id !== 'string' ||
    !PATH_IDS.has(row.blessing_path_id) ||
    typeof row.is_default !== 'boolean' ||
    typeof row.is_active !== 'boolean'
  ) {
    throw new MetaBuildDependencyError();
  }
  const skillIds = parseSlots<MetaSkillId>(row.skill_slots, META_SKILL_SLOT_COUNT, SKILL_IDS);
  return {
    id: row.id,
    name: row.name,
    blessingPathId: row.blessing_path_id as BlessingPathId,
    blessingBudget: safeRank(row.blessing_budget),
    blessingRanks: parseBlessingRanks(row.blessing_ranks),
    skillSlots: skillIds.map((id) => (id === null ? null : { id, rank: ownedSkills.get(id) ?? 0 })),
    gemSlots: parseSlots<MetaGemId>(row.gem_slots, META_GEM_SLOT_COUNT, GEM_IDS),
    isDefault: row.is_default,
    isActive: row.is_active,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRows(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some((row) => !isRecord(row))) {
    throw new MetaBuildDependencyError();
  }
  return value;
}

export class PostgrestMetaBuildRepository implements MetaBuildRepository {
  public constructor(
    private readonly baseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  public async loadActiveBuild(userId: string): Promise<MetaBuildModifiers> {
    const encodedUserId = encodeURIComponent(userId);
    const headers = {
      apikey: this.serviceRoleKey,
      authorization: `Bearer ${this.serviceRoleKey}`,
      accept: 'application/json',
    };
    try {
      const [profilesResponse, skillsResponse] = await Promise.all([
        this.request(
          `${this.baseUrl}/meta_character_profiles?user_id=eq.${encodedUserId}&select=id,name,blessing_path_id,blessing_budget,blessing_ranks,skill_slots,gem_slots,is_default,is_active&order=created_at.asc`,
          { headers },
        ),
        this.request(
          `${this.baseUrl}/meta_owned_skills?user_id=eq.${encodedUserId}&select=skill_id,rank`,
          { headers },
        ),
      ]);
      if (!profilesResponse.ok || !skillsResponse.ok) throw new MetaBuildDependencyError();

      const profileRows = parseRows(await profilesResponse.json()) as unknown as ProfileRow[];
      const skillRows = parseRows(await skillsResponse.json()) as unknown as SkillRow[];
      const selected =
        profileRows.find((row) => row.is_active === true) ??
        profileRows.find((row) => row.is_default === true) ??
        profileRows[0];
      if (selected === undefined) throw new MetaBuildDependencyError();

      const ownedSkills = new Map<MetaSkillId, number>();
      for (const row of skillRows) {
        if (typeof row.skill_id === 'string' && SKILL_IDS.has(row.skill_id)) {
          ownedSkills.set(row.skill_id as MetaSkillId, safeRank(row.rank));
        }
      }
      return resolveMetaBuildEffects(profileFromRows(selected, ownedSkills));
    } catch (error) {
      if (error instanceof MetaBuildDependencyError) throw error;
      throw new MetaBuildDependencyError();
    }
  }
}
