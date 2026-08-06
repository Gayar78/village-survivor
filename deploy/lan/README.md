# Déploiement LAN auto-hébergé

Prépare *Village Survivor* sur un réseau local, **sans dépendance à internet**. La stack
canonique contient la base, les comptes, le lobby temps réel, le collecteur, le client statique
et le serveur de jeu autoritaire. Nginx publie l'ensemble sur une seule origine.

## Pourquoi une stack complète

Le serveur Colyseus simule toutes les parties. Supabase reste nécessaire pour les comptes, la
progression et le lobby : le chef y diffuse uniquement le `roomId` créé par le serveur.

| Service | Rôle | Image |
|---|---|---|
| `db` | Postgres, avec les rôles et extensions attendus par Supabase | `supabase/postgres` |
| `auth` | comptes, sessions, TOTP | `supabase/gotrue` |
| `rest` | tables et RPC sous politiques RLS | `postgrest/postgrest` |
| `realtime` | présence, invitations et diffusion du `roomId` dans le hub | `supabase/realtime` |
| `otel` | reçoit traces, métriques et journaux du navigateur, et les affiche | `grafana/otel-lgtm` |
| `game-server` | authentifie, simule les rooms Colyseus et finalise les récompenses | image locale Node 24 |
| `web` | sert le jeu et fait passerelle vers les cinq autres services applicatifs | `nginx` |

Ni Studio, ni Storage, ni Edge Functions, ni pooler : le jeu ne s'en sert pas.

**`otel` n'est pas nécessaire pour jouer.** Arrêté, absent ou en panne, les parties se déroulent
à l'identique et les mesures sont simplement perdues : la télémétrie n'est jamais sur le chemin
critique d'une partie.

`web` expose tout sur **une seule origine**. Pour le navigateur, le jeu et l'API sont le même
site : aucune question de CORS ne se pose.

## Mise en route

Prérequis : Docker, Node.js et pnpm.

```powershell
# 1. Détecte l'adresse LAN, tire les secrets, écrit deploy/lan/.env et .env
node deploy/lan/setup.mjs

# 2. Construit le client — l'URL Supabase est FIGÉE dans le paquet à cette étape
pnpm build

# 3. Démarre la stack
docker compose -f deploy/lan/docker-compose.yml up -d

# 4. Applique les migrations du jeu (après que l'authentification soit saine)
./deploy/lan/apply-migrations.ps1

# 5. Vérifie le lobby et la frontière transactionnelle des récompenses
node deploy/lan/check-realtime.mjs
./deploy/lan/check-game-rewards.ps1
```

Compose construit et lance `game-server`. Son port 2567 reste interne au réseau Docker ; les
navigateurs utilisent `/game/` via Nginx. Seul le port 8080 doit être ouvert sur le LAN.

Puis, **dans une console PowerShell en administrateur**, autorisez le port du site :

```powershell
New-NetFirewallRule -DisplayName 'Village Survivor LAN (8080)' -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private
```

Les autres joueurs ouvrent alors l'adresse affichée par `setup.mjs`, par exemple
`http://192.168.1.24:8080`. Chacun crée un compte — l'inscription est auto-confirmée, aucun
courriel n'est envoyé — puis le hub permet de former un salon et de lancer une partie.

L'interface de télémétrie écoute sur 3001 et reste
joignable depuis la machine hôte sans rien ouvrir ; n'ajoutez une règle pour ce port que si vous
voulez la consulter depuis un autre poste :

```powershell
New-NetFirewallRule -DisplayName 'Village Survivor télémétrie (3001)' -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Private
```

## Pièges à connaître

**Ouvrir le port ne suffit pas : encore faut-il que la règle couvre la bonne interface.** Une
règle créée pour le profil « Privé » reste sans effet si Windows a classé votre réseau comme
« Public », ce qu'il fait par défaut. Le symptôme est déroutant : la règle existe, elle est
active, le port écoute, la page répond depuis la machine elle-même — et aucun autre poste
n'arrive à se connecter. Vérifiez le classement, et corrigez-le si le réseau vous appartient :

```powershell
Get-NetConnectionProfile | Select-Object InterfaceAlias, NetworkCategory
Set-NetConnectionProfile -InterfaceAlias Ethernet -NetworkCategory Private
```

Ce second réglage ne fait pas qu'ouvrir un port : il déclare le réseau fiable et relâche
d'autres protections pour lui. À réserver à un réseau personnel. Sur un réseau d'entreprise ou
partagé, étendre la seule règle au profil public est plus prudent :
`Set-NetFirewallRule -DisplayName '…' -Profile Private,Public`.

Notez aussi qu'une règle « Privé » s'applique à **toutes** les interfaces ainsi classées, y
compris un réseau privé virtuel du type Tailscale : le jeu peut devenir joignable par des
personnes hors du LAN sans que ce soit voulu.

**Tester depuis la machine hôte ne prouve rien.** Une requête d'un poste vers sa propre adresse
ne traverse pas le pare-feu comme une requête venue de l'extérieur. La seule preuve qu'un joueur
peut se connecter, c'est un second poste qui se connecte.

**Le client et le serveur ne se mettent pas à jour de la même façon, et c'est un piège.** `web`
monte `apps/client/dist` en volume : un `pnpm build` change **immédiatement** ce que les
navigateurs téléchargent, sans qu'aucun conteneur soit recréé. Le serveur de jeu, lui, vit dans
une image : `docker compose up -d` seul **ne le reconstruit pas**. Après un changement de code,
la séquence complète est donc :

```powershell
pnpm build
docker compose -f deploy/lan/docker-compose.yml build game-server
docker compose -f deploy/lan/docker-compose.yml up -d --force-recreate game-server
```

Sauter la deuxième et la troisième ligne laisse tourner un client neuf devant un serveur ancien.
Le 6 août 2026, une partie entière a été jouée dans cet état : le serveur ne connaissait aucun
monstre du bestiaire Torri, mais le rendu était celui de la version courante. Le jeu paraissait
fonctionner et la télémétrie était verte — elle mesurait simplement une autre version. Vérifiez
ce que le conteneur exécute réellement plutôt que ce que le dépôt contient :

```powershell
docker inspect vs-game-server --format '{{.Created}}'
docker compose -f deploy/lan/docker-compose.yml logs game-server --tail 5
```

**Ne reconstruisez pas le client pendant que quelqu'un joue.** L'écriture dans `apps/client/dist`
est visible du serveur web à l'instant même.

**L'adresse est figée à la compilation.** `VITE_SUPABASE_URL` est intégrée au paquet par Vite.
Si l'adresse de la machine change, il faut relancer `setup.mjs --host <nouvelle IP>` **puis**
`pnpm build`, sinon les clients continueront de parler à l'ancienne adresse.

**Ne mettez pas `localhost` comme hôte.** Le paquet servi aux autres machines pointerait vers
leur propre machine. `setup.mjs` choisit une adresse privée routable et écarte volontairement
les interfaces virtuelles et Tailscale, qu'il liste tout de même en fin d'exécution.

**Le HTTP en clair coûte un contexte non sécurisé.** Sur `http://<IP>`, le navigateur n'expose
pas `crypto.randomUUID` ni `crypto.subtle`. Le jeu s'en accommode — les graines viennent de
`crypto.getRandomValues`, disponible partout — mais **les connexions OAuth Google et GitHub ne
fonctionneront pas** : elles ont besoin d'un contexte sécurisé et d'un fournisseur joignable
depuis internet. En LAN, utilisez la connexion par courriel et mot de passe.

**Le nom du conteneur `realtime-dev.supabase-realtime` n'est pas cosmétique.** Realtime déduit
l'identifiant de son locataire du sous-domaine de l'en-tête `Host`. C'est pourquoi `nginx.conf`
force cet en-tête sur la route `/realtime/v1/`. Renommer le conteneur sans adapter nginx casse
le lobby et les invitations, mais pas une room Colyseus déjà démarrée.

**Les migrations ne peuvent pas être jouées à l'initialisation de Postgres.** La migration
`0001` référence `auth.users`, table que GoTrue crée à son premier démarrage. D'où l'étape 4,
séparée. Toutes les migrations sont idempotentes : relancer le script est sans danger.

## Vérifier

```powershell
docker compose -f deploy/lan/docker-compose.yml ps
node deploy/lan/check-realtime.mjs
./deploy/lan/check-game-rewards.ps1
```

`check-realtime.mjs` ouvre deux connexions sur un même canal et vérifie qu'un message diffusé
par l'une parvient à l'autre — le mécanisme utilisé par le lobby pour transmettre `roomId`. Il ne
vérifie ni le serveur Colyseus ni une partie. `check-game-rewards.ps1` crée deux comptes isolés,
lance deux finalisations concurrentes, contrôle les droits puis nettoie ses données.

Deux contrôles complètent le tableau :

- **serveur joignable** — `Invoke-WebRequest http://<adresse>:8080/game/health` doit répondre
  `200` depuis le second poste ;
- **télémétrie reçue** — la route de la passerelle doit répondre :

  ```powershell
  Invoke-WebRequest 'http://<adresse>:8080/otel/v1/traces' -Method POST `
    -ContentType 'application/json' -Body '{"resourceSpans":[]}'
  ```

  Une réponse `200 {"partialSuccess":{}}` signifie que le collecteur reçoit.

## Exploitation

**Consulter la télémétrie** : `http://<adresse>:3001` — traces d'une partie (Tempo), mesures de
performance (Prometheus) et journaux corrélés (Loki), sans mot de passe puisque l'interface n'est
exposée que sur le réseau local.

Pour élever le niveau de journalisation d'un poste **sans reconstruire le jeu**, dans la console
du navigateur :

```javascript
localStorage.setItem('vs.log.level', 'trace'); // puis recharger la page
```

```powershell
# Journaux du serveur de jeu
docker compose -f deploy/lan/docker-compose.yml logs -f game-server

# Arrêter sans rien perdre
docker compose -f deploy/lan/docker-compose.yml stop

# Tout détruire, comptes et progression compris
docker compose -f deploy/lan/docker-compose.yml down -v
```

La base est accessible en local sur `127.0.0.1:54322` (utilisateur `postgres`, mot de passe dans
`deploy/lan/.env`), jamais depuis le LAN.

## Portée de sécurité

Ce déploiement est prévu pour **un réseau local de confiance**, et rien d'autre.

- tout circule en clair : ni TLS, ni certificat ;
- la clé `anon` est publique par conception — la protection réelle vient des politiques RLS ;
- l'inscription est ouverte et auto-confirmée : quiconque atteint le port 8080 peut créer un
  compte ;
- la règle de pare-feu ci-dessus est limitée au profil **privé** ; ne l'étendez pas au profil
  public ;
- n'exposez pas ce port sur internet, et ne redirigez pas de port depuis votre box.

La simulation et le crédit d'or sont autoritaires côté serveur depuis l'ADR-0011. La clé
`service_role` n'est injectée que dans `game-server`; elle ne doit jamais être préfixée `VITE_`,
journalisée ou copiée dans le client.

## Fichiers

| Fichier | Rôle |
|---|---|
| `docker-compose.yml` | les sept services et leurs contrôles de santé |
| `nginx.conf` | passerelle : jeu, `/game`, `/auth/v1`, `/rest/v1`, `/realtime/v1`, `/otel`, `/diagnostics` |
| `setup.mjs` | détection d'adresse, génération des secrets et des deux `.env` |
| `apply-migrations.ps1` | applique les migrations du jeu |
| `check-realtime.mjs` | contrôle du transport du lobby |
| `check-game-rewards.ps1` | contrôle concurrence/idempotence/droits de la RPC d'or |
| `volumes/db/*.sql` | initialisation Postgres, dérivée de `supabase/docker` |
| `.env` | **secrets générés, jamais committés** |
