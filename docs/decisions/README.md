# Décisions d'architecture

Les Architecture Decision Records (ADR) conservent les choix structurants du projet.
Ils complètent le
[`cadrage technique initial`](../requirements/initial-technical-baseline.md) sans le
dupliquer.

## Statuts

- **Proposé** : décision en discussion, non contraignante.
- **Accepté** : décision applicable au projet.
- **Remplacé** : décision conservée pour l'historique mais remplacée par un autre ADR.
- **Abandonné** : décision explicitement retirée sans remplacement direct.

## Index

| ADR | Statut | Décision |
|---|---|---|
| [0001](0001-pnpm-monorepo.md) | Accepté | Organiser le projet en monorepo avec workspaces pnpm |
| [0002](0002-headless-fixed-step-simulation.md) | Accepté | Isoler une simulation à pas fixe exécutable sans rendu |
| [0003](0003-game-session-boundary.md) | Accepté | Faire dépendre le client d'une frontière `GameSession` |
| [0004](0004-authoritative-multiplayer-server.md) | Accepté | Utiliser un serveur Colyseus autoritaire en multijoueur |
| [0005](0005-data-driven-content.md) | Accepté | Piloter le contenu et l'équilibrage par des données validées |
| [0006](0006-defer-persistence.md) | Accepté | Différer base de données et persistance de compte |
| [0007](0007-immediate-mode-entity-rendering.md) | Accepté | Rendre les entités en mode immédiat trié par profondeur |

## Convention

Un ADR ne doit pas être réécrit pour masquer une évolution. Une décision ultérieure
le remplace explicitement et les deux documents se référencent. Les corrections de
forme qui ne changent pas l'intention restent autorisées.
