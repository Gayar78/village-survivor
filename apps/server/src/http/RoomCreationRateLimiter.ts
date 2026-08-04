export interface RoomCreationRateLimiter {
  allow(userId: string, nowMs: number): boolean;
}

/** Limite en mémoire adaptée au petit roster LAN ; aucune identité n'est journalisée. */
export class SlidingWindowRoomCreationRateLimiter implements RoomCreationRateLimiter {
  private readonly attemptsByUserId = new Map<string, number[]>();

  public constructor(
    private readonly limit = 5,
    private readonly windowMs = 60_000,
  ) {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs <= 0) {
      throw new Error('Configuration de limitation de création invalide.');
    }
  }

  public allow(userId: string, nowMs: number): boolean {
    const previous = this.attemptsByUserId.get(userId) ?? [];
    const active = previous.filter((timestamp) => timestamp > nowMs - this.windowMs);
    if (active.length >= this.limit) {
      this.attemptsByUserId.set(userId, active);
      return false;
    }
    active.push(nowMs);
    this.attemptsByUserId.set(userId, active);
    return true;
  }
}
