/**
 * Configuration de la télémétrie, lue une fois au démarrage.
 *
 * Volontairement **pure** : une fonction de l'environnement de compilation et du stockage local
 * vers un objet. C'est ce qui permet de tester le contrat d'observabilité — notamment que le
 * niveau de journalisation se change sans reconstruire — sans monter un navigateur.
 */

/** Niveaux applicatifs, du plus bavard au plus grave. L'ordre du tableau est le seuil. */
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** Clé de surcharge du niveau de journalisation, dans le stockage local du navigateur. */
export const LOG_LEVEL_STORAGE_KEY = 'vs.log.level';

export interface TelemetryConfig {
  /** Nom du service émetteur, tel qu'il apparaîtra dans le backend. */
  serviceName: string;
  serviceVersion: string;
  /** `lan`, `dev`… — sert à ne pas confondre deux environnements dans une même vue. */
  environment: string;
  /**
   * Racine OTLP, relative pour rester sur l'origine du jeu. Vide ⇒ **aucun export** : le jeu
   * fonctionne à l'identique, sans collecteur.
   */
  endpoint: string;
  logLevel: LogLevel;
  /** `false` quand aucun endpoint n'est configuré ; le reste du code n'a pas à s'en soucier. */
  exportEnabled: boolean;
}

/** Source de valeurs figées à la compilation (`import.meta.env`). */
export type TelemetryEnvironment = Readonly<Record<string, string | boolean | undefined>>;

/** Ce que le navigateur expose ; `null` en test, où il n'y a pas de stockage local. */
export interface LogLevelStorage {
  getItem(key: string): string | null;
}

function readString(environment: TelemetryEnvironment, key: string, fallback: string): string {
  const value = environment[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value);
}

/**
 * Niveau applicatif effectif.
 *
 * La surcharge par le stockage local prime sur la valeur de compilation : un navigateur ne lit
 * pas de variable d'environnement à l'exécution, et il faut pouvoir passer un poste en `trace`
 * le temps d'un diagnostic **sans reconstruire le jeu** — reconstruire pour diagnostiquer
 * reviendrait à modifier le produit qu'on observe.
 *
 * Une valeur illisible est ignorée sans bruit : c'est une aide au diagnostic, pas une commande.
 */
export function resolveLogLevel(
  environment: TelemetryEnvironment,
  storage: LogLevelStorage | null,
): LogLevel {
  let stored: string | null;
  try {
    stored = storage?.getItem(LOG_LEVEL_STORAGE_KEY) ?? null;
  } catch {
    // Stockage local refusé (mode privé, politique du navigateur) : on garde la valeur figée.
    stored = null;
  }
  if (isLogLevel(stored)) {
    return stored;
  }
  const compiled = readString(environment, 'VITE_APP_LOG_LEVEL', '');
  return isLogLevel(compiled) ? compiled : environment.DEV === true ? 'debug' : 'info';
}

export function readTelemetryConfig(
  environment: TelemetryEnvironment,
  storage: LogLevelStorage | null,
): TelemetryConfig {
  const endpoint = readString(environment, 'VITE_OTEL_EXPORTER_OTLP_ENDPOINT', '').replace(
    /\/+$/,
    '',
  );
  return {
    serviceName: readString(environment, 'VITE_OTEL_SERVICE_NAME', 'village-survivor-client'),
    serviceVersion: readString(environment, 'VITE_OTEL_SERVICE_VERSION', '0.1.0'),
    environment: readString(
      environment,
      'VITE_OTEL_ENVIRONMENT',
      environment.DEV === true ? 'dev' : 'lan',
    ),
    endpoint,
    logLevel: resolveLogLevel(environment, storage),
    exportEnabled: endpoint.length > 0,
  };
}

/** Vrai si un message de niveau `level` doit être émis sous le seuil `threshold`. */
export function passesLogThreshold(level: LogLevel, threshold: LogLevel): boolean {
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(threshold);
}
