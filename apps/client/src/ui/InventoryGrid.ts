/**
 * Grille d'inventaire générique (5 colonnes x 4 lignes = 20 cases), réutilisée
 * pour l'inventaire du joueur ET celui du village dans la vue d'échange.
 *
 * Server-authoritative : le composant affiche DIRECTEMENT le tableau de 20
 * `(InventorySlot | undefined)` fourni par l'appelant, À L'INDEX EXACT où chaque
 * case se trouve dans ce tableau. Le serveur (la simulation) décide seul quelle
 * case contient quoi ; il n'y a plus aucune logique de placement « première case
 * libre » ni de persistance `localStorage` des positions côté client.
 */

import type { InventorySlot, ResourceType } from '@village-survivor/protocol';

/** Ensemble des ressources connues, utilisé pour valider un payload de drag. */
const RESOURCE_TYPES: readonly ResourceType[] = ['wood', 'stone', 'iron', 'gold', 'diamond'];

/** Nom court affiché sous la pastille de couleur (dupliqué localement, cf. contrat). */
const RESOURCE_LABELS: Readonly<Record<ResourceType, string>> = {
  wood: 'Bois',
  stone: 'Pierre',
  iron: 'Fer',
  gold: 'Or',
  diamond: 'Diamant',
};

export interface InventoryGridHandlers {
  /**
   * Une pile déposée ici en provenance d'une AUTRE grille (transfert). On reçoit
   * l'index de la case SOURCE, l'identifiant de la grille source, et l'index de
   * la case cible dans CETTE grille (à la disposition de l'appelant).
   */
  onDropFromOther?: (sourceSlotIndex: number, sourceGridId: string, targetSlotIndex: number) => void;
  /** Maj+clic sur une pile occupée : raccourci pour un transfert complet de cette case. */
  onShiftClickStack?: (slotIndex: number) => void;
}

export interface InventoryGridOptions {
  /** Identifiant unique de la grille (ex: 'player', 'village'), porté par le drag. */
  id: string;
  columns?: number;
  rows?: number;
  handlers?: InventoryGridHandlers;
}

interface DragPayload {
  gridId: string;
  slotIndex: number;
  resourceType: ResourceType;
  quantity: number;
}

const DRAG_MIME = 'application/x-village-survivor-stack';

function isResourceType(value: unknown): value is ResourceType {
  return typeof value === 'string' && (RESOURCE_TYPES as readonly string[]).includes(value);
}

function parseDragPayload(raw: string): DragPayload | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.gridId === 'string' &&
      typeof record.slotIndex === 'number' &&
      Number.isInteger(record.slotIndex) &&
      isResourceType(record.resourceType) &&
      typeof record.quantity === 'number'
    ) {
      return {
        gridId: record.gridId,
        slotIndex: record.slotIndex,
        resourceType: record.resourceType,
        quantity: record.quantity,
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export class InventoryGrid {
  private readonly id: string;
  private readonly columns: number;
  private readonly rows: number;
  private readonly handlers: InventoryGridHandlers;

  public constructor(options: InventoryGridOptions) {
    this.id = options.id;
    this.columns = options.columns ?? 5;
    this.rows = options.rows ?? 4;
    this.handlers = options.handlers ?? {};
  }

  /**
   * (Re)construit entièrement la grille dans `container`. Chaque case `index` du
   * DOM affiche exactement `slots[index]` : aucune re-position côté client.
   */
  public renderInto(container: HTMLElement, slots: readonly (InventorySlot | undefined)[]): void {
    const totalSlots = this.columns * this.rows;
    container.innerHTML = '';
    container.classList.add('inv-grid__slots');
    for (let index = 0; index < totalSlots; index += 1) {
      container.append(this.buildSlot(index, slots[index]));
    }
  }

  private buildSlot(index: number, slot: InventorySlot | undefined): HTMLElement {
    const slotElement = document.createElement('div');
    slotElement.className = 'inv-grid__slot';
    slotElement.dataset.slotIndex = String(index);

    if (slot !== undefined && slot.quantity > 0) {
      const { resourceType, quantity } = slot;
      slotElement.classList.add('inv-grid__slot--occupied');
      slotElement.draggable = true;
      slotElement.dataset.resourceType = resourceType;
      slotElement.innerHTML = `
        <div class="inv-grid__stack">
          <span class="inv-grid__stack-icon inv-grid__stack-icon--${resourceType}"></span>
          <strong class="inv-grid__stack-qty">${quantity}</strong>
          <small class="inv-grid__stack-label">${RESOURCE_LABELS[resourceType]}</small>
        </div>
      `;
      slotElement.addEventListener('dragstart', (event) => {
        const payload: DragPayload = {
          gridId: this.id,
          slotIndex: index,
          resourceType,
          quantity,
        };
        event.dataTransfer?.setData(DRAG_MIME, JSON.stringify(payload));
        event.dataTransfer?.setData('text/plain', String(quantity));
        if (event.dataTransfer !== null) {
          event.dataTransfer.effectAllowed = 'move';
        }
      });
      slotElement.addEventListener('click', (event) => {
        if (!event.shiftKey) {
          return;
        }
        this.handlers.onShiftClickStack?.(index);
      });
    }

    slotElement.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer !== null) {
        event.dataTransfer.dropEffect = 'move';
      }
      slotElement.classList.add('inv-grid__slot--drop-target');
    });
    slotElement.addEventListener('dragleave', () => {
      slotElement.classList.remove('inv-grid__slot--drop-target');
    });
    slotElement.addEventListener('drop', (event) => {
      event.preventDefault();
      slotElement.classList.remove('inv-grid__slot--drop-target');
      const raw = event.dataTransfer?.getData(DRAG_MIME);
      if (raw === undefined || raw === '') {
        return;
      }
      const payload = parseDragPayload(raw);
      if (payload === undefined) {
        return;
      }
      if (payload.gridId === this.id) {
        // Réordonnancement au sein d'une même grille : la position des cases est
        // désormais autoritaire côté serveur, donc ce cas n'a plus de sens. On
        // l'ignore volontairement (no-op).
        return;
      }
      this.handlers.onDropFromOther?.(payload.slotIndex, payload.gridId, index);
    });

    return slotElement;
  }
}
