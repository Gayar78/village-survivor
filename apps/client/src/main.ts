import type { PublicGameState, ResourceType } from '@village-survivor/protocol';
import Phaser from 'phaser';

import { authService } from './account/authService.js';
import { isSupabaseConfigured } from './account/supabaseClient.js';
import type { AccountSession } from './account/types.js';
import { friendsService } from './hub/friendsService.js';
import { realtimeService } from './hub/realtimeService.js';
import type { LaunchPayload } from './hub/types.js';
import { GameScene } from './scenes/GameScene.js';
import { LocalSession, type VillageSurvivorDebug } from './session/LocalSession.js';
import { AudioFeedback } from './ui/AudioFeedback.js';
import { AuthScreen } from './ui/AuthScreen.js';
import { EscapeMenu } from './ui/EscapeMenu.js';
import { GameOverScreen } from './ui/GameOverScreen.js';
import { Hub } from './ui/Hub.js';
import { Hud } from './ui/Hud.js';
import { Inventory } from './ui/Inventory.js';
import { ProfileScreen } from './ui/ProfileScreen.js';
import { statsService } from './account/statsService.js';
import { VILLAGE_TRADE_HINT, VillageTrade } from './ui/VillageTrade.js';
import './styles.css';

declare global {
  interface Window {
    __VILLAGE_SURVIVOR_DEBUG__?: VillageSurvivorDebug;
  }
}

/**
 * Clé sessionStorage posée juste avant un rechargement volontaire (bouton
 * « Recommencer » de l'écran de défaite ou du menu Échap) pour sauter l'écran
 * de menu au prochain chargement et relancer directement une partie.
 */
const AUTOSTART_STORAGE_KEY = 'vs-autostart';

/** Pose le flag puis recharge : utilisé partout où « Recommencer » doit sauter le menu. */
function restartWithoutMenu(): void {
  sessionStorage.setItem(AUTOSTART_STORAGE_KEY, '1');
  location.reload();
}

const gameElement = document.querySelector<HTMLElement>('#game');
const hudElement = document.querySelector<HTMLElement>('#hud');
const authElement = document.querySelector<HTMLElement>('#auth');
const profileElement = document.querySelector<HTMLElement>('#profile');
const hubElement = document.querySelector<HTMLElement>('#hub');
const escapeMenuElement = document.querySelector<HTMLElement>('#escape-menu');
const inventoryElement = document.querySelector<HTMLElement>('#inventory');
const villageTradeElement = document.querySelector<HTMLElement>('#village-trade');
const gameOverElement = document.querySelector<HTMLElement>('#game-over');
if (
  gameElement === null ||
  hudElement === null ||
  authElement === null ||
  profileElement === null ||
  hubElement === null ||
  escapeMenuElement === null ||
  inventoryElement === null ||
  villageTradeElement === null ||
  gameOverElement === null
) {
  throw new Error('La page ne contient pas les points de montage attendus.');
}

// Clés sessionStorage posées par le hub au lancement d'une partie (co-op ou solo) :
// graine commune du monde + nombre de joueurs, transmis via un rechargement.
const COOP_SEED_KEY = 'vs-coop-seed';
const COOP_PLAYERS_KEY = 'vs-coop-players';

// Posé par « Recommencer » ou par le lancement depuis le hub : on saute alors les
// écrans (hub/menu) et on relance directement la partie.
const shouldAutostart = sessionStorage.getItem(AUTOSTART_STORAGE_KEY) === '1';
const storedCoopSeed = sessionStorage.getItem(COOP_SEED_KEY);
const storedCoopPlayers = sessionStorage.getItem(COOP_PLAYERS_KEY);
if (shouldAutostart) {
  sessionStorage.removeItem(AUTOSTART_STORAGE_KEY);
  sessionStorage.removeItem(COOP_SEED_KEY);
  sessionStorage.removeItem(COOP_PLAYERS_KEY);
}

const parameters = new URLSearchParams(location.search);
const seed =
  parameters.get('seed') ??
  (shouldAutostart && storedCoopSeed !== null ? storedCoopSeed : null) ??
  crypto.randomUUID().slice(0, 8);
const playerCount =
  shouldAutostart && storedCoopPlayers !== null
    ? Math.max(1, Math.min(10, Number.parseInt(storedCoopPlayers, 10) || 1))
    : 1;
const session = new LocalSession({ seed, playerCount });
const scene = new GameScene(session);
const hud = new Hud(hudElement, (upgradeId) => scene.selectUpgrade(upgradeId));
const audio = new AudioFeedback();
const inventory = new Inventory(inventoryElement);
const villageTrade = new VillageTrade(villageTradeElement, session);

let gameStarted = shouldAutostart;

// Session de compte courante (connexion obligatoire) : mise à jour au démarrage,
// à chaque authentification réussie et via l'abonnement aux changements d'auth.
let accountSession: AccountSession | null = null;

const profileScreen = new ProfileScreen(
  profileElement,
  () => profileScreen.hide(),
  () => location.reload(),
);
profileScreen.hide();

// Barre compte (profil + déconnexion) affichée sur le hub, masquée en jeu.
const accountBar = document.createElement('div');
accountBar.id = 'account-bar';
accountBar.style.cssText = 'position:fixed;top:16px;left:16px;z-index:46;display:none;gap:8px;';
accountBar.innerHTML =
  '<button type="button" class="hub-btn hub-btn--small" id="account-profile">Mon profil</button>' +
  '<button type="button" class="hub-btn hub-btn--small" id="account-logout">Se déconnecter</button>';
document.body.append(accountBar);
accountBar.querySelector('#account-profile')?.addEventListener('click', () => {
  if (accountSession !== null) {
    void profileScreen.open(accountSession);
  }
});
accountBar.querySelector('#account-logout')?.addEventListener('click', () => {
  if (window.confirm('Se déconnecter de ton compte ?')) {
    void authService.signOut().finally(() => location.reload());
  }
});

// Alias non-nullable (le narrowing du bloc de garde ne se propage pas dans les
// fonctions imbriquées comme `startHub`).
const hubRoot: HTMLElement = hubElement;
let hub: Hub | null = null;

// Pose le flag d'autostart + la graine commune + le nombre de joueurs, puis recharge
// pour démarrer la partie (chef ET membres reçoivent le même appel). Idempotent :
// le chef reçoit à la fois son clic et l'écho réseau, on ne recharge qu'une fois.
let coopLaunching = false;
function beginLaunch(payload: LaunchPayload): void {
  if (coopLaunching) {
    return;
  }
  coopLaunching = true;
  sessionStorage.setItem(AUTOSTART_STORAGE_KEY, '1');
  sessionStorage.setItem(COOP_SEED_KEY, payload.seed);
  sessionStorage.setItem(COOP_PLAYERS_KEY, String(payload.playerCount));
  location.reload();
}

// Démarre la présence temps réel (code perso = code de hub) puis affiche le hub.
async function startHub(account: AccountSession): Promise<void> {
  const displayName = account.displayName.length > 0 ? account.displayName : account.email;
  const hubSession = { userId: account.userId, displayName };
  try {
    const friendCode = await friendsService.getMyFriendCode();
    await realtimeService.start(hubSession, friendCode);
  } catch (error) {
    console.warn('Démarrage temps réel impossible :', error);
  }
  // Membres non-chef : le lancement réseau déclenche le démarrage local.
  realtimeService.onLaunch((payload) => beginLaunch(payload));
  hub = new Hub(hubRoot, { onLaunch: (payload) => beginLaunch(payload), session: hubSession });
  accountBar.style.display = 'flex';
  void hub.open();
}

// Une fois l'authentification acquise : autostart direct (retour de « Recommencer »
// ou lancement depuis le hub) ou affichage du hub.
let revealed = false;
async function revealAfterAuth(): Promise<void> {
  if (revealed) {
    return;
  }
  revealed = true;
  authScreen.hide();
  if (shouldAutostart) {
    gameStarted = true;
    void session.start();
    return;
  }
  if (accountSession !== null) {
    await startHub(accountSession);
  }
}

const authScreen = new AuthScreen(authElement, () => {
  void authService.getSession().then((current) => {
    accountSession = current;
    void revealAfterAuth();
  });
});

// Affiche un message d'aide clair (au lieu d'une page blanche) tant que les clés
// Supabase ne sont pas renseignées dans le `.env`.
function showConfigMissing(root: HTMLElement): void {
  root.classList.add('auth-screen');
  root.classList.remove('auth--hidden');
  root.innerHTML = `
    <div class="auth-panel">
      <div class="auth-brand"><span>VS</span><strong>Village Survivor</strong></div>
      <h2>Configuration requise</h2>
      <p class="auth-hint">
        La connexion aux comptes n'est pas encore configurée. Créez un fichier
        <code>.env</code> à la racine du projet avec vos clés Supabase
        (<code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>),
        puis relancez le serveur (<code>pnpm dev</code>).
      </p>
      <p class="auth-hint">Guide pas-à-pas : <code>docs/SETUP_SUPABASE.md</code>.</p>
    </div>`;
}

if (!isSupabaseConfigured) {
  // Pas de clés : on n'appelle aucun service réseau, on guide simplement le joueur.
  showConfigMissing(authElement);
} else {
  // Suit les changements d'état d'authentification (rafraîchissement de session,
  // déconnexion dans un autre onglet…) pour garder `accountSession` à jour.
  authService.onAuthStateChange((current) => {
    accountSession = current;
  });

  // Une session existe déjà : on vérifie l'état de la 2FA avant de déverrouiller le
  // jeu. Retour d'un lien de confirmation d'email ⇒ mise en place de la 2FA ; facteur
  // vérifié en attente ⇒ saisie du code ; sinon (aal2 ou compte OAuth) ⇒ accès direct.
  async function routeAfterSession(): Promise<void> {
    try {
      const situation = await authService.getMfaSituation();
      if (situation === 'needs-verify') {
        authScreen.resumeVerification();
      } else if (situation === 'needs-enroll') {
        authScreen.resumeEnrollment();
      } else {
        void revealAfterAuth();
      }
    } catch {
      // En cas d'échec de la détection, on laisse entrer un utilisateur déjà authentifié.
      void revealAfterAuth();
    }
  }

  // Au chargement : si une session persiste déjà (session sauvegardée, retour d'un
  // flux OAuth ou d'une confirmation d'email), on route selon l'état 2FA ; sinon on
  // affiche l'écran de connexion.
  void authService
    .getSession()
    .then((current) => {
      accountSession = current;
      if (current === null) {
        authScreen.show();
        return;
      }
      // Sur un lancement de partie (autostart), on est déjà authentifié cette
      // session : on démarre directement le jeu sans re-vérifier la 2FA. Cette
      // vérification réseau, si elle traîne ou bloque, laisserait l'écran d'auth
      // (fond vert) affiché par-dessus le jeu qui vient de démarrer.
      if (shouldAutostart) {
        void revealAfterAuth();
      } else {
        void routeAfterSession();
      }
    })
    .catch(() => {
      authScreen.show();
    });
}

const gameOverScreen = new GameOverScreen(gameOverElement, {
  onBackToMenu: () => location.reload(),
  onRestart: () => restartWithoutMenu(),
});

const escapeMenu = new EscapeMenu(escapeMenuElement, {
  onContinue: () => {},
  onRestart: () => {
    if (window.confirm('Recommencer la partie depuis le début ?')) {
      restartWithoutMenu();
    }
  },
  onQuit: () => {
    if (window.confirm('Quitter la partie en cours et revenir au menu principal ?')) {
      location.reload();
    }
  },
  onToggleMute: () => audio.toggleMute(),
  isMuted: () => audio.isMuted(),
});

/** Cumule un inventaire (joueur ou village) par type de ressource. */
function addInventory(
  totals: Record<ResourceType, number>,
  inventory: PublicGameState['player']['inventory'],
): void {
  for (const slot of inventory) {
    if (slot !== undefined) {
      totals[slot.resourceType] += slot.quantity;
    }
  }
}

// Enregistre le résultat de la partie une seule fois, à la première transition
// vers un état terminal (victoire ou défaite). Les ressources « récoltées »
// sont approchées par la somme des inventaires du joueur et du village en fin de
// partie (proxy suffisant pour des statistiques cumulées).
let runRecorded = false;
function recordRun(state: PublicGameState): void {
  if (runRecorded || accountSession === null) {
    return;
  }
  runRecorded = true;
  const resourcesGathered: Record<ResourceType, number> = {
    wood: 0,
    stone: 0,
    iron: 0,
    gold: 0,
    diamond: 0,
  };
  addInventory(resourcesGathered, state.player.inventory);
  addInventory(resourcesGathered, state.village.inventory);
  void statsService
    .recordGameResult({
      won: state.status === 'victory',
      durationMs: state.elapsedMs,
      cycleReached: state.cycle,
      playerLevel: state.player.level,
      resourcesGathered,
    })
    .catch((error: unknown) => {
      // Un échec réseau ne doit pas casser la fin de partie côté client.
      console.error("Échec de l'enregistrement des statistiques de la partie :", error);
    });
}

let latestState: ReturnType<VillageSurvivorDebug['getState']> | undefined;
session.subscribe((state) => {
  latestState = state;
  hud.render(state);
  audio.consume(state);
  inventory.update(state);
  villageTrade.update(state);
  if (state.status === 'victory' || state.status === 'defeat') {
    recordRun(state);
  }
  if (state.status === 'defeat') {
    gameOverScreen.show();
  }
});

// `Échap` ouvre/ferme le menu pause, qui ne met jamais la partie en pause (la
// simulation continue derrière). `I` ouvre l'inventaire solo. L'ouverture de la
// vue d'échange villageois se fait désormais au clic gauche près du village
// (voir le listener `pointerdown` plus bas), E étant réaffecté au soin dans la
// scène. `F` ouvre le panneau d'améliorations quand le joueur le décide ; `1`,
// `2` et `3` choisissent sans quitter le clavier une fois qu'il est ouvert.
window.addEventListener('keydown', (event) => {
  if (event.repeat) {
    return;
  }
  if (event.code === 'Escape') {
    if (gameStarted) {
      if (villageTrade.isOpen()) {
        villageTrade.close();
      } else if (inventory.isOpen()) {
        inventory.close();
      } else {
        escapeMenu.toggle();
      }
    }
    return;
  }
  if (event.code === 'KeyI') {
    if (gameStarted) {
      if (villageTrade.isOpen()) {
        villageTrade.close();
      }
      inventory.toggle();
    }
    return;
  }
  if (latestState === undefined) {
    return;
  }
  if (event.code === 'KeyF') {
    if (latestState.upgradeChoices.length > 0) {
      hud.toggleUpgradePanel();
      hud.render(latestState);
    }
    return;
  }
  if (!hud.isUpgradePanelOpen()) {
    return;
  }
  const index = ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code);
  const choice = index < 0 ? undefined : latestState.upgradeChoices[index];
  if (choice !== undefined) {
    scene.selectUpgrade(choice.id);
  }
});

// Reprise exacte de l'ancien comportement de la touche E, transposée au clic
// gauche : quand l'indice affiché signale un échange villageois, un clic gauche
// sur le monde (hors panneaux d'interface) bascule la vue d'échange. On écoute
// au niveau du document plutôt que via la scène Phaser pour tester simplement la
// cible de l'événement et éviter de réagir aux clics sur l'UI DOM existante ; la
// scène, de son côté, ignore déjà ce clic quand `interactionHint` vaut
// `VILLAGE_TRADE_HINT`, donc aucune double action n'est déclenchée.
const UI_PANELS_SELECTOR = '#inventory, #village-trade, #escape-menu, #menu, #game-over';
document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !gameStarted) {
    return;
  }
  if (latestState?.interactionHint !== VILLAGE_TRADE_HINT) {
    return;
  }
  const target = event.target;
  if (target instanceof Element && target.closest(UI_PANELS_SELECTOR) !== null) {
    return;
  }
  if (inventory.isOpen()) {
    inventory.close();
  }
  villageTrade.toggle();
});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: gameElement,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#111a1d',
  render: {
    antialias: true,
    roundPixels: true,
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [scene],
});

if (import.meta.env.DEV) {
  window.__VILLAGE_SURVIVOR_DEBUG__ = session.debug;
  const metrics = document.createElement('output');
  metrics.className = 'debug-metrics';
  metrics.setAttribute('aria-label', 'Métriques de développement');
  document.body.append(metrics);
  window.setInterval(() => {
    const state = session.debug.getState();
    const sessionMetrics = session.debug.getMetrics();
    metrics.textContent = [
      `FPS ${game.loop.actualFps.toFixed(0)}`,
      `tick ${state.tick}`,
      `sim ${sessionMetrics.lastTickDurationMs.toFixed(2)} ms`,
      `entités ${state.enemies.length + state.resources.filter((resource) => resource.amountRemaining > 0).length + state.defenses.length + 2}`,
      `graine ${state.seed}`,
    ].join(' · ');
  }, 500);
}

// La partie démarre seulement après authentification : soit au clic sur « Jouer »
// dans le menu, soit immédiatement via `revealAfterAuth` si le flag d'autostart
// est posé (retour de « Recommencer »). La simulation ne tourne donc jamais tant
// que l'écran de connexion ou l'écran-titre est affiché.
window.addEventListener('beforeunload', () => void session.stop(), { once: true });
