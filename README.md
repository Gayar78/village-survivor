# Village Survivor

*Village Survivor* est un jeu 2D pour navigateur. Dans sa forme actuelle — nom de code
**« Tower »** — vous défendez un Cœur au centre d'une plaine contre des vagues de monstres qui
ne cessent jamais d'arriver.

## Objectif

Livrer un vrai jeu, pour de vrais joueurs — et le prouver d'abord en donnant à Gayar, Hida et
Clem l'envie d'y revenir d'eux-mêmes.

Le jeu existe et fonctionne ; ce qui n'est pas établi, c'est qu'il donne envie d'y revenir.
La réussite se mesure donc sur un mois : les trois lancent chacun au moins trois parties de
leur propre initiative, et le groupe écrit au moins cinq propositions d'amélioration.

Le public est un cercle fermé de 5 à 20 personnes, par sessions de 2 à 4 joueurs. Pas
d'ouverture publique, pas d'argent réel ou virtuel. Détail complet dans
[`docs/objectif.md`](docs/objectif.md).

## État du projet

Le jeu jouable est un **twin-stick shooter de survie**, solo ou coopératif jusqu'à dix joueurs.
Vous vous déplacez au clavier, visez à la souris, tirez, ramassez de la ferraille pour améliorer
quatre tourelles fixes, et vous tenez le plus longtemps possible. **Il n'y a pas de victoire :
seulement une défaite plus ou moins tardive.**

Un premier MVP différent, « M1 », avait été livré en juillet 2026 : exploration diurne, défense
nocturne, récolte de bois, balistes, épée et barrière. Il a été remplacé par le jeu actuel, et
son code a été supprimé du dépôt le 31 juillet 2026 — il reste consultable dans l'historique Git.

Les règles réellement implémentées sont décrites dans
[`docs/gameplay/current-rules.md`](docs/gameplay/current-rules.md), qui signale aussi les points
où le jeu contredit des décisions produit encore formellement en vigueur.

## Lancer le jeu

Prérequis : Node.js 24 ou 26, et pnpm 11.15.1 (la version est épinglée par le champ
`packageManager`).

```bash
pnpm install
pnpm dev
```

Le client démarre sur `http://127.0.0.1:5173`.

### Deux pages, deux prérequis

| Page | Contenu | Compte requis |
|---|---|---|
| `/play.html?seed=<graine>` | la partie elle-même, en solo | **non** |
| `/` | connexion, menu, hub multijoueur, atelier de méta-build | **oui** |

**Pour simplement jouer ou faire une recette en solo, ouvrez directement `/play.html`.** Elle ne
dépend d'aucun service externe.

### Jouer à plusieurs sur un réseau local

Un déploiement Docker complet permet de jouer en multijoueur sur un LAN **sans aucune
dépendance à internet** : base de données, comptes et temps réel sont auto-hébergés.

```bash
node deploy/lan/setup.mjs && pnpm build && docker compose -f deploy/lan/docker-compose.yml up -d
```

Procédure détaillée, vérifications et portée de sécurité :
[`deploy/lan/README.md`](deploy/lan/README.md).

Le lobby, en revanche, exige un projet Supabase : sans les variables `VITE_SUPABASE_URL` et
`VITE_SUPABASE_ANON_KEY` dans un fichier `.env` à la racine, il affiche « Configuration requise »
et ni le menu, ni la coopération, ni la progression de compte ne sont accessibles. Le guide pas à
pas est [`docs/SETUP_SUPABASE.md`](docs/SETUP_SUPABASE.md) — pensez à appliquer **les cinq**
migrations de `supabase/migrations`, pas seulement la première.

## Contrôles

| Touche | Action |
|---|---|
| `ZQSD`, `WASD` ou les flèches | se déplacer |
| Souris | viser |
| Clic gauche maintenu | tirer |
| `1`, `2`, `3` | changer d'arme — ou choisir une carte quand une montée de niveau est en attente |
| `E` | ouvrir l'atelier, à proximité d'une tourelle |
| `Échap` | menu de partie |

Pendant que l'atelier d'une tourelle est ouvert, votre avatar est ignoré par les monstres.

## Principes techniques

- une simulation TypeScript indépendante de Phaser, du navigateur et du réseau ;
- une boucle déterministe à pas fixe de 50 ms, exécutée par l'unique simulation serveur ;
- un client Phaser 4 qui ne communique que par une frontière `TowerSession` ;
- un serveur Colyseus autoritaire requis en solo comme en coopération ;
- Supabase pour l'authentification, la progression de compte et le lobby temps réel.

## Documentation

| Sujet | Document |
|---|---|
| **Porte d'entrée de la documentation** | [`docs/index.md`](docs/index.md) |
| Objectif du projet | [`docs/objectif.md`](docs/objectif.md) |
| Règles réellement implémentées | [`docs/gameplay/current-rules.md`](docs/gameplay/current-rules.md) |
| Architecture réelle | [`docs/architecture.md`](docs/architecture.md) |
| Décisions d'architecture | [`docs/decisions/README.md`](docs/decisions/README.md) |
| Configuration de Supabase | [`docs/SETUP_SUPABASE.md`](docs/SETUP_SUPABASE.md) |
| Déploiement et intégration continue | [`docs/deployment.md`](docs/deployment.md) |
| Déploiement LAN auto-hébergé | [`deploy/lan/README.md`](deploy/lan/README.md) |
| Cadrage technique d'origine | [`docs/requirements/initial-technical-baseline.md`](docs/requirements/initial-technical-baseline.md) |
| Traçabilité des exigences | [`docs/qualite/traceabilite.md`](docs/qualite/traceabilite.md) |
| Piliers produit de juillet 2026 | [`docs/product/product-pillars.md`](docs/product/product-pillars.md) |
| Feuille de route | [`ROADMAP.md`](ROADMAP.md) |
| Historique des changements | [`CHANGELOG.md`](CHANGELOG.md) |

Les piliers produit et le cadrage technique sont des documents **historiques et normatifs** que
le code contredit aujourd'hui sur plusieurs points. Ces contradictions sont listées, pas
effacées : voir la section « Écarts non arbitrés » des règles de gameplay et les ADR 0008 et 0009.

## Contrôles de qualité

```bash
pnpm check
```

Enchaîne formatage, lint, types, tests unitaires et build. C'est ce que vérifie la CI.

| Commande | Portée |
|---|---|
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck` | formatage, règles et types |
| `pnpm test` | 159 tests unitaires, de simulation, de contrat et d'observabilité |
| `pnpm build` | build de production des deux pages |
| `pnpm test:smoke` | Playwright sur le build : le jeu démarre, aucune API de débogage, aucune erreur console |
| `pnpm benchmark` | coût d'un tick sous 200 monstres et coût d'une projection d'état |

Le smoke test vise `play.html` et fonctionne donc **sans clés Supabase** : il tourne en CI. Il
faut avoir téléchargé le navigateur une fois, avec `pnpm exec playwright install chromium`.

Il n'existe en revanche **aucun test de bout en bout du lobby** : il faudrait un mode invité ou
un mock de l'authentification.

Sur Windows, si `pnpm format:check` signale des centaines de fichiers, c'est un artefact de fins
de ligne : le dépôt n'a pas de `.gitattributes` et Git convertit en CRLF à l'extraction.
`git config core.autocrlf false` puis une réextraction résolvent le symptôme.

## Dépôts

- Développement historique déclaré :
  [HidaAkawa/village_survivor](https://github.com/HidaAkawa/village_survivor)
- Référence fonctionnelle en lecture seule :
  [Gayar78/village-survivors-v2](https://github.com/Gayar78/village-survivors-v2)

Le prototype historique sert uniquement à comprendre des intentions fonctionnelles. Son code et
ses assets ne sont pas repris.

## Licence

Aucune licence n'a encore été choisie. Malgré la visibilité publique du dépôt, le code
et les contenus ne doivent pas être considérés comme librement réutilisables tant
qu'un fichier de licence explicite n'est pas ajouté.
