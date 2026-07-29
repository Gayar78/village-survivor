import type { TowerGameState, UpgradeRarity } from '@village-survivor/protocol';

const RARITY_COLORS: Readonly<Record<UpgradeRarity, string>> = {
  common: '#aaa',
  rare: '#4a9eff',
  epic: '#9b59b6',
  legendary: '#f1c40f',
  mythic: '#e21111',
  divin: '#5900ff',
};

/** Verrou anti-missclick : ignore les clics survenant juste après l'apparition. */
const MISCLICK_LOCK_MS = 200;

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character] ?? character);
}

/**
 * Écran de montée de niveau (Tower) : lit `state.player.upgradeChoices` et
 * n'affiche les cartes que si l'offre n'est pas vide (masqué sinon). La couleur
 * de bordure de chaque carte reflète sa rareté. Un clic sur une carte appelle
 * `onSelect(card.offerId)` — sauf pendant les 200 ms suivant l'apparition, pour
 * absorber un clic resté « collé » d'une action précédente.
 */
export class TowerLevelUp {
  private readonly element: HTMLElement;
  private readonly onSelect: (offerId: string) => void;
  private signature = '';
  private shownAtMs = 0;

  public constructor(root: HTMLElement, onSelect: (offerId: string) => void) {
    this.element = root;
    this.onSelect = onSelect;
  }

  public render(state: TowerGameState): void {
    const choices = state.player.upgradeChoices;
    if (choices.length === 0) {
      if (this.signature !== '') {
        this.signature = '';
        this.element.innerHTML = '';
      }
      return;
    }

    const signature = choices.map((card) => card.offerId).join('|');
    if (signature === this.signature) {
      return;
    }
    this.signature = signature;
    this.shownAtMs = Date.now();

    this.element.innerHTML = `
      <section class="tower-levelup" data-testid="tower-levelup">
        <p class="eyebrow">NIVEAU ${state.player.level}</p>
        <h2>Choisissez une amélioration</h2>
        <div class="tower-levelup-grid">
          ${choices
            .map(
              (card) => `<button
                type="button"
                class="tower-levelup-card"
                data-offer-id="${escapeHtml(card.offerId)}"
                style="border-color:${RARITY_COLORS[card.rarity]}"
              >
                <span class="tower-levelup-card__rarity">${escapeHtml(card.rarity)}</span>
                <strong>${escapeHtml(card.label)}</strong>
                <small>${escapeHtml(card.description)}</small>
              </button>`,
            )
            .join('')}
        </div>
      </section>
    `;

    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-offer-id]')) {
      button.addEventListener('click', () => {
        if (Date.now() - this.shownAtMs < MISCLICK_LOCK_MS) {
          return;
        }
        const offerId = button.dataset.offerId;
        if (offerId !== undefined) {
          this.onSelect(offerId);
        }
      });
    }
  }
}
