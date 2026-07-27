import type { PublicGameState } from '@village-survivor/protocol';

import { InventoryGrid } from './InventoryGrid.js';

/**
 * Panneau d'inventaire solo (touche I) : une grille 5x4 affichant les 20 cases
 * de l'inventaire du joueur, ancrée à droite de l'écran (~20px du bord). Non-modal :
 * la simulation continue derrière, comme le reste de l'UI de ce projet (elle ne
 * se met jamais en pause).
 *
 * Server-authoritative : on passe `state.player.inventory` tel quel à la grille,
 * qui affiche chaque case à son index exact. Plus aucune construction locale de
 * `Stack[]` ni de persistance de disposition.
 */
export class Inventory {
  private readonly element: HTMLElement;
  private readonly grid = new InventoryGrid({ id: 'player' });
  private open = false;
  private latestState: PublicGameState | undefined;

  public constructor(element: HTMLElement) {
    this.element = element;
  }

  public isOpen(): boolean {
    return this.open;
  }

  public toggle(): void {
    if (this.open) {
      this.close();
    } else {
      this.show();
    }
  }

  public show(): void {
    this.open = true;
    this.element.classList.add('inventory-panel--open');
    this.render();
  }

  public close(): void {
    this.open = false;
    this.element.classList.remove('inventory-panel--open');
  }

  /** Appelé à chaque publication d'état ; ne redessine que si le panneau est ouvert. */
  public update(state: PublicGameState): void {
    this.latestState = state;
    if (this.open) {
      this.render();
    }
  }

  private render(): void {
    const state = this.latestState;
    if (state === undefined) {
      return;
    }
    const inventory = state.player.inventory;
    const occupied = inventory.reduce((count, slot) => (slot === undefined ? count : count + 1), 0);

    this.element.innerHTML = `
      <div class="side-panel side-panel--player">
        <div class="side-panel__header">
          <h2>Inventaire</h2>
          <p>${occupied} / ${inventory.length} cases occupées</p>
        </div>
        <div class="inv-grid" data-testid="player-inventory-grid"></div>
      </div>
    `;
    const gridContainer = this.element.querySelector<HTMLElement>(
      '[data-testid="player-inventory-grid"]',
    );
    if (gridContainer !== null) {
      this.grid.renderInto(gridContainer, inventory);
    }
  }
}
