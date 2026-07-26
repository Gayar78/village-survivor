import { defaultContent } from '@village-survivor/content';
import { describe, expect, it } from 'vitest';

import { SeededRandom } from '../src/random.js';
import { selectWeightedUpgrades } from '../src/upgrade-selection.js';

class FixedRandom extends SeededRandom {
  public constructor(private readonly ratio: number) {
    super('fixed-random');
  }

  public override between(minimum: number, maximum: number): number {
    return minimum + (maximum - minimum) * this.ratio;
  }
}

describe('weighted upgrade selection', () => {
  it('uses weights and samples without replacement', () => {
    const favoredId = defaultContent.upgrades.at(-1)!.id;
    const upgrades = defaultContent.upgrades.map((upgrade) => ({
      ...upgrade,
      weight: upgrade.id === favoredId ? 100 : 1,
    }));

    const choices = selectWeightedUpgrades(upgrades, [], 3, new FixedRandom(0.2));

    expect(choices[0]?.id).toBe(favoredId);
    expect(new Set(choices.map((choice) => choice.id)).size).toBe(3);
  });

  it('excludes upgrades already selected', () => {
    const selectedId = defaultContent.upgrades[0]!.id;
    const choices = selectWeightedUpgrades(
      defaultContent.upgrades,
      [selectedId],
      defaultContent.progression.upgradeChoiceCount,
      new SeededRandom('selected-upgrades'),
    );

    expect(choices.some((choice) => choice.id === selectedId)).toBe(false);
  });
});
