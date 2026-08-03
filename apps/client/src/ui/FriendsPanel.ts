import { friendsService, type FriendBase } from '../hub/friendsService.js';
import type { IncomingFriendRequest, PresenceStatus } from '../hub/types.js';
import { Toasts } from './Toasts.js';

/** Instantané de présence exposé par l'appelant pour un joueur donné. */
interface PresenceSnapshot {
  status: PresenceStatus;
  hubCode?: string;
}

/** Dépendances injectées par l'écran hub. */
export interface FriendsPanelDeps {
  /** Fournit la présence courante indexée par userId (source temps réel). */
  presenceProvider: () => Map<string, PresenceSnapshot>;
  /** Demande de rejoindre le hub d'un ami (par code). */
  onJoinHub: (code: string) => void;
  /** Demande d'inviter un ami en ligne dans notre hub. */
  onInvite: (friendUserId: string) => void;
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

/** True si le statut correspond à un joueur connecté (peu importe où). */
function isOnline(status: PresenceStatus): boolean {
  return status !== 'offline';
}

/**
 * Colonne « Amis » du hub : ajout par code, demandes reçues à accepter/refuser,
 * et liste d'amis avec pastille de présence + actions (Rejoindre / Inviter /
 * Retirer). La présence est fusionnée à la volée via `presenceProvider`.
 */
export class FriendsPanel {
  private readonly element: HTMLElement;
  private readonly deps: FriendsPanelDeps;
  private readonly toasts: Toasts;

  private friends: FriendBase[] = [];
  private requests: IncomingFriendRequest[] = [];
  private error: string | null = null;
  private busy = false;
  private pollHandle: number | null = null;

  public constructor(element: HTMLElement, deps: FriendsPanelDeps) {
    this.element = element;
    this.deps = deps;
    this.element.classList.add('friends-panel');
    this.toasts = new Toasts(FriendsPanel.ensureToastRoot());
    this.startPolling();
  }

  /**
   * Les demandes d'ami n'arrivent pas en temps réel : on réinterroge la base
   * périodiquement pour qu'une demande reçue apparaisse sans recharger la page.
   */
  private startPolling(): void {
    if (this.pollHandle !== null) {
      return;
    }
    this.pollHandle = window.setInterval(() => {
      void this.refresh();
    }, 12000);
  }

  /** Arrête le rafraîchissement périodique. */
  public stop(): void {
    if (this.pollHandle !== null) {
      window.clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  /** Recharge amis + demandes, puis rend l'ensemble du panneau. */
  public async refresh(): Promise<void> {
    try {
      const [friends, requests] = await Promise.all([
        friendsService.listFriends(),
        friendsService.listIncomingRequests(),
      ]);
      this.friends = friends;
      this.requests = requests;
      this.error = null;
    } catch (error) {
      this.error = this.describe(error);
    }
    this.render();
  }

  /**
   * À appeler quand la présence change : ne re-rend que la liste (préserve le
   * champ « code ami » en cours de saisie).
   */
  public updatePresence(): void {
    this.renderList();
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="friends-header">
        <h3 class="friends-title">Amis</h3>
      </div>
      <form class="friends-add" id="friends-add">
        <input
          class="friends-input"
          id="friends-code"
          type="text"
          maxlength="8"
          autocomplete="off"
          spellcheck="false"
          placeholder="Code ami (8 car.)"
        />
        <button type="submit" class="friends-add-btn" ${this.busy ? 'disabled' : ''}>Ajouter</button>
      </form>
      ${this.error ? `<p class="friends-error">${escapeHtml(this.error)}</p>` : ''}
      ${this.renderRequests()}
      <div class="friends-list" id="friends-list"></div>
    `;
    this.attachListeners();
    this.renderList();
  }

  private renderRequests(): string {
    if (this.requests.length === 0) {
      return '';
    }
    const items = this.requests
      .map((req) => {
        return `
          <li class="friends-request">
            <span class="friends-request-name">${escapeHtml(req.fromDisplayName)}</span>
            <span class="friends-request-code">${escapeHtml(req.fromFriendCode)}</span>
            <span class="friends-request-actions">
              <button type="button" class="friends-btn friends-btn--accept"
                data-action="accept" data-reqid="${escapeHtml(req.requestId)}">Accepter</button>
              <button type="button" class="friends-btn friends-btn--decline"
                data-action="decline" data-reqid="${escapeHtml(req.requestId)}">Refuser</button>
            </span>
          </li>
        `;
      })
      .join('');
    return `
      <div class="friends-requests">
        <h4 class="friends-subtitle">Demandes reçues</h4>
        <ul class="friends-request-list" id="friends-requests">${items}</ul>
      </div>
    `;
  }

  private renderList(): void {
    const list = this.element.querySelector('#friends-list');
    if (!list) {
      return;
    }
    if (this.friends.length === 0) {
      list.innerHTML = `<p class="friends-empty">Aucun ami pour l'instant. Ajoute un code ami ci-dessus.</p>`;
      return;
    }
    const presence = this.deps.presenceProvider();
    list.innerHTML = this.friends
      .map((friend) => {
        const snapshot = presence.get(friend.userId);
        const status: PresenceStatus = snapshot ? snapshot.status : 'offline';
        const online = isOnline(status);
        const dotClass = online ? 'friends-dot--online' : 'friends-dot--offline';
        const stateLabel = online ? 'En ligne' : 'Hors ligne';
        return `
          <div class="friends-item">
            <span class="friends-dot ${dotClass}" title="${stateLabel}"></span>
            <span class="friends-info">
              <span class="friends-name">${escapeHtml(friend.displayName)}</span>
              <span class="friends-item-code">${escapeHtml(friend.friendCode)}</span>
            </span>
            <span class="friends-item-actions">
              ${this.renderFriendAction(friend, snapshot, online)}
              <button type="button" class="friends-btn friends-btn--remove"
                data-action="remove" data-userid="${escapeHtml(friend.userId)}">Retirer</button>
            </span>
          </div>
        `;
      })
      .join('');
  }

  private renderFriendAction(
    friend: FriendBase,
    snapshot: PresenceSnapshot | undefined,
    online: boolean,
  ): string {
    if (snapshot && snapshot.hubCode) {
      return `<button type="button" class="friends-btn friends-btn--join"
        data-action="join" data-userid="${escapeHtml(friend.userId)}"
        data-hubcode="${escapeHtml(snapshot.hubCode)}">Rejoindre</button>`;
    }
    if (online) {
      return `<button type="button" class="friends-btn friends-btn--invite"
        data-action="invite" data-userid="${escapeHtml(friend.userId)}">Inviter</button>`;
    }
    return '';
  }

  private attachListeners(): void {
    const form = this.element.querySelector('#friends-add');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleAdd();
    });

    this.element.querySelector('#friends-requests')?.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
      if (!target) {
        return;
      }
      const reqId = target.dataset.reqid;
      const action = target.dataset.action;
      if (!reqId || (action !== 'accept' && action !== 'decline')) {
        return;
      }
      this.handleRespond(reqId, action === 'accept');
    });

    this.element.querySelector('#friends-list')?.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
      if (!target) {
        return;
      }
      const userId = target.dataset.userid;
      const action = target.dataset.action;
      if (!userId) {
        return;
      }
      if (action === 'join') {
        const hubCode = target.dataset.hubcode;
        if (hubCode) {
          this.deps.onJoinHub(hubCode);
        }
      } else if (action === 'invite') {
        this.deps.onInvite(userId);
      } else if (action === 'remove') {
        this.handleRemove(userId);
      }
    });
  }

  private handleAdd(): void {
    if (this.busy) {
      return;
    }
    const input = this.element.querySelector<HTMLInputElement>('#friends-code');
    const code = input?.value.trim().toUpperCase() ?? '';
    if (code.length === 0) {
      return;
    }
    this.busy = true;
    void (async () => {
      try {
        await friendsService.sendFriendRequest(code);
        this.busy = false;
        this.toasts.info("Demande d'ami envoyée.");
        await this.refresh();
      } catch (error) {
        this.busy = false;
        this.error = this.describe(error);
        this.render();
      }
    })();
  }

  private handleRespond(requestId: string, accept: boolean): void {
    if (this.busy) {
      return;
    }
    this.busy = true;
    void (async () => {
      try {
        await friendsService.respondFriendRequest(requestId, accept);
        this.busy = false;
        this.toasts.info(accept ? 'Ami ajouté.' : 'Demande refusée.');
        await this.refresh();
      } catch (error) {
        this.busy = false;
        this.error = this.describe(error);
        this.render();
      }
    })();
  }

  private handleRemove(friendUserId: string): void {
    if (this.busy) {
      return;
    }
    this.busy = true;
    void (async () => {
      try {
        await friendsService.removeFriend(friendUserId);
        this.busy = false;
        this.toasts.info('Ami retiré.');
        await this.refresh();
      } catch (error) {
        this.busy = false;
        this.error = this.describe(error);
        this.render();
      }
    })();
  }

  private describe(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Une erreur est survenue. Réessayez.';
  }

  /** Conteneur de toasts partagé (unique) attaché au document. */
  private static ensureToastRoot(): HTMLElement {
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
