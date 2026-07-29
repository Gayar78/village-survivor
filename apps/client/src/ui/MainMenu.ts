import './main-menu.css';

export interface MainMenuCallbacks {
  onClassic: () => void;
  onMultiplayer: () => void;
  onCompendium: () => void;
  onProfile: () => void;
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
        <button type="button" class="main-menu-card main-menu-card--sandbox" id="main-menu-sandbox">
          <span class="main-menu-card__eyebrow">Développement</span>
          <span class="main-menu-card__title">Sandbox</span>
          <span class="main-menu-card__description">Outils et essais locaux de Tower.</span>
        </button>
      `
      : '';

    this.element.innerHTML = `
      <main class="main-menu__shell">
        <header class="main-menu__header">
          <p class="main-menu__kicker">Le village tient encore</p>
          <h1>Village Survivor</h1>
          <p class="main-menu__intro">
            Renforcez le Cœur, organisez la défense et survivez aux assauts.
          </p>
        </header>

        <section class="main-menu__actions" aria-label="Destinations principales">
          <button type="button" class="main-menu-card main-menu-card--primary" id="main-menu-classic">
            <span class="main-menu-card__eyebrow">Tower · solo</span>
            <span class="main-menu-card__title">Partie classique</span>
            <span class="main-menu-card__description">Lancez une défense du village en solo.</span>
          </button>
          <button type="button" class="main-menu-card" id="main-menu-multiplayer">
            <span class="main-menu-card__eyebrow">Équipe</span>
            <span class="main-menu-card__title">Multijoueur</span>
            <span class="main-menu-card__description">Créez un hub, rejoignez des amis et lancez la coop.</span>
          </button>
          <button type="button" class="main-menu-card" id="main-menu-compendium">
            <span class="main-menu-card__eyebrow">Guide</span>
            <span class="main-menu-card__title">Annuaire</span>
            <span class="main-menu-card__description">Consultez les systèmes essentiels de Tower Phase 1.</span>
          </button>
          <button type="button" class="main-menu-card" id="main-menu-profile">
            <span class="main-menu-card__eyebrow">Compte</span>
            <span class="main-menu-card__title">Profil</span>
            <span class="main-menu-card__description">Retrouvez vos statistiques et votre compte.</span>
          </button>
          ${sandbox}
        </section>

        <footer class="main-menu__footer">
          <button type="button" class="main-menu__signout" id="main-menu-signout">Se déconnecter</button>
        </footer>
      </main>
    `;

    this.bind('#main-menu-classic', this.callbacks.onClassic);
    this.bind('#main-menu-multiplayer', this.callbacks.onMultiplayer);
    this.bind('#main-menu-compendium', this.callbacks.onCompendium);
    this.bind('#main-menu-profile', this.callbacks.onProfile);
    this.bind('#main-menu-sandbox', this.callbacks.onSandbox);
    this.bind('#main-menu-signout', this.callbacks.onSignOut);
  }

  private bind(selector: string, callback: (() => void) | undefined): void {
    if (callback) {
      this.element.querySelector(selector)?.addEventListener('click', callback);
    }
  }
}
