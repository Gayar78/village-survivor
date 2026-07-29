import './main-menu.css';

export interface MainMenuCallbacks {
  onClassic: () => void;
  onMultiplayer: () => void;
  onCompendium: () => void;
  onProfile: () => void;
  onSettings?: () => void;
  onSandbox?: () => void;
  onSignOut: () => void;
}

/** Menu principal du lobby, distinct de l'overlay de jeu de l'ancienne interface. */
export class MainMenu {
  private readonly element: HTMLElement;
  private readonly callbacks: MainMenuCallbacks;

  public constructor(element: HTMLElement, callbacks: MainMenuCallbacks) {
    this.element = element;
    this.callbacks = callbacks;
    this.element.classList.add('main-menu');
    this.render();
  }

  public show(): void {
    this.element.classList.remove('main-menu--hidden');
    this.element.querySelector<HTMLElement>('#main-menu-classic')?.focus();
  }

  public hide(): void {
    this.element.classList.add('main-menu--hidden');
  }

  private render(): void {
    const sandbox = this.callbacks.onSandbox
      ? `
        <button type="button" class="main-menu-link main-menu-link--sandbox" id="main-menu-sandbox">
          <span class="main-menu-link__glyph" aria-hidden="true">✦</span>
          <span>
            <span class="main-menu-link__eyebrow">Développement</span>
            <span class="main-menu-link__title">Sandbox</span>
          </span>
        </button>
      `
      : '';
    const settings = this.callbacks.onSettings
      ? `
        <button type="button" class="main-menu-link" id="main-menu-settings">
          <span class="main-menu-link__glyph" aria-hidden="true">⚙</span>
          <span>
            <span class="main-menu-link__eyebrow">Personnalisation</span>
            <span class="main-menu-link__title">Paramètres de couleur</span>
          </span>
          <span class="main-menu-link__arrow" aria-hidden="true">→</span>
        </button>
      `
      : '';

    this.element.innerHTML = `
      <main class="main-menu__shell">
        <header class="main-menu__header">
          <div class="main-menu__brand">
            <span class="main-menu__sigil" aria-hidden="true">VS</span>
            <p class="main-menu__kicker">Tour de garde · cycle 01</p>
          </div>
          <h1><span>Village</span> Survivor</h1>
          <p class="main-menu__intro">
            Le Cœur du village brûle encore. Préparez les tourelles et tenez jusqu’à l’aube.
          </p>
        </header>

        <section class="main-menu__actions" aria-label="Destinations principales">
          <button type="button" class="main-menu-play" id="main-menu-classic">
            <span class="main-menu-play__crest" aria-hidden="true"><i></i></span>
            <span class="main-menu-play__content">
              <span class="main-menu-card__eyebrow">Défense solo</span>
              <span class="main-menu-play__title">Jouer</span>
              <span class="main-menu-play__description">Lancez une partie classique et protégez le Cœur.</span>
            </span>
            <span class="main-menu-play__cta">Entrer dans la tour <span aria-hidden="true">→</span></span>
          </button>

          <div class="main-menu__secondary" aria-label="Autres accès">
            <button type="button" class="main-menu-link" id="main-menu-multiplayer">
              <span class="main-menu-link__glyph" aria-hidden="true">⌁</span>
              <span>
                <span class="main-menu-link__eyebrow">Escouade</span>
                <span class="main-menu-link__title">Multijoueur</span>
              </span>
              <span class="main-menu-link__arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" class="main-menu-link" id="main-menu-compendium">
              <span class="main-menu-link__glyph" aria-hidden="true">◇</span>
              <span>
                <span class="main-menu-link__eyebrow">Manuel de terrain</span>
                <span class="main-menu-link__title">Annuaire</span>
              </span>
              <span class="main-menu-link__arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" class="main-menu-link main-menu-link--profile" id="main-menu-profile">
              <span class="main-menu-link__glyph" aria-hidden="true">◉</span>
              <span>
                <span class="main-menu-link__eyebrow">Compte</span>
                <span class="main-menu-link__title">Fiche survivant</span>
              </span>
              <span class="main-menu-link__arrow" aria-hidden="true">→</span>
            </button>
            ${settings}
            ${sandbox}
          </div>
        </section>

        <footer class="main-menu__footer">
          <p>Village Survivor <span aria-hidden="true">·</span> Tower Phase 1</p>
          <button type="button" class="main-menu__signout" id="main-menu-signout">Se déconnecter</button>
        </footer>
      </main>
    `;

    this.bind('#main-menu-classic', this.callbacks.onClassic);
    this.bind('#main-menu-multiplayer', this.callbacks.onMultiplayer);
    this.bind('#main-menu-compendium', this.callbacks.onCompendium);
    this.bind('#main-menu-profile', this.callbacks.onProfile);
    this.bind('#main-menu-settings', this.callbacks.onSettings);
    this.bind('#main-menu-sandbox', this.callbacks.onSandbox);
    this.bind('#main-menu-signout', this.callbacks.onSignOut);
  }

  private bind(selector: string, callback: (() => void) | undefined): void {
    if (callback) {
      this.element.querySelector(selector)?.addEventListener('click', callback);
    }
  }
}
