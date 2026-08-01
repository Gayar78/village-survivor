# Village Survivor — Déploiement

> Statut : approuvé
> Version du projet : v1
> Propriétaire : l'équipe Village Survivor
> Dernière revue : 31 juillet 2026
> État : déploiement LAN auto-hébergé fonctionnel, aucun hébergement public

## 1. État réel

Le client produit un site statique dans `apps/client/dist`, composé de deux pages :
`index.html` (lobby) et `play.html` (partie).

Un **environnement LAN auto-hébergé existe et fonctionne** depuis le 31 juillet 2026 : le jeu y
est jouable en multijoueur sans aucune dépendance à internet (voir §7). En revanche, aucun
**hébergement public** n'est configuré : ni compte Cloudflare, ni URL publique, ni pipeline de
publication.

Il n'existe aucun serveur de jeu à déployer — la simulation tourne dans le navigateur et la
coopération est pair-à-pair. Le seul service externe est **Supabase**, qui n'est pas déployé par
ce dépôt mais configuré à la main dans son tableau de bord.

## 2. Intégration continue

Le workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) s'exécute sur `main`, sur
les branches `codex/**` et sur chaque pull request :

1. checkout ;
2. installation de pnpm 11.15.1 ;
3. Node.js 24 avec cache pnpm ;
4. `pnpm install --frozen-lockfile` ;
5. `pnpm format:check` ;
6. `pnpm lint` ;
7. `pnpm typecheck` ;
8. `pnpm test` ;
9. `pnpm build` ;
10. installation du navigateur Playwright ;
11. `pnpm test:smoke`.

Les tests navigateur avaient été retirés le 27 juillet 2026, quand l'authentification
obligatoire est apparue : l'application affichait d'abord l'écran de connexion, que les
scénarios ne connaissaient pas, et la CI n'a pas de clés Supabase.

**Le smoke test a été rétabli le 31 juillet 2026** en le faisant viser `play.html` plutôt que
`/`. Cette page démarre sans projet Supabase, ce qui rend le test exécutable partout, y compris
en CI. Il vérifie que le jeu se lance réellement dans un navigateur, que le build n'expose
aucune API de débogage et que la graine reçue par l'URL n'est jamais interprétée comme du HTML.

**Ce qui n'est toujours pas couvert** : le lobby. Connexion, hub et lancement coopératif n'ont
aucun test de bout en bout, faute de mode invité ou de mock d'authentification.

Aucune étape de publication n'existe, donc aucune règle du type « un échec interdit le
déploiement » ne s'applique encore.

## 3. Variables d'environnement

Le client lit exactement deux variables, chargées depuis un `.env` **à la racine du monorepo**
(et non dans `apps/client` — voir le champ `envDir` de la configuration Vite) :

| Variable | Rôle |
|---|---|
| `VITE_SUPABASE_URL` | adresse du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | clé publique `anon` |

Ces deux valeurs sont **intégrées au paquet JavaScript** et donc publiques. C'est le
fonctionnement prévu de Supabase : la sécurité repose sur les politiques RLS, pas sur le secret
de la clé `anon`.

La clé `service_role`, elle, contourne toutes les politiques RLS. Elle ne doit jamais figurer
dans un `.env` lu par Vite, ni dans le dépôt, ni dans un bundle. Aucun composant de ce projet
n'en a besoin.

Sans ces variables, `play.html` reste jouable en solo ; `index.html` affiche « Configuration
requise ».

## 4. Base de données

Le schéma vit dans [`supabase/migrations/`](../supabase/migrations) — cinq fichiers SQL
idempotents. **Leur application est manuelle** : éditeur SQL du tableau de bord, ou
`supabase db push`. Aucun automatisme ne les applique, et rien ne vérifie qu'un environnement est
à jour. Voir [`SETUP_SUPABASE.md`](SETUP_SUPABASE.md).

Une mise à jour du client qui suppose une migration non appliquée casse silencieusement les
fonctionnalités concernées.

## 5. Build de production

```bash
pnpm build
```

Points à connaître :

- **la minification est désactivée** dans la configuration Vite. Ce n'est pas un oubli : depuis
  le 27 juillet 2026, rolldown/oxc cassait le rendu du canvas. Le paquet de la page de jeu pèse
  en conséquence environ 7,2 Mo (1,3 Mo compressé) ;
- **les sourcemaps sont produites et publiées**, ce qui expose le code source d'origine ;
- deux points d'entrée sont construits, `index.html` et `play.html`.

Ces trois points sont acceptables pour un projet non publié. Aucun ne l'est pour une mise en
ligne publique.

## 6. Cible d'hébergement

La cible reste **Cloudflare Workers Static Assets** pour un site statique, décidée au cadrage et
jamais remise en cause. Aucun serveur n'est à héberger.

Le déploiement suppose, en plus de la mise en ligne des fichiers :

- l'ajout de l'URL de production dans **Authentication > URL Configuration** du projet Supabase,
  faute de quoi les connexions Google et GitHub échoueront ;
- la mise à jour des URL de rappel dans les applications OAuth Google et GitHub ;
- l'activation de la confirmation d'email, à garder active en production.

## 7. Environnements

| Environnement | Client | Supabase | État |
|---|---|---|---|
| Local | `pnpm dev` sur `127.0.0.1:5173` | projet personnel du développeur | fonctionnel |
| **LAN auto-hébergé** | nginx conteneurisé sur `<IP>:8080` | stack Docker locale | **fonctionnel** |
| Preview / staging | non configuré | non configuré | inexistant |
| Production | non configuré | non configuré | inexistant |

### Environnement LAN

Depuis le 31 juillet 2026, le jeu peut tourner en multijoueur sur un réseau local sans aucune
dépendance à internet. Une stack Docker héberge Postgres, GoTrue, PostgREST et Realtime, et un
nginx sert le client tout en faisant passerelle vers ces trois services **sur une seule
origine** — ce qui supprime toute question de CORS.

Procédure complète, pièges et portée de sécurité : [`deploy/lan/README.md`](../deploy/lan/README.md).

Trois points structurants en découlent :

- **l'adresse du serveur est figée dans le paquet** par Vite, donc changer d'adresse impose de
  reconstruire le client ;
- **les migrations ne peuvent pas être jouées à l'initialisation de Postgres**, car la première
  référence `auth.users`, table créée par GoTrue à son premier démarrage ;
- **les connexions OAuth ne fonctionnent pas en LAN** : servi en HTTP clair, le navigateur
  n'accorde pas de contexte sécurisé, et les fournisseurs ne peuvent pas rappeler une adresse
  privée. La connexion par courriel et mot de passe, elle, fonctionne.

Un environnement de preview partageant le projet Supabase de production partagerait aussi ses
comptes et ses données. Si des previews sont mises en place, elles devront viser un projet
Supabase distinct.

## 8. Secrets

Aucun secret n'est commité : `.env` et `.env.*` sont ignorés par Git, à l'exception de
`.env.example` qui ne contient que des clés vides.

Les secrets réels du projet ne vivent pas dans le dépôt mais dans le tableau de bord Supabase :
identifiants OAuth Google et GitHub, mot de passe de la base, clé `service_role`. Leur
propriétaire, leur rotation et leur périmètre ne sont documentés nulle part — c'est une lacune à
combler avant toute mise en ligne.

## 9. Retour arrière

Pour le client statique, republier l'artefact d'un commit antérieur suffira lorsqu'un
hébergement existera.

Les migrations, en revanche, **n'ont pas de chemin de retour arrière** : elles ne comportent pas
de section `down`, et rien n'articule une version du client avec une version du schéma. Un
retour arrière du client après une migration appliquée n'est pas couvert.

## 10. Prérequis non fournis

- compte et projet Cloudflare, URL ou domaine de production ;
- projet Supabase de production, distinct de celui de développement ;
- politique de preview ;
- secrets GitHub nécessaires à une publication ;
- budgets de coût autorisés ;
- licence du dépôt public.
