import type { GameContent } from '@village-survivor/content';
import type { Vector2 } from '@village-survivor/protocol';

import { distance } from './geometry.js';
import { countResource, removeResource } from './inventory.js';
import type { MutableDefense, MutableInventory, MutableVillage } from './state.js';

/**
 * Répare une baliste en payant le coût en bois d'abord depuis le stock du village,
 * puis, à défaut, depuis l'inventaire du joueur. Coût et effet inchangés.
 */
export function repairDefense(
  defense: MutableDefense,
  villageInventory: MutableInventory,
  playerInventory: MutableInventory,
  content: GameContent['defense'],
): boolean {
  if (!defense.built || defense.hp >= defense.maxHp) {
    return false;
  }
  const available =
    countResource(villageInventory, 'wood') + countResource(playerInventory, 'wood');
  if (available < content.repairCost) {
    return false;
  }
  const fromVillage = removeResource(villageInventory, 'wood', content.repairCost);
  removeResource(playerInventory, 'wood', content.repairCost - fromVillage);
  defense.hp = Math.min(defense.maxHp, defense.hp + content.repairAmount);
  return true;
}

export function canPlaceDefenseAt(
  position: Vector2,
  village: MutableVillage,
  defenses: readonly MutableDefense[],
  content: Pick<GameContent, 'defense' | 'village'>,
): boolean {
  const heartDistance = distance(position, village.position);
  if (
    heartDistance < content.defense.minimumHeartDistance ||
    heartDistance > content.village.areaRadius - content.defense.placementOuterMargin
  ) {
    return false;
  }
  return defenses.every(
    (defense) => distance(position, defense.position) >= content.defense.minimumSpacing,
  );
}

export function createDefense(
  id: string,
  position: Vector2,
  content: GameContent['defense'],
): MutableDefense {
  return {
    id,
    position: { ...position },
    built: false,
    hp: content.maxHp,
    maxHp: content.maxHp,
    cooldownRemainingMs: 0,
    buildRemainingMs: content.buildDurationMs,
  };
}
