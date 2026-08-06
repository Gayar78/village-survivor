import type { Logger } from '@opentelemetry/api-logs';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
  type MeterProvider,
} from '@opentelemetry/sdk-metrics';
import { describe, expect, it, vi } from 'vitest';

import {
  createServerMeterProvider,
  ServerLogger,
  TICK_DURATION_BUCKETS_MS,
} from './serverTelemetry.js';

function createTestMeterProvider(): {
  exporter: InMemoryMetricExporter;
  provider: MeterProvider;
} {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: 60_000,
  });
  return {
    exporter,
    provider: createServerMeterProvider({ readers: [reader] }),
  };
}

describe('observabilité serveur hors chemin critique', () => {
  it('respecte APP_LOG_LEVEL et ne produit aucune donnée sous le seuil', () => {
    const emit = vi.fn();
    const logger = new ServerLogger('warn', { emit } as unknown as Logger);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    logger.emit('info', 'ignoré');
    logger.emit('warn', 'conservé', { 'game.reason': 'test' });
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledOnce();
    info.mockRestore();
    warn.mockRestore();
  });

  it('expose des buckets capables de vérifier précisément le budget p95 de 3 ms', async () => {
    const { exporter, provider } = createTestMeterProvider();
    try {
      const histogram = provider
        .getMeter('village-survivor-server')
        .createHistogram('vs.game.tick.duration', { unit: 'ms' });
      for (const durationMs of [0.08, 0.2, 0.4, 0.7, 0.95, 1.1, 1.8, 2.2, 2.4, 12, 42]) {
        histogram.record(durationMs, { 'game.mode': 'solo', 'game.monsters': '0-50' });
      }

      await provider.forceFlush();
      const metric = exporter
        .getMetrics()
        .flatMap((resource) => resource.scopeMetrics)
        .flatMap((scope) => scope.metrics)
        .find((candidate) => candidate.descriptor.name === 'vs.game.tick.duration');
      const point = metric?.dataPoints[0] as
        { value: { buckets: { boundaries: readonly number[] } } } | undefined;

      expect(point?.value.buckets.boundaries).toEqual(TICK_DURATION_BUCKETS_MS);
      expect(TICK_DURATION_BUCKETS_MS).toContain(3);
      expect(TICK_DURATION_BUCKETS_MS.length).toBeLessThan(15);
    } finally {
      await provider.shutdown();
    }
  });

  it('garde le coût d’agrégation négligeable à vingt enregistrements par seconde', async () => {
    const { provider } = createTestMeterProvider();
    try {
      const histogram = provider
        .getMeter('village-survivor-server')
        .createHistogram('vs.game.tick.duration', { unit: 'ms' });
      const attributes = { 'game.mode': 'solo', 'game.monsters': '0-50' };
      for (let index = 0; index < 1_000; index += 1) histogram.record(0.5, attributes);

      const sampleCount = 200_000;
      const startedAt = performance.now();
      for (let index = 0; index < sampleCount; index += 1) {
        histogram.record((index % 100) / 100, attributes);
      }
      const microsecondsPerRecord = ((performance.now() - startedAt) * 1_000) / sampleCount;
      console.info(`[metrics] ${microsecondsPerRecord.toFixed(3)} µs/enregistrement`);

      // Une limite volontairement large évite les faux rouges sur un runner chargé. Même
      // 20 µs à 20 Hz ne consommeraient que 0,04 % d'une seconde CPU.
      expect(microsecondsPerRecord).toBeLessThan(20);
    } finally {
      await provider.shutdown();
    }
  });
});
