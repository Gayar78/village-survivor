import {
  META_CATALOG,
  type MetaCatalog,
  type MetaCharacterProfile,
} from '@village-survivor/protocol';

/**
 * Éclats de bénédiction réellement investis par un profil.
 *
 * À ne pas confondre avec `profile.blessingBudget`, qui est la **capacité** allouée : la base la
 * fixe à `META_BLESSING_BUDGET` et une contrainte `check (blessing_budget = 4)` lui interdit
 * toute autre valeur. L'utiliser comme montant dépensé faisait afficher « 4 / 4 investis » à
 * tout profil neuf, avant le moindre achat.
 *
 * Le montant dépensé se déduit donc des rangs acquis. Seules les bénédictions de la voie du
 * profil comptent : ce sont les seules que `resolveMetaBuildEffects` applique, et donc les
 * seules qui consomment réellement le budget. Les rangs hors limites ou absents sont bornés,
 * de sorte qu'un profil ancien ou altéré ne produise jamais de total aberrant.
 */
export function spentBlessingBudget(
  profile: MetaCharacterProfile | null,
  catalog: MetaCatalog = META_CATALOG,
): number {
  if (profile === null) {
    return 0;
  }
  return catalog.blessings.reduce((total, blessing) => {
    if (blessing.pathId !== profile.blessingPathId) {
      return total;
    }
    const raw = profile.blessingRanks[blessing.id] ?? 0;
    const rank = Number.isFinite(raw)
      ? Math.max(0, Math.min(blessing.maxRank, Math.floor(raw)))
      : 0;
    return total + rank * blessing.budgetPerRank;
  }, 0);
}
