import { describe, expect, it } from 'vitest';

import { SlidingWindowRoomCreationRateLimiter } from './RoomCreationRateLimiter.js';

describe('limitation de création de rooms', () => {
  it('borne chaque identité et rouvre la fenêtre après son expiration', () => {
    const limiter = new SlidingWindowRoomCreationRateLimiter(2, 1_000);
    expect(limiter.allow('user-1', 0)).toBe(true);
    expect(limiter.allow('user-1', 100)).toBe(true);
    expect(limiter.allow('user-1', 200)).toBe(false);
    expect(limiter.allow('user-2', 200)).toBe(true);
    expect(limiter.allow('user-1', 1_001)).toBe(true);
  });
});
