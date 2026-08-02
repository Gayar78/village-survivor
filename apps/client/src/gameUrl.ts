import { BUILD_ID } from './buildId.js';

/**
 * URL de la page de jeu, portant toujours l'identifiant de la construction.
 *
 * Le 2 août 2026, deux postes ont joué une build périmée : leur navigateur tenait `play.html` en
 * cache et ne l'a jamais redemandé. L'en-tête `Cache-Control` corrige la cause pour l'avenir,
 * mais il ne peut rien pour une entrée **déjà** mémorisée sous l'ancienne règle — le navigateur
 * ne redemande pas une page qu'il croit encore fraîche, et n'apprend donc jamais la nouvelle
 * consigne.
 *
 * Le paramètre de construction change l'URL à chaque livraison. Une URL différente est une autre
 * entrée de cache : le navigateur est obligé d'aller chercher la page, quel que soit ce qu'il
 * gardait sous l'ancienne. C'est une ceinture en plus des bretelles, et elle ne coûte rien.
 */
export function gameUrl(parameters: Readonly<Record<string, string>> = {}): string {
  const query = new URLSearchParams({ ...parameters, b: BUILD_ID });
  return `play.html?${query.toString()}`;
}
