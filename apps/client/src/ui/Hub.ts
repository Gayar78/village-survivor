import { friendsService } from '../hub/friendsService.js';
import { realtimeService } from '../hub/realtimeService.js';
import {
  HUB_CAPACITY,
  type HubInvite,
  type HubMember,
  type HubState,
  type LaunchPayload,
  type PresenceStatus,
} from '../hub/types.js';
import { FriendsPanel } from './FriendsPanel.js';
import { Toasts } from './Toasts.js';

/** Session minimale nécessaire à l'écran hub. */
interface HubSession {
  userId: string;
  displayName: string;
}

/** Callbacks fournis par l'orchestrateur (main.ts). */
export interface HubCallbacks {
  /** Démarre la partie localement avec la graine + le nombre de joueurs. */
  onLaunch: (payload: LaunchPayload) => void;
  session: HubSession;
}

/** Instantané de présence transmis au panneau amis. */
interface PresenceSnapshot {
  status: PresenceStatus;
  hubCode?: string;
}

/** Échappe le texte dynamique injecté dans du innerHTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Génère une graine de monde partagée (8 caractères hexadécimaux). */
function randomSeed(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Deux initiales majuscules à partir d'un nom d'affichage. */
function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  const first = parts[0];
  if (!first) {
    return '?';
  }
  const second = parts[1];
  if (!second) {
    return first.slice(0, 2).toUpperCase();
  }
  return ((first[0] ?? '') + (second[0] ?? '')).toUpperCase();
}

/** Construit un instantané de présence sans propriété optionnelle undefined. */
function toSnapshot(status: PresenceStatus, hubCode: string | undefined): PresenceSnapshot {
  return hubCode === undefined ? { status } : { status, hubCode };
}

/**
 * Écran principal « hub launcher » (façon Steam/Discord), sombre & moderne.
 *
 * Colonne gauche « Ton hub » : avatar, code copiable, membres (badge chef +
 * bouton exclure réservé au chef), « Lancer la partie » (chef ou joueur seul),
 * « Rejoindre une équipe » par code. Colonne droite : le panneau `FriendsPanel`.
 *
 * Politique de lancement (pour éviter tout double-démarrage) :
 * au clic sur « Lancer » (chef/seul uniquement) on diffuse via
 * `realtimeService.launch(...)` PUIS on démarre localement via
 * `callbacks.onLaunch(...)`. Les membres NON-chef sont démarrés par main.ts qui
 * s'abonne directement à la diffusion réseau (hors de ce lot). Cet écran ne
 * s'abonne donc PAS lui-même à l'événement réseau de lancement, ce qui garantit
 * qu'un même joueur n'est jamais lancé deux fois.
 */
export class Hub {
  private readonly element: HTMLElement;
  private readonly callbacks: HubCallbacks;
  private readonly session: HubSession;

  private friendsPanel: FriendsPanel | null = null;
  private toasts: Toasts | null = null;

  private myFriendCode = '';
  private hubState: HubState | null = null;
  private presence: Map<string, PresenceSnapshot> = new Map();
  private error: string | null = null;

  private readonly unsubscribers: Array<() => void> = [];

  public constructor(element: HTMLElement, callbacks: HubCallbacks) {
    this.element = element;
    this.callbacks = callbacks;
    this.session = callbacks.session;
    this.element.classList.add('hub-screen');
  }

  public show(): void {
    this.element.classList.remove('hub--hidden');
  }

  public hide(): void {
    this.element.classList.add('hub--hidden');
  }

  /**
   * Charge le code ami, s'abonne à la présence / l'état du hub / les
   * invitations, monte le panneau amis et rend l'UI.
   */
  public async open(): Promise<void> {
    this.teardown();
    this.error = null;
    this.renderShell();
    this.show();

    // Abonnements temps réel.
    this.unsubscribers.push(
      realtimeService.onHubState((state) => {
        this.hubState = state;
        this.renderHub();
      }),
    );
    this.unsubscribers.push(
      realtimeService.onPresence((entries) => {
        const snapshot = new Map<string, PresenceSnapshot>();
        entries.forEach((entry, userId) => {
          snapshot.set(userId, toSnapshot(entry.status, entry.hubCode));
        });
        this.presence = snapshot;
        this.friendsPanel?.updatePresence();
      }),
    );
    this.unsubscribers.push(
      realtimeService.onInvite((invite) => {
        this.handleInvite(invite);
      }),
    );

    try {
      this.myFriendCode = await friendsService.getMyFriendCode();
    } catch (error) {
      this.error = this.describe(error);
    }
    this.renderHub();
    if (this.friendsPanel) {
      await this.friendsPanel.refresh();
    }
  }

  /** Détache les abonnements temps réel (idempotent). */
  public close(): void {
    this.teardown();
  }

  private teardown(): void {
    while (this.unsubscribers.length > 0) {
      const unsub = this.unsubscribers.pop();
      if (unsub) {
        unsub();
      }
    }
  }

  /** Construit la structure fixe (deux colonnes) et monte les sous-panneaux. */
  private renderShell(): void {
    this.element.innerHTML = `
      <div class="hub-shell">
        <section class="hub-panel hub-col--left">
          <div class="hub-left-body" id="hub-left-body"></div>
        </section>
        <aside class="hub-panel hub-col--right" id="hub-friends-mount"></aside>
      </div>
    `;

    const friendsMount = this.element.querySelector<HTMLElement>('#hub-friends-mount');
    if (friendsMount) {
      this.friendsPanel = new FriendsPanel(friendsMount, {
        presenceProvider: () => this.presenceProvider(),
        onJoinHub: (code) => this.joinHub(code),
        onInvite: (friendUserId) => this.inviteFriend(friendUserId),
      });
    }

    this.toasts = new Toasts(this.ensureToastRoot());
  }

  /** Rend la colonne gauche « Ton hub » (code + membres + actions). */
  private renderHub(): void {
    const body = this.element.querySelector<HTMLElement>('#hub-left-body');
    if (!body) {
      return;
    }
    const code = this.currentCode();
    const members = this.members();
    const capacity = this.hubState ? this.hubState.capacity : HUB_CAPACITY;
    const chief = this.isChief();

    body.innerHTML = `
      <header class="hub-head">
        <div class="hub-avatar">${escapeHtml(initialsOf(this.session.displayName))}</div>
        <div class="hub-head-text">
          <h2 class="hub-title">Ton hub</h2>
          <p class="hub-subtitle">${escapeHtml(this.session.displayName)}</p>
        </div>
      </header>

      <div class="hub-code-block">
        <span class="hub-code-label">Code d'équipe</span>
        <div class="hub-code-row">
          <code class="hub-code" id="hub-code">${escapeHtml(code || '--------')}</code>
          <button type="button" class="hub-copy" id="hub-copy" ${code ? '' : 'disabled'}>Copier</button>
        </div>
      </div>

      ${this.error ? `<p class="hub-error">${escapeHtml(this.error)}</p>` : ''}

      <div class="hub-members-block">
        <div class="hub-members-head">
          <h3 class="hub-section-title">Membres</h3>
          <span class="hub-count">${members.length}/${capacity}</span>
        </div>
        <ul class="hub-members" id="hub-members">
          ${members.map((member) => this.renderMember(member, chief)).join('')}
        </ul>
      </div>

      <div class="hub-actions">
        ${
          chief
            ? `<button type="button" class="hub-btn hub-btn--primary" id="hub-launch">Lancer la partie</button>`
            : `<p class="hub-hint">Seul le chef peut lancer la partie.</p>`
        }
        <button type="button" class="hub-btn" id="hub-join-toggle">Rejoindre une équipe</button>
        ${
          this.hubState && this.session.userId !== this.hubState.chiefUserId
            ? `<button type="button" class="hub-btn hub-btn--ghost" id="hub-leave">Quitter l'équipe</button>`
            : ''
        }
        <div class="hub-join" id="hub-join">
          <input
            class="hub-join-input"
            id="hub-join-code"
            type="text"
            maxlength="8"
            autocomplete="off"
            spellcheck="false"
            placeholder="Code d'équipe (8 car.)"
          />
          <button type="button" class="hub-btn hub-btn--small" id="hub-join-confirm">Rejoindre</button>
        </div>
      </div>
    `;

    this.attachHubListeners();
  }

  private renderMember(member: HubMember, viewerIsChief: boolean): string {
    const isSelf = member.userId === this.session.userId;
    const chiefBadge = member.isChief ? `<span class="hub-badge-chief">Chef</span>` : '';
    const kickBtn =
      viewerIsChief && !isSelf
        ? `<button type="button" class="hub-kick" data-kick="${escapeHtml(member.userId)}">Exclure</button>`
        : '';
    return `
      <li class="hub-member">
        <span class="hub-member-dot"></span>
        <span class="hub-member-name">${escapeHtml(member.displayName)}${isSelf ? ' (toi)' : ''}</span>
        ${chiefBadge}
        ${kickBtn}
      </li>
    `;
  }

  private attachHubListeners(): void {
    this.element.querySelector('#hub-copy')?.addEventListener('click', () => this.copyCode());
    this.element.querySelector('#hub-launch')?.addEventListener('click', () => this.handleLaunch());
    this.element.querySelector('#hub-join-toggle')?.addEventListener('click', () => {
      this.element.querySelector('#hub-join')?.classList.toggle('hub-join--open');
    });
    this.element.querySelector('#hub-join-confirm')?.addEventListener('click', () => {
      const input = this.element.querySelector<HTMLInputElement>('#hub-join-code');
      const code = input?.value.trim().toUpperCase() ?? '';
      if (code.length > 0) {
        this.joinHub(code);
      }
    });
    this.element.querySelector('#hub-leave')?.addEventListener('click', () => this.leaveHub());
    this.element.querySelector('#hub-members')?.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-kick]');
      const userId = target?.dataset.kick;
      if (userId) {
        this.kick(userId);
      }
    });
  }

  /** Membres courants : ceux du hub, ou soi-même seul (chef de son propre hub). */
  private members(): HubMember[] {
    if (this.hubState) {
      return this.hubState.members;
    }
    return [{ userId: this.session.userId, displayName: this.session.displayName, isChief: true }];
  }

  /** Chef si on l'est dans l'état du hub, ou si l'on est seul dans son hub. */
  private isChief(): boolean {
    if (!this.hubState) {
      return true;
    }
    return this.session.userId === this.hubState.chiefUserId;
  }

  /** Code d'équipe à afficher : celui du hub courant, sinon notre code perso. */
  private currentCode(): string {
    if (this.hubState) {
      return this.hubState.code;
    }
    return realtimeService.currentHubCode() ?? this.myFriendCode;
  }

  private presenceProvider(): Map<string, PresenceSnapshot> {
    const copy = new Map<string, PresenceSnapshot>();
    this.presence.forEach((entry, userId) => {
      copy.set(userId, toSnapshot(entry.status, entry.hubCode));
    });
    return copy;
  }

  private copyCode(): void {
    const code = this.currentCode();
    if (!code) {
      return;
    }
    void (async () => {
      try {
        await navigator.clipboard.writeText(code);
        this.toasts?.info('Code copié dans le presse-papiers.');
      } catch {
        this.toasts?.info('Copie impossible.');
      }
    })();
  }

  private handleLaunch(): void {
    if (!this.isChief()) {
      return;
    }
    // Roster ordonné (chef en premier) : chaque membre du hub devient un avatar. Les
    // identifiants d'avatar sont les userId, l'hôte est le chef (= le joueur local ici).
    const members = this.members();
    const roster = [...members]
      .sort((a, b) => (a.isChief === b.isChief ? 0 : a.isChief ? -1 : 1))
      .map((member) => ({ id: member.userId, name: member.displayName }));
    const code = this.currentCode();
    const payload: LaunchPayload = {
      seed: randomSeed(),
      playerCount: members.length,
      ...(code.length > 0 && roster.length > 0
        ? { code, hostId: this.session.userId, roster }
        : {}),
    };
    void (async () => {
      try {
        await realtimeService.launch(payload);
      } catch {
        // Diffusion réseau impossible : on démarre tout de même en local.
      }
      // Démarrage local du chef. Les membres non-chef sont démarrés par main.ts
      // via l'abonnement réseau au lancement (hors périmètre de ce lot).
      this.callbacks.onLaunch(payload);
    })();
  }

  private joinHub(code: string): void {
    void (async () => {
      try {
        await realtimeService.joinHub(code);
        this.toasts?.info('Équipe rejointe.');
      } catch (error) {
        this.error = this.describe(error);
        this.renderHub();
      }
    })();
  }

  private leaveHub(): void {
    void (async () => {
      try {
        await realtimeService.leaveHub();
        this.hubState = null;
        this.toasts?.info("Tu as quitté l'équipe.");
        this.renderHub();
      } catch (error) {
        this.error = this.describe(error);
        this.renderHub();
      }
    })();
  }

  private kick(userId: string): void {
    void (async () => {
      try {
        await realtimeService.kick(userId);
      } catch (error) {
        this.error = this.describe(error);
        this.renderHub();
      }
    })();
  }

  private inviteFriend(friendUserId: string): void {
    const code = this.currentCode();
    if (!code) {
      this.toasts?.info("Aucun code d'équipe disponible pour inviter.");
      return;
    }
    void (async () => {
      try {
        await realtimeService.invite(
          friendUserId,
          code,
          this.session.displayName,
          this.session.userId,
        );
        this.toasts?.info('Invitation envoyée.');
      } catch (error) {
        this.toasts?.info(this.describe(error));
      }
    })();
  }

  private handleInvite(invite: HubInvite): void {
    this.toasts?.invite(invite, () => {
      this.joinHub(invite.hubCode);
    });
  }

  private describe(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Une erreur est survenue. Réessayez.';
  }

  /** Conteneur de toasts partagé (unique) attaché au document. */
  private ensureToastRoot(): HTMLElement {
    const existing = document.getElementById('hub-toast-root');
    if (existing) {
      return existing;
    }
    const root = document.createElement('div');
    root.id = 'hub-toast-root';
    document.body.appendChild(root);
    return root;
  }
}
