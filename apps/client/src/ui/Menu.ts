import { CONTROLS } from './controls.js';

/**
 * Écran-titre plein écran affiché avant le début de la partie. Il regroupe les
 * informations sur le jeu (objectif, contrôles) qui étaient auparavant
 * affichées en permanence par-dessus la partie, pour laisser le HUD en jeu se
 * concentrer sur l'état courant.
 */
export class Menu {
  private readonly element: HTMLElement;
  private readonly onPlay: () => void;
  private readonly onProfile: (() => void) | undefined;
  private readonly onSignOut: (() => void) | undefined;

  public constructor(
    element: HTMLElement,
    onPlay: () => void,
    onProfile?: () => void,
    onSignOut?: () => void,
  ) {
    this.element = element;
    this.onPlay = onPlay;
    this.onProfile = onProfile;
    this.onSignOut = onSignOut;
    this.render();
    // Ferme le menu déroulant « Compte » quand on clique en dehors.
    document.addEventListener('click', (event) => {
      const account = this.element.querySelector('#menu-account');
      if (account !== null && event.target instanceof Node && !account.contains(event.target)) {
        this.setAccountOpen(false);
      }
    });
  }

  public show(): void {
    this.element.classList.remove('menu--hidden');
  }

  public hide(): void {
    this.element.classList.add('menu--hidden');
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="menu-panel">
        <div class="menu-brand"><span>VS</span><strong>Village Survivor</strong></div>
        <p class="menu-pitch">
          Le jour, explorez les alentours pour récolter du bois auprès de gisements gardés et le
          rapporter au village. La nuit, des vagues de monstres attaquent : défendez le cœur du
          village grâce à vos disciplines et à des balistes fabriquées sur place.
        </p>
        <div class="menu-columns">
          <section>
            <h2>Objectif</h2>
            <p>
              Améliorez le cœur du village jusqu'à son niveau ultime, puis survivez à la vague
              d'activation finale pour gagner. Vous perdez si le village est détruit ou si votre
              personnage meurt définitivement.
            </p>
          </section>
          <section>
            <h2>Contrôles</h2>
            <ul class="menu-controls">
              ${CONTROLS.map(
                (entry) => `<li><kbd>${entry.key}</kbd><span>${entry.label}</span></li>`,
              ).join('')}
            </ul>
          </section>
        </div>
      </div>
      <div class="menu-actions">
        <button type="button" class="menu-play" id="menu-play">Jouer</button>
        ${this.renderAccountMenu()}
      </div>
    `;
    this.element.querySelector('#menu-play')?.addEventListener('click', () => this.onPlay());

    this.element.querySelector('#menu-account-toggle')?.addEventListener('click', () => {
      const account = this.element.querySelector('#menu-account');
      this.setAccountOpen(account === null || !account.classList.contains('menu-account--open'));
    });
    if (this.onProfile) {
      const onProfile = this.onProfile;
      this.element.querySelector('#menu-profile')?.addEventListener('click', () => {
        this.setAccountOpen(false);
        onProfile();
      });
    }
    if (this.onSignOut) {
      const onSignOut = this.onSignOut;
      this.element.querySelector('#menu-signout')?.addEventListener('click', () => {
        this.setAccountOpen(false);
        onSignOut();
      });
    }
  }

  /** Menu déroulant « Compte » (profil + déconnexion), affiché seulement si utile. */
  private renderAccountMenu(): string {
    if (this.onProfile === undefined && this.onSignOut === undefined) {
      return '';
    }
    const profileItem = this.onProfile
      ? '<button type="button" id="menu-profile">Mon profil</button>'
      : '';
    const signOutItem = this.onSignOut
      ? '<button type="button" id="menu-signout" class="menu-danger">Se déconnecter</button>'
      : '';
    return `
      <div class="menu-account" id="menu-account">
        <button type="button" class="menu-account-toggle" id="menu-account-toggle" aria-expanded="false">
          Compte <span class="menu-account-caret" aria-hidden="true">▾</span>
        </button>
        <div class="menu-account-dropdown">
          ${profileItem}
          ${signOutItem}
        </div>
      </div>
    `;
  }

  private setAccountOpen(open: boolean): void {
    const account = this.element.querySelector('#menu-account');
    if (account === null) {
      return;
    }
    account.classList.toggle('menu-account--open', open);
    this.element.querySelector('#menu-account-toggle')?.setAttribute('aria-expanded', String(open));
  }
}
