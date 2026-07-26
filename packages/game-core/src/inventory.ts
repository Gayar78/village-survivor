import type { ResourceType } from '@village-survivor/protocol';
import { INVENTORY_SIZE, PLAYER_STACK_SIZE } from '@village-survivor/protocol';

import type { MutableInventory } from './state.js';

/** Plafond « illimité » pour l'inventaire du village (aucune borne par case). */
export const UNLIMITED_STACK = Number.POSITIVE_INFINITY;

/** Crée un inventaire vide de longueur fixe INVENTORY_SIZE. */
export function createInventory(): MutableInventory {
  return new Array<undefined>(INVENTORY_SIZE).fill(undefined);
}

/**
 * Ajoute une unité d'un type donné : d'abord dans une pile existante compatible avec
 * de la place, sinon dans la première case vide. Retourne `false` (gain perdu) si
 * aucune pile compatible ni case vide n'est disponible.
 */
export function addToInventory(
  inventory: MutableInventory,
  resourceType: ResourceType,
  stackCap: number,
): boolean {
  for (const slot of inventory) {
    if (slot !== undefined && slot.resourceType === resourceType && slot.quantity < stackCap) {
      slot.quantity += 1;
      return true;
    }
  }
  for (let index = 0; index < inventory.length; index += 1) {
    if (inventory[index] === undefined) {
      inventory[index] = { resourceType, quantity: 1 };
      return true;
    }
  }
  return false;
}

/** Y a-t-il de la place pour au moins une unité de `resourceType` ? */
export function hasRoomFor(
  inventory: MutableInventory,
  resourceType: ResourceType,
  stackCap: number,
): boolean {
  for (const slot of inventory) {
    if (slot === undefined) {
      return true;
    }
    if (slot.resourceType === resourceType && slot.quantity < stackCap) {
      return true;
    }
  }
  return false;
}

/** Quantité totale d'un type donné, toutes cases confondues. */
export function countResource(inventory: MutableInventory, resourceType: ResourceType): number {
  let total = 0;
  for (const slot of inventory) {
    if (slot !== undefined && slot.resourceType === resourceType) {
      total += slot.quantity;
    }
  }
  return total;
}

/**
 * Retire jusqu'à `amount` unités d'un type, case par case. Retourne la quantité
 * réellement retirée (peut être inférieure si le stock est insuffisant).
 */
export function removeResource(
  inventory: MutableInventory,
  resourceType: ResourceType,
  amount: number,
): number {
  let remaining = amount;
  for (let index = 0; index < inventory.length && remaining > 0; index += 1) {
    const slot = inventory[index];
    if (slot === undefined || slot.resourceType !== resourceType) {
      continue;
    }
    const taken = Math.min(slot.quantity, remaining);
    slot.quantity -= taken;
    remaining -= taken;
    if (slot.quantity <= 0) {
      inventory[index] = undefined;
    }
  }
  return amount - remaining;
}

/**
 * Ajoute une quantité arbitraire d'un type dans un inventaire sans plafond (village) :
 * fusionne dans une pile existante du même type, sinon crée une nouvelle case.
 * Retourne `false` si aucune case n'est disponible.
 */
export function mergeIntoUnlimited(
  inventory: MutableInventory,
  resourceType: ResourceType,
  quantity: number,
): boolean {
  if (quantity <= 0) {
    return true;
  }
  for (const slot of inventory) {
    if (slot !== undefined && slot.resourceType === resourceType) {
      slot.quantity += quantity;
      return true;
    }
  }
  for (let index = 0; index < inventory.length; index += 1) {
    if (inventory[index] === undefined) {
      inventory[index] = { resourceType, quantity };
      return true;
    }
  }
  return false;
}

export { INVENTORY_SIZE, PLAYER_STACK_SIZE };
