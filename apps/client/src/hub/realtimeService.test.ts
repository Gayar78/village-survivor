import { describe, expect, it } from 'vitest';

import {
  createHubPresencePayload,
  isActiveGameDescriptor,
  isLaunchPayload,
  type RealtimeSession,
} from './realtimeService.js';

describe('active co-op game descriptor', () => {
  const valid = { roomId: 'authoritative-room-id' };

  it('accepts the minimal reconnect descriptor only', () => {
    expect(isActiveGameDescriptor(valid)).toBe(true);
    expect(isActiveGameDescriptor({ roomId: '' })).toBe(false);
    expect(isActiveGameDescriptor({ roomId: 'ok', seed: 'leaked' })).toBe(false);
    expect(isActiveGameDescriptor({ roomId: 42 })).toBe(false);
  });

  it('accepts launch broadcasts containing only the room id', () => {
    expect(isLaunchPayload(valid)).toBe(true);
    expect(isLaunchPayload({ roomId: 'ok', roster: ['unexpected'] })).toBe(false);
    expect(isLaunchPayload(null)).toBe(false);
  });

  it('ne publie jamais les bonus persistants dans la présence du hub', () => {
    const legacy = {
      userId: 'member-1',
      displayName: 'Membre',
      metaBuild: { damageMultiplier: 2 },
    } as RealtimeSession;
    expect(createHubPresencePayload(legacy, false, 42)).toEqual({
      userId: 'member-1',
      displayName: 'Membre',
      isOwner: false,
      joinedAt: 42,
    });
  });
});
