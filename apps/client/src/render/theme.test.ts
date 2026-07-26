import { describe, expect, it } from 'vitest';

import { PHASE_TRANSITION_MS, lerpColor, resolvePhaseVisuals } from './theme.js';

describe('lerpColor', () => {
  it('returns the bounds without drifting', () => {
    expect(lerpColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(lerpColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
  });

  it('interpolates each channel independently', () => {
    expect(lerpColor(0x000000, 0xff8000, 0.5)).toBe(0x804000);
  });

  it('clamps ratios outside of the unit range', () => {
    expect(lerpColor(0x102030, 0xffffff, -3)).toBe(0x102030);
    expect(lerpColor(0x102030, 0xffffff, 4)).toBe(0xffffff);
  });
});

describe('resolvePhaseVisuals', () => {
  it('keeps the plain phase colours outside of the transition window', () => {
    const early = resolvePhaseVisuals('day', PHASE_TRANSITION_MS * 3);
    const boundary = resolvePhaseVisuals('day', PHASE_TRANSITION_MS);
    expect(boundary).toEqual(early);
  });

  it('reaches the next phase exactly when the current one ends', () => {
    const dayEnd = resolvePhaseVisuals('day', 0);
    const night = resolvePhaseVisuals('night', PHASE_TRANSITION_MS * 3);
    expect(dayEnd).toEqual(night);
  });

  it('darkens progressively as night approaches', () => {
    const early = resolvePhaseVisuals('day', PHASE_TRANSITION_MS);
    const middle = resolvePhaseVisuals('day', PHASE_TRANSITION_MS / 2);
    const late = resolvePhaseVisuals('day', PHASE_TRANSITION_MS / 8);
    expect(middle.ground).toBeLessThan(early.ground);
    expect(late.ground).toBeLessThan(middle.ground);
  });

  it('cuts hard into the final phase because it is player-triggered', () => {
    const started = resolvePhaseVisuals('final', 90_000);
    const ending = resolvePhaseVisuals('final', 0);
    expect(ending).toEqual(started);
  });
});
