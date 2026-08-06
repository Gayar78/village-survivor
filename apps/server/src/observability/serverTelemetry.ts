import {
  context,
  metrics,
  propagation,
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  type Attributes,
  type Counter,
  type Histogram,
  type Span,
  type UpDownCounter,
} from '@opentelemetry/api';
import { logs, SeverityNumber, type Logger } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import {
  AggregationType,
  MeterProvider,
  PeriodicExportingMetricReader,
  type MeterProviderOptions,
  type ViewOptions,
} from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_TELEMETRY_SDK_LANGUAGE,
} from '@opentelemetry/semantic-conventions';

import type { ServerConfig } from '../config.js';

const SCOPE = 'village-survivor-server';
const EXPORT_TIMEOUT_MS = 2_000;
const EXPORT_INTERVAL_MS = 10_000;

// Le budget produit est p95 < 3 ms. Les répétitions locales après le lot Torri vont
// de 1,863 à 2,779 ms (la CI est passée de 0,138 à 1,505 ms) : les frontières restent
// donc resserrées autour de 3 ms plutôt qu'autour de 1 ms. Elles sont quatorze,
// moins nombreuses que les quinze frontières par défaut, sans travail supplémentaire
// par tick.
export const TICK_DURATION_BUCKETS_MS = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 5, 10, 50,
] as const;

export function createServerMetricViews(): ViewOptions[] {
  return [
    {
      instrumentName: 'vs.game.tick.duration',
      meterName: SCOPE,
      aggregation: {
        type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
        options: {
          boundaries: [...TICK_DURATION_BUCKETS_MS],
          // Prometheus n'expose pas min/max et leur calcul ne doit pas charger la boucle.
          recordMinMax: false,
        },
      },
    },
  ];
}

type ServerMeterProviderOptions = Pick<MeterProviderOptions, 'readers' | 'resource'>;

/** Fabrique unique partagée par la production et les tests de contrat. */
export function createServerMeterProvider(options: ServerMeterProviderOptions): MeterProvider {
  return new MeterProvider({ ...options, views: createServerMetricViews() });
}

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
type LogLevel = (typeof LEVELS)[number];

const SEVERITY: Readonly<Record<LogLevel, SeverityNumber>> = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

interface Instruments {
  activeRooms: UpDownCounter;
  players: UpDownCounter;
  roomDuration: Histogram;
  tickDuration: Histogram;
  tickLag: Histogram;
  patchSize: Histogram;
  rejectedCommands: Counter;
  reconnects: Counter;
  scrapEntities: Histogram;
  goldCredits: Counter;
}

function monstersBucket(count: number): string {
  if (count < 50) return '0-50';
  if (count < 100) return '50-100';
  if (count < 200) return '100-200';
  return '200+';
}

function createInstruments(): Instruments {
  const meter = metrics.getMeter(SCOPE);
  return {
    activeRooms: meter.createUpDownCounter('vs.game.rooms.active'),
    players: meter.createUpDownCounter('vs.game.players.active'),
    roomDuration: meter.createHistogram('vs.game.room.duration', { unit: 'ms' }),
    tickDuration: meter.createHistogram('vs.game.tick.duration', { unit: 'ms' }),
    tickLag: meter.createHistogram('vs.game.tick.lag', { unit: 'ms' }),
    patchSize: meter.createHistogram('vs.game.patch.size', { unit: 'By' }),
    rejectedCommands: meter.createCounter('vs.game.command.rejected'),
    reconnects: meter.createCounter('vs.game.reconnection'),
    scrapEntities: meter.createHistogram('vs.game.scrap.entities'),
    goldCredits: meter.createCounter('vs.game.gold.credits'),
  };
}

export class ServerLogger {
  private readonly threshold: number;

  public constructor(
    level: LogLevel,
    private readonly otelLogger: Logger = logs.getLogger(SCOPE),
  ) {
    this.threshold = LEVELS.indexOf(level);
  }

  public emit(level: LogLevel, message: string, attributes: Attributes = {}, span?: Span): void {
    if (LEVELS.indexOf(level) < this.threshold) return;
    const spanContext = span?.spanContext();
    const correlation =
      spanContext !== undefined && trace.isSpanContextValid(spanContext)
        ? { trace_id: spanContext.traceId, span_id: spanContext.spanId }
        : {};
    const fields = { ...attributes, ...correlation };
    const method = level === 'fatal' ? 'error' : level === 'trace' ? 'debug' : level;
    console[method](`[game-server] ${message}`, fields);
    this.otelLogger.emit({
      body: message,
      severityNumber: SEVERITY[level],
      severityText: level.toUpperCase(),
      attributes: fields,
      ...(span === undefined ? {} : { context: trace.setSpan(context.active(), span) }),
    });
  }
}

export class RoomTelemetry {
  private readonly startedAt = performance.now();
  private readonly root: Span;
  private disposed = false;
  private outcome?: 'defeat' | 'abandoned';

  public constructor(
    private readonly instruments: Instruments,
    private readonly logger: ServerLogger,
    private readonly mode: 'solo' | 'coop',
    expectedPlayers: number,
    traceParent?: string,
  ) {
    const parent =
      traceParent === undefined
        ? ROOT_CONTEXT
        : propagation.extract(ROOT_CONTEXT, { traceparent: traceParent });
    this.root = trace
      .getTracer(SCOPE)
      .startSpan(
        'game.room',
        { attributes: { 'game.mode': this.mode, 'game.expected_players': expectedPlayers } },
        parent,
      );
    instruments.activeRooms.add(1, { 'game.mode': this.mode });
    this.child('game.room.create');
  }

  public child(name: string, attributes: Attributes = {}, error = false): void {
    const span = trace
      .getTracer(SCOPE)
      .startSpan(name, { attributes }, trace.setSpan(context.active(), this.root));
    if (error) span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
  }

  public playerDelta(delta: number): void {
    this.instruments.players.add(delta, { 'game.mode': this.mode });
  }

  public commandRejected(command: string, reason: string): void {
    this.instruments.rejectedCommands.add(1, {
      'game.mode': this.mode,
      'game.command': command,
      'game.reason': reason,
    });
  }

  public reconnect(outcome: 'success' | 'expired' | 'voluntary' | 'drop'): void {
    this.instruments.reconnects.add(1, { 'game.mode': this.mode, 'game.outcome': outcome });
    if (outcome === 'success' || outcome === 'expired')
      this.child('game.room.reconnect', { 'game.outcome': outcome }, outcome === 'expired');
  }

  public tick(durationMs: number, lagMs: number, scraps: number, monsters: number): void {
    this.instruments.tickDuration.record(durationMs, {
      'game.mode': this.mode,
      'game.monsters': monstersBucket(monsters),
    });
    this.instruments.tickLag.record(Math.max(0, lagMs), { 'game.mode': this.mode });
    this.instruments.scrapEntities.record(scraps, { 'game.mode': this.mode });
  }

  public patch(bytes: number): void {
    this.instruments.patchSize.record(bytes, { 'game.mode': this.mode });
  }

  public goldCredited(amount: number): void {
    this.instruments.goldCredits.add(amount, { 'game.mode': this.mode });
  }

  public log(level: LogLevel, message: string, attributes: Attributes = {}): void {
    this.logger.emit(level, message, attributes, this.root);
  }

  public finish(outcome: 'defeat' | 'abandoned'): void {
    this.outcome = outcome;
    this.root.setAttribute('game.outcome', outcome);
    this.child('game.room.end', { 'game.outcome': outcome });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.instruments.activeRooms.add(-1, { 'game.mode': this.mode });
    this.instruments.roomDuration.record(performance.now() - this.startedAt, {
      'game.mode': this.mode,
      ...(this.outcome === undefined ? {} : { 'game.outcome': this.outcome }),
    });
    this.root.end();
  }
}

export interface ServerTelemetry {
  logger: ServerLogger;
  room(mode: 'solo' | 'coop', expectedPlayers: number, traceParent?: string): RoomTelemetry;
  shutdown(): Promise<void>;
}

export function initServerTelemetry(config: ServerConfig): ServerTelemetry {
  const shutdownTasks: Array<() => Promise<void>> = [];
  if (config.otlpEndpoint !== undefined) {
    try {
      const resource = resourceFromAttributes({
        [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'village-survivor-game-server',
        [ATTR_SERVICE_VERSION]: '0.1.0',
        [ATTR_TELEMETRY_SDK_LANGUAGE]: 'nodejs',
        'deployment.environment.name': config.environment,
      });
      const traceProvider = new NodeTracerProvider({
        resource,
        spanProcessors: [
          new BatchSpanProcessor(
            new OTLPTraceExporter({
              url: `${config.otlpEndpoint}/v1/traces`,
              timeoutMillis: EXPORT_TIMEOUT_MS,
            }),
            { maxQueueSize: 256, maxExportBatchSize: 64, exportTimeoutMillis: EXPORT_TIMEOUT_MS },
          ),
        ],
      });
      traceProvider.register();
      const meterProvider = createServerMeterProvider({
        resource,
        readers: [
          new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({
              url: `${config.otlpEndpoint}/v1/metrics`,
              timeoutMillis: EXPORT_TIMEOUT_MS,
            }),
            exportIntervalMillis: EXPORT_INTERVAL_MS,
            exportTimeoutMillis: EXPORT_TIMEOUT_MS,
          }),
        ],
      });
      metrics.setGlobalMeterProvider(meterProvider);
      const loggerProvider = new LoggerProvider({
        resource,
        processors: [
          new BatchLogRecordProcessor({
            exporter: new OTLPLogExporter({
              url: `${config.otlpEndpoint}/v1/logs`,
              timeoutMillis: EXPORT_TIMEOUT_MS,
            }),
            maxQueueSize: 256,
            maxExportBatchSize: 64,
            exportTimeoutMillis: EXPORT_TIMEOUT_MS,
          }),
        ],
      });
      logs.setGlobalLoggerProvider(loggerProvider);
      shutdownTasks.push(
        () => traceProvider.shutdown(),
        () => meterProvider.shutdown(),
        () => loggerProvider.shutdown(),
      );
    } catch (error) {
      console.warn('[game-server] télémétrie indisponible, le serveur continue.', {
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
  const logger = new ServerLogger(config.appLogLevel);
  const instruments = createInstruments();
  return {
    logger,
    room: (mode, expectedPlayers, traceParent) =>
      new RoomTelemetry(instruments, logger, mode, expectedPlayers, traceParent),
    shutdown: async () => {
      await Promise.allSettled(shutdownTasks.map((task) => task()));
    },
  };
}
