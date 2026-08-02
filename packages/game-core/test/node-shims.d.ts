/**
 * Déclarations minimales de l'API Node employée par la garde d'architecture.
 *
 * `packages/game-core` compile **sans les types de Node et sans ceux du DOM** : c'est une partie
 * de la garde elle-même, puisque le moteur ne doit connaître ni l'un ni l'autre. Installer
 * `@types/node` pour un seul test rendrait `process`, `fs` et le reste typés dans `src` — donc
 * invisibles au compilateur le jour où quelqu'un les emploierait.
 *
 * On déclare donc ici, à la main, les trois fonctions dont la garde a besoin pour lire les
 * fichiers du moteur. Rien de plus : ce qui n'est pas déclaré reste une erreur de compilation.
 */

declare module 'node:fs' {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function statSync(path: string): { isDirectory(): boolean };
}

declare module 'node:path' {
  export function dirname(path: string): string;
  export function join(...segments: string[]): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}

interface ImportMeta {
  readonly url: string;
}
