import { context, metrics, trace, type Meter, type Tracer } from '@opentelemetry/api';
import { logs, type Logger } from '@opentelemetry/api-logs';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_TELEMETRY_SDK_LANGUAGE,
} from '@opentelemetry/semantic-conventions';

import { readTelemetryConfig, type TelemetryConfig } from './config.js';

/**
 * Mise en place d'OpenTelemetry côté navigateur.
 *
 * Trois principes gouvernent ce fichier, dans cet ordre :
 *
 * 1. **La télémétrie n'est jamais sur le chemin critique d'une partie.** L'export est asynchrone,
 *    par lots, avec une file bornée. Un collecteur absent, lent ou en panne ne doit ni ralentir
 *    le jeu, ni le bloquer, ni prévenir le joueur. Toute l'initialisation est enveloppée : si
 *    elle échoue, le jeu démarre quand même, sans mesure.
 * 2. **Le cœur de simulation reste hors de portée.** Rien ici n'est importé par
 *    `packages/game-core`, qui ne doit connaître ni horloge, ni réseau. La mesure observe la
 *    simulation de l'extérieur.
 * 3. **Aucune donnée interdite ne sort.** Les attributs sont construits dans `gameTelemetry.ts`
 *    et assainis dans `redact.ts` ; ce module ne fait que transporter.
 */

/** Fenêtre d'export des métriques. Assez courte pour suivre une partie, assez longue pour être discrète. */
const METRIC_EXPORT_INTERVAL_MS = 15_000;
/** Au-delà, l'export est abandonné : mieux vaut perdre une mesure que retenir une requête. */
const EXPORT_TIMEOUT_MS = 5_000;
const SCOPE_NAME = 'village-survivor';

let currentConfig: TelemetryConfig | undefined;
let shutdown: (() => Promise<void>) | undefined;

/** Configuration effective ; lit l'environnement au premier appel. */
export function telemetryConfig(): TelemetryConfig {
  currentConfig ??= readTelemetryConfig(
    import.meta.env as unknown as Record<string, string | boolean | undefined>,
    typeof localStorage === 'undefined' ? null : localStorage,
  );
  return currentConfig;
}

/**
 * Démarre traces, métriques et journaux. Idempotent, et sans effet si aucun collecteur n'est
 * configuré — auquel cas les API d'OpenTelemetry restent utilisables mais n'émettent rien.
 */
export function initTelemetry(): TelemetryConfig {
  const config = telemetryConfig();
  if (shutdown !== undefined || !config.exportEnabled) {
    return config;
  }
  try {
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion,
      [ATTR_TELEMETRY_SDK_LANGUAGE]: 'webjs',
      // Attribut normalisé de l'environnement de déploiement : distingue `lan` de `dev` dans une
      // vue commune, sans quoi deux postes de développement pollueraient les mesures réelles.
      'deployment.environment.name': config.environment,
    });
    const headers = { 'content-type': 'application/json' };

    const tracerProvider = new WebTracerProvider({
      resource,
      spanProcessors: [
        new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: `${config.endpoint}/v1/traces`,
            headers,
            timeoutMillis: EXPORT_TIMEOUT_MS,
          }),
          // File bornée : au-delà, les spans les plus anciens sont abandonnés. C'est le
          // comportement voulu — perdre des mesures plutôt que de la mémoire.
          { maxQueueSize: 512, maxExportBatchSize: 64, exportTimeoutMillis: EXPORT_TIMEOUT_MS },
        ),
      ],
    });
    tracerProvider.register({ propagator: new W3CTraceContextPropagator() });

    const meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: `${config.endpoint}/v1/metrics`,
            headers,
            timeoutMillis: EXPORT_TIMEOUT_MS,
          }),
          exportIntervalMillis: METRIC_EXPORT_INTERVAL_MS,
          exportTimeoutMillis: EXPORT_TIMEOUT_MS,
        }),
      ],
    });
    metrics.setGlobalMeterProvider(meterProvider);

    const loggerProvider = new LoggerProvider({
      resource,
      processors: [
        // Ce processeur vide sa file quand l'onglet passe en arrière-plan ou se ferme : les
        // dernières lignes d'une partie interrompue sont justement celles qu'on veut lire.
        new BatchLogRecordProcessor({
          exporter: new OTLPLogExporter({
            url: `${config.endpoint}/v1/logs`,
            headers,
            timeoutMillis: EXPORT_TIMEOUT_MS,
          }),
          maxQueueSize: 512,
          maxExportBatchSize: 64,
          exportTimeoutMillis: EXPORT_TIMEOUT_MS,
        }),
      ],
    });
    logs.setGlobalLoggerProvider(loggerProvider);

    shutdown = async (): Promise<void> => {
      await Promise.allSettled([
        tracerProvider.shutdown(),
        meterProvider.shutdown(),
        loggerProvider.shutdown(),
      ]);
    };
  } catch (error) {
    // Un échec d'initialisation ne doit pas empêcher de jouer. Le message part sur la console,
    // seul canal encore disponible à ce stade.
    console.warn('[télémétrie] initialisation impossible, le jeu continue sans mesure.', error);
  }
  return config;
}

export function getTracer(): Tracer {
  return trace.getTracer(SCOPE_NAME);
}

export function getMeter(): Meter {
  return metrics.getMeter(SCOPE_NAME);
}

export function getLogger(): Logger {
  return logs.getLogger(SCOPE_NAME);
}

/** Identifiants de corrélation du span actif, ou `undefined` hors de tout contexte tracé. */
export function activeTraceIds(): { trace_id: string; span_id: string } | undefined {
  const span = trace.getSpan(context.active());
  if (span === undefined) {
    return undefined;
  }
  const spanContext = span.spanContext();
  return trace.isSpanContextValid(spanContext)
    ? { trace_id: spanContext.traceId, span_id: spanContext.spanId }
    : undefined;
}

/**
 * Vide les files avant la fermeture de l'onglet. Attendre n'aurait aucun sens ici : la page
 * disparaît de toute façon, et retenir sa fermeture serait exactement le comportement interdit.
 */
export function flushTelemetry(): void {
  void shutdown?.();
}
