import { authService } from '../account/authService.js';
import type { MfaEnrollment } from '../account/types.js';

type AuthMode = 'login' | 'signup' | 'check-email' | 'enroll-2fa' | 'verify-2fa';

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
 * Écran de connexion / inscription, premier écran obligatoire affiché avant
 * d'accéder au jeu. Gère les connexions OAuth (Google/GitHub), le flux
 * email + mot de passe (connexion et inscription), ainsi que l'enrôlement et
 * la vérification TOTP (double authentification).
 */
export class AuthScreen {
  private readonly element: HTMLElement;
  private readonly onAuthenticated: () => void;

  private mode: AuthMode = 'login';
  private loading = false;
  private error: string | null = null;
  private enrollment: MfaEnrollment | null = null;
  private pendingEmail = '';

  public constructor(element: HTMLElement, onAuthenticated: () => void) {
    this.element = element;
    this.onAuthenticated = onAuthenticated;
    this.element.classList.add('auth-screen');
    this.render();
  }

  public show(): void {
    this.element.classList.remove('auth--hidden');
  }

  public hide(): void {
    this.element.classList.add('auth--hidden');
  }

  /**
   * Reprend un flux 2FA quand une session existe déjà mais que la double
   * authentification n'est pas satisfaite (ex. retour du lien de confirmation
   * d'email). Appelé par le point d'entrée de l'application.
   */
  public resumeVerification(): void {
    this.show();
    this.setMode('verify-2fa');
  }

  public resumeEnrollment(): void {
    this.show();
    this.beginEnrollment();
  }

  private setMode(mode: AuthMode): void {
    this.mode = mode;
    this.error = null;
    this.render();
  }

  private setLoading(loading: boolean): void {
    this.loading = loading;
    this.render();
  }

  private setError(message: string): void {
    this.error = message;
    this.loading = false;
    this.render();
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="auth-panel">
        <div class="auth-brand"><span>VS</span><strong>Village Survivor</strong></div>
        ${this.renderBody()}
        ${this.error ? `<p class="auth-error">${escapeHtml(this.error)}</p>` : ''}
      </div>
    `;
    this.attachListeners();
  }

  private renderBody(): string {
    switch (this.mode) {
      case 'login':
        return this.renderLogin();
      case 'signup':
        return this.renderSignup();
      case 'check-email':
        return this.renderCheckEmail();
      case 'enroll-2fa':
        return this.renderEnroll2fa();
      case 'verify-2fa':
        return this.renderVerify2fa();
      default:
        return '';
    }
  }

  private renderOAuthButtons(): string {
    return `
      <div class="auth-oauth">
        <button type="button" class="auth-btn auth-btn--oauth" id="auth-google" ${this.loading ? 'disabled' : ''}>
          Continuer avec Google
        </button>
        <button type="button" class="auth-btn auth-btn--oauth" id="auth-github" ${this.loading ? 'disabled' : ''}>
          Continuer avec GitHub
        </button>
      </div>
      <div class="auth-separator"><span>ou</span></div>
    `;
  }

  private renderLogin(): string {
    return `
      ${this.renderOAuthButtons()}
      <form class="auth-form" id="auth-login-form">
        <label class="auth-field">
          <span>Email</span>
          <input type="email" id="auth-email" autocomplete="email" required />
        </label>
        <label class="auth-field">
          <span>Mot de passe</span>
          <input type="password" id="auth-password" autocomplete="current-password" required />
        </label>
        <button type="submit" class="auth-btn auth-btn--primary" id="auth-submit" ${this.loading ? 'disabled' : ''}>
          ${this.loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <button type="button" class="auth-switch" id="auth-switch-signup">
        Pas de compte ? Créer un compte
      </button>
    `;
  }

  private renderSignup(): string {
    return `
      ${this.renderOAuthButtons()}
      <form class="auth-form" id="auth-signup-form">
        <label class="auth-field">
          <span>Pseudo</span>
          <input type="text" id="auth-name" autocomplete="nickname" required />
        </label>
        <label class="auth-field">
          <span>Email</span>
          <input type="email" id="auth-email" autocomplete="email" required />
        </label>
        <label class="auth-field">
          <span>Mot de passe</span>
          <input type="password" id="auth-password" autocomplete="new-password" required />
        </label>
        <button type="submit" class="auth-btn auth-btn--primary" id="auth-submit" ${this.loading ? 'disabled' : ''}>
          ${this.loading ? 'Création…' : 'Créer un compte'}
        </button>
      </form>
      <button type="button" class="auth-switch" id="auth-switch-login">
        Déjà un compte ? Se connecter
      </button>
    `;
  }

  private renderCheckEmail(): string {
    return `
      <h2>Confirme ton email</h2>
      <p class="auth-hint">
        Un email de confirmation a été envoyé à
        <strong>${escapeHtml(this.pendingEmail)}</strong>. Clique le lien qu'il contient
        pour activer ton compte, puis reviens ici. Tu configureras la double
        authentification à ta première connexion.
      </p>
      <button type="button" class="auth-switch" id="auth-switch-login">
        Revenir à la connexion
      </button>
    `;
  }

  private renderEnroll2fa(): string {
    const enrollment = this.enrollment;
    if (!enrollment) {
      return `<p class="auth-hint">Préparation de la double authentification…</p>`;
    }
    return `
      <p class="auth-hint">
        Scannez ce QR code avec une application d'authentification (Google Authenticator, Authy…),
        puis saisissez le code à 6 chiffres généré pour sécuriser votre compte.
      </p>
      <img class="auth-qr" src="${escapeHtml(enrollment.qrCode)}" alt="QR code 2FA" />
      <p class="auth-secret">Code secret manuel : <code>${escapeHtml(enrollment.secret)}</code></p>
      <form class="auth-form" id="auth-enroll-form">
        <label class="auth-field">
          <span>Code à 6 chiffres</span>
          <input
            type="text"
            inputmode="numeric"
            maxlength="6"
            id="auth-code"
            autocomplete="one-time-code"
            required
          />
        </label>
        <button type="submit" class="auth-btn auth-btn--primary" id="auth-submit" ${this.loading ? 'disabled' : ''}>
          ${this.loading ? 'Validation…' : 'Valider'}
        </button>
      </form>
    `;
  }

  private renderVerify2fa(): string {
    return `
      <p class="auth-hint">
        Saisissez le code à 6 chiffres généré par votre application d'authentification.
      </p>
      <form class="auth-form" id="auth-verify-form">
        <label class="auth-field">
          <span>Code à 6 chiffres</span>
          <input
            type="text"
            inputmode="numeric"
            maxlength="6"
            id="auth-code"
            autocomplete="one-time-code"
            required
          />
        </label>
        <button type="submit" class="auth-btn auth-btn--primary" id="auth-submit" ${this.loading ? 'disabled' : ''}>
          ${this.loading ? 'Vérification…' : 'Vérifier'}
        </button>
      </form>
    `;
  }

  private attachListeners(): void {
    this.element.querySelector('#auth-google')?.addEventListener('click', () => this.handleOAuth('google'));
    this.element.querySelector('#auth-github')?.addEventListener('click', () => this.handleOAuth('github'));
    this.element
      .querySelector('#auth-switch-signup')
      ?.addEventListener('click', () => this.setMode('signup'));
    this.element
      .querySelector('#auth-switch-login')
      ?.addEventListener('click', () => this.setMode('login'));

    this.element.querySelector('#auth-login-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleLogin();
    });
    this.element.querySelector('#auth-signup-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleSignup();
    });
    this.element.querySelector('#auth-enroll-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleConfirmEnrollment();
    });
    this.element.querySelector('#auth-verify-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleVerify();
    });
  }

  private handleOAuth(provider: 'google' | 'github'): void {
    if (this.loading) {
      return;
    }
    this.setLoading(true);
    void (async () => {
      try {
        if (provider === 'google') {
          await authService.signInWithGoogle();
        } else {
          await authService.signInWithGitHub();
        }
        // Une redirection OAuth quitte la page en cas de succès : rien d'autre à faire ici.
      } catch (error) {
        this.setError(this.describeError(error));
      }
    })();
  }

  private handleLogin(): void {
    if (this.loading) {
      return;
    }
    const email = this.readValue('#auth-email');
    const password = this.readValue('#auth-password');
    const validationError = this.validateCredentials(email, password);
    if (validationError) {
      this.setError(validationError);
      return;
    }
    this.setLoading(true);
    void (async () => {
      try {
        await authService.signInWithEmail(email, password);
        const situation = await authService.getMfaSituation();
        this.loading = false;
        if (situation === 'needs-verify') {
          this.setMode('verify-2fa');
        } else if (situation === 'needs-enroll') {
          // Première connexion d'un compte email : on met en place la 2FA maintenant.
          this.beginEnrollment();
        } else {
          this.render();
          this.onAuthenticated();
        }
      } catch (error) {
        this.setError(this.describeError(error));
      }
    })();
  }

  private handleSignup(): void {
    if (this.loading) {
      return;
    }
    const name = this.readValue('#auth-name');
    const email = this.readValue('#auth-email');
    const password = this.readValue('#auth-password');
    if (!name) {
      this.setError('Le pseudo est requis.');
      return;
    }
    const validationError = this.validateCredentials(email, password);
    if (validationError) {
      this.setError(validationError);
      return;
    }
    this.pendingEmail = email;
    this.setLoading(true);
    void (async () => {
      try {
        const { needsEmailConfirmation } = await authService.signUpWithEmail(email, password, name);
        this.loading = false;
        if (needsEmailConfirmation) {
          // Confirmation email active : on ne peut pas enrôler la 2FA sans session.
          this.setMode('check-email');
        } else {
          // Session déjà active (confirmation désactivée) : on enchaîne sur la 2FA.
          this.beginEnrollment();
        }
      } catch (error) {
        this.setError(this.describeError(error));
      }
    })();
  }

  /** Démarre l'enrôlement TOTP et affiche l'étape correspondante (QR + code). */
  private beginEnrollment(): void {
    this.enrollment = null;
    this.setMode('enroll-2fa');
    this.setLoading(true);
    void (async () => {
      try {
        this.enrollment = await authService.enrollTotp();
        this.loading = false;
        this.render();
      } catch (error) {
        this.setError(this.describeError(error));
      }
    })();
  }

  private handleConfirmEnrollment(): void {
    if (this.loading || !this.enrollment) {
      return;
    }
    const code = this.readValue('#auth-code');
    const validationError = this.validateCode(code);
    if (validationError) {
      this.setError(validationError);
      return;
    }
    const factorId = this.enrollment.factorId;
    this.setLoading(true);
    void (async () => {
      try {
        await authService.confirmTotpEnrollment(factorId, code);
        this.loading = false;
        this.render();
        this.onAuthenticated();
      } catch (error) {
        this.setError(this.describeError(error));
      }
    })();
  }

  private handleVerify(): void {
    if (this.loading) {
      return;
    }
    const code = this.readValue('#auth-code');
    const validationError = this.validateCode(code);
    if (validationError) {
      this.setError(validationError);
      return;
    }
    this.setLoading(true);
    void (async () => {
      try {
        await authService.verifyTotp(code);
        this.loading = false;
        this.render();
        this.onAuthenticated();
      } catch (error) {
        this.setError(this.describeError(error));
      }
    })();
  }

  private readValue(selector: string): string {
    const input = this.element.querySelector<HTMLInputElement>(selector);
    return input?.value.trim() ?? '';
  }

  private validateCredentials(email: string, password: string): string | null {
    if (!email) {
      return "L'email est requis.";
    }
    if (password.length < 8) {
      return 'Le mot de passe doit contenir au moins 8 caractères.';
    }
    return null;
  }

  private validateCode(code: string): string | null {
    if (!/^\d{6}$/.test(code)) {
      return 'Le code doit contenir exactement 6 chiffres.';
    }
    return null;
  }

  private describeError(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Une erreur est survenue. Réessayez.';
  }
}
