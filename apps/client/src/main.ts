import { authService } from './account/authService.js';
import { isSupabaseConfigured } from './account/supabaseClient.js';
import type { AccountSession } from './account/types.js';
import { friendsService } from './hub/friendsService.js';
import { realtimeService } from './hub/realtimeService.js';
import type { LaunchPayload } from './hub/types.js';
import { AuthScreen } from './ui/AuthScreen.js';
import { Hub } from './ui/Hub.js';
import { ProfileScreen } from './ui/ProfileScreen.js';
import './styles.css';

// Page LOBBY. Elle gère l'authentification (connexion obligatoire) puis le hub
// multijoueur. Le jeu lui-même vit sur une page dédiée (play.html) : au lancement
// d'une partie, on navigue vers cette page en lui transmettant la graine du monde
// et le nombre de joueurs. Cette séparation garantit un rendu Phaser propre, sans
// calque d'interface du lobby par-dessus le canvas de jeu.

const authElement = document.querySelector<HTMLElement>('#auth');
const profileElement = document.querySelector<HTMLElement>('#profile');
const hubElement = document.querySelector<HTMLElement>('#hub');
if (authElement === null || profileElement === null || hubElement === null) {
  throw new Error('La page lobby ne contient pas les points de montage attendus.');
}

// Session de compte courante (connexion obligatoire) : mise à jour au démarrage,
// à chaque authentification réussie et via l'abonnement aux changements d'auth.
let accountSession: AccountSession | null = null;

const profileScreen = new ProfileScreen(
  profileElement,
  () => profileScreen.hide(),
  () => location.reload(),
);
profileScreen.hide();

// Barre compte (profil + déconnexion) affichée sur le hub.
const accountBar = document.createElement('div');
accountBar.id = 'account-bar';
accountBar.style.cssText = 'position:fixed;top:16px;left:16px;z-index:46;display:none;gap:8px;';
accountBar.innerHTML =
  '<button type="button" class="hub-btn hub-btn--small" id="account-profile">Mon profil</button>' +
  '<button type="button" class="hub-btn hub-btn--small" id="account-logout">Se déconnecter</button>';
document.body.append(accountBar);
accountBar.querySelector('#account-profile')?.addEventListener('click', () => {
  if (accountSession !== null) {
    void profileScreen.open(accountSession);
  }
});
accountBar.querySelector('#account-logout')?.addEventListener('click', () => {
  if (window.confirm('Se déconnecter de ton compte ?')) {
    void authService.signOut().finally(() => location.reload());
  }
});

// Alias non-nullable (le narrowing du bloc de garde ne se propage pas dans les
// fonctions imbriquées comme `startHub`).
const hubRoot: HTMLElement = hubElement;
let hub: Hub | null = null;

// Navigue vers la page de jeu avec la graine commune et le nombre de joueurs (chef
// ET membres reçoivent le même appel). Idempotent : le chef reçoit à la fois son
// clic et l'écho réseau, on ne navigue qu'une fois.
let coopLaunching = false;
function beginLaunch(payload: LaunchPayload): void {
  if (coopLaunching) {
    return;
  }
  coopLaunching = true;
  const me = accountSession?.userId;
  // Co-op réel : le payload porte le canal (code), l'hôte et un roster d'au moins 2
  // joueurs. On dépose la config réseau (consommée par play.ts) puis on navigue.
  if (
    payload.code !== undefined &&
    payload.hostId !== undefined &&
    payload.roster !== undefined &&
    payload.roster.length > 1 &&
    me !== undefined
  ) {
    const config = {
      seed: payload.seed,
      code: payload.code,
      hostId: payload.hostId,
      me,
      roster: payload.roster,
    };
    sessionStorage.setItem('vs-coop-netcode', JSON.stringify(config));
    location.assign('play.html');
    return;
  }
  // Sinon : partie solo (graine + nombre de joueurs pour l'échelle de difficulté).
  const query = `seed=${encodeURIComponent(payload.seed)}&players=${String(payload.playerCount)}`;
  location.assign(`play.html?${query}`);
}

// Démarre la présence temps réel (code perso = code de hub) puis affiche le hub.
async function startHub(account: AccountSession): Promise<void> {
  const displayName = account.displayName.length > 0 ? account.displayName : account.email;
  const hubSession = { userId: account.userId, displayName };
  try {
    const friendCode = await friendsService.getMyFriendCode();
    await realtimeService.start(hubSession, friendCode);
  } catch (error) {
    console.warn('Démarrage temps réel impossible :', error);
  }
  // Membres non-chef : le lancement réseau déclenche la navigation vers le jeu.
  realtimeService.onLaunch((payload) => beginLaunch(payload));
  hub = new Hub(hubRoot, { onLaunch: (payload) => beginLaunch(payload), session: hubSession });
  accountBar.style.display = 'flex';
  void hub.open();
}

// Une fois l'authentification acquise : affichage du hub.
let revealed = false;
async function revealAfterAuth(): Promise<void> {
  if (revealed) {
    return;
  }
  revealed = true;
  authScreen.hide();
  if (accountSession !== null) {
    await startHub(accountSession);
  }
}

const authScreen = new AuthScreen(authElement, () => {
  void authService.getSession().then((current) => {
    accountSession = current;
    void revealAfterAuth();
  });
});

// Affiche un message d'aide clair (au lieu d'une page blanche) tant que les clés
// Supabase ne sont pas renseignées dans le `.env`.
function showConfigMissing(root: HTMLElement): void {
  root.classList.add('auth-screen');
  root.classList.remove('auth--hidden');
  root.innerHTML = `
    <div class="auth-panel">
      <div class="auth-brand"><span>VS</span><strong>Village Survivor</strong></div>
      <h2>Configuration requise</h2>
      <p class="auth-hint">
        La connexion aux comptes n'est pas encore configurée. Créez un fichier
        <code>.env</code> à la racine du projet avec vos clés Supabase
        (<code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>),
        puis relancez le serveur (<code>pnpm dev</code>).
      </p>
      <p class="auth-hint">Guide pas-à-pas : <code>docs/SETUP_SUPABASE.md</code>.</p>
    </div>`;
}

if (!isSupabaseConfigured) {
  // Pas de clés : on n'appelle aucun service réseau, on guide simplement le joueur.
  showConfigMissing(authElement);
} else {
  // Suit les changements d'état d'authentification (rafraîchissement de session,
  // déconnexion dans un autre onglet…) pour garder `accountSession` à jour.
  authService.onAuthStateChange((current) => {
    accountSession = current;
  });

  // Une session existe déjà : on vérifie l'état de la 2FA avant de déverrouiller le
  // hub. Retour d'un lien de confirmation d'email ⇒ mise en place de la 2FA ; facteur
  // vérifié en attente ⇒ saisie du code ; sinon (aal2 ou compte OAuth) ⇒ accès direct.
  async function routeAfterSession(): Promise<void> {
    try {
      const situation = await authService.getMfaSituation();
      if (situation === 'needs-verify') {
        authScreen.resumeVerification();
      } else if (situation === 'needs-enroll') {
        authScreen.resumeEnrollment();
      } else {
        void revealAfterAuth();
      }
    } catch {
      // En cas d'échec de la détection, on laisse entrer un utilisateur déjà authentifié.
      void revealAfterAuth();
    }
  }

  // Au chargement : si une session persiste déjà (session sauvegardée, retour d'un
  // flux OAuth ou d'une confirmation d'email), on route selon l'état 2FA ; sinon on
  // affiche l'écran de connexion.
  void authService
    .getSession()
    .then((current) => {
      accountSession = current;
      if (current === null) {
        authScreen.show();
        return;
      }
      void routeAfterSession();
    })
    .catch(() => {
      authScreen.show();
    });
}
