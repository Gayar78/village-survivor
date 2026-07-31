/**
 * Contenu partagé du jeu Tower : les seules données dont plusieurs couches ont besoin,
 * afin que le moteur qui applique un effet et l'interface qui l'affiche ne divergent pas.
 *
 * Le reste du réglage — statistiques des joueurs, des tourelles et des monstres, courbe
 * d'expérience, budget de vagues — vit dans `packages/game-core/src/tower/tuning.ts`.
 * C'est un écart connu vis-à-vis d'ADR-0005 et de `REQ-CONTENT-001`, recensé dans
 * `docs/requirements/traceability-matrix.md`.
 *
 * Ce catalogue n'est validé par aucun schéma, contrairement à l'ancien contenu qui l'était
 * par Zod. Le rétablir est un point ouvert de la feuille de route.
 */
export * from './tower.js';
