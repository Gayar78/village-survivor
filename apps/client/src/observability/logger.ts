import { SeverityNumber } from '@opentelemetry/api-logs';

import { passesLogThreshold, type LogLevel } from './config.js';
import { boundedAttribute } from './redact.js';
import { activeTraceIds, getLogger, telemetryConfig } from './telemetry.js';

/**
 * Journalisation applicative, corrélée aux traces.
 *
 * Un enregistrement émis pendant une partie porte `trace_id` et `span_id` : c'est ce qui permet
 * de passer d'un symptôme à la ligne de journal qui l'explique, et non de chercher à l'heure
 * dite dans un fichier. Le seuil vient de la configuration, donc du stockage local en priorité :
 * on élève le niveau d'un poste sans reconstruire le jeu.
 *
 * La console reste alimentée en parallèle. Elle est le seul canal disponible quand aucun
 * collecteur n'écoute, et c'est là que regarde quelqu'un qui débogue devant l'écran.
 */

const SEVERITY: Readonly<Record<LogLevel, SeverityNumber>> = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

export type LogAttributes = Readonly<Record<string, string | number | boolean>>;

export interface ScopedLogger {
  trace(message: string, attributes?: LogAttributes): void;
  debug(message: string, attributes?: LogAttributes): void;
  info(message: string, attributes?: LogAttributes): void;
  warn(message: string, attributes?: LogAttributes): void;
  error(message: string, attributes?: LogAttributes): void;
  fatal(message: string, attributes?: LogAttributes): void;
}

function toConsole(level: LogLevel, line: string, attributes: LogAttributes): void {
  const payload = Object.keys(attributes).length === 0 ? undefined : attributes;
  if (level === 'error' || level === 'fatal') {
    console.error(line, payload);
  } else if (level === 'warn') {
    console.warn(line, payload);
  } else if (level === 'info') {
    console.info(line, payload);
  } else {
    console.debug(line, payload);
  }
}

function emit(
  scope: string,
  level: LogLevel,
  message: string,
  attributes: LogAttributes = {},
): void {
  if (!passesLogThreshold(level, telemetryConfig().logLevel)) {
    return;
  }
  const correlation = activeTraceIds();
  const enriched: Record<string, string | number | boolean> = {
    'vs.scope': scope,
    ...attributes,
    ...(correlation ?? {}),
  };
  toConsole(level, `[${scope}] ${message}`, enriched);
  try {
    getLogger().emit({
      severityNumber: SEVERITY[level],
      severityText: level,
      body: boundedAttribute(message, 512),
      attributes: enriched,
    });
  } catch {
    // Une panne du canal de journalisation ne doit jamais remonter jusqu'à l'appelant : ici,
    // l'appelant est du code de jeu.
  }
}

/** Journal nommé — le nom sert à filtrer, par exemple `coop` ou `session`. */
export function createLogger(scope: string): ScopedLogger {
  return {
    trace: (message, attributes) => emit(scope, 'trace', message, attributes),
    debug: (message, attributes) => emit(scope, 'debug', message, attributes),
    info: (message, attributes) => emit(scope, 'info', message, attributes),
    warn: (message, attributes) => emit(scope, 'warn', message, attributes),
    error: (message, attributes) => emit(scope, 'error', message, attributes),
    fatal: (message, attributes) => emit(scope, 'fatal', message, attributes),
  };
}
