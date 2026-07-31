# Décisions d'architecture

Les Architecture Decision Records (ADR) conservent les choix structurants du projet.
Ils complètent le
[`cadrage technique initial`](../requirements/initial-technical-baseline.md) sans le
dupliquer.

## Statuts

- **Proposé** : décision en discussion, non contraignante.
- **Accepté** : décision applicable au projet.
- **Constaté** : décision **déjà implémentée dans le code sans validation préalable**. L'ADR
  existe pour rendre l'écart visible et permettre son arbitrage ; il ne vaut pas acceptation.
- **Remplacé** : décision conservée pour l'historique mais remplacée par un autre ADR.
- **Abandonné** : décision explicitement retirée sans remplacement direct.

## Index

| ADR | Statut | Décision |
|---|---|---|
| [0001](0001-pnpm-monorepo.md) | Accepté | Organiser le projet en monorepo avec workspaces pnpm |
| [0002](0002-headless-fixed-step-simulation.md) | Accepté | Isoler une simulation à pas fixe exécutable sans rendu |
| [0003](0003-game-session-boundary.md) | Accepté | Faire dépendre le client d'une frontière `GameSession` |
| [0004](0004-authoritative-multiplayer-server.md) | Remplacé par [0008](0008-p2p-lockstep-coop.md) | Utiliser un serveur Colyseus autoritaire en multijoueur |
| [0005](0005-data-driven-content.md) | Accepté, **non tenu** par le contenu Tower | Piloter le contenu et l'équilibrage par des données validées |
| [0006](0006-defer-persistence.md) | Remplacé par [0009](0009-account-persistence.md) | Différer base de données et persistance de compte |
| [0007](0007-immediate-mode-entity-rendering.md) | Accepté, **partiellement caduc** | Rendre les entités en mode immédiat trié par profondeur |
| [0008](0008-p2p-lockstep-coop.md) | Constaté | Coopération en lockstep pair-à-pair sans serveur |
| [0009](0009-account-persistence.md) | Constaté | Comptes Supabase et progression persistante |

### Notes sur les statuts particuliers

**ADR-0005** reste la règle du projet, mais le catalogue du jeu Tower
(`packages/content/src/tower.ts`) ne possède aucun schéma ni validation au chargement, et une
partie de son réglage vit dans `packages/game-core/src/tower/tuning.ts` plutôt que dans le
contenu. L'écart est ouvert : soit le contenu Tower est validé, soit l'ADR est explicitement
assoupli.

**ADR-0007** garde sa décision de fond : `TowerScene` dessine bien le monde en mode immédiat,
dans des objets `Graphics` effacés et redessinés à chaque frame. En revanche, tout ce que l'ADR
décrivait en propre — les six effets retenus, les passes ordonnées avec ombres portées, la
transition jour/nuit progressive et le module d'état visuel `apps/client/src/render` —
appartenait à l'ancien jeu et **a été supprimé le 31 juillet 2026**. Les passes de rendu Tower
ne sont consignées nulle part.

## Convention

Un ADR ne doit pas être réécrit pour masquer une évolution. Une décision ultérieure
le remplace explicitement et les deux documents se référencent. Les corrections de
forme qui ne changent pas l'intention restent autorisées.
