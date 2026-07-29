import { authService } from './account/authService.js';
import { isSupabaseConfigured } from './account/supabaseClient.js';
import type { AccountSession } from './account/types.js';
import { friendsService } from './hub/friendsService.js';
import { realtimeService } from './hub/realtimeService.js';
import type { LaunchPayload } from './hub/types.js';
import { AuthScreen } from './ui/AuthScreen.js';
import { Compendium } from './ui/Compendium.js';
import { Hub } from './ui/Hub.js';
import { MainMenu } from './ui/MainMenu.js';
import { ProfileScreen } from './ui/ProfileScreen.js';
import { SettingsScreen } from './ui/SettingsScreen.js';
import './styles.css';

const authElement = document.querySelector<HTMLElement>('#auth');
const menuElement = document.querySelector<HTMLElement>('#main-menu');
const compendiumElement = document.querySelector<HTMLElement>('#compendium');
const profileElement = document.querySelector<HTMLElement>('#profile');
const settingsElement = document.querySelector<HTMLElement>('#settings');
const hubElement = document.querySelector<HTMLElement>('#hub');
const multiplayerNav = document.querySelector<HTMLElement>('#multiplayer-nav');
if (
  authElement === null ||
  menuElement === null ||
  compendiumElement === null ||
  profileElement === null ||
  settingsElement === null ||
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
  hideMultiplayer();
  void profileScreen.open(accountSession);
}

function openSettings(): void {
  mainMenu.hide();
  profileScreen.hide();
  compendium.hide();
  hideMultiplayer();
  settingsScreen.show();
}

const profileScreen = new ProfileScreen(profileElement, showMenu, () => location.reload());
profileScreen.hide();

const settingsScreen = new SettingsScreen(settingsElement, showMenu);
settingsScreen.hide();

const compendium = new Compendium(compendiumElement, showMenu);
compendium.hide();

function randomSeed(): string {
  return crypto.randomUUID().slice(0, 8);
}

function beginClassic(): void {
  location.assign(`play.html?seed=${encodeURIComponent(randomSeed())}&players=1`);
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
      }),
    );
    location.assign('play.html');
    return;
  }
  location.assign(
    `play.html?seed=${encodeURIComponent(payload.seed)}&players=${String(payload.playerCount)}`,
  );
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
  try {
    if (!multiplayerStarted) {
      multiplayerStarted = true;
      const displayName =
        accountSession.displayName.length > 0 ? accountSession.displayName : accountSession.email;
      const hubSession = { userId: accountSession.userId, displayName };
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
  hideMultiplayer();
  compendium.show();
}

function openSandbox(): void {
  window.alert(
    'La Sandbox Tower est réservée au développement. Aucun outil dédié n’est exposé dans ce build.',
  );
}

const mainMenu = new MainMenu(menuElement, {
  onClassic: beginClassic,
  onMultiplayer: () => void openMultiplayer(),
  onCompendium: openCompendium,
  onProfile: openProfile,
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
    try {
      const situation = await authService.getMfaSituation();
      if (situation === 'needs-verify') {
        authScreen.resumeVerification();
      } else if (situation === 'needs-enroll') {
        authScreen.resumeEnrollment();
      } else {
        revealAfterAuth();
      }
    } catch {
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
