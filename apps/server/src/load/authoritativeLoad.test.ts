import type { TowerSimulation } from '@village-survivor/game-core';
import { describe, expect, it } from 'vitest';

import { TowerRoomRuntime } from '../runtime/TowerRoomRuntime.js';
import { syncTowerState, TowerStateSchema } from '../state/towerState.js';

const TICKS_IN_TWENTY_MINUTES = 20 * 60 * 20;
const TARGET_MONSTERS = 200;
const STATE_SAMPLE_INTERVAL_TICKS = 20;

function percentile(values: readonly number[], ratio: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * ratio))] ?? 0;
}

describe('charge longue du serveur autoritaire', () => {
  it('simule vingt minutes, quatre joueurs et deux cents monstres dans les budgets', () => {
    const playerIds = ['load-1', 'load-2', 'load-3', 'load-4'];
    const runtime = new TowerRoomRuntime({
      seed: 'server-load-20-minutes',
      expectedUserIds: playerIds,
      metaBuildsByPlayerId: Object.fromEntries(
        playerIds.map((playerId) => [
          playerId,
          {
            damageMultiplier: 1,
            fireRateMultiplier: 1,
            moveSpeedMultiplier: 1,
            maxHealthMultiplier: 1,
            heartMaxHealthMultiplier: 1,
            pickupRadiusMultiplier: 1,
          },
        ]),
      ),
    });
    for (const playerId of playerIds) expect(runtime.admit(playerId, 0)).toBe(true);
    const simulation = (runtime as unknown as { simulation: TowerSimulation }).simulation;
    // Le test mesure la charge d'une room longue, pas l'équilibrage : cette mutation reste
    // strictement dans le harnais pour empêcher une défaite d'écourter les 24 000 ticks.
    const durable = simulation as unknown as {
      heart: { hp: number; maxHp: number };
      players: Array<{ hp: number; maxHp: number }>;
      monsters: Array<unknown>;
      scraps: Array<unknown>;
    };
    durable.heart.hp = durable.heart.maxHp = 1_000_000_000;
    for (const player of durable.players) player.hp = player.maxHp = 1_000_000_000;
    const schema = new TowerStateSchema();
    const durations: number[] = [];
    const patchSizes: number[] = [];
    let maxScraps = 0;

    for (let tick = 1; tick <= TICKS_IN_TWENTY_MINUTES; tick += 1) {
      for (let index = durable.monsters.length; index < TARGET_MONSTERS; index += 1) {
        const angle = (index / TARGET_MONSTERS) * Math.PI * 2;
        simulation.spawnMonster('runner', {
          x: Math.cos(angle) * 4_000,
          y: Math.sin(angle) * 4_000,
        });
      }
      const nowMs = tick * 50;
      for (const playerId of playerIds) {
        runtime.submitControl(
          playerId,
          { sequence: tick, moveX: 0, moveY: 0, aimX: 1, aimY: 0 },
          nowMs,
        );
      }
      const startedAt = performance.now();
      const result = runtime.step(nowMs);
      durations.push(performance.now() - startedAt);

      // Les vagues continuent de fonctionner pendant la charge. Le harnais borne leur
      // population pour mesurer le scénario demandé (200 monstres), au lieu de laisser
      // s'accumuler plusieurs milliers d'entités invulnérables autour du Cœur de test.
      if (durable.monsters.length > TARGET_MONSTERS) {
        durable.monsters.splice(TARGET_MONSTERS);
      }

      maxScraps = Math.max(maxScraps, durable.scraps.length);
      if (tick % STATE_SAMPLE_INTERVAL_TICKS === 0) {
        syncTowerState(schema, result.state, 'running');
        // La projection JSON est une borne supérieure conservatrice du patch différentiel
        // envoyé par Colyseus : le patch ne peut contenir davantage que l'état projeté.
        patchSizes.push(Buffer.byteLength(JSON.stringify(schema.toJSON()), 'utf8'));
      }
    }

    const p95TickMs = percentile(durations, 0.95);
    const p95PatchBytes = percentile(patchSizes, 0.95);
    console.info(
      `[server-load] ${TICKS_IN_TWENTY_MINUTES} ticks · tick p95 ${p95TickMs.toFixed(3)} ms · patch p95 ${String(Math.round(p95PatchBytes / 1024))} Kio · ferraille max ${maxScraps}`,
    );
    expect(runtime.snapshot().tick).toBe(TICKS_IN_TWENTY_MINUTES);
    expect(p95TickMs).toBeLessThan(1);
    expect(Math.max(...durations)).toBeLessThan(50);
    expect(p95PatchBytes).toBeLessThan(64 * 1024);
    expect(maxScraps).toBeLessThanOrEqual(TARGET_MONSTERS * 2);
  }, 120_000);
});
