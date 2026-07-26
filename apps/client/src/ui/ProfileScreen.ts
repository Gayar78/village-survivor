import { authService } from '../account/authService.js';
import { statsService } from '../account/statsService.js';
import type { AccountSession, PlayerStats } from '../account/types.js';

type ProfileState =
  | { kind: 'loading'; session: AccountSession }
  | { kind: 'ready'; session: AccountSession; stats: PlayerStats }
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

/**
 * Écran de profil, ouvert depuis le menu : affiche l'identité du joueur ainsi
 * que ses statistiques cumulées (parties, temps de jeu, ressources
 * récoltées…) et permet de se déconnecter.
 */
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
      const stats = await statsService.loadStats();
      this.state = { kind: 'ready', session, stats };
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
    this.element.innerHTML = `
      <div class="profile-panel">
        <div class="profile-header">
          <div>
            <h2 class="profile-name">${escapeHtml(session.displayName)}</h2>
            <p class="profile-email">${escapeHtml(session.email)}</p>
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
      return `<p class="profile-hint">Chargement des statistiques…</p>`;
    }
    if (this.state.kind === 'error') {
      return `<p class="auth-error">${escapeHtml(this.state.message)}</p>`;
    }
    const stats = this.state.stats;
    return `
      <div class="profile-stats-grid">
        <div class="profile-stat"><span>Parties jouées</span><strong>${stats.gamesPlayed}</strong></div>
        <div class="profile-stat"><span>Parties gagnées</span><strong>${stats.gamesWon}</strong></div>
        <div class="profile-stat"><span>Parties perdues</span><strong>${stats.gamesLost}</strong></div>
        <div class="profile-stat">
          <span>Temps de jeu</span><strong>${escapeHtml(this.formatDuration(stats.totalPlayMs))}</strong>
        </div>
        <div class="profile-stat"><span>Meilleure vague</span><strong>${stats.bestCycle}</strong></div>
        <div class="profile-stat"><span>Niveau max</span><strong>${stats.maxPlayerLevel}</strong></div>
      </div>
      <h3 class="profile-subtitle">Ressources récoltées</h3>
      <div class="profile-resources-grid">
        <div class="profile-resource">
          <span class="profile-resource-icon profile-resource-icon--wood"></span>
          <span class="profile-resource-label">Bois</span>
          <strong>${stats.resourcesGathered.wood}</strong>
        </div>
        <div class="profile-resource">
          <span class="profile-resource-icon profile-resource-icon--stone"></span>
          <span class="profile-resource-label">Pierre</span>
          <strong>${stats.resourcesGathered.stone}</strong>
        </div>
        <div class="profile-resource">
          <span class="profile-resource-icon profile-resource-icon--iron"></span>
          <span class="profile-resource-label">Fer</span>
          <strong>${stats.resourcesGathered.iron}</strong>
        </div>
        <div class="profile-resource">
          <span class="profile-resource-icon profile-resource-icon--gold"></span>
          <span class="profile-resource-label">Or</span>
          <strong>${stats.resourcesGathered.gold}</strong>
        </div>
        <div class="profile-resource">
          <span class="profile-resource-icon profile-resource-icon--diamond"></span>
          <span class="profile-resource-label">Diamant</span>
          <strong>${stats.resourcesGathered.diamond}</strong>
        </div>
      </div>
    `;
  }

  private attachListeners(): void {
    this.element.querySelector('#profile-close')?.addEventListener('click', () => this.onClose());
    this.element.querySelector('#profile-signout')?.addEventListener('click', () => this.handleSignOut());
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
