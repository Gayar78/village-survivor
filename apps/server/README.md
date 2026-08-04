# Serveur de jeu autoritaire

`apps/server` héberge l'API de création de rooms et le transport Colyseus. Une room possède une
seule `TowerSimulation`, cadencée à 50 ms. Depuis la boucle 3, les parcours solo et coopératif de
production passent tous deux par ce serveur et ne disposent d'aucun repli local ou P2P.

## Démarrage local

Le processus exige ses secrets Supabase côté serveur et accepte les réglages d'exploitation
suivants :

| Variable | Usage |
|---|---|
| `JWT_SECRET` | vérification locale des JWT Supabase HS256 |
| `SERVICE_ROLE_KEY` | lecture serveur des profils via PostgREST |
| `POSTGREST_URL` | origine PostgREST, sans chemin final `/` |
| `PORT` | port HTTP/WebSocket, `2567` par défaut |
| `APP_LOG_LEVEL` | seuil `trace` à `fatal`, `info` par défaut |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | origine OTLP/HTTP optionnelle ; aucune exportation si absente |

```powershell
$env:JWT_SECRET = '<jwt-secret-supabase>'
$env:SERVICE_ROLE_KEY = '<service-role-key>'
$env:POSTGREST_URL = 'http://127.0.0.1:3000'
pnpm --filter @village-survivor/server dev
```

Les secrets ne portent jamais le préfixe `VITE_` et ne sont donc pas inclus dans le bundle
navigateur. Le client accepte facultativement `VITE_GAME_SERVER_URL`; sans cette variable il
utilise `http://<hôte>:2567` en développement et `/game` sur une origine déployée.

## API, solo et coopération

1. `POST /rooms` avec `Authorization: Bearer <JWT>` et `{ "mode": "solo" }` ;
2. le serveur vérifie identité et échéance, charge le profil actif, génère `runId` et seed ;
3. un ticket interne à usage unique autorise le matchmaker à construire la room ;
4. le client rejoint `roomId` avec le même JWT avant `expiresAt` ;
5. la room se verrouille, démarre son unique simulation puis diffuse ses patches Schema.

En coopération, le chef envoie `{ "mode": "coop", "rosterUserIds": [...] }`. Le serveur réserve
exactement ces identités et le lobby Supabase ne diffuse que le `roomId` opaque. Tous les membres
doivent rejoindre avant quinze secondes ; sinon la room est annulée sans lancer un seul tick.

Le endpoint de matchmaking public ne peut pas forger une création : sans ticket interne, le
constructeur de room refuse roster, seed et bonus fournis par un appelant. `GET /health` vérifie
que le processus répond. Dans la stack LAN, Nginx publie cette API et le WebSocket sous
`/game/`, sur la même origine que le client.

Une identité peut demander au plus cinq créations par minute. L'excédent reçoit HTTP 429 et le
code fermé `rate-limited` ; cette limite en mémoire est réinitialisée avec le processus.
Une authentification Colyseus qui n'atteint jamais `onJoin` libère sa réservation après cinq
secondes, afin qu'une coupure pendant le handshake ne bloque pas durablement un membre du roster.

## Commandes et erreurs

- `control` : remplaçable, au plus 30/s, séquence strictement croissante, déplacement `[-1, 1]`,
  visée finie et bornée ; après 250 ms de silence, l'entrée devient neutre. Le transport
  WebSocket est fiable par nature : Colyseus ignore `sendUnreliable`, donc le client utilise
  `send` et le serveur élimine les séquences périmées ;
- `action` : fiable, au plus 10/s, union fermée niveau/arme/boutique, file de 16 et déduplication
  par `actionId` ;
- les champs supplémentaires, positions, dégâts, ticks, récompenses et états calculés sont
  rejetés ou ne font partie d'aucun contrat d'entrée.

Les erreurs de création utilisent un code fermé et un message affichable. JWT, identité hors
roster, double connexion, room expirée, commande malformée et dépassement de fréquence ne sont
jamais transformés en état de simulation.

Une coupure neutralise immédiatement l'entrée mais conserve l'avatar, présent et vulnérable,
pendant trente secondes. Une reconnexion récupère le même `sessionId` et un état complet. À
l'échéance, le joueur est retiré à une frontière de tick et son retour est refusé ; une sortie
volontaire le retire immédiatement. Une room vide devient `abandoned`.

Une panne terminale affiche son motif puis ramène au lobby après 3,5 secondes. Un simple refus de
commande n'est pas terminal et ne provoque aucune navigation.

## Fin de partie et récompenses

Le runtime conserve dans un registre serveur l'or de chaque participant, y compris après son
retrait. À la défaite, `finalize_game_run` reçoit le lot complet. La migration `0006` verrouille
le run, écrit les récompenses et crédite les portefeuilles dans la même transaction ; la clé
`(run_id, user_id)` et le verrou rendent les répétitions et appels concurrents idempotents. Une
room abandonnée n'appelle jamais la RPC. Une room terminée reste disponible 60 secondes et une
panne PostgREST déclenche une nouvelle tentative toutes les 5 secondes pendant cette fenêtre.
Chaque appel PostgREST expire après 4 secondes. Si la fenêtre terminale se ferme sans
persistance, le serveur émet explicitement un span et un journal d'erreur, sans identifiant.

Le navigateur ne contient plus aucune fonction de crédit d'or. La RPC est réservée à
`service_role` et l'ancien `credit_account_gold` est révoqué pour `authenticated`.

## Observabilité

Une room ouvre une racine `game.room`; création, admission, démarrage, reconnexion, persistance
et fin sont des enfants. Aucun tick ni commande valide ne crée de span. Les métriques agrègent
rooms/joueurs actifs, durée, durée et retard de tick, octets réellement encodés par patch,
commandes refusées, reconnexions, ferraille et crédits. Aucun identifiant, courriel, jeton,
`roomId`, `runId` ou seed n'est émis. Les exports OTLP sont asynchrones, bornés et facultatifs.

La durée des ticks utilise quatorze buckets explicites en millisecondes : `0,1`, `0,25`, `0,5`,
`0,75`, `0,9`, `1`, `1,25`, `1,5`, `2`, `3`, `5`, `10`, `25` et `50`. Ils permettent de vérifier
réellement le budget p95 inférieur à 1 ms. Leur nombre reste inférieur aux quinze frontières par
défaut du SDK et le calcul min/max est désactivé : cette précision n'ajoute aucune charge
significative à la boucle de jeu.

## Vérifications

```powershell
pnpm --filter @village-survivor/server typecheck
pnpm exec vitest run apps/server/src
pnpm --filter @village-survivor/client build
pnpm test:smoke
pnpm exec vitest run apps/server/src/load/authoritativeLoad.test.ts --reporter=verbose
./deploy/lan/check-game-rewards.ps1
```

Le smoke démarre le vrai serveur, un faux PostgREST hermétique et Chromium avec un JWT de test.
Il prouve le parcours solo, le refus d'un JWT invalide, l'impossibilité de créer directement une
room forgée, les rosters réels de deux et quatre clients, l'annulation à quinze secondes, la
reconnexion à dix secondes, le refus après trente et une secondes, la panne du serveur et une
panne d'export OTLP. Le scénario multi-client mesure aussi le délai commande→état. Les tests de
room couvrent en plus l'expiration d'une authentification interrompue, la capture d'un vrai patch
Schema encodé et l'erreur terminale après épuisement de la persistance.
