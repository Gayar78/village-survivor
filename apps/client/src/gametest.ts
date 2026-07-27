// Page de diagnostic : lance la VRAIE scène de jeu (GameScene) avec une session
// locale, SANS auth, SANS hub, SANS le flux de lancement de l'app. Sert à isoler
// le rendu du jeu.
// - Si le monde s'affiche ici → le rendu du jeu est bon, le bug est dans le flux
//   de l'app (auth/hub/lancement) côté main.ts.
// - Si l'écran reste vide → le souci est dans le rendu de la scène elle-même.
import Phaser from 'phaser';

import { GameScene } from './scenes/GameScene.js';
import { LocalSession } from './session/LocalSession.js';

const session = new LocalSession({ seed: 'gametest' });
const scene = new GameScene(session);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
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

void session.start();
