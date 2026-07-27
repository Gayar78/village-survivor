// Page de diagnostic isolée : instancie UNIQUEMENT Phaser (aucune auth, aucun hub,
// aucune logique de jeu) et dessine un carré rouge + le type de moteur de rendu.
// - Si le carré rouge s'affiche en production → Phaser se rend correctement, le
//   souci est dans le code du jeu (caméra/scène).
// - Si l'écran reste vide → Phaser lui-même ne rend rien en prod (bundler/WebGL).
import Phaser from 'phaser';

class TestScene extends Phaser.Scene {
  public create(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    this.add.rectangle(width / 2, height / 2, 320, 320, 0xff3b3b);
    const type = this.game.renderer.type;
    const label =
      type === Phaser.WEBGL ? 'WebGL' : type === Phaser.CANVAS ? 'Canvas' : `Headless (${type})`;
    this.add.text(24, 24, `Phaser rendu OK — moteur : ${label}`, {
      color: '#7cfc00',
      fontSize: '32px',
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#202830',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TestScene],
});
