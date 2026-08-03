import { describe, expect, it } from 'vitest';

import {
  LOG_LEVEL_STORAGE_KEY,
  passesLogThreshold,
  readTelemetryConfig,
  resolveLogLevel,
  type LogLevelStorage,
} from './config.js';
import { boundedAttribute, describeError, MAX_ATTRIBUTE_LENGTH } from './redact.js';
import { monstersBucket } from './gameTelemetry.js';

/**
 * Contrat d'observabilité, tel que défini par `docs/observabilite.md` et exigé par
 * `docs/qualite/strategie-tests.md`. Ces tests bloquent la release : une donnée interdite qui
 * partirait dans la télémétrie, ou un niveau de journalisation qu'on ne pourrait plus changer
 * sans reconstruire, sont des défauts de conformité, pas des détails.
 */

function storage(value: string | null): LogLevelStorage {
  return { getItem: (key) => (key === LOG_LEVEL_STORAGE_KEY ? value : null) };
}

describe('configuration de la télémétrie', () => {
  it('identifie le service, sa version et son environnement', () => {
    const config = readTelemetryConfig(
      {
        VITE_OTEL_SERVICE_NAME: 'village-survivor-client',
        VITE_OTEL_SERVICE_VERSION: '0.1.0',
        VITE_OTEL_ENVIRONMENT: 'lan',
        VITE_OTEL_EXPORTER_OTLP_ENDPOINT: '/otel',
      },
      null,
    );

    expect(config.serviceName).toBe('village-survivor-client');
    expect(config.serviceVersion).toBe('0.1.0');
    expect(config.environment).toBe('lan');
    expect(config.exportEnabled).toBe(true);
  });

  it('démarre sans collecteur configuré', () => {
    // Le jeu doit rester jouable et testable sans pile de télémétrie : c'est une exigence de la
    // spécification, pas une commodité.
    const config = readTelemetryConfig({}, null);

    expect(config.exportEnabled).toBe(false);
    expect(config.endpoint).toBe('');
  });

  it('normalise un endpoint terminé par une barre oblique', () => {
    expect(readTelemetryConfig({ VITE_OTEL_EXPORTER_OTLP_ENDPOINT: '/otel/' }, null).endpoint).toBe(
      '/otel',
    );
  });
});

describe('niveau de journalisation', () => {
  it('se change par le stockage local, sans reconstruire', () => {
    // Vite fige `VITE_APP_LOG_LEVEL` à la compilation. Sans cette surcharge, élever le niveau
    // d'un poste imposerait de reconstruire le jeu — donc de modifier le produit observé.
    const environment = { VITE_APP_LOG_LEVEL: 'info' };

    expect(resolveLogLevel(environment, null)).toBe('info');
    expect(resolveLogLevel(environment, storage('trace'))).toBe('trace');
  });

  it('ignore une surcharge illisible plutôt que de la subir', () => {
    expect(resolveLogLevel({ VITE_APP_LOG_LEVEL: 'warn' }, storage('bavard'))).toBe('warn');
  });

  it('survit à un stockage local refusé', () => {
    const hostile: LogLevelStorage = {
      getItem: () => {
        throw new Error('accès refusé');
      },
    };

    expect(resolveLogLevel({ VITE_APP_LOG_LEVEL: 'error' }, hostile)).toBe('error');
  });

  it('retient le seuil dans le bon sens', () => {
    expect(passesLogThreshold('error', 'info')).toBe(true);
    expect(passesLogThreshold('debug', 'info')).toBe(false);
    expect(passesLogThreshold('info', 'info')).toBe(true);
  });
});

describe('assainissement des valeurs émises', () => {
  it('borne un attribut de longueur arbitraire', () => {
    const bounded = boundedAttribute('x'.repeat(1_000));

    expect(bounded.length).toBe(MAX_ATTRIBUTE_LENGTH);
  });

  it('ne recopie jamais un objet d’erreur inconnu', () => {
    // Une erreur venant du réseau peut transporter n'importe quoi, y compris un jeton dans une
    // URL. On n'en garde que le nom et le message.
    const carrier = { message: 'échec', token: 'secret-token', url: 'https://x/?access_token=abc' };

    const described = describeError(carrier);

    expect(described).not.toContain('secret-token');
    expect(described).not.toContain('access_token');
  });

  it('conserve un message d’erreur exploitable', () => {
    expect(describeError(new RangeError('tick hors bornes'))).toBe('RangeError: tick hors bornes');
  });
});

describe('seaux de population', () => {
  it('borne la cardinalité des séries de mesure', () => {
    // Émettre le nombre exact de monstres créerait des centaines de séries pour une information
    // qu'on ne lit qu'en ordre de grandeur.
    expect(monstersBucket(0)).toBe('0-50');
    expect(monstersBucket(49)).toBe('0-50');
    expect(monstersBucket(50)).toBe('50-100');
    expect(monstersBucket(199)).toBe('100-200');
    expect(monstersBucket(200)).toBe('200+');
    expect(monstersBucket(5_000)).toBe('200+');
  });
});
