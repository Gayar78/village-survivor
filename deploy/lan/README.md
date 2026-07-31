# Déploiement LAN auto-hébergé

Fait tourner *Village Survivor* en multijoueur sur un réseau local, **sans aucune dépendance
à internet**. Tout est conteneurisé : base de données, comptes, temps réel et jeu.

## Pourquoi une stack complète pour un jeu sans serveur

La coopération est un lockstep pair-à-pair : aucun serveur ne simule la partie. Mais les pairs
doivent bien s'échanger leurs entrées par **quelque chose**, et ce quelque chose est un canal de
diffusion Supabase Realtime. Par ailleurs le lobby exige un compte. Rendre le jeu jouable hors
ligne impose donc d'héberger soi-même l'authentification et le temps réel.

| Service | Rôle | Image |
|---|---|---|
| `db` | Postgres, avec les rôles et extensions attendus par Supabase | `supabase/postgres` |
| `auth` | comptes, sessions, TOTP | `supabase/gotrue` |
| `rest` | tables et RPC sous politiques RLS | `postgrest/postgrest` |
| `realtime` | présence du hub **et** transport du lockstep | `supabase/realtime` |
| `web` | sert le jeu et fait passerelle vers les trois autres | `nginx` |

Ni Studio, ni Storage, ni Edge Functions, ni pooler : le jeu ne s'en sert pas.

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

# 5. Vérifie que le transport coopératif répond
node deploy/lan/check-realtime.mjs
```

Puis, **dans une console PowerShell en administrateur**, autorisez le port :

```powershell
New-NetFirewallRule -DisplayName 'Village Survivor LAN (8080)' -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private
```

Les autres joueurs ouvrent alors l'adresse affichée par `setup.mjs`, par exemple
`http://192.168.1.24:8080`. Chacun crée un compte — l'inscription est auto-confirmée, aucun
courriel n'est envoyé — puis le hub permet de former un salon et de lancer une partie.

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
tout le multijoueur, en laissant le reste du jeu parfaitement fonctionnel.

**Les migrations ne peuvent pas être jouées à l'initialisation de Postgres.** La migration
`0001` référence `auth.users`, table que GoTrue crée à son premier démarrage. D'où l'étape 4,
séparée. Les quatre fichiers sont idempotents : relancer le script est sans danger.

## Vérifier

```powershell
docker compose -f deploy/lan/docker-compose.yml ps
node deploy/lan/check-realtime.mjs
```

`check-realtime.mjs` ouvre deux connexions sur un même canal et vérifie qu'un message diffusé
par l'une parvient à l'autre — exactement le mécanisme qui transporte les lots d'entrées d'une
partie coopérative. C'est le contrôle qui compte : si le jeu se lance mais que ce script échoue,
le multijoueur ne marchera pas.

## Exploitation

```powershell
# Journaux
docker compose -f deploy/lan/docker-compose.yml logs -f realtime

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

Les limites de confiance du jeu lui-même — client autoritaire sur sa simulation et sur l'or
crédité à son compte — sont décrites dans
[ADR-0008](../../docs/decisions/0008-p2p-lockstep-coop.md) et
[ADR-0009](../../docs/decisions/0009-account-persistence.md). Le déploiement LAN ne les change
pas.

## Fichiers

| Fichier | Rôle |
|---|---|
| `docker-compose.yml` | les cinq services |
| `nginx.conf` | passerelle : jeu, `/auth/v1`, `/rest/v1`, `/realtime/v1` |
| `setup.mjs` | détection d'adresse, génération des secrets et des deux `.env` |
| `apply-migrations.ps1` | applique les quatre migrations du jeu |
| `check-realtime.mjs` | contrôle du transport coopératif |
| `volumes/db/*.sql` | initialisation Postgres, dérivée de `supabase/docker` |
| `.env` | **secrets générés, jamais committés** |
