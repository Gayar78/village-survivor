# Village Survivor — Décisions d'architecture

> Statut : approuvé
> Version du projet : v2
> Propriétaire : Gayar
> Dernière revue : 3 août 2026

Les Architecture Decision Records (ADR) conservent les choix structurants du projet. Ils
complètent le [cadrage technique initial](../requirements/initial-technical-baseline.md) sans le
dupliquer.

Chaque fichier suit le nommage `ADR-<NNNN>-<titre>.md` et porte sa propre date et son propre
statut. Un ADR est une décision datée, pas un document vivant : il n'est jamais révisé après
coup, et ne reçoit donc pas la date de dernière revue que la méthode demande aux documents
courants.

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
| [0001](ADR-0001-pnpm-monorepo.md) | Accepté | Organiser le projet en monorepo avec workspaces pnpm |
| [0002](ADR-0002-headless-fixed-step-simulation.md) | Accepté | Isoler une simulation à pas fixe exécutable sans rendu |
| [0003](ADR-0003-game-session-boundary.md) | Accepté | Faire dépendre le client d'une frontière `GameSession` |
| [0004](ADR-0004-authoritative-multiplayer-server.md) | Remplacé par [0008](ADR-0008-p2p-lockstep-coop.md) | Utiliser un serveur Colyseus autoritaire en multijoueur |
| [0005](ADR-0005-data-driven-content.md) | Accepté, **non tenu** par le contenu Tower | Piloter le contenu et l'équilibrage par des données validées |
| [0006](ADR-0006-defer-persistence.md) | Remplacé par [0009](ADR-0009-account-persistence.md) | Différer base de données et persistance de compte |
| [0007](ADR-0007-immediate-mode-entity-rendering.md) | Accepté, **partiellement caduc** | Rendre les entités en mode immédiat trié par profondeur |
| [0008](ADR-0008-p2p-lockstep-coop.md) | Constaté | Coopération en lockstep pair-à-pair sans serveur |
| [0009](ADR-0009-account-persistence.md) | Constaté | Comptes Supabase et progression persistante |
| [0010](ADR-0010-local-render-prediction.md) | Accepté | Dessiner l'avatar local en avance sur la simulation |
| [0011](ADR-0011-authoritative-game-server.md) | Accepté | Faire exécuter toutes les parties par un serveur autoritaire |
| [0012](ADR-0012-mode-solo-local-degrade.md) | Accepté | Conserver un solo local dégradé après indisponibilité HTTP confirmée |

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

**ADR-0008** est remplacé par ADR-0011 à compter de la v2. Son statut « constaté » décrit
toujours correctement la manière dont le P2P avait été introduit ; ADR-0011 porte la décision
humaine qui le retire du chemin de production.

## Convention

Un ADR ne doit pas être réécrit pour masquer une évolution. Une décision ultérieure
le remplace explicitement et les deux documents se référencent. Les corrections de
forme qui ne changent pas l'intention restent autorisées.
