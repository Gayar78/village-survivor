import type { Session, User } from '@supabase/supabase-js';

import { supabase } from './supabaseClient.js';
import type { AccountSession, MfaEnrollment } from './types.js';

/**
 * État de la double authentification pour la session courante :
 * - `ok` : 2FA satisfaite (niveau aal2) ou compte OAuth (2FA non imposée) ;
 * - `needs-verify` : un facteur TOTP vérifié existe, il faut saisir un code ;
 * - `needs-enroll` : compte email sans facteur TOTP, il faut en mettre un en place.
 */
export type MfaSituation = 'ok' | 'needs-verify' | 'needs-enroll';

export interface AuthService {
  /** Session courante (ou null si non connecté / MFA non finalisé). */
  getSession(): Promise<AccountSession | null>;
  /** S'abonne aux changements d'auth ; renvoie une fonction de désabonnement. */
  onAuthStateChange(callback: (session: AccountSession | null) => void): () => void;
  signInWithGoogle(): Promise<void>;
  signInWithGitHub(): Promise<void>;
  /**
   * Inscription email/mot de passe. Le displayName est stocké dans les métadonnées.
   * `needsEmailConfirmation=true` si le projet exige une confirmation par email
   * (aucune session active tant que le lien reçu n'est pas cliqué).
   */
  signUpWithEmail(
    email: string,
    password: string,
    displayName: string,
  ): Promise<{ needsEmailConfirmation: boolean }>;
  /** Connexion email/mot de passe. Lève une erreur lisible si l'email n'est pas confirmé. */
  signInWithEmail(email: string, password: string): Promise<void>;
  /** Indique si la 2FA est satisfaite pour la session courante, ou ce qu'il reste à faire. */
  getMfaSituation(): Promise<MfaSituation>;
  /** Démarre l'enrôlement TOTP : renvoie le QR + secret à afficher. */
  enrollTotp(): Promise<MfaEnrollment>;
  /** Finalise l'enrôlement TOTP avec le code à 6 chiffres saisi par l'utilisateur. */
  confirmTotpEnrollment(factorId: string, code: string): Promise<void>;
  /** Vérifie un code TOTP lors d'une connexion nécessitant le 2e facteur. */
  verifyTotp(code: string): Promise<void>;
  signOut(): Promise<void>;
}

/** Extrait un nom d'affichage lisible depuis les métadonnées de l'utilisateur, sinon l'email. */
function resolveDisplayName(user: User): string {
  const metadata = user.user_metadata as Record<string, unknown> | null;
  const displayName = metadata?.['display_name'];
  if (typeof displayName === 'string' && displayName.length > 0) {
    return displayName;
  }
  const fullName = metadata?.['full_name'];
  if (typeof fullName === 'string' && fullName.length > 0) {
    return fullName;
  }
  return user.email ?? '';
}

function toAccountSession(user: User): AccountSession {
  return {
    userId: user.id,
    email: user.email ?? '',
    displayName: resolveDisplayName(user),
  };
}

/** Uniformise les erreurs Supabase en Error avec un message lisible en français. */
function toError(message: string, cause: unknown): Error {
  if (cause instanceof Error) {
    return new Error(`${message} : ${cause.message}`);
  }
  return new Error(message);
}

class SupabaseAuthService implements AuthService {
  async getSession(): Promise<AccountSession | null> {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      // Absence de session : on renvoie simplement null plutôt que de lever.
      return null;
    }
    if (!data.user) {
      return null;
    }
    return toAccountSession(data.user);
  }

  onAuthStateChange(callback: (session: AccountSession | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      callback(session?.user ? toAccountSession(session.user) : null);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }

  async signInWithGoogle(): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Retour vers l'origine courante (localhost en dev, domaine Vercel en ligne).
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      throw toError('Échec de la connexion avec Google', error);
    }
  }

  async signInWithGitHub(): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      throw toError('Échec de la connexion avec GitHub', error);
    }
  }

  async signUpWithEmail(
    email: string,
    password: string,
    displayName: string,
  ): Promise<{ needsEmailConfirmation: boolean }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      throw toError("Échec de l'inscription", error);
    }
    // Confirmation email active côté projet : aucune session tant que le lien n'est pas cliqué.
    return { needsEmailConfirmation: data.session === null };
  }

  async signInWithEmail(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if ((error as { code?: string }).code === 'email_not_confirmed') {
        throw new Error(
          "Ton adresse email n'est pas encore confirmée. Clique le lien reçu par email, puis reconnecte-toi.",
        );
      }
      throw toError('Échec de la connexion', error);
    }
  }

  async getMfaSituation(): Promise<MfaSituation> {
    const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) {
      throw toError("Échec de la vérification du niveau d'authentification", error);
    }
    if (aal.currentLevel === 'aal2') {
      return 'ok';
    }
    // Un facteur TOTP vérifié existe (aal1 -> aal2 possible) : il faut saisir un code.
    if (aal.nextLevel === 'aal2') {
      return 'needs-verify';
    }
    // Aucun facteur vérifié : on n'impose la 2FA que pour les comptes email/mot de passe.
    const { data: userData } = await supabase.auth.getUser();
    const provider = userData.user?.app_metadata.provider;
    if (provider !== undefined && provider !== 'email') {
      return 'ok';
    }
    return 'needs-enroll';
  }

  async enrollTotp(): Promise<MfaEnrollment> {
    // Nettoie tout facteur TOTP resté « non vérifié » à cause d'une tentative
    // d'enrôlement abandonnée : sans ça, un nouvel enrôlement échoue avec
    // « a factor with the friendly name … already exists ».
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    if (factorsData) {
      for (const factor of factorsData.all) {
        if (factor.factor_type === 'totp' && factor.status !== 'verified') {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }
    }
    // Nom unique : évite toute collision de « friendly name » résiduelle.
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `village-survivor-${Date.now()}`,
    });
    if (error) {
      throw toError("Échec de l'enrôlement de la double authentification", error);
    }
    return {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    };
  }

  async confirmTotpEnrollment(factorId: string, code: string): Promise<void> {
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError) {
      throw toError('Échec du démarrage de la vérification TOTP', challengeError);
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    });
    if (verifyError) {
      throw toError('Code de vérification invalide', verifyError);
    }
  }

  async verifyTotp(code: string): Promise<void> {
    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      throw toError('Échec de la récupération des facteurs TOTP', factorsError);
    }
    const factor = factorsData.totp[0];
    if (!factor) {
      throw new Error('Aucun facteur TOTP vérifié n’est associé à ce compte.');
    }
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: factor.id,
    });
    if (challengeError) {
      throw toError('Échec du démarrage de la vérification TOTP', challengeError);
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challengeData.id,
      code,
    });
    if (verifyError) {
      throw toError('Code de vérification invalide', verifyError);
    }
  }

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw toError('Échec de la déconnexion', error);
    }
  }
}

export const authService: AuthService = new SupabaseAuthService();
