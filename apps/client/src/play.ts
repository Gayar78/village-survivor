import type { PublicGameState, ResourceType } from '@village-survivor/protocol';
import Phaser from 'phaser';

import { authService } from './account/authService.js';
import type { AccountSession } from './account/types.js';
import { statsService } from './account/statsService.js';
import { createCoopSession, type CoopConfig } from './net/coopSession.js';
import { GameScene } from './scenes/GameScene.js';
import { LocalSession, type VillageSurvivorDebug } from './session/LocalSession.js';
import type { RenderableSession } from './session/RenderableSession.js';
import { AudioFeedback } from './ui/AudioFeedback.js';
import { EscapeMenu } from './ui/EscapeMenu.js';
import { GameOverScreen } from './ui/GameOverScreen.js';
import { Hud } from './ui/Hud.js';
import { Inventory } from './ui/Inventory.js';
import { VILLAGE_TRADE_HINT, VillageTrade } from './ui/VillageTrade.js';
import './styles.css';

declare global {
  interface Window {
    __VILLAGE_SURVIVOR_DEBUG__?: VillageSurvivorDebug;
  }
}

// Page de JEU dédiée. Elle ne contient ni authentification ni hub : ceux-ci vivent
// sur la page lobby (index.html). Le hub navigue vers `play.html?seed=…&players=…`
// pour lancer une partie (chef et membres reçoivent la même graine). Séparer le jeu
// sur sa propre page garantit un rendu Phaser propre, sans calque d'interface du
// lobby par-dessus le canvas.

const gameElement = document.querySelector<HTMLElement>('#game');
const hudElement = document.querySelector<HTMLElement>('#hud');
const escapeMenuElement = document.querySelector<HTMLElement>('#escape-menu');
const inventoryElement = document.querySelector<HTMLElement>('#inventory');
const villageTradeElement = document.querySelector<HTMLElement>('#village-trade');
const gameOverElement = document.querySelector<HTMLElement>('#game-over');
if (
  gameElement === null ||
  hudElement === null ||
  escapeMenuElement === null ||
  inventoryElement === null ||
  villageTradeElement === null ||
  gameOverElement === null
) {
  throw new Error('La page de jeu ne contient pas les points de montage attendus.');
}

// Graine commune du monde + nombre de joueurs, transmis par le hub via l'URL.
const parameters = new URLSearchParams(location.search);
const seed = parameters.get('seed') ?? crypto.randomUUID().slice(0, 8);
const playerCount = Math.max(
  1,
  Math.min(10, Number.parseInt(parameters.get('players') ?? '1', 10) || 1),
);

// Retour au lobby (menu principal / hub).
function goToLobby(): void {
  location.assign('index.html');
}

// Relance une nouvelle partie (nouvelle graine, même nombre de joueurs).
function restartGame(): void {
  location.assign(`play.html?players=${String(playerCount)}`);
}

// Configuration co-op posée par le lobby juste avant la navigation (clé consommée
// une seule fois : un simple rafraîchissement de la page retombe donc en solo).
const NETCODE_KEY = 'vs-coop-netcode';
function readCoopConfig(): CoopConfig | null {
  const raw = sessionStorage.getItem(NETCODE_KEY);
  if (raw === null) {
    return null;
  }
  sessionStorage.removeItem(NETCODE_KEY);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as CoopConfig).seed === 'string' &&
      typeof (parsed as CoopConfig).code === 'string' &&
      typeof (parsed as CoopConfig).hostId === 'string' &&
      typeof (parsed as CoopConfig).me === 'string' &&
      Array.isArray((parsed as CoopConfig).roster)
    ) {
      return parsed as CoopConfig;
    }
  } catch (error) {
    console.warn('Configuration co-op illisible, démarrage en solo.', error);
  }
  return null;
}

const coopConfig = readCoopConfig();
// Co-op (au moins 2 joueurs) → session réseau hôte/invité ; sinon partie solo locale.
let session: RenderableSession;
if (coopConfig !== null && coopConfig.roster.length > 1) {
  session = createCoopSession(coopConfig);
} else {
  console.info(
    `[play] démarrage SOLO — ${
      coopConfig === null
        ? 'aucune config co-op (lancement direct, ou page rafraîchie : relance depuis le hub)'
        : `roster insuffisant (${String(coopConfig.roster.length)})`
    }`,
  );
  session = new LocalSession({ seed, playerCount });
}
const scene = new GameScene(session);
if (coopConfig !== null) {
  // Libellés d'alliés avec les vrais pseudos (roster du hub) plutôt que l'identifiant.
  scene.setPlayerNames(new Map(coopConfig.roster.map((entry) => [entry.id, entry.name])));
}
const hud = new Hud(hudElement, (upgradeId) => scene.selectUpgrade(upgradeId));
const audio = new AudioFeedback();
const inventory = new Inventory(inventoryElement);
const villageTrade = new VillageTrade(villageTradeElement, session);

// Session de compte (pour l'enregistrement des statistiques). Récupérée en
// arrière-plan : une partie peut démarrer sans attendre le réseau.
let accountSession: AccountSession | null = null;
void authService
  .getSession()
  .then((current) => {
    accountSession = current;
  })
  .catch(() => {});

const gameOverScreen = new GameOverScreen(gameOverElement, {
  onBackToMenu: () => goToLobby(),
  onRestart: () => restartGame(),
});

const escapeMenu = new EscapeMenu(escapeMenuElement, {
  onContinue: () => {},
  onRestart: () => {
    if (window.confirm('Recommencer la partie depuis le début ?')) {
      restartGame();
    }
  },
  onQuit: () => {
    if (window.confirm('Quitter la partie en cours et revenir au menu principal ?')) {
      goToLobby();
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

// Enregistre le résultat de la partie une seule fois, à la première transition vers
// un état terminal (victoire ou défaite).
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

// `Échap` ouvre/ferme le menu pause. `I` ouvre l'inventaire. `F` ouvre le panneau
// d'améliorations ; `1`, `2`, `3` choisissent sans quitter le clavier.
window.addEventListener('keydown', (event) => {
  if (event.repeat) {
    return;
  }
  if (event.code === 'Escape') {
    if (villageTrade.isOpen()) {
      villageTrade.close();
    } else if (inventory.isOpen()) {
      inventory.close();
    } else {
      escapeMenu.toggle();
    }
    return;
  }
  if (event.code === 'KeyI') {
    if (villageTrade.isOpen()) {
      villageTrade.close();
    }
    inventory.toggle();
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

// Clic gauche sur le monde (hors panneaux d'UI) pour ouvrir l'échange villageois
// quand l'indice le signale.
const UI_PANELS_SELECTOR = '#inventory, #village-trade, #escape-menu, #game-over';
document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) {
    return;
  }
  if (latestState?.player.interactionHint !== VILLAGE_TRADE_HINT) {
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

// Métriques de dev : uniquement en solo (la session locale expose `debug`). Les
// sessions co-op (hôte/invité) ne fournissent pas cette console de débogage.
if (import.meta.env.DEV && session instanceof LocalSession) {
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
      `graine ${state.seed}`,
    ].join(' · ');
  }, 500);
}

window.addEventListener('beforeunload', () => void session.stop(), { once: true });

// La partie démarre immédiatement : cette page n'est atteinte qu'après le lancement
// depuis le hub.
void session.start();
