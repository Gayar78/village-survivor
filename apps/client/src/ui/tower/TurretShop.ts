import type { TowerGameState, TurretDir } from '@village-survivor/protocol';
import { TOWER_TURRET_REPAIR_COST_PER_HP, TOWER_TURRET_SHOP } from '@village-survivor/content';

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
 * Boutique de tourelle (Tower) : n'affiche un panneau que si elle est ouverte ET
 * que le joueur est à portée d'une tourelle (`state.player.nearTurret`). Liste le
 * catalogue partagé `TOWER_TURRET_SHOP` + une option « Réparer » (coût dérivé des
 * PV manquants de la tourelle visée). N'émet jamais rien seule : chaque clic
 * délègue à `onAction(turret, id|'repair')`, l'appelant décidant du réseau.
 */
export class TurretShop {
  private readonly element: HTMLElement;
  private readonly onAction: (turret: TurretDir, action: string) => void;
  private opened = false;
  private signature = '';

  public constructor(root: HTMLElement, onAction: (turret: TurretDir, action: string) => void) {
    this.element = root;
    this.onAction = onAction;
  }

  public open(): void {
    this.opened = true;
  }

  public close(): void {
    this.opened = false;
  }

  public toggle(): void {
    this.opened = !this.opened;
  }

  public isOpen(): boolean {
    return this.opened;
  }

  private clear(): void {
    if (this.signature !== '') {
      this.signature = '';
      this.element.innerHTML = '';
    }
  }

  public render(state: TowerGameState): void {
    const nearTurret = state.player.nearTurret;
    if (nearTurret === undefined) {
      // Le joueur n'est plus à portée d'une tourelle : le panneau se referme de
      // lui-même, quelle que soit l'intention d'ouverture précédente.
      this.opened = false;
      this.clear();
      return;
    }
    if (!this.opened) {
      this.clear();
      return;
    }

    const turret = state.turrets.find((candidate) => candidate.dir === nearTurret);
    if (turret === undefined) {
      this.clear();
      return;
    }

    const repairMissing = Math.max(0, turret.maxHp - turret.hp);
    const repairCost = Math.ceil(repairMissing * TOWER_TURRET_REPAIR_COST_PER_HP);
    const signature = [nearTurret, state.scrapFund, Math.ceil(turret.hp), turret.maxHp].join('|');
    if (signature === this.signature) {
      return;
    }
    this.signature = signature;

    const shopButtons = TOWER_TURRET_SHOP.map((entry) => {
      const disabled = state.scrapFund < entry.cost ? 'disabled' : '';
      return `<button type="button" class="turret-shop-item" data-action="${escapeHtml(entry.id)}" ${disabled}>
        <strong>${escapeHtml(entry.label)}</strong>
        <small>${escapeHtml(entry.desc)}</small>
        <span>${entry.cost} ferraille</span>
      </button>`;
    }).join('');

    const repairDisabled = repairMissing <= 0 || state.scrapFund < repairCost ? 'disabled' : '';

    this.element.innerHTML = `
      <section class="turret-shop" data-testid="turret-shop">
        <p class="eyebrow">TOURELLE ${escapeHtml(nearTurret)}</p>
        <h2>Boutique de tourelle</h2>
        <p>Ferraille commune disponible : <strong>${state.scrapFund}</strong></p>
        <div class="turret-shop-grid">
          ${shopButtons}
          <button type="button" class="turret-shop-item turret-shop-item--repair" data-action="repair" ${repairDisabled}>
            <strong>Réparer</strong>
            <small>${Math.ceil(turret.hp)} / ${turret.maxHp} PV</small>
            <span>${repairCost} ferraille</span>
          </button>
        </div>
      </section>
    `;

    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-action]')) {
      button.addEventListener('click', () => {
        const action = button.dataset.action;
        if (action !== undefined) {
          this.onAction(nearTurret, action);
        }
      });
    }
  }
}
