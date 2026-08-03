export type Vector2 = Readonly<{
  x: number;
  y: number;
}>;

/**
 * Ressources de l'ancien jeu. Elles ne sont plus produites par aucune règle : elles
 * subsistent parce que la table `player_stats` (migration `0001_init.sql`) possède une
 * colonne par ressource et que l'écran de profil affiche encore ces compteurs.
 *
 * Le jeu Tower n'en utilise aucune ; sa seule monnaie de partie est la ferraille, et sa
 * seule monnaie de compte est l'or.
 */
export type ResourceType = 'wood' | 'stone' | 'iron' | 'gold' | 'diamond';

// Contrat du jeu Tower : entrées, état public, session.
export * from './tower.js';
export * from './tower-network.js';

// Catalogue et résolution de la méta-progression de compte.
export * from './meta.js';
