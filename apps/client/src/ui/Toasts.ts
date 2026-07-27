import type { HubInvite } from '../hub/types.js';

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
 * Gestionnaire de notifications empilées (coin haut-droit).
 *
 * - `info(message)` : petite bulle informative qui disparaît d'elle-même (~4 s).
 * - `invite(invite, onAccept)` : pop-up d'invitation à un hub avec un bouton
 *   « Rejoindre » et une croix pour l'ignorer.
 *
 * Plusieurs instances peuvent partager le même élément conteneur : chaque
 * instance ne gère que les nœuds qu'elle crée, sans jamais vider le conteneur.
 */
export class Toasts {
  private readonly element: HTMLElement;

  public constructor(element: HTMLElement) {
    this.element = element;
    this.element.classList.add('toast-container');
  }

  /** Affiche une bulle informative qui s'efface automatiquement. */
  public info(message: string): void {
    const node = document.createElement('div');
    node.className = 'toast toast--info';
    node.innerHTML = `
      <div class="toast-body">
        <span class="toast-icon">i</span>
        <p class="toast-text">${escapeHtml(message)}</p>
        <button type="button" class="toast-close" aria-label="Fermer">&times;</button>
      </div>
    `;
    node.querySelector('.toast-close')?.addEventListener('click', () => this.dismiss(node));
    this.element.appendChild(node);
    window.setTimeout(() => this.dismiss(node), 4000);
  }

  /** Affiche une pop-up d'invitation à un hub. */
  public invite(invite: HubInvite, onAccept: () => void): void {
    const node = document.createElement('div');
    node.className = 'toast toast--invite';
    node.innerHTML = `
      <div class="toast-body">
        <span class="toast-icon toast-icon--invite">@</span>
        <p class="toast-text">
          <strong>${escapeHtml(invite.fromDisplayName)}</strong> t'invite dans son hub
        </p>
        <button type="button" class="toast-close" aria-label="Ignorer">&times;</button>
      </div>
      <div class="toast-actions">
        <button type="button" class="toast-btn toast-btn--accept">Rejoindre</button>
      </div>
    `;
    node.querySelector('.toast-close')?.addEventListener('click', () => this.dismiss(node));
    node.querySelector('.toast-btn--accept')?.addEventListener('click', () => {
      onAccept();
      this.dismiss(node);
    });
    this.element.appendChild(node);
  }

  /** Retire un toast avec une petite transition de sortie. */
  private dismiss(node: HTMLElement): void {
    if (!node.isConnected) {
      return;
    }
    node.classList.add('toast--leaving');
    window.setTimeout(() => {
      node.remove();
    }, 180);
  }
}
