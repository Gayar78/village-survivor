/**
 * Identifiant de la construction en cours d'exécution.
 *
 * Injecté par Vite (`define`) au moment de la compilation. En développement, ou dans un test qui
 * n'est pas passé par la construction, la constante n'existe pas : on renvoie alors `dev`, qui a
 * l'avantage de se voir.
 */
declare const __VS_BUILD_ID__: string | undefined;

export const BUILD_ID: string =
  typeof __VS_BUILD_ID__ === 'string' && __VS_BUILD_ID__.length > 0 ? __VS_BUILD_ID__ : 'dev';
