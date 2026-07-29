export interface EscapeMenuHandlers {
  onContinue: () => void;
  onQuit: () => void;
}

/**
 * Menu ouvert par « Échap » pendant la partie. Il ne met jamais la simulation
 * en pause (invariant du projet : la simulation ne se met jamais en pause, en
 * solo comme en coopération) — c'est un simple panneau qui se superpose au
 * jeu, qui continue de tourner derrière.
 */
export class EscapeMenu {
  private readonly element: HTMLElement;
  private readonly handlers: EscapeMenuHandlers;
  private open = false;

  public constructor(element: HTMLElement, handlers: EscapeMenuHandlers) {
    this.element = element;
    this.handlers = handlers;
    this.element.setAttribute('aria-hidden', 'true');
  }

  public isOpen(): boolean {
    return this.open;
  }

  public toggle(): void {
    if (this.open) {
      this.close();
    } else {
      this.show();
    }
  }

  public show(): void {
    this.open = true;
    this.render();
    this.element.classList.add('escape-menu--open');
    this.element.setAttribute('aria-hidden', 'false');
    this.element.querySelector<HTMLButtonElement>('#escape-continue')?.focus();
  }

  public close(): void {
    this.open = false;
    this.element.classList.remove('escape-menu--open');
    this.element.setAttribute('aria-hidden', 'true');
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="escape-panel">
        <h2>Menu</h2>
        <div class="escape-actions">
          <button type="button" id="escape-continue">Reprendre</button>
          <button type="button" id="escape-quit" class="escape-danger">Retour au menu</button>
        </div>
        <p class="escape-note">La partie continue en arrière-plan : elle ne se met jamais en pause.</p>
      </div>
    `;
    this.element.querySelector('#escape-continue')?.addEventListener('click', () => {
      this.close();
      this.handlers.onContinue();
    });
    this.element
      .querySelector('#escape-quit')
      ?.addEventListener('click', () => this.handlers.onQuit());
  }
}
