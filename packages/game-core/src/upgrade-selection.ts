import type { UpgradeDefinition } from '@village-survivor/content';

import type { SeededRandom } from './random.js';

export function selectWeightedUpgrades(
  upgrades: readonly UpgradeDefinition[],
  selectedUpgradeIds: readonly string[],
  count: number,
  random: SeededRandom,
): UpgradeDefinition[] {
  const selected = new Set(selectedUpgradeIds);
  const candidates = upgrades.filter((upgrade) => !selected.has(upgrade.id));
  const choices: UpgradeDefinition[] = [];

  while (choices.length < count && candidates.length > 0) {
    const totalWeight = candidates.reduce((sum, upgrade) => sum + upgrade.weight, 0);
    const roll = random.between(0, totalWeight);
    let cumulativeWeight = 0;
    let selectedIndex = candidates.length - 1;

    for (let index = 0; index < candidates.length; index += 1) {
      cumulativeWeight += candidates[index]!.weight;
      if (roll < cumulativeWeight) {
        selectedIndex = index;
        break;
      }
    }

    const [choice] = candidates.splice(selectedIndex, 1);
    if (choice !== undefined) {
      choices.push(choice);
    }
  }

  return choices;
}
