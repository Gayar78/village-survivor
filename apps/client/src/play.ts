import { TOWER_WEAPONS } from '@village-survivor/content';
import type { TowerGameState, TowerInput, TurretDir } from '@village-survivor/protocol';
import Phaser from 'phaser';

import {
  createTowerCoopSession,
  TowerLocalSession,
  type TowerCoopConfig,
  type TowerRenderableSession,
} from './net/towerSession.js';
import { authService } from './account/authService.js';
import { statsService } from './account/statsService.js';
import { TowerScene } from './scenes/TowerScene.js';
import { EscapeMenu } from './ui/EscapeMenu.js';
import { GameOverScreen } from './ui/GameOverScreen.js';
import { TowerHud } from './ui/tower/TowerHud.js';
import { TowerLevelUp } from './ui/tower/TowerLevelUp.js';
import { TurretShop } from './ui/tower/TurretShop.js';
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
if (
  gameElement === null ||
  hudElement === null ||
  shopElement === null ||
  levelupElement === null ||
  escapeMenuElement === null ||
  gameOverElement === null
) {
  throw new Error('La page de jeu ne contient pas les points de montage attendus.');
}

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

const parameters = new URLSearchParams(location.search);
const seed = parameters.get('seed') ?? crypto.randomUUID().slice(0, 8);

function goToLobby(): void {
  location.assign('index.html');
}
function restartGame(): void {
  sessionStorage.removeItem(NETCODE_KEY);
  location.assign('play.html');
}

const coopConfig = readCoopConfig();
const session: TowerRenderableSession =
  coopConfig !== null && coopConfig.roster.length > 1
    ? createTowerCoopSession(coopConfig)
    : new TowerLocalSession({ seed });

const connectionIssue = document.createElement('section');
connectionIssue.className = 'tower-connection-issue';
connectionIssue.setAttribute('role', 'status');
connectionIssue.hidden = true;
const connectionIssueText = document.createElement('p');
connectionIssue.append(connectionIssueText);
document.body.append(connectionIssue);
const unsubscribeConnectionIssue = session.onConnectionIssue((message) => {
  connectionIssueText.textContent = message;
  connectionIssue.hidden = false;
});

const scene = new TowerScene(session);
const hud = new TowerHud(hudElement);

// Actions ponctuelles en attente d'envoi (une seule frame) : choix d'amélioration + achat.
let pendingSelect: string | undefined;
let pendingShop: { turret: TurretDir; action: string } | undefined;

const turretShop = new TurretShop(shopElement, (turret, action) => {
  pendingShop = { turret, action };
});
const levelUp = new TowerLevelUp(levelupElement, (offerId) => {
  pendingSelect = offerId;
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
  try {
    const account = await authService.getSession();
    if (account !== null) {
      await statsService.creditAccountGold(gold);
    }
  } catch (error) {
    // L'écran de fin doit rester utilisable même si Supabase est indisponible.
    console.error("Échec de l'enregistrement de l'or de cette partie.", error);
  }
}

session.subscribe((state) => {
  latestState = state;
  hud.render(state);
  turretShop.render(state);
  levelUp.render(state);
  if (state.status === 'defeat') {
    void creditAccountGoldAtEndOfRun(state.player.gold);
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
  if (event.repeat) {
    pressed.add(event.code);
    return;
  }
  pressed.add(event.code);
  if (event.code === 'KeyE') {
    if (!escapeMenu.isOpen() && latestState?.player.nearTurret !== undefined) {
      turretShop.toggle();
    }
    return;
  }
  const digit = ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code);
  if (digit >= 0 && latestState !== undefined) {
    const card = latestState.player.upgradeChoices[digit];
    if (card !== undefined) {
      pendingSelect = card.offerId;
      return;
    }
    const weapon = TOWER_WEAPONS[digit];
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
  const input: TowerInput = {
    sequence,
    moveX: axis(left, right),
    moveY: axis(up, down),
    aimX: mouseX - window.innerWidth / 2,
    aimY: mouseY - window.innerHeight / 2,
    ...(fire ? { fire: true } : {}),
    ...(pendingSelect === undefined ? {} : { selectUpgradeId: pendingSelect }),
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
    void session.stop();
  },
  { once: true },
);

void session.start();
requestAnimationFrame(inputLoop);
