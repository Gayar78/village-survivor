# Village Survivor — Déploiement

> Statut : migration v2 en cours
> Version du projet : v2
> Propriétaire : Gayar
> Dernière revue : 3 août 2026
> État : serveur solo/coop implémenté localement ; intégration LAN prévue en boucle 4

## 1. État réel

Le client produit un site statique dans `apps/client/dist`, composé de deux pages :
`index.html` (lobby) et `play.html` (partie).

Un **environnement LAN auto-hébergé existe** depuis le 31 juillet 2026 pour le client et
Supabase. La boucle 2 ajoute `apps/server`, mais ne l'a pas encore intégré au Compose ou à
Nginx : le parcours solo autoritaire fonctionne localement sur le port 2567, pas encore sur la
stack LAN canonique. Cette intégration, le healthcheck conteneur et la limite mémoire arrivent
en boucle 4.

La coopération utilise désormais ce serveur en local. Aucun hébergement public n'est configuré :
ni compte Cloudflare, ni URL publique, ni pipeline de publication.

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

Le smoke vise `play.html` avec le vrai serveur Colyseus, un faux PostgREST local et des JWT signés
par un secret de test. Il vérifie le parcours solo, les rooms coopératives de deux et quatre
clients, l'annulation d'un roster partiel, les coupures de dix et trente et une secondes, le refus
d'un JWT invalide, l'impossibilité de forger une room par le matchmaker public et l'absence d'API
de débogage. Aucun bypass d'auth n'existe dans le build.

**Ce qui n'est toujours pas couvert** : l'interface du lobby de bout en bout. Son contrat de
broadcast `roomId` est testé, puis les clients Colyseus réels couvrent l'admission et la partie.

Aucune étape de publication n'existe, donc aucune règle du type « un échec interdit le
déploiement » ne s'applique encore.

## 3. Variables d'environnement

Le client lit les variables publiques suivantes depuis le `.env` à la racine :

| Variable | Rôle |
|---|---|
| `VITE_SUPABASE_URL` | adresse du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | clé publique `anon` |
| `VITE_GAME_SERVER_URL` | optionnelle : origine du serveur ; défaut port 2567 en local, `/game` déployé |

Ces deux valeurs sont **intégrées au paquet JavaScript** et donc publiques. C'est le
fonctionnement prévu de Supabase : la sécurité repose sur les politiques RLS, pas sur le secret
de la clé `anon`.

Le processus `apps/server` lit `JWT_SECRET`, `SERVICE_ROLE_KEY`, `POSTGREST_URL` et `PORT`.
Ces noms ne portent jamais `VITE_` : Vite ne les expose pas au bundle. La clé `service_role`
contourne les RLS et reste strictement côté serveur.

Sans session Supabase ou sans serveur, `play.html` affiche une erreur lisible et ne démarre
aucune simulation locale. Il n'existe plus de mode solo hors ligne.

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

Cette commande compile désormais le client, les packages et `apps/server`. Le serveur produit
du JavaScript dans `apps/server/dist`; en développement la commande
`pnpm --filter @village-survivor/server dev` utilise `tsx`.

Points à connaître :

- **la minification est désactivée** dans la configuration Vite. Ce n'est pas un oubli : depuis
  le 27 juillet 2026, rolldown/oxc cassait le rendu du canvas. Le paquet de la page de jeu pèse
  en conséquence environ 7,2 Mo (1,3 Mo compressé) ;
- **les sourcemaps sont produites et publiées**, ce qui expose le code source d'origine ;
- deux points d'entrée sont construits, `index.html` et `play.html`.

Ces trois points sont acceptables pour un projet non publié. Aucun ne l'est pour une mise en
ligne publique.

## 6. Cible d'hébergement

Le client statique peut toujours être publié séparément, mais une partie exige désormais un
serveur Node/Colyseus. La cible LAN approuvée place ce processus derrière Nginx sous `/game/`.
Un hébergement public futur devra donc fournir WebSocket et processus Node ; Static Assets seul
ne suffit plus.

Le déploiement suppose, en plus de la mise en ligne des fichiers :

- l'ajout de l'URL de production dans **Authentication > URL Configuration** du projet Supabase,
  faute de quoi les connexions Google et GitHub échoueront ;
- la mise à jour des URL de rappel dans les applications OAuth Google et GitHub ;
- l'activation de la confirmation d'email, à garder active en production.

## 7. Environnements

| Environnement | Client | Supabase | État |
|---|---|---|---|
| Local | Vite 5173 + jeu 2567 | projet personnel du développeur | solo et coop autoritaires fonctionnels |
| **LAN auto-hébergé** | nginx conteneurisé sur `<IP>:8080` | stack Docker locale | client/Supabase fonctionnels, game-server à intégrer |
| Preview / staging | non configuré | non configuré | inexistant |
| Production | non configuré | non configuré | inexistant |

### Environnement LAN

Depuis le 31 juillet 2026, le jeu peut tourner en multijoueur sur un réseau local sans aucune
dépendance à internet. Une stack Docker héberge Postgres, GoTrue, PostgREST et Realtime, et un
nginx sert le client tout en faisant passerelle vers ces trois services **sur une seule
origine** — ce qui supprime toute question de CORS.

Procédure complète, pièges et portée de sécurité : [`deploy/lan/README.md`](../deploy/lan/README.md).

Quatre points structurants en découlent :

- **l'adresse du serveur est figée dans le paquet** par Vite, donc changer d'adresse impose de
  reconstruire le client ;
- **les migrations ne peuvent pas être jouées à l'initialisation de Postgres**, car la première
  référence `auth.users`, table créée par GoTrue à son premier démarrage ;
- **les connexions OAuth ne fonctionnent pas en LAN** : servi en HTTP clair, le navigateur
  n'accorde pas de contexte sécurisé, et les fournisseurs ne peuvent pas rappeler une adresse
  privée. La connexion par courriel et mot de passe, elle, fonctionne.
- le futur proxy `/game/` doit conserver l'upgrade WebSocket et retirer ce préfixe avant de
  transmettre au serveur ; cette configuration appartient à la boucle 4.

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
