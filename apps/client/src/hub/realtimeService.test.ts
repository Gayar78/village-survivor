import { describe, expect, it } from 'vitest';

import { isActiveGameDescriptor } from './realtimeService.js';

describe('active co-op game descriptor', () => {
  const valid = {
    seed: 'a1b2c3d4',
    code: 'TEAMCODE',
    hostId: 'host',
    roster: [
      { id: 'host', name: 'Host' },
      { id: 'guest', name: 'Guest' },
    ],
  };

  it('accepts the minimal reconnect descriptor only', () => {
    expect(isActiveGameDescriptor(valid)).toBe(true);
    expect(isActiveGameDescriptor({ ...valid, roster: [{ id: 'host', name: 'Host' }] })).toBe(
      false,
    );
    expect(
      isActiveGameDescriptor({
        ...valid,
        roster: [
          { id: 'host', name: 'Host' },
          { id: 'host', name: 'Duplicate' },
        ],
      }),
    ).toBe(false);
    expect(isActiveGameDescriptor({ ...valid, code: '' })).toBe(false);
    expect(isActiveGameDescriptor({ ...valid, roster: 'not-a-roster' })).toBe(false);
  });
});
