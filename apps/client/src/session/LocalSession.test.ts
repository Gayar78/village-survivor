import type { GameSession, PublicGameState } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { LocalSession, type FrameScheduler } from './LocalSession.js';

class ManualScheduler implements FrameScheduler {
  private callback: ((timestamp: number) => void) | undefined;
  private timestamp = 0;
  public cancelled = false;

  public now(): number {
    return this.timestamp;
  }

  public request(callback: (timestamp: number) => void): number {
    this.callback = callback;
    return 1;
  }

  public cancel(): void {
    this.cancelled = true;
    this.callback = undefined;
  }

  public frame(milliseconds: number): void {
    this.timestamp += milliseconds;
    const callback = this.callback;
    this.callback = undefined;
    callback?.(this.timestamp);
  }
}

describe('LocalSession GameSession contract', () => {
  it('publishes serializable state while advancing fixed ticks', async () => {
    const scheduler = new ManualScheduler();
    const session: GameSession = new LocalSession({ seed: 'contract', scheduler });
    const ticks: number[] = [];
    const unsubscribe = session.subscribe((state) => ticks.push(state.tick));
    await session.start();
    session.sendInput({ sequence: 1, moveX: 1, moveY: 0 });
    scheduler.frame(125);

    expect(ticks.at(-1)).toBe(2);
    unsubscribe();
    await session.stop();
    expect(scheduler.cancelled).toBe(true);
  });

  it('exposes deterministic development controls through a separate capability', async () => {
    const scheduler = new ManualScheduler();
    const session = new LocalSession({ seed: 'debug', scheduler });
    await session.start();
    session.debug.giveResources(9);
    session.debug.giveExperience(20);
    session.debug.skipToNight();

    const state = session.debug.getState();
    const villageWood = state.village.inventory.reduce(
      (total, slot) => (slot !== undefined && slot.resourceType === 'wood' ? total + slot.quantity : total),
      0,
    );
    expect(villageWood).toBe(9);
    expect(state.player.level).toBe(2);
    expect(state.phase).toBe('night');
    await session.stop();
  });

  it('delivers the events of every tick when a single frame advances several', async () => {
    const scheduler = new ManualScheduler();
    const session = new LocalSession({ seed: 'multi-tick-events', scheduler });
    const published: PublicGameState[] = [];
    session.subscribe((state) => published.push(state));
    await session.start();

    const guardian = session.debug.getState().enemies[0]!;
    session.debug.teleportPlayer({
      x: guardian.position.x + 25,
      y: guardian.position.y,
    });
    session.debug.setGameSpeed(10);
    published.length = 0;
    scheduler.frame(250);

    expect(published).toHaveLength(1);
    const events = published[0]!.events;
    const sourceTicks = new Set(events.map((event) => event.tick));
    expect(sourceTicks.size).toBeGreaterThan(1);
    await session.stop();
  });

  it('keeps one-shot actions queued until the next simulation tick', async () => {
    const scheduler = new ManualScheduler();
    const session = new LocalSession({ seed: 'queued-input', scheduler });
    await session.start();
    session.debug.giveResources(6);
    session.debug.teleportPlayer({ x: 140, y: 0 });
    session.sendInput({ sequence: 1, moveX: 0, moveY: 0, buildDefense: true });
    session.sendInput({ sequence: 2, moveX: 0, moveY: 0 });
    scheduler.frame(50);

    expect(session.debug.getState().defenses).toHaveLength(1);
    expect(session.debug.getState().defenses[0]?.built).toBe(false);
    await session.stop();
  });
});
