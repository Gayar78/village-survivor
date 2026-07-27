import { defaultContent } from '@village-survivor/content';
import type {
  InventorySlot,
  PlayerInput,
  PublicGameState,
  ResourceType,
} from '@village-survivor/protocol';

import type { LocalSession } from '../session/LocalSession.js';
import { InventoryGrid } from './InventoryGrid.js';

/**
 * Texte exact publié par la simulation dans `interactionHint` quand le joueur
 * est à portée du village et qu'aucun autre indice prioritaire (ressource,
 * baliste) ne s'applique. `GameScene` s'appuie sur cette même constante pour
 * éviter d'envoyer `interact: true` quand ce texte est affiché : cette
 * pression sur E est entièrement gérée ici, côté client, pour ouvrir la vue
 * d'échange plutôt que de déclencher une récolte ou une réparation.
 */
export const VILLAGE_TRADE_HINT = 'E — Échanger avec le village';

/** Ordre d'affichage stable du résumé multi-ressources du stock du village. */
const RESOURCE_SUMMARY_ORDER: readonly ResourceType[] = [
  'wood',
  'stone',
  'iron',
  'gold',
  'diamond',
];

/** Noms courts affichés dans le résumé du stock (dupliqués localement, cf. contrat). */
const RESOURCE_LABELS: Readonly<Record<ResourceType, string>> = {
  wood: 'Bois',
  stone: 'Pierre',
  iron: 'Fer',
  gold: 'Or',
  diamond: 'Diamant',
};

/**
 * Vue d'échange villageois (ouverte/fermée par E quand `interactionHint`
 * vaut `VILLAGE_TRADE_HINT`, ou par Échap) : deux grilles côte à côte (village à
 * gauche ~20px, joueur à droite ~20px), server-authoritative, avec glisser-déposer
 * bidirectionnel + Maj+clic et un panneau d'amélioration du Cœur. Non-modale
 * comme le reste de l'UI : la simulation continue derrière.
 *
 * Sémantique des transferts (cf. contrat game-core) :
 *  - déposer une pile joueur dans le village → `depositSlot` (index côté joueur) ;
 *  - retirer une pile village vers le joueur → `withdrawSlot` (index côté village,
 *    clampé à 8 unités côté serveur) ;
 *  - « Tout déposer » → `depositAll: true`.
 *
 * Le bouton « Tout reprendre » côté village a été RETIRÉ : avec 5 ressources et
 * un plafond de 8 unités par case du joueur, un retrait global n'a plus de
 * traduction simple en une seule entrée. Le retrait se fait désormais pile par
 * pile, via glisser-déposer ou Maj+clic sur une case du village.
 */
export class VillageTrade {
  private readonly element: HTMLElement;
  private readonly session: LocalSession;
  private readonly playerGrid = new InventoryGrid({
    id: 'player',
    handlers: {
      // Une pile lâchée sur la grille joueur vient forcément du village = retrait.
      onDropFromOther: (sourceSlotIndex, sourceGridId) => {
        if (sourceGridId === 'village') {
          this.withdraw(sourceSlotIndex);
        }
      },
      onShiftClickStack: (slotIndex) => this.deposit(slotIndex),
    },
  });
  private readonly villageGrid = new InventoryGrid({
    id: 'village',
    handlers: {
      // Une pile lâchée sur la grille village vient forcément du joueur = dépôt.
      // `targetSlotIndex` est ignoré : le serveur choisit lui-même la case de
      // fusion/dépôt côté village (cf. contrat).
      onDropFromOther: (sourceSlotIndex, sourceGridId) => {
        if (sourceGridId === 'player') {
          this.deposit(sourceSlotIndex);
        }
      },
      onShiftClickStack: (slotIndex) => this.withdraw(slotIndex),
    },
  });
  private open = false;
  private showUpgradeConfirm = false;
  private latestState: PublicGameState | undefined;
  private sequence = 0;
  /** `true` quand une amélioration du Cœur est encore possible (heartLevel < 3). */
  private canOpenUpgrade = false;
  /** `true` quand le stock de bois du village couvre le coût de la prochaine amélioration. */
  private canAffordUpgrade = false;
  /** Handler clavier scopé : n'est branché que pendant que la vue est ouverte. */
  private readonly onKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event);

  public constructor(element: HTMLElement, session: LocalSession) {
    this.element = element;
    this.session = session;
  }

  /**
   * Navigation clavier, active uniquement pendant que la vue d'échange est
   * ouverte (le listener est ajouté à `show()` et retiré à `close()`), afin de ne
   * jamais entrer en conflit avec les touches 1/2/3 du panneau d'améliorations F.
   *  - Digit2 (touche « é/2 ») sur la grille du village → ouvre la confirmation ;
   *  - Enter sur la confirmation → lance l'amélioration si le coût est atteignable ;
   *  - Digit1 (touche « &/1 ») sur la confirmation → revient à la grille du village.
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.open) {
      return;
    }
    if (!this.showUpgradeConfirm) {
      if (event.code === 'Digit2' && this.canOpenUpgrade) {
        event.preventDefault();
        this.showUpgradeConfirm = true;
        this.render();
      }
      return;
    }
    if (event.code === 'Enter') {
      event.preventDefault();
      if (this.canAffordUpgrade) {
        this.send({ upgradeHeart: true });
      }
    } else if (event.code === 'Digit1') {
      event.preventDefault();
      this.showUpgradeConfirm = false;
      this.render();
    }
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
    this.showUpgradeConfirm = false;
    this.element.classList.add('village-trade--open');
    window.addEventListener('keydown', this.onKeyDown);
    this.render();
  }

  public close(): void {
    this.open = false;
    window.removeEventListener('keydown', this.onKeyDown);
    this.element.classList.remove('village-trade--open');
  }

  /** Appelé à chaque publication d'état ; ne redessine que si le panneau est ouvert. */
  public update(state: PublicGameState): void {
    this.latestState = state;
    if (this.open) {
      this.render();
    }
  }

  /**
   * Envoie une entrée sans déplacement : cette vue est ouverte alors que la
   * simulation continue de tourner, mais le clavier reste maître du mouvement
   * (`GameScene` republie moveX/moveY à chaque frame de toute façon).
   */
  private send(partial: Partial<PlayerInput>): void {
    this.sequence += 1;
    this.session.sendInput({ sequence: this.sequence, moveX: 0, moveY: 0, ...partial });
  }

  /** Transfère toute la pile de la case `slotIndex` du joueur vers le village. */
  private deposit(slotIndex: number): void {
    if (slotIndex < 0) {
      return;
    }
    this.send({ depositSlot: slotIndex });
  }

  /** Transfère (jusqu'à 8 unités, clampé serveur) la case `slotIndex` du village vers le joueur. */
  private withdraw(slotIndex: number): void {
    if (slotIndex < 0) {
      return;
    }
    this.send({ withdrawSlot: slotIndex });
  }

  private depositAll(): void {
    this.send({ depositAll: true });
  }

  /** Somme, par ressource, les quantités présentes dans les cases du village. */
  private summarizeVillage(
    inventory: readonly (InventorySlot | undefined)[],
  ): { type: ResourceType; total: number }[] {
    const totals = new Map<ResourceType, number>();
    for (const slot of inventory) {
      if (slot === undefined) {
        continue;
      }
      totals.set(slot.resourceType, (totals.get(slot.resourceType) ?? 0) + slot.quantity);
    }
    return RESOURCE_SUMMARY_ORDER.map((type) => ({ type, total: totals.get(type) ?? 0 })).filter(
      (entry) => entry.total > 0,
    );
  }

  private render(): void {
    const state = this.latestState;
    if (state === undefined) {
      return;
    }

    const villageInventory = state.village.inventory;
    const playerInventory = state.player.inventory;
    const summary = this.summarizeVillage(villageInventory);
    const summaryText =
      summary.length === 0
        ? 'Stock vide'
        : summary.map((entry) => `${RESOURCE_LABELS[entry.type]} ×${entry.total}`).join(', ');

    // Le coût d'amélioration du Cœur reste libellé EN BOIS : on somme les cases
    // `wood` du village (plus de champ scalaire `storedWood`).
    const villageWood = summary.find((entry) => entry.type === 'wood')?.total ?? 0;
    const heartLevel = state.village.heartLevel;
    const nextCost =
      heartLevel === 1
        ? defaultContent.village.levelTwoCost
        : heartLevel === 2
          ? defaultContent.village.ultimateCost
          : undefined;
    // Conditions supplémentaires de l'activation finale (heartLevel === 2 → 3),
    // vérifiées côté simulation : sans elles, cliquer « Go » ne déclenche RIEN
    // (aucune consommation de bois). On les reflète donc dans l'état du bouton.
    const hasOperationalBaliste = state.defenses.some((defense) => defense.built);
    const requiredPlayerLevel = defaultContent.village.ultimateMinimumPlayerLevel;
    const hasRequiredLevel = state.player.level >= requiredPlayerLevel;
    const hasEnoughWood = nextCost !== undefined && villageWood >= nextCost;
    const isFinalActivation = heartLevel === 2;
    const canAffordUpgrade =
      nextCost !== undefined &&
      hasEnoughWood &&
      (!isFinalActivation || (hasOperationalBaliste && hasRequiredLevel));
    // Message précisant CE QUI MANQUE quand le bouton « Go » est désactivé.
    const missingReasons: string[] = [];
    if (nextCost !== undefined && !hasEnoughWood) {
      missingReasons.push(`${nextCost - villageWood} bois manquants`);
    }
    if (isFinalActivation && !hasOperationalBaliste) {
      missingReasons.push('Il vous faut une baliste opérationnelle');
    }
    if (isFinalActivation && !hasRequiredLevel) {
      missingReasons.push(`Niveau ${requiredPlayerLevel} requis`);
    }
    // Mémorisés pour le handler clavier (Digit2 / Enter / Digit1).
    this.canOpenUpgrade = nextCost !== undefined;
    this.canAffordUpgrade = canAffordUpgrade;
    const playerHasStacks = playerInventory.some((slot) => slot !== undefined);

    this.element.innerHTML = `
      <div class="side-panel side-panel--village">
        ${
          this.showUpgradeConfirm
            ? this.renderUpgradeConfirm(nextCost, villageWood, canAffordUpgrade, missingReasons)
            : this.renderVillagePanel(summaryText)
        }
      </div>
      <div class="side-panel side-panel--player">
        <div class="side-panel__header">
          <h2>Vous</h2>
          <p>${summaryLabel(playerInventory)}</p>
        </div>
        <div class="inv-grid" data-testid="player-inventory-grid"></div>
        <div class="side-panel__actions">
          <button type="button" id="village-trade-deposit-all" ${playerHasStacks ? '' : 'disabled'}>Tout déposer</button>
        </div>
      </div>
    `;

    if (this.showUpgradeConfirm) {
      this.element.querySelector('#village-trade-upgrade-go')?.addEventListener('click', () => {
        if (canAffordUpgrade) {
          this.send({ upgradeHeart: true });
        }
      });
    } else {
      const villageGridContainer = this.element.querySelector<HTMLElement>(
        '[data-testid="village-inventory-grid"]',
      );
      if (villageGridContainer !== null) {
        this.villageGrid.renderInto(villageGridContainer, villageInventory);
      }
    }

    const playerGridContainer = this.element.querySelector<HTMLElement>(
      '[data-testid="player-inventory-grid"]',
    );
    if (playerGridContainer !== null) {
      this.playerGrid.renderInto(playerGridContainer, playerInventory);
    }
    this.element.querySelector('#village-trade-deposit-all')?.addEventListener('click', () => {
      this.depositAll();
    });
  }

  private renderVillagePanel(summaryText: string): string {
    // Plus de bouton « Tout reprendre » ni de bouton « A » ici : l'ouverture de la
    // confirmation d'amélioration passe désormais par la touche 2 (cf. handleKeyDown).
    // Le retrait se fait case par case via glisser-déposer / Maj+clic.
    return `
      <div class="side-panel__header">
        <h2>Village</h2>
        <p>${summaryText}</p>
      </div>
      <div class="inv-grid" data-testid="village-inventory-grid"></div>
    `;
  }

  private renderUpgradeConfirm(
    nextCost: number | undefined,
    villageWood: number,
    canAfford: boolean,
    missingReasons: readonly string[],
  ): string {
    const missingHtml =
      !canAfford && missingReasons.length > 0
        ? `<p class="upgrade-confirm__missing">${missingReasons.join(' · ')}</p>`
        : '';
    return `
      <div class="side-panel__header side-panel__header--upgrade">
        <h2>Améliorer le Cœur</h2>
      </div>
      <div class="upgrade-confirm">
        <p>Voulez-vous améliorer le village ?</p>
        <p class="upgrade-confirm__cost">${nextCost ?? 0} bois nécessaires, prélevés sur le stock du village (${villageWood} bois disponibles).</p>
        <button type="button" id="village-trade-upgrade-go" ${canAfford ? '' : 'disabled'}>Go</button>
        ${missingHtml}
      </div>
    `;
  }
}

/** Sous-titre du panneau joueur : nombre de cases occupées sur le total. */
function summaryLabel(inventory: readonly (InventorySlot | undefined)[]): string {
  const occupied = inventory.reduce((count, slot) => (slot === undefined ? count : count + 1), 0);
  return `${occupied} / ${inventory.length} cases occupées`;
}
