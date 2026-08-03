import { authService } from './account/authService.js';
import { spentBlessingBudget } from './account/blessingBudget.js';
import { metaProgressionService } from './account/metaProgressionService.js';
import { isSupabaseConfigured } from './account/supabaseClient.js';
import type { AccountSession, MetaProgressionSnapshot } from './account/types.js';
import {
  META_BLESSING_BUDGET,
  META_CATALOG,
  META_PROFILE_LIMIT,
  resolveMetaBuildEffects,
} from '@village-survivor/protocol';
import type {
  BlessingId,
  BlessingPathId,
  ForgeRecipeId,
  MetaCharacterProfile,
  MetaGemId,
  MetaSkillId,
} from '@village-survivor/protocol';
import { friendsService } from './hub/friendsService.js';
import { realtimeService } from './hub/realtimeService.js';
import type { LaunchPayload } from './hub/types.js';
import { gameUrl } from './gameUrl.js';
import { AuthScreen } from './ui/AuthScreen.js';
import { Compendium } from './ui/Compendium.js';
import { Hub } from './ui/Hub.js';
import { MainMenu } from './ui/MainMenu.js';
import { MetaBuildScreen } from './ui/MetaBuildScreen.js';
import type { MetaBuildController, MetaBuildViewModel } from './ui/MetaBuildScreen.js';
import { ProfileScreen } from './ui/ProfileScreen.js';
import { SettingsScreen } from './ui/SettingsScreen.js';
import './styles.css';

const authElement = document.querySelector<HTMLElement>('#auth');
const menuElement = document.querySelector<HTMLElement>('#main-menu');
const compendiumElement = document.querySelector<HTMLElement>('#compendium');
const profileElement = document.querySelector<HTMLElement>('#profile');
const settingsElement = document.querySelector<HTMLElement>('#settings');
const metaBuildElement = document.querySelector<HTMLElement>('#meta-build');
const hubElement = document.querySelector<HTMLElement>('#hub');
const multiplayerNav = document.querySelector<HTMLElement>('#multiplayer-nav');
if (
  authElement === null ||
  menuElement === null ||
  compendiumElement === null ||
  profileElement === null ||
  settingsElement === null ||
  metaBuildElement === null ||
  hubElement === null ||
  multiplayerNav === null
) {
  throw new Error('La page lobby ne contient pas les points de montage attendus.');
}

let accountSession: AccountSession | null = null;
let hub: Hub | null = null;
let multiplayerStarted = false;
let multiplayerOpening = false;
let unsubscribeLaunch: (() => void) | null = null;
let coopLaunching = false;

const hubRoot: HTMLElement = hubElement;
const navRoot: HTMLElement = multiplayerNav;

function hideMultiplayer(): void {
  hub?.hide();
  navRoot.classList.remove('main-menu-account-bar--visible');
}

function showMenu(): void {
  profileScreen.hide();
  settingsScreen.hide();
  compendium.hide();
  metaBuildScreen.hide();
  hideMultiplayer();
  mainMenu.show();
}

function openProfile(): void {
  if (accountSession === null) {
    return;
  }
  mainMenu.hide();
  settingsScreen.hide();
  compendium.hide();
  metaBuildScreen.hide();
  hideMultiplayer();
  void profileScreen.open(accountSession);
}

function openSettings(): void {
  mainMenu.hide();
  profileScreen.hide();
  compendium.hide();
  metaBuildScreen.hide();
  hideMultiplayer();
  settingsScreen.show();
}

const profileScreen = new ProfileScreen(profileElement, showMenu, () => location.reload());
profileScreen.hide();

const settingsScreen = new SettingsScreen(settingsElement, showMenu);
settingsScreen.hide();

function activeProfile(snapshot: MetaProgressionSnapshot): MetaCharacterProfile | null {
  return snapshot.profiles.find((profile) => profile.isActive) ?? snapshot.profiles[0] ?? null;
}

async function loadActiveMetaBuild(): Promise<
  ReturnType<typeof resolveMetaBuildEffects> | undefined
> {
  try {
    const profile = activeProfile(await metaProgressionService.loadMetaProgression());
    return profile === null ? undefined : resolveMetaBuildEffects(profile);
  } catch (error) {
    console.warn('Build méta indisponible : statistiques de base utilisées.', error);
    return undefined;
  }
}

function toMetaBuildViewModel(snapshot: MetaProgressionSnapshot): MetaBuildViewModel {
  const active = activeProfile(snapshot);
  const equippedSkills = active?.skillSlots ?? [];
  const equippedGems = active?.gemSlots ?? [];
  const equippedGemViews = equippedGems.flatMap((gemId, slot) => {
    const gem = META_CATALOG.gems.find((candidate) => candidate.id === gemId);
    return gem
      ? [{ id: gem.id, name: gem.label, effect: gem.description, quantity: 0, equippedSlot: slot }]
      : [];
  });
  const spareGemViews = META_CATALOG.gems.flatMap((gem) => {
    const quantity = Math.max(
      0,
      snapshot.ownedGems[gem.id] - equippedGems.filter((equipped) => equipped === gem.id).length,
    );
    return quantity > 0
      ? [{ id: gem.id, name: gem.label, effect: gem.description, quantity, equippedSlot: null }]
      : [];
  });
  return {
    accountGold: snapshot.goldBalance,
    profileLimit: META_PROFILE_LIMIT,
    blessingPaths: META_CATALOG.paths.map((path) => ({
      id: path.id,
      name: path.label,
      description: path.description,
    })),
    characters: snapshot.profiles.map((profile, index) => ({
      id: profile.id,
      name: profile.name,
      title: `Profil ${String(index + 1).padStart(2, '0')}`,
      summary:
        META_CATALOG.paths.find((candidate) => candidate.id === profile.blessingPathId)
          ?.description ?? 'Build sauvegardé.',
      level: 1,
      active: profile.isActive,
      isDefault: profile.isDefault,
    })),
    blessingBudget: { spent: spentBlessingBudget(active), total: META_BLESSING_BUDGET },
    blessings: META_CATALOG.blessings.map((blessing) => {
      const rank = active?.blessingRanks[blessing.id] ?? 0;
      const remaining = META_BLESSING_BUDGET - spentBlessingBudget(active);
      return {
        id: blessing.id,
        name: blessing.label,
        region:
          META_CATALOG.paths.find((candidate) => candidate.id === blessing.pathId)?.label ?? 'Voie',
        description: blessing.description,
        effect: `Rang ${rank} / ${blessing.maxRank}`,
        cost: blessing.goldCosts[Math.min(rank, blessing.goldCosts.length - 1)] ?? 0,
        unlocked: rank > 0,
        available:
          active !== null &&
          blessing.pathId === active.blessingPathId &&
          rank < blessing.maxRank &&
          // Sans cette borne, le bouton reste actif une fois le budget épuisé et seule la base
          // finit par refuser l'achat — le joueur découvre la limite par un message d'erreur.
          remaining >= blessing.budgetPerRank,
        isMaxed: rank >= blessing.maxRank,
      };
    }),
    skills: META_CATALOG.skills.map((skill) => {
      const rank = snapshot.ownedSkills[skill.id] ?? 0;
      const slot = equippedSkills.findIndex((equipped) => equipped?.id === skill.id);
      return {
        id: skill.id,
        name: skill.label,
        description: skill.description,
        equipped: slot >= 0,
        slot: slot >= 0 ? slot : null,
        rank,
        maxRank: skill.maxRank,
        cost: rank < skill.maxRank ? (skill.goldCosts[rank] ?? null) : null,
      };
    }),
    gems: [...equippedGemViews, ...spareGemViews],
    forgeRecipes: META_CATALOG.forgeRecipes.map((recipe) => ({
      id: recipe.id,
      name: recipe.label,
      output: `${recipe.output.quantity} × ${META_CATALOG.gems.find((gem) => gem.id === recipe.output.gemId)?.label ?? recipe.output.gemId}`,
      goldCost: recipe.goldCost,
      available: recipe.ingredients.every(
        (ingredient) => (snapshot.ownedGems[ingredient.gemId] ?? 0) >= ingredient.quantity,
      ),
    })),
  };
}

/** Adaptateur UI : les écritures restent exclusivement dans metaProgressionService. */
function createMetaBuildController(): MetaBuildController {
  let snapshot: MetaProgressionSnapshot | null = null;
  const refresh = async (): Promise<MetaBuildViewModel> => {
    snapshot = await metaProgressionService.loadMetaProgression();
    return toMetaBuildViewModel(snapshot);
  };
  const requireActive = (): MetaCharacterProfile => {
    const profile = snapshot ? activeProfile(snapshot) : null;
    if (!profile) throw new Error('Créez d’abord un personnage pour modifier son build.');
    return profile;
  };
  const requireSlot = (slot: number): void => {
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) {
      throw new Error('Choisissez un emplacement valide.');
    }
  };
  const saveSlots = async (
    profile: MetaCharacterProfile,
    skillSlots: readonly (MetaSkillId | null)[],
    gemSlots: readonly (MetaGemId | null)[],
  ): Promise<void> => {
    await metaProgressionService.saveProfile(profile.id, {
      name: profile.name,
      blessingPathId: profile.blessingPathId,
      skillSlots,
      gemSlots,
    });
  };
  return {
    load: refresh,
    createCharacter: async (name, blessingPathId) => {
      await metaProgressionService.createProfile(name, blessingPathId as BlessingPathId);
      return { viewModel: await refresh(), message: 'Profil créé et confirmé.' };
    },
    activateCharacter: async (profileId) => {
      await metaProgressionService.activateProfile(profileId);
      return { viewModel: await refresh(), message: 'Personnage actif confirmé.' };
    },
    deleteCharacter: async (profileId) => {
      const profile = snapshot?.profiles.find((candidate) => candidate.id === profileId);
      if (!profile) throw new Error('Ce personnage est introuvable.');
      if (profile.isDefault) throw new Error('Le profil par défaut ne peut pas être supprimé.');
      await metaProgressionService.deleteProfile(profileId);
      return { viewModel: await refresh(), message: 'Profil supprimé et confirmation reçue.' };
    },
    unlockBlessing: async (blessingId) => {
      await metaProgressionService.purchaseBlessing(requireActive().id, blessingId as BlessingId);
      return { viewModel: await refresh(), message: 'Bénédiction confirmée.' };
    },
    purchaseSkill: async (skillId) => {
      await metaProgressionService.purchaseSkill(skillId as MetaSkillId);
      return { viewModel: await refresh(), message: 'Compétence achetée et confirmée.' };
    },
    equipSkill: async (skillId, slot) => {
      const profile = requireActive();
      requireSlot(slot);
      const skillSlots = profile.skillSlots.map((skill) => skill?.id ?? null);
      skillSlots[slot] = skillId as MetaSkillId;
      await saveSlots(profile, skillSlots, profile.gemSlots);
      return { viewModel: await refresh(), message: 'Compétence équipée et confirmée.' };
    },
    unequipSkill: async (slot) => {
      const profile = requireActive();
      requireSlot(slot);
      const skillSlots = profile.skillSlots.map((skill) => skill?.id ?? null);
      skillSlots[slot] = null;
      await saveSlots(profile, skillSlots, profile.gemSlots);
      return { viewModel: await refresh(), message: 'Compétence retirée et confirmation reçue.' };
    },
    socketGem: async (gemId, slot) => {
      const profile = requireActive();
      requireSlot(slot);
      const gemSlots = [...profile.gemSlots];
      gemSlots[slot] = gemId as MetaGemId;
      await saveSlots(
        profile,
        profile.skillSlots.map((skill) => skill?.id ?? null),
        gemSlots,
      );
      return { viewModel: await refresh(), message: 'Gemme sertie et confirmée.' };
    },
    unsocketGem: async (slot) => {
      const profile = requireActive();
      requireSlot(slot);
      const gemSlots = [...profile.gemSlots];
      gemSlots[slot] = null;
      await saveSlots(
        profile,
        profile.skillSlots.map((skill) => skill?.id ?? null),
        gemSlots,
      );
      return { viewModel: await refresh(), message: 'Gemme retirée et confirmation reçue.' };
    },
    forge: async (recipeId) => {
      await metaProgressionService.forge(recipeId as ForgeRecipeId);
      return { viewModel: await refresh(), message: 'Recette forgée et confirmée.' };
    },
  };
}

const metaBuildController = createMetaBuildController();

const metaBuildScreen = new MetaBuildScreen(metaBuildElement, showMenu, metaBuildController);
metaBuildScreen.hide();

const compendium = new Compendium(compendiumElement, showMenu);
compendium.hide();

function beginClassic(): void {
  // La build active et la graine sont désormais résolues par le serveur autoritaire.
  location.assign(gameUrl());
}

function beginLaunch(payload: LaunchPayload): void {
  if (coopLaunching) {
    return;
  }
  coopLaunching = true;
  const me = accountSession?.userId;
  if (
    payload.code !== undefined &&
    payload.hostId !== undefined &&
    payload.roster !== undefined &&
    payload.roster.length > 1 &&
    me !== undefined
  ) {
    sessionStorage.setItem(
      'vs-coop-netcode',
      JSON.stringify({
        seed: payload.seed,
        code: payload.code,
        hostId: payload.hostId,
        me,
        roster: payload.roster,
        metaBuildsByPlayerId: Object.fromEntries(
          payload.roster.map((entry) => [entry.id, entry.metaBuild ?? {}]),
        ),
      }),
    );
    location.assign(gameUrl());
    return;
  }
  location.assign(gameUrl({ seed: payload.seed, players: String(payload.playerCount) }));
}

async function openMultiplayer(): Promise<void> {
  if (accountSession === null || multiplayerOpening) {
    return;
  }
  multiplayerOpening = true;
  mainMenu.hide();
  compendium.hide();
  profileScreen.hide();
  settingsScreen.hide();
  metaBuildScreen.hide();
  try {
    if (!multiplayerStarted) {
      multiplayerStarted = true;
      const displayName =
        accountSession.displayName.length > 0 ? accountSession.displayName : accountSession.email;
      const metaBuild = await loadActiveMetaBuild();
      const hubSession = {
        userId: accountSession.userId,
        displayName,
        ...(metaBuild === undefined ? {} : { metaBuild }),
      };
      try {
        const friendCode = await friendsService.getMyFriendCode();
        await realtimeService.start(hubSession, friendCode);
      } catch (error) {
        console.warn('Démarrage temps réel impossible :', error);
      }
      unsubscribeLaunch = realtimeService.onLaunch(beginLaunch);
      hub = new Hub(hubRoot, { onLaunch: beginLaunch, session: hubSession });
    }
    navRoot.classList.add('main-menu-account-bar--visible');
    await hub?.open();
  } finally {
    multiplayerOpening = false;
  }
}

function openCompendium(): void {
  mainMenu.hide();
  settingsScreen.hide();
  metaBuildScreen.hide();
  hideMultiplayer();
  compendium.show();
}

function openMetaBuild(): void {
  mainMenu.hide();
  profileScreen.hide();
  settingsScreen.hide();
  compendium.hide();
  hideMultiplayer();
  void metaBuildScreen.open();
}

function openSandbox(): void {
  window.alert(
    'La Sandbox Tower est réservée au développement. Aucun outil dédié n’est exposé dans ce build.',
  );
}

const mainMenu = new MainMenu(menuElement, {
  onClassic: () => void beginClassic(),
  onMultiplayer: () => void openMultiplayer(),
  onCompendium: openCompendium,
  onProfile: openProfile,
  onMetaBuild: openMetaBuild,
  onSettings: openSettings,
  ...(import.meta.env.DEV ? { onSandbox: openSandbox } : {}),
  onSignOut: () => {
    if (window.confirm('Se déconnecter de ton compte ?')) {
      void authService.signOut().finally(() => location.reload());
    }
  },
});
mainMenu.hide();

navRoot.querySelector('#multiplayer-back')?.addEventListener('click', showMenu);
navRoot.querySelector('#multiplayer-profile')?.addEventListener('click', openProfile);
navRoot.querySelector('#multiplayer-logout')?.addEventListener('click', () => {
  if (window.confirm('Se déconnecter de ton compte ?')) {
    unsubscribeLaunch?.();
    unsubscribeLaunch = null;
    void authService.signOut().finally(() => location.reload());
  }
});

const authScreen = new AuthScreen(authElement, () => {
  void authService.getSession().then((current) => {
    accountSession = current;
    revealAfterAuth();
  });
});

function revealAfterAuth(): void {
  if (accountSession === null) {
    return;
  }
  authScreen.hide();
  showMenu();
}

function showConfigMissing(root: HTMLElement): void {
  root.classList.add('auth-screen');
  root.classList.remove('auth--hidden');
  root.innerHTML = `
    <div class="auth-panel">
      <div class="auth-brand"><span>VS</span><strong>Village Survivor</strong></div>
      <h2>Configuration requise</h2>
      <p class="auth-hint">
        La connexion aux comptes n'est pas encore configurée. Créez un fichier <code>.env</code>
        à la racine du projet avec <code>VITE_SUPABASE_URL</code> et
        <code>VITE_SUPABASE_ANON_KEY</code>, puis relancez le serveur.
      </p>
      <p class="auth-hint">Guide pas-à-pas : <code>docs/SETUP_SUPABASE.md</code>.</p>
    </div>`;
}

if (!isSupabaseConfigured) {
  showConfigMissing(authElement);
} else {
  authService.onAuthStateChange((current) => {
    accountSession = current;
  });

  async function routeAfterSession(): Promise<void> {
    let situation;
    try {
      situation = await authService.getMfaSituation();
    } catch (error) {
      // Échec fermé. Une erreur ici signifie qu'on n'a PAS pu établir que le second facteur
      // était satisfait — pas qu'il l'est. Révéler le contenu authentifié dans ce cas
      // transformait la moindre panne réseau en contournement de la double authentification.
      console.error("Niveau d'authentification invérifiable : accès refusé.", error);
      accountSession = null;
      authScreen.show();
      return;
    }
    if (situation === 'needs-verify') {
      authScreen.resumeVerification();
    } else if (situation === 'needs-enroll') {
      authScreen.resumeEnrollment();
    } else {
      revealAfterAuth();
    }
  }

  void authService
    .getSession()
    .then((current) => {
      accountSession = current;
      if (current === null) {
        authScreen.show();
        return;
      }
      void routeAfterSession();
    })
    .catch(() => authScreen.show());
}
