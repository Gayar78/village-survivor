# Matrice de traçabilité des exigences

Statut : **mise à jour après livraison de M1**
Date : 21 juillet 2026

## 1. Usage

Cette matrice empêche qu'une exigence du cadrage disparaisse pendant les incréments.
Elle relie chaque groupe d'exigences à sa décision d'architecture, à son emplacement
cible et à son mode de vérification.

La colonne « Implémentation » donne le chemin cible ou réel. L'état réel du dépôt est
indiqué dans la dernière colonne.

## 2. Traçabilité

| Exigence | Décision ou référence | Implémentation | Vérification | État au 21/07/2026 |
|---|---|---|---|---|
| `REQ-GOV-001` | Cadrage initial | Processus d'incrément, documentation | Revue de chaque livraison | Documenté |
| `REQ-GOV-002` | Cadrage initial | Gouvernance produit | Journal des décisions humaines | Documenté |
| `REQ-SCOPE-001` | [ADR-0003](../decisions/0003-game-session-boundary.md), [ADR-0004](../decisions/0004-authoritative-multiplayer-server.md) | `LocalSession`, puis session réseau | Tests de `LocalSession` | Local implémenté, réseau différé |
| `REQ-SCOPE-002` | [ROADMAP](../../ROADMAP.md) | Incréments verticaux | Scénario Playwright M1 | M1 implémenté |
| `REQ-PRINCIPLES-001` | Cadrage initial | Toutes les couches | Revue d'architecture | Documenté |
| `REQ-PRINCIPLES-002` | [Vue d'architecture](../architecture/overview.md) | Frontières de packages | TypeScript, ESLint et revue | Implémenté pour M1 |
| `REQ-STACK-001` | Cadrage initial | `apps/client` | Build et tests navigateur | Implémenté pour M1 |
| `REQ-STACK-002` | [ADR-0004](../decisions/0004-authoritative-multiplayer-server.md) | `apps/server` | Tests de rooms futurs | Différé |
| `REQ-STACK-003` | [ADR-0001](../decisions/0001-pnpm-monorepo.md) | `package.json`, workspace et lockfile | Commandes racine et CI | Implémenté |
| `REQ-PERSISTENCE-001` | [ADR-0006](../decisions/0006-defer-persistence.md) | Aucun composant en V1 | Vérifier l'absence de DB et de progression | Accepté, différé |
| `REQ-ARCH-001` | [ADR-0002](../decisions/0002-headless-fixed-step-simulation.md) | `packages/game-core` | Tests Node, lint et types | Implémenté pour M1 |
| `REQ-ARCH-002` | [ADR-0003](../decisions/0003-game-session-boundary.md) | `GameSession`, `LocalSession`, futur `NetworkSession` | Tests de contrat local | Local implémenté |
| `REQ-ARCH-003` | [ADR-0001](../decisions/0001-pnpm-monorepo.md) | Workspaces pnpm | Installation et build racine | Implémenté |
| `REQ-SIM-001` | [ADR-0002](../decisions/0002-headless-fixed-step-simulation.md) | Boucle et RNG de `game-core` | Tests de graine et pas fixe | Implémenté |
| `REQ-SIM-002` | [ROADMAP](../../ROADMAP.md) | Systèmes M1 dans `game-core` | Scénarios victoire et défaite | Sous-ensemble M1 implémenté |
| `REQ-SIM-003` | [Vue d'architecture](../architecture/overview.md) | `packages/protocol` | Sérialisation et déterminisme | Implémenté pour M1 |
| `REQ-NET-001` | [ADR-0004](../decisions/0004-authoritative-multiplayer-server.md) | Rooms Colyseus | Rejet de commandes invalides | Différé |
| `REQ-NET-002` | [ADR-0004](../decisions/0004-authoritative-multiplayer-server.md) | `NetworkSession`, client et serveur | Tests multi-clients et reconnexion | Différé |
| `REQ-CONTENT-001` | [ADR-0005](../decisions/0005-data-driven-content.md) | `packages/content` | Catalogue centralisé | Implémenté pour M1 |
| `REQ-CONTENT-002` | [ADR-0005](../decisions/0005-data-driven-content.md) | Schémas Zod et chargeur | Tests valides et invalides | Implémenté pour M1 |
| `REQ-ASSET-001` | Cadrage initial, [ADR-0007](../decisions/0007-immediate-mode-entity-rendering.md) | Rendu de formes en passes ordonnées, `apps/client/src/render`, audio synthétique | Tests unitaires de phase et d'impact, revue visuelle navigateur | Temporaire M1 implémenté |
| `REQ-ASSET-002` | Cadrage initial | `scripts/assets` | Contrôles automatisés d'assets | Différé au premier asset |
| `REQ-ASSET-003` | [Analyse historique](../product/legacy-analysis/selection-matrix.md) | Métadonnées de provenance | Contrôle de licence en revue | Documenté |
| `REQ-TEST-001` | Cadrage initial | Tests proches des packages | `pnpm test` | Implémenté pour M1 |
| `REQ-TEST-002` | [ADR-0002](../decisions/0002-headless-fixed-step-simulation.md) | Tests de `packages/game-core` | Vitest sans navigateur | Implémenté pour M1 |
| `REQ-TEST-003` | [ADR-0004](../decisions/0004-authoritative-multiplayer-server.md) | `tests/multiplayer` | Clients Colyseus de test | Différé |
| `REQ-TEST-004` | Cadrage initial | `tests/browser` et API debug | Playwright et erreurs console | Implémenté pour M1 |
| `REQ-DEBUG-001` | [Vue d'architecture](../architecture/overview.md) | `LocalSession` et client développement | E2E et smoke de production | Implémenté pour M1 |
| `REQ-PERF-001` | Cadrage initial, [ADR-0007](../decisions/0007-immediate-mode-entity-rendering.md) | Test de performance `game-core`, coût de rendu de la scène | `pnpm benchmark` pour la simulation, observation navigateur pour le rendu | Simulation automatisée, rendu mesuré manuellement, budgets à chiffrer |
| `REQ-PERF-002` | Cadrage initial | Métriques de développement client | FPS, tick, simulation, entités, graine | Observabilité M1 implémentée |
| `REQ-CI-001` | [ADR-0001](../decisions/0001-pnpm-monorepo.md), [déploiement](../deployment.md) | Scripts racine et GitHub Actions | Pipeline complet | Implémenté |
| `REQ-DEPLOY-001` | [Déploiement](../deployment.md) | `apps/client/dist`, puis Cloudflare | Build et smoke de production | Build prêt, accès non configuré |
| `REQ-DEPLOY-002` | [ADR-0004](../decisions/0004-authoritative-multiplayer-server.md), [déploiement](../deployment.md) | Image Docker serveur | Build et smoke test d'image | Différé |
| `REQ-DEPLOY-003` | [Déploiement](../deployment.md) | `.gitignore` et environnements futurs | Smoke du bundle et revue | Politique et contrôle M1 |
| `REQ-DOC-001` | Cadrage initial | Documentation racine et `docs` | Contrôle des fichiers requis | Implémenté |
| `REQ-DOC-002` | [Index ADR](../decisions/README.md) | `docs/decisions` | Revue des changements structurants | Implémenté |
| `REQ-DOC-003` | Cadrage initial | Tous les incréments | Revue documentation/code | Implémenté pour M1 |
| `REQ-WORK-001` | Cadrage initial | Processus de livraison | Checklist d'incrément | Documenté |
| `REQ-WORK-002` | Cadrage initial | ADR ou note de refactoring | Revue avant refonte | Documenté |
| `REQ-QUALITY-001` | Cadrage initial | TypeScript, ESLint, Prettier | Format, lint, types et CI | Implémenté pour M1 |
| `REQ-SEC-001` | [ADR-0004](../decisions/0004-authoritative-multiplayer-server.md) | Validation côté serveur | Tests d'abus et limites | Différé au réseau |

## 3. Contrôle à chaque incrément

Lorsqu'une exigence commence à être implémentée :

1. remplacer l'emplacement cible par le chemin réel ;
2. référencer les tests concrets ;
3. mettre à jour l'état sans déclarer « implémenté » avant vérification ;
4. créer un ADR si la solution s'écarte du cadrage ;
5. conserver la ligne même si l'exigence est remplacée, avec le lien vers la décision
   qui la remplace.
