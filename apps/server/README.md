# Serveur de jeu autoritaire

`apps/server` héberge l'API de création de rooms et le transport Colyseus. Une room possède une
seule `TowerSimulation`, cadencée à 50 ms. Depuis la boucle 3, les parcours solo et coopératif de
production passent tous deux par ce serveur et ne disposent d'aucun repli local ou P2P.

## Démarrage local

Le processus exige quatre variables dans son environnement :

| Variable | Usage |
|---|---|
| `JWT_SECRET` | vérification locale des JWT Supabase HS256 |
| `SERVICE_ROLE_KEY` | lecture serveur des profils via PostgREST |
| `POSTGREST_URL` | origine PostgREST, sans chemin final `/` |
| `PORT` | port HTTP/WebSocket, `2567` par défaut |

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
que le processus répond. Le préfixe public `/game/` sera ajouté par Nginx à la boucle 4.

Une identité peut demander au plus cinq créations par minute. L'excédent reçoit HTTP 429 et le
code fermé `rate-limited` ; cette limite en mémoire est réinitialisée avec le processus.

## Commandes et erreurs

- `control` : non fiable, au plus 30/s, séquence strictement croissante, déplacement `[-1, 1]`,
  visée finie et bornée ; après 250 ms de silence, l'entrée devient neutre ;
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

## Vérifications

```powershell
pnpm --filter @village-survivor/server typecheck
pnpm exec vitest run apps/server/src
pnpm --filter @village-survivor/client build
pnpm test:smoke
```

Le smoke démarre le vrai serveur, un faux PostgREST hermétique et Chromium avec un JWT de test.
Il prouve le parcours solo, le refus d'un JWT invalide, l'impossibilité de créer directement une
room forgée, les rosters réels de deux et quatre clients, l'annulation à quinze secondes, la
reconnexion à dix secondes et le refus après trente et une secondes.
