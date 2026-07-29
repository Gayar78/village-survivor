import { authService } from '../account/authService.js';
import { statsService } from '../account/statsService.js';
import type { AccountSession, PlayerStats } from '../account/types.js';

type ProfileState =
  | { kind: 'loading'; session: AccountSession }
  | { kind: 'ready'; session: AccountSession; stats: PlayerStats; accountGold: number | null }
  | { kind: 'error'; session: AccountSession; message: string };

/** Échappe le texte dynamique injecté dans du innerHTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Écran de profil, ouvert depuis le menu : identité et repères de progression. */
export class ProfileScreen {
  private readonly element: HTMLElement;
  private readonly onClose: () => void;
  private readonly onSignedOut: () => void;

  private state: ProfileState | null = null;
  private signingOut = false;
  private signOutError: string | null = null;

  public constructor(element: HTMLElement, onClose: () => void, onSignedOut: () => void) {
    this.element = element;
    this.onClose = onClose;
    this.onSignedOut = onSignedOut;
    this.element.classList.add('profile-screen');
  }

  public show(): void {
    this.element.classList.remove('profile--hidden');
  }

  public hide(): void {
    this.element.classList.add('profile--hidden');
  }

  /** Affiche l'écran et charge les statistiques de la session courante. */
  public async open(session: AccountSession): Promise<void> {
    this.signOutError = null;
    this.state = { kind: 'loading', session };
    this.show();
    this.render();
    try {
      const [stats, accountGold] = await Promise.all([
        statsService.loadStats(),
        statsService.loadAccountGold().catch(() => null),
      ]);
      this.state = { kind: 'ready', session, stats, accountGold };
    } catch (error) {
      this.state = { kind: 'error', session, message: this.describeError(error) };
    }
    this.render();
  }

  private render(): void {
    if (!this.state) {
      this.element.innerHTML = '';
      return;
    }
    const { session } = this.state;
    const initial = session.displayName.trim().charAt(0).toUpperCase() || 'V';
    this.element.innerHTML = `
      <div class="profile-panel">
        <div class="profile-header">
          <div class="profile-identity">
            <span class="profile-avatar" aria-hidden="true">${escapeHtml(initial)}</span>
            <div>
              <p class="profile-kicker">Fiche de survivant</p>
              <h2 class="profile-name">${escapeHtml(session.displayName)}</h2>
              <p class="profile-email">${escapeHtml(session.email)}</p>
            </div>
          </div>
          <button type="button" class="profile-close" id="profile-close">Fermer</button>
        </div>
        ${this.renderBody()}
        ${this.signOutError ? `<p class="auth-error">${escapeHtml(this.signOutError)}</p>` : ''}
        <div class="profile-actions">
          <button type="button" class="auth-btn auth-btn--danger" id="profile-signout" ${
            this.signingOut ? 'disabled' : ''
          }>
            ${this.signingOut ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
        </div>
      </div>
    `;
    this.attachListeners();
  }

  private renderBody(): string {
    if (!this.state) {
      return '';
    }
    if (this.state.kind === 'loading') {
      return `<p class="profile-hint">Chargement de la fiche…</p>`;
    }
    if (this.state.kind === 'error') {
      return `<p class="auth-error">${escapeHtml(this.state.message)}</p>`;
    }
    const stats = this.state.stats;
    const { accountGold } = this.state;
    return `
      <section class="profile-wallet" aria-label="Or du compte">
        <div>
          <span class="profile-wallet__eyebrow">Trésor personnel</span>
          <strong class="profile-wallet__value">${accountGold === null ? '—' : this.formatNumber(accountGold)} <span>or</span></strong>
          <p>${accountGold === null ? 'Solde de compte bientôt disponible.' : 'Réserve disponible sur votre compte.'}</p>
        </div>
        <span class="profile-wallet__coin" aria-hidden="true">✦</span>
      </section>
      <section class="profile-overview" aria-labelledby="profile-overview-title">
        <h3 class="profile-subtitle" id="profile-overview-title">Expédition</h3>
        <div class="profile-stats-grid">
          <div class="profile-stat"><span>Parties</span><strong>${this.formatNumber(stats.gamesPlayed)}</strong></div>
          <div class="profile-stat"><span>Victoires</span><strong>${this.formatNumber(stats.gamesWon)}</strong></div>
          <div class="profile-stat"><span>Meilleure vague</span><strong>${this.formatNumber(stats.bestCycle)}</strong></div>
          <div class="profile-stat">
            <span>Temps de jeu</span><strong>${escapeHtml(this.formatDuration(stats.totalPlayMs))}</strong>
          </div>
        </div>
      </section>
    `;
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('fr-FR').format(value);
  }

  private attachListeners(): void {
    this.element.querySelector('#profile-close')?.addEventListener('click', () => this.onClose());
    this.element
      .querySelector('#profile-signout')
      ?.addEventListener('click', () => this.handleSignOut());
  }

  private handleSignOut(): void {
    if (this.signingOut) {
      return;
    }
    this.signingOut = true;
    this.signOutError = null;
    this.render();
    void (async () => {
      try {
        await authService.signOut();
        this.signingOut = false;
        this.onSignedOut();
      } catch (error) {
        this.signingOut = false;
        this.signOutError = this.describeError(error);
        this.render();
      }
    })();
  }

  private formatDuration(ms: number): string {
    const totalMinutes = Math.floor(ms / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return `${hours} h ${minutes} min`;
    }
    return `${minutes} min`;
  }

  private describeError(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Une erreur est survenue. Réessayez.';
  }
}
