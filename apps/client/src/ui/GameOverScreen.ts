export interface GameOverScreenHandlers {
  onBackToMenu: () => void;
  onRestart: () => void;
}

/**
 * Écran de fin de partie perdue, plein écran, avec les mêmes codes visuels que
 * `Menu.ts`. Affiché une seule fois dès que `state.status === 'defeat'`
 * (contrôlé par l'appelant, qui décide quand appeler `show()`) : ce composant
 * ne surveille pas l'état lui-même, il se contente de se montrer/rendre.
 */
export class GameOverScreen {
  private readonly element: HTMLElement;
  private readonly handlers: GameOverScreenHandlers;
  private shown = false;

  public constructor(element: HTMLElement, handlers: GameOverScreenHandlers) {
    this.element = element;
    this.handlers = handlers;
    this.render();
  }

  /** N'affiche l'écran qu'une seule fois : les appels suivants sont sans effet. */
  public show(): void {
    if (this.shown) {
      return;
    }
    this.shown = true;
    this.element.classList.add('game-over--open');
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="menu-panel game-over-panel">
        <div class="menu-brand"><span>VS</span><strong>Défaite</strong></div>
        <p class="menu-pitch">
          Le village est tombé. Retournez au menu principal ou relancez immédiatement une nouvelle
          partie pour retenter votre chance.
        </p>
        <div class="game-over-actions">
          <button type="button" id="game-over-menu">Retour au menu</button>
          <button type="button" id="game-over-restart">Recommencer</button>
        </div>
      </div>
    `;
    this.element
      .querySelector('#game-over-menu')
      ?.addEventListener('click', () => this.handlers.onBackToMenu());
    this.element
      .querySelector('#game-over-restart')
      ?.addEventListener('click', () => this.handlers.onRestart());
  }
}
