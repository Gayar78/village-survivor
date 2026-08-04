# Village Survivor — Spécification non-fonctionnelle

> Statut : approuvé — cible v2 en cours de réalisation
> Version du projet : v2
> Propriétaire : Gayar
> Dernière revue : 3 août 2026
> Niveau de garantie requis : `renforce`

Ce document fixe comment la v2 est construite, hébergée, sécurisée, testée et diagnostiquée.
Les comportements de jeu relèvent de la [spécification fonctionnelle](spec-fonctionnelle.md).

## Classement

| Axe | Décision | Motifs |
|---|---|---|
| Garantie | `renforce` | produit partagé, service d'authentification, données de tiers |
| Complexité | élevée | navigateur, serveur de jeu, Supabase, Nginx, télémétrie, asynchronisme et données persistantes |
| Observabilité | `distribue` | une partie traverse le navigateur, le serveur de jeu et PostgREST |

Réévaluer en `critique` si le jeu s'ouvre à des inconnus, introduit de l'argent réel, collecte
des données plus sensibles ou crée une compétition classée.

## Déploiement et architecture

| Sujet | Décision |
|---|---|
| Hébergement | pile Docker auto-hébergée sur une machine du réseau local |
| Public visé | 5 à 20 comptes, une ou deux rooms, 10 joueurs maximum par room |
| Jeu | serveur Node.js/TypeScript autoritaire, requis en solo comme en coopération |
| Rooms | Colyseus `0.17.10`, client `0.17.43`, Schema `4.0.30` |
| Simulation | une `TowerSimulation` par `TowerRoom`, pas fixe de 50 ms |
| État | mémoire uniquement ; un redémarrage interrompt les parties actives |
| Façade | Nginx, HTTP et WebSocket sous `/game/`, même origine que le client |
| Coût logiciel mensuel | 0 € ; matériel et électricité existants |

Le navigateur envoie uniquement des commandes bornées et rend les états reçus. Il ne décide
jamais de la position, des dégâts, des récompenses, du tick, de la seed, du roster effectif ni
de l'état complet. Supabase garde les comptes, la progression et le lobby ; Realtime ne
transporte plus la simulation. Voir [architecture.md](architecture.md) et
[ADR-0011](decisions/ADR-0011-authoritative-game-server.md).

## Technique

| Sujet | Décision |
|---|---|
| Langage | TypeScript strict, Node.js 22 ou supérieur |
| Client | Phaser 4 et Vite 8 ; rendu sans règle de jeu |
| Serveur | Express/Colyseus, dépendant de `game-core`, `content` et `protocol` |
| Persistance | PostgreSQL/Supabase via PostgREST et RPC serveur |
| Tests | Vitest, Playwright, tests SQL et charge bornée |
| Télémétrie | OpenTelemetry, export OTLP asynchrone |

`packages/game-core` reste déterministe, indépendant du réseau, du navigateur, de l'horloge et
de toute bibliothèque de télémétrie. Le serveur mesure l'appel à la simulation de l'extérieur.

## Données et cycle de vie

Les comptes, bonus persistants et récompenses de fin de partie appartiennent à Gayar. Les
seules données personnelles nécessaires sont l'adresse e-mail et le pseudonyme. L'état actif
d'une room n'est pas sauvegardé. Les tables `game_runs` et `game_run_rewards` conservent le
résultat nécessaire à un crédit d'or idempotent ; l'unicité `(run_id, user_id)` interdit le
double crédit.

Une room terminée est conservée 60 secondes afin d'afficher le résultat et terminer la
persistance. Une room abandonnée ne crédite aucun or.

## Sécurité

| Surface | Contrôle obligatoire |
|---|---|
| `POST /game/rooms` | JWT Supabase vérifié ; identité tirée du jeton |
| Admission à une room | identité réservée, capacité et connexion unique vérifiées |
| Métaprogression | lecture serveur avec `service_role`, jamais exposée au client |
| Contrôles continus | séquence croissante, nombres finis, valeurs bornées, 30 messages/s |
| Actions | union fermée, `actionId` dédupliqué, 10 messages/s, file de 16 maximum |
| Récompenses | RPC `finalize_game_run` accessible uniquement à `service_role` |
| Secrets | variables serveur seulement ; jamais Git, client, stockage web, log ou télémétrie |
| Transport | HTTP non chiffré sur LAN de confiance ; TLS obligatoire avant toute ouverture |

Les canaux Realtime du lobby restent une surface déclarative assumée dans le LAN. En revanche,
le crédit d'or déclaré par le navigateur et le bus P2P ont disparu du chemin de production.
Le serveur neutralise immédiatement un joueur déconnecté, conserve son avatar vulnérable
30 secondes, puis le retire à une frontière de tick. Un retour tardif est refusé.

## Observabilité

| Sujet | Décision |
|---|---|
| Trace serveur | racine `game.room` ; enfants création, admission, démarrage, reconnexion, persistance et fin |
| Trace client | `game.client.session`, corrélée par propagation W3C |
| Granularité | aucun span par tick, image, commande ou entité |
| Métriques | rooms, joueurs, durée/retard des ticks, patches, refus, reconnexions, ferraille, crédits d'or |
| Logs | `APP_LOG_LEVEL` côté serveur, `VITE_APP_LOG_LEVEL` côté client |
| Données interdites | identité, courriel, pseudonyme, JWT, secret, clé de service, seed, `roomId`, `runId` |
| Panne OTLP | perte de télémétrie acceptée ; aucune conséquence sur la partie |

Le détail se trouve dans [observabilite.md](observabilite.md).

## Performance et disponibilité

| Indicateur | Budget |
|---|---|
| Tick de simulation, 200 monstres | p95 < 1 ms |
| Boucle serveur | aucune itération au-delà de 50 ms |
| Commande vers état sur LAN | p95 < 150 ms |
| Patch Schema par client | p95 < 64 Kio |
| Rendu client | 60 images/s visées |

Le test de charge de référence dure 20 minutes avec quatre joueurs et 200 monstres. Aucun
engagement de disponibilité n'est pris. Une panne serveur rend le jeu indisponible et ramène le
client proprement au lobby ; il n'existe plus de mode hors ligne.

## Stratégie de livraison

La migration technique a été menée en quatre boucles : ferraille bornée, solo autoritaire, coopération et
reconnexion, puis récompenses/exploitation/suppression du P2P. Chaque boucle suit
développement → documentation → tests → revue Claude indépendante → arbitrage → corrections et
nouveaux tests → clôture. Une contre-revue exige une confirmation explicite du propriétaire.

Les migrations de récompenses sont additives : déployer d'abord la nouvelle RPC, valider la
bascule, puis seulement révoquer `authenticated` sur `credit_account_gold`.

## Hypothèses ouvertes

| ID | Hypothèse | Validation attendue |
|---|---|---|
| HYP-003 | aucune sauvegarde de la base | première conséquence de perte ou ouverture publique |
| HYP-004 | sept jours de télémétrie suffisent | première analyse rétrospective impossible |
| HYP-005 | un collecteur unique sans redondance suffit | première perte de diagnostic constatée |
