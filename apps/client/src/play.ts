import { TOWER_WEAPONS } from '@village-survivor/content';
import type { TowerGameState, TowerInput } from '@village-survivor/protocol';
import Phaser from 'phaser';

import {
  createTowerCoopSession,
  type TowerCoopConfig,
  type TowerRenderableSession,
} from './net/towerSession.js';
import { TowerServerSession } from './net/TowerServerSession.js';
import { authService } from './account/authService.js';
import { statsService } from './account/statsService.js';
import { friendsService } from './hub/friendsService.js';
import { realtimeService } from './hub/realtimeService.js';
import { gameUrl } from './gameUrl.js';
import { createLogger } from './observability/logger.js';
import { describeError } from './observability/redact.js';
import { flushTelemetry, initTelemetry } from './observability/telemetry.js';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  endGameSessionSpan,
  startGameChildSpan,
  startGameSessionSpan,
  type GameMode,
} from './observability/gameTelemetry.js';
import { TowerScene } from './scenes/TowerScene.js';
import { EscapeMenu } from './ui/EscapeMenu.js';
import { GameOverScreen } from './ui/GameOverScreen.js';
import { TowerHud } from './ui/tower/TowerHud.js';
import { TowerLevelUp } from './ui/tower/TowerLevelUp.js';
import { TurretShop } from './ui/tower/TurretShop.js';
import {
  canQueueTowerLevelSelection,
  getTowerLevelShortcutIndex,
  isTowerLevelSelectionAcknowledged,
} from './towerLevelShortcuts.js';
import './styles.css';

// Page de JEU (« Tower / arme à feu », Phase 1). Assemble : session (solo ou co-op
// host-autoritaire), scène de rendu, HUD, boutique de tourelle, écran de niveau, et la
// capture des entrées (déplacement clavier + visée souris + tir + arsenal 1/2/3).

const gameElement = document.querySelector<HTMLElement>('#game');
const hudElement = document.querySelector<HTMLElement>('#hud');
const shopElement = document.querySelector<HTMLElement>('#turret-shop');
const levelupElement = document.querySelector<HTMLElement>('#levelup');
const escapeMenuElement = document.querySelector<HTMLElement>('#escape-menu');
const gameOverElement = document.querySelector<HTMLElement>('#game-over');
const syncStatusElement = document.querySelector<HTMLElement>('#tower-sync-status');
const syncStatusTitleElement = document.querySelector<HTMLElement>('#tower-sync-status-title');
const syncStatusDetailElement = document.querySelector<HTMLElement>('#tower-sync-status-detail');
if (
  gameElement === null ||
  hudElement === null ||
  shopElement === null ||
  levelupElement === null ||
  escapeMenuElement === null ||
  gameOverElement === null ||
  syncStatusElement === null ||
  syncStatusTitleElement === null ||
  syncStatusDetailElement === null
) {
  throw new Error('La page de jeu ne contient pas les points de montage attendus.');
}
const syncStatus = {
  element: syncStatusElement,
  title: syncStatusTitleElement,
  detail: syncStatusDetailElement,
};

// Config co-op posée par le lobby (même clé/forme que l'ancien jeu). Consommée une fois.
const NETCODE_KEY = 'vs-coop-netcode';
function readCoopConfig(): TowerCoopConfig | null {
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
      typeof (parsed as TowerCoopConfig).seed === 'string' &&
      typeof (parsed as TowerCoopConfig).code === 'string' &&
      typeof (parsed as TowerCoopConfig).hostId === 'string' &&
      typeof (parsed as TowerCoopConfig).me === 'string' &&
      Array.isArray((parsed as TowerCoopConfig).roster)
    ) {
      return parsed as TowerCoopConfig;
    }
  } catch (error) {
    console.warn('Configuration co-op illisible, démarrage en solo.', error);
  }
  return null;
}

function goToLobby(): void {
  location.assign('index.html');
}
function restartGame(): void {
  sessionStorage.removeItem(NETCODE_KEY);
  location.assign(gameUrl());
}

const coopConfig = readCoopConfig();
const activeCoopConfig = coopConfig !== null && coopConfig.roster.length > 1 ? coopConfig : null;
const isCoopSession = activeCoopConfig !== null;

// La télémétrie démarre avant la partie et ne conditionne rien : sans collecteur configuré,
// `initTelemetry` ne fait rien et le jeu se déroule à l'identique.
const telemetry = initTelemetry();
const log = createLogger('session');
const gameMode: GameMode = isCoopSession ? 'coop' : 'solo';
const gameSessionSpan = startGameSessionSpan({
  seed: activeCoopConfig?.seed ?? 'server-assigned',
  mode: gameMode,
  playersCount: activeCoopConfig?.roster.length ?? 1,
  ...(activeCoopConfig === null ? {} : { roomCode: activeCoopConfig.code }),
});
let gameSessionEnded = false;

/** Une partie ne se termine qu'une fois, quelle qu'en soit la porte de sortie. */
function endGameSession(outcome: 'defeat' | 'left' | 'error', attributes = {}): void {
  if (gameSessionEnded) {
    return;
  }
  gameSessionEnded = true;
  endGameSessionSpan(gameSessionSpan, outcome, attributes);
  flushTelemetry();
}

log.info('partie lancée', {
  'vs.mode': gameMode,
  'vs.players.count': activeCoopConfig?.roster.length ?? 1,
  'vs.telemetry.enabled': telemetry.exportEnabled,
});

const session: TowerRenderableSession =
  activeCoopConfig !== null ? createTowerCoopSession(activeCoopConfig) : new TowerServerSession();

type CoopStatusTone = 'pending' | 'issue';

function showConnectionStatus(tone: CoopStatusTone, title: string, detail: string): void {
  syncStatus.element.dataset.tone = tone;
  syncStatus.title.textContent = title;
  syncStatus.detail.textContent = detail;
  syncStatus.element.hidden = false;
}

if (activeCoopConfig !== null) {
  const role = activeCoopConfig.me === activeCoopConfig.hostId ? 'hôte' : 'invité';
  showConnectionStatus(
    'pending',
    `Co-op P2P · ${role}`,
    'Synchronisation au lancement : gardez cet onglet actif.',
  );
}
if (activeCoopConfig === null) {
  showConnectionStatus(
    'pending',
    'Connexion au serveur',
    'Création de la partie solo autoritaire…',
  );
}

const unsubscribeConnectionIssue = session.onConnectionIssue((message) => {
  showConnectionStatus(
    'issue',
    isCoopSession ? 'Synchronisation P2P en attente' : 'Connexion au serveur interrompue',
    message,
  );
});

const scene = new TowerScene(session);
const hud = new TowerHud(hudElement);

// Actions ponctuelles en attente d'envoi (une seule frame) : changement d'arme + achat.
let pendingSelect: string | undefined;
let pendingShop: TowerInput['turretShop'];

/**
 * Un choix de niveau reste présent jusqu'au prochain état autoritaire qui ne
 * contient plus son offre. Cela évite qu'une frame rAF sans action remplace
 * l'input local avant le prochain tick de simulation.
 */
let pendingLevelSelection: Readonly<{ offerId: string; actionId: string }> | undefined;
let nextLevelSelectionId = 0;

function selectLevelOffer(offerId: string): void {
  if (pendingLevelSelection !== undefined) {
    return;
  }
  nextLevelSelectionId += 1;
  pendingLevelSelection = {
    offerId,
    actionId: `level-select-${nextLevelSelectionId}`,
  };
}

const turretShop = new TurretShop(shopElement, (turret, action) => {
  pendingShop = { turret, action };
});
const levelUp = new TowerLevelUp(levelupElement, (offerId) => {
  selectLevelOffer(offerId);
});
const escapeMenu = new EscapeMenu(escapeMenuElement, {
  onContinue: () => undefined,
  onQuit: () => {
    if (window.confirm('Quitter la partie et revenir au menu principal ?')) {
      goToLobby();
    }
  },
});
const gameOver = new GameOverScreen(gameOverElement, {
  onBackToMenu: () => goToLobby(),
  onRestart: () => restartGame(),
});

let latestState: TowerGameState | undefined;
let accountGoldCredited = false;

async function creditAccountGoldAtEndOfRun(gold: number): Promise<void> {
  if (accountGoldCredited || !Number.isSafeInteger(gold) || gold <= 0) {
    return;
  }
  accountGoldCredited = true;
  const span = startGameChildSpan('account.gold.credit', { 'vs.gold': gold });
  try {
    const account = await authService.getSession();
    if (account !== null) {
      await statsService.creditAccountGold(gold);
    }
    span.end();
  } catch (error) {
    // L'écran de fin doit rester utilisable même si Supabase est indisponible.
    span.recordException(describeError(error));
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
    log.error("échec de l'enregistrement de l'or de cette partie", {
      'vs.error': describeError(error),
    });
  }
}

/**
 * La présence ne transporte qu'une invitation de reprise (graine + roster),
 * jamais l'état du jeu. Une erreur Supabase ne doit surtout pas empêcher la
 * partie locale de démarrer.
 */
async function publishActiveCoopGame(): Promise<void> {
  if (activeCoopConfig === null) {
    return;
  }
  try {
    const account = await authService.getSession();
    if (account === null) {
      return;
    }
    const friendCode = await friendsService.getMyFriendCode();
    await realtimeService.start(
      {
        userId: account.userId,
        displayName: account.displayName.length > 0 ? account.displayName : account.email,
      },
      friendCode,
    );
    await realtimeService.setActiveGame({
      seed: activeCoopConfig.seed,
      code: activeCoopConfig.code,
      hostId: activeCoopConfig.hostId,
      roster: activeCoopConfig.roster,
      ...(activeCoopConfig.metaBuildsByPlayerId === undefined
        ? {}
        : { metaBuildsByPlayerId: activeCoopConfig.metaBuildsByPlayerId }),
    });
  } catch (error) {
    console.warn('Présence de reprise co-op indisponible :', error);
  }
}

session.subscribe((state) => {
  syncStatus.element.hidden = true;
  latestState = state;
  if (
    pendingLevelSelection !== undefined &&
    isTowerLevelSelectionAcknowledged(
      pendingLevelSelection.offerId,
      state.player.upgradeChoices.map((choice) => choice.offerId),
    )
  ) {
    pendingLevelSelection = undefined;
  }
  hud.render(state);
  turretShop.render(state);
  levelUp.render(state);
  if (state.status === 'defeat') {
    void creditAccountGoldAtEndOfRun(state.player.gold);
    endGameSession('defeat', {
      'vs.wave': state.wave,
      'vs.duration.ms': state.elapsedMs,
      'vs.tick': state.tick,
    });
    gameOver.show();
  }
});

// ─── Entrées ──────────────────────────────────────────────────────────────────
const pressed = new Set<string>();
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let mouseDown = false;
/** Vrai si le clic en cours a démarré sur un panneau d'UI (on ne tire pas alors). */
let mouseOnUi = false;

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') {
    event.preventDefault();
    turretShop.close();
    escapeMenu.toggle();
    return;
  }
  pressed.add(event.code);
  const levelShortcut = getTowerLevelShortcutIndex(event);
  if (levelShortcut !== undefined && (latestState?.player.upgradeChoices.length ?? 0) > 0) {
    // La montée de niveau est prioritaire sur l'arsenal et ne doit jamais laisser
    // le navigateur interpréter la touche (notamment les symboles AZERTY).
    event.preventDefault();
    if (canQueueTowerLevelSelection(event.repeat, pendingLevelSelection !== undefined)) {
      const card = latestState?.player.upgradeChoices[levelShortcut];
      if (card !== undefined) {
        selectLevelOffer(card.offerId);
      }
    }
    return;
  }
  if (event.repeat) {
    return;
  }
  if (event.code === 'KeyE') {
    if (!escapeMenu.isOpen() && latestState?.player.nearTurret !== undefined) {
      turretShop.toggle();
    }
    return;
  }
  if (levelShortcut !== undefined && latestState !== undefined) {
    const weapon = TOWER_WEAPONS[levelShortcut];
    if (latestState.player.upgradeChoices.length === 0 && weapon !== undefined) {
      pendingSelect = `weapon:${weapon.id}`;
    }
  }
});
window.addEventListener('keyup', (event) => pressed.delete(event.code));
window.addEventListener('blur', () => pressed.clear());

window.addEventListener('mousemove', (event) => {
  mouseX = event.clientX;
  mouseY = event.clientY;
});
window.addEventListener('mousedown', (event) => {
  if (event.button !== 0) {
    return;
  }
  const target = event.target;
  mouseOnUi =
    target instanceof Element &&
    target.closest('#turret-shop, #levelup, #escape-menu, #game-over') !== null;
  mouseDown = true;
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 0) {
    mouseDown = false;
    mouseOnUi = false;
  }
});

function axis(negative: boolean, positive: boolean): number {
  return (positive ? 1 : 0) - (negative ? 1 : 0);
}

let sequence = 0;
function buildInput(): TowerInput {
  const up = pressed.has('KeyW') || pressed.has('KeyZ') || pressed.has('ArrowUp');
  const down = pressed.has('KeyS') || pressed.has('ArrowDown');
  const left = pressed.has('KeyA') || pressed.has('KeyQ') || pressed.has('ArrowLeft');
  const right = pressed.has('KeyD') || pressed.has('ArrowRight');
  sequence += 1;
  // La caméra est centrée sur le joueur local : le centre de l'écran = le joueur, donc
  // la visée est la position de la souris relative au centre.
  const fire = mouseDown && !mouseOnUi;
  const levelSelection = pendingLevelSelection;
  const input: TowerInput = {
    sequence,
    moveX: axis(left, right),
    moveY: axis(up, down),
    aimX: mouseX - window.innerWidth / 2,
    aimY: mouseY - window.innerHeight / 2,
    ...(fire ? { fire: true } : {}),
    // L'intention est répétée à chaque frame tant que l'atelier est réellement
    // ouvert. Le moteur vérifie ensuite portée, vie du joueur et tourelle active.
    ...(turretShop.isOpen() && !escapeMenu.isOpen() ? { turretWorkshopOpen: true } : {}),
    ...(levelSelection !== undefined
      ? {
          selectUpgradeId: levelSelection.offerId,
          discreteActionId: levelSelection.actionId,
        }
      : pendingSelect === undefined
        ? {}
        : { selectUpgradeId: pendingSelect }),
    ...(pendingShop === undefined ? {} : { turretShop: pendingShop }),
  };
  pendingSelect = undefined;
  pendingShop = undefined;
  return input;
}

function inputLoop(): void {
  session.sendInput(buildInput());
  requestAnimationFrame(inputLoop);
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: gameElement,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#111a1d',
  render: { antialias: true, roundPixels: true },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [scene],
});

window.addEventListener(
  'beforeunload',
  () => {
    unsubscribeConnectionIssue();
    endGameSession('left');
    void session.stop();
    void realtimeService.stop();
  },
  { once: true },
);

// Une exception non rattrapée est le cas où la trace vaut le plus cher : c'est le seul moment où
// personne ne pourra raconter ce qui s'est passé.
window.addEventListener('error', (event) => {
  log.fatal('exception non rattrapée', { 'vs.error': describeError(event.error) });
  endGameSession('error', { 'vs.error': describeError(event.error) });
});

void session.start().catch((error) => {
  showConnectionStatus(
    'issue',
    'Partie indisponible',
    error instanceof Error ? error.message : 'Le serveur de jeu est indisponible.',
  );
  log.error('échec du démarrage de la session serveur', { 'vs.error': describeError(error) });
  endGameSession('error', { 'vs.error': describeError(error) });
});
void publishActiveCoopGame();
requestAnimationFrame(inputLoop);
