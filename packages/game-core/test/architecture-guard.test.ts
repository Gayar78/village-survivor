import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Garde d'architecture du cœur de simulation.
 *
 * **C'est la garde la plus importante du projet : si elle tombe, la coopération tombe avec
 * elle.** Le lockstep exige que tous les navigateurs calculent exactement le même état à partir
 * des mêmes entrées. Une horloge, un aléatoire non maîtrisé ou une bibliothèque de télémétrie —
 * qui horodate, mesure et appelle le réseau — introduiraient une valeur différente d'un poste à
 * l'autre, et les parties divergeraient.
 *
 * L'instrumentation existe : elle mesure `step()` depuis la couche client, sans que `step()` ne
 * sache qu'il est mesuré. Ce test vérifie que cette frontière tient.
 */

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(packageRoot, 'src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry: string) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return path.endsWith('.ts') ? [path] : [];
  });
}

const sources = sourceFiles(sourceRoot).map((path) => ({
  path: path.slice(packageRoot.length + 1).replaceAll('\\', '/'),
  code: readFileSync(path, 'utf8'),
}));

describe('garde d’architecture du cœur de simulation', () => {
  it('couvre bien tout le code du moteur', () => {
    // Un test qui ne lirait aucun fichier passerait toujours : on s'assure d'abord qu'il regarde
    // quelque chose.
    expect(sources.length).toBeGreaterThan(5);
  });

  it('ne dépend que de paquets du dépôt', () => {
    // Le moteur ne tire aucune bibliothèque extérieure : ni télémétrie, ni utilitaire, ni
    // polyfill. Chaque dépendance ajoutée serait du code dont personne n'a vérifié qu'il donne
    // le même résultat sur deux navigateurs.
    const manifest = JSON.parse(
      readFileSync(join(packageRoot, 'package.json'), 'utf8'),
    ) as Readonly<{ dependencies?: Record<string, string> }>;

    for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
      expect(name, `${name} n'appartient pas au dépôt`).toMatch(/^@village-survivor\//);
      expect(range, `${name} n'est pas résolu depuis le dépôt`).toBe('workspace:*');
    }
  });

  it('n’importe aucune bibliothèque de télémétrie', () => {
    for (const source of sources) {
      expect(source.code, source.path).not.toContain('@opentelemetry');
    }
  });

  it('ne lit ni l’horloge ni un aléatoire non maîtrisé', () => {
    // `SeededRandom` est la seule source d'aléatoire admise : elle est reproductible d'un poste
    // à l'autre, ce que `Math.random` n'est pas.
    for (const source of sources) {
      expect(source.code, source.path).not.toMatch(/\bDate\.now\b/);
      expect(source.code, source.path).not.toMatch(/\bperformance\.now\b/);
      expect(source.code, source.path).not.toMatch(/\bMath\.random\b/);
      expect(source.code, source.path).not.toMatch(/\bnew Date\b/);
    }
  });

  it('n’accède pas au navigateur', () => {
    for (const source of sources) {
      expect(source.code, source.path).not.toMatch(/\bdocument\./);
      expect(source.code, source.path).not.toMatch(/\bwindow\./);
      expect(source.code, source.path).not.toMatch(/\blocalStorage\b/);
      expect(source.code, source.path).not.toMatch(/\bfetch\(/);
    }
  });
});
