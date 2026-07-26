# Village Survivor

*Village Survivor* est un jeu 2D pour navigateur qui alterne exploration diurne,
développement d'un village et défense nocturne contre des vagues de monstres.

## État du projet

Le premier **MVP solo M1 est implémenté**. Il permet de parcourir la chaîne complète
« explorer → rapporter → construire → défendre → gagner ou perdre » dans un client
Phaser relié à une simulation TypeScript indépendante et reproductible.

Le prochain jalon est l'élargissement progressif de cette preuve de concept vers la
V1 fonctionnelle décrite dans [`ROADMAP.md`](ROADMAP.md).

## Principes essentiels

- une simulation TypeScript indépendante de Phaser, du navigateur et du réseau ;
- une boucle déterministe autant que raisonnablement possible, à pas de temps fixe ;
- un client Phaser 4 qui communique uniquement par une frontière `GameSession` ;
- une session locale aujourd'hui, un serveur Colyseus autoritaire demain ;
- du contenu et de l'équilibrage dans des fichiers texte validés ;
- de petits incréments jouables, testés et documentés ;
- aucune persistance de compte avant un besoin produit validé.

## Documentation

| Sujet | Document |
|---|---|
| Vision et règles produit | [`docs/product/product-pillars.md`](docs/product/product-pillars.md) |
| Décisions de l'atelier produit | [`docs/product/decisions/2026-07-20-product-workshop.md`](docs/product/decisions/2026-07-20-product-workshop.md) |
| Cadrage technique normatif | [`docs/requirements/initial-technical-baseline.md`](docs/requirements/initial-technical-baseline.md) |
| Traçabilité des exigences | [`docs/requirements/traceability-matrix.md`](docs/requirements/traceability-matrix.md) |
| Architecture cible | [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| Décisions d'architecture | [`docs/decisions/README.md`](docs/decisions/README.md) |
| Règles de gameplay courantes | [`docs/gameplay/current-rules.md`](docs/gameplay/current-rules.md) |
| Déploiement | [`docs/deployment.md`](docs/deployment.md) |
| Analyse du prototype historique | [`docs/product/legacy-analysis/functional-inventory.md`](docs/product/legacy-analysis/functional-inventory.md) |
| Feuille de route | [`ROADMAP.md`](ROADMAP.md) |
| Historique des changements | [`CHANGELOG.md`](CHANGELOG.md) |

## Architecture locale implémentée

```text
Client Phaser
    |
    | GameSession
    +-- LocalSession ----> game-core
    |
    `-- NetworkSession --> serveur Colyseus --> game-core
```

Le cœur de jeu ne dépend ni du rendu ni du transport. `NetworkSession` et le serveur
restent des cibles futures ; le client actuel utilise exclusivement `LocalSession`.

## Lancer le jeu

Prérequis : Node.js 24 ou 26 et pnpm 11. Depuis la racine :

```bash
pnpm install
pnpm dev
```

Le jeu est ensuite disponible sur `http://127.0.0.1:5173`. Les contrôles sont ZQSD,
WASD ou les flèches pour se déplacer, `E` pour interagir ou déposer les ressources au
village, `B` pour fabriquer une baliste à l'emplacement du personnage, `Espace` pour
Fente, `Maj` pour Barrière et `F` pour ouvrir les améliorations en attente, puis `1`,
`2` ou `3` pour en choisir une.

## Contrôles de qualité

```bash
pnpm build
pnpm test
pnpm test:smoke
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm format:check
pnpm benchmark
pnpm check
```

L'API `window.__VILLAGE_SURVIVOR_DEBUG__` est exposée uniquement par le serveur de
développement. Le smoke test de production vérifie explicitement qu'elle n'est pas
exposée par le build.

## Dépôts

- Développement officiel :
  [HidaAkawa/village_survivor](https://github.com/HidaAkawa/village_survivor)
- Référence fonctionnelle historique en lecture seule :
  [Gayar78/village-survivors-v2](https://github.com/Gayar78/village-survivors-v2)

Le prototype historique sert uniquement à comprendre des intentions fonctionnelles.
Son code et ses assets ne sont pas repris par défaut.

## Licence

Aucune licence n'a encore été choisie. Malgré la visibilité publique du dépôt, le code
et les contenus ne doivent pas être considérés comme librement réutilisables tant
qu'un fichier de licence explicite n'est pas ajouté.
