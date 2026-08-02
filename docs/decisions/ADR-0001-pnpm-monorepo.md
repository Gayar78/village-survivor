# ADR-0001 — Organiser le projet en monorepo avec pnpm

- Statut : **Accepté**
- Date : 20 juillet 2026
- Exigences : `REQ-STACK-003`, `REQ-ARCH-003`, `REQ-CI-001`

## Contexte

Le projet doit livrer un client web, une simulation partagée, un protocole commun et,
ultérieurement, un serveur. Ces composants évoluent ensemble et doivent partager des
types, des règles de qualité et des commandes de développement.

Le premier incrément est local et pourrait tenir dans une application unique, mais
cette organisation rendrait plus coûteuse l'extraction ultérieure de la simulation et
du protocole.

## Décision

Utiliser un monorepo piloté par les workspaces `pnpm`.

Les responsabilités cibles sont réparties entre :

- `apps/client` pour le navigateur et Phaser ;
- `apps/server` lorsque Colyseus sera introduit ;
- `packages/game-core` pour la simulation ;
- `packages/protocol` pour les contrats de session et réseau ;
- `packages/content` ou un espace équivalent pour les données validées ;
- des tests et scripts transverses lorsque leur portée le justifie.

Les répertoires sont créés progressivement. L'arborescence cible ne justifie pas des
packages vides ou une configuration complexe avant leur premier usage.

Les commandes de formatage, lint, types, tests, build et développement sont exposées
depuis la racine.

## Options étudiées

### Dépôts séparés

Rejeté au démarrage : coordination des versions, changements atomiques et CI seraient
plus coûteux pour une petite équipe et des composants fortement liés.

### Application client unique puis extraction

Rejeté : simple à très court terme, mais favorise le couplage de la logique à Phaser
et transforme la préparation multijoueur en refactoring risqué.

### Autres gestionnaires de workspaces

`npm` et Yarn pourraient répondre au besoin. `pnpm` est retenu par le cadrage pour son
installation déterministe, son efficacité et sa gestion explicite des dépendances de
workspace.

## Conséquences

### Positives

- changements atomiques entre client, simulation et protocole ;
- configuration de qualité et CI centralisée ;
- partage de types sans publication de packages ;
- une seule installation et des commandes racine cohérentes.

### Négatives

- configuration initiale légèrement plus importante ;
- nécessité de surveiller les dépendances entre packages ;
- risque de créer trop tôt des packages sans responsabilité réelle.

### Garde-fous

- aucun package vide uniquement pour respecter un diagramme ;
- dépendances de workspace explicites ;
- absence de cycles vérifiée par la structure et, si nécessaire, par un outil dédié ;
- une nouvelle application ou un nouveau package doit posséder une responsabilité
  unique et documentée.
