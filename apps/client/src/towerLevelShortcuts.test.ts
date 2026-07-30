import { describe, expect, it } from 'vitest';

import {
  canQueueTowerLevelSelection,
  getTowerLevelShortcutIndex,
  isTowerLevelSelectionAcknowledged,
} from './towerLevelShortcuts.js';

describe('tour level shortcuts', () => {
  it.each([
    ['Digit1', '1', 0],
    ['Digit2', '2', 1],
    ['Digit3', '3', 2],
    ['Digit1', '&', 0],
    ['Digit2', 'é', 1],
    ['Digit3', '"', 2],
    ['Numpad1', '1', 0],
    ['Numpad2', '2', 1],
    ['Numpad3', '3', 2],
    ['Unidentified', '&', 0],
    ['Unidentified', 'é', 1],
    ['Unidentified', '"', 2],
  ])('maps %s / %s to card %i', (code, key, expected) => {
    expect(getTowerLevelShortcutIndex({ code, key })).toBe(expected);
  });

  it('rejects auto-repeat and any second selection while one is pending', () => {
    expect(canQueueTowerLevelSelection(false, false)).toBe(true);
    expect(canQueueTowerLevelSelection(true, false)).toBe(false);
    expect(canQueueTowerLevelSelection(false, true)).toBe(false);
  });

  it('keeps a selection pending until its authoritative offer disappears', () => {
    expect(isTowerLevelSelectionAcknowledged('offer-2', ['offer-1', 'offer-2', 'offer-3'])).toBe(
      false,
    );
    expect(isTowerLevelSelectionAcknowledged('offer-2', ['offer-4', 'offer-5', 'offer-6'])).toBe(
      true,
    );
  });
});
