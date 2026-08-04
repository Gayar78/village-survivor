# Village Survivor — Observabilité v2

> Statut : instrumentation v2 implémentée — preuve LAN finale à collecter
> Version du projet : v2
> Propriétaire : Gayar
> Dernière revue : 4 août 2026
> Niveau : `distribue`

## Objectif

L'observabilité doit expliquer la vie d'une room, localiser une panne entre navigateur, serveur
et base, et vérifier les budgets de charge. Elle ne mesure pas l'usage produit et ne doit jamais
ralentir ou arrêter une partie.

L'instrumentation P2P a été retirée avec le netcode lockstep. La simulation et ses mesures vivent
désormais dans `apps/server`; le navigateur ne conserve que la session, la création/jonction,
les erreurs de connexion et le coût du rendu. L'événement déterministe `scrap-expired` reste dans
`game-core` pour rendre le cycle de vie testable sans y introduire OpenTelemetry.

## Traces

| Unité | Span | Enfants autorisés |
|---|---|---|
| Room serveur | `game.room` | `game.room.create`, `game.room.admission`, `game.room.start`, `game.room.reconnect`, `game.room.persistence`, `game.room.end` |
| Session navigateur | `game.client.session` | `game.client.room.create`, état de connexion, retour au lobby |
| Lobby | création de room | `game.client.room.create`, diffusion du `roomId` |

Le client injecte un `traceparent` W3C dans `POST /rooms`. Le serveur n'accepte que sa grammaire
fermée et utilise ce contexte comme parent de `game.room`; la valeur n'est jamais un attribut.
Les traces ne contiennent ni JWT, ni identité, ni `runId`, ni `roomId`, ni seed.

**Interdiction absolue :** aucun span par tick, commande, image, projectile ou entité. Un tick
est une mesure agrégée, pas une unité de trace.

## Métriques serveur

| Métrique | Type | Attributs de faible cardinalité |
|---|---|---|
| `vs.game.rooms.active` | jauge | mode |
| `vs.game.players.active` | jauge | mode |
| `vs.game.room.duration` | histogramme | mode, résultat |
| `vs.game.tick.duration` | histogramme ms | mode, tranche de monstres |
| `vs.game.tick.lag` | histogramme ms | mode |
| `vs.game.patch.size` | histogramme octets | mode |
| `vs.game.command.rejected` | compteur | type, raison fermée |
| `vs.game.reconnection` | compteur | mode, résultat fermé |
| `vs.game.scrap.entities` | histogramme | mode |
| `vs.game.gold.credits` | compteur | mode |

La taille est celle du buffer différentiel réellement encodé par Colyseus, mesurée autour de
`broadcastPatch`, pas une ré-estimation JSON. Le client conserve la métrique de rendu ; le délai
commande→état est vérifié par le test LAN multi-client. Aucun identifiant de
compte, pseudonyme, courriel, adresse IP ou room brute ne devient un attribut de métrique.

L'histogramme `vs.game.tick.duration` emploie les frontières `0,1`, `0,25`, `0,5`, `0,75`, `0,9`,
`1`, `1,25`, `1,5`, `2`, `3`, `5`, `10`, `25` et `50` ms. Le bucket `le="1"` permet de vérifier
directement qu'au moins 95 % des ticks respectent le budget, et `histogram_quantile` fournit une
estimation utile autour du seuil. Ces quatorze frontières remplacent les quinze frontières par
défaut et le calcul min/max est désactivé ; la précision n'augmente donc ni le nombre de buckets
ni le travail synchrone de la boucle.

## Logs

Le serveur lit `APP_LOG_LEVEL`, défaut `info` en LAN et `debug` en développement. Le client lit
`VITE_APP_LOG_LEVEL`. Les logs d'une trace portent `trace_id` et `span_id`, mais jamais de corps
de JWT, de secret, de courriel, de clé de service ou de message réseau brut.

Les changements de cycle de vie sont portés par les spans. Les logs structurés restent limités
au démarrage du service et aux erreurs exploitables, notamment un retry de persistance. Les
commandes valides et ticks normaux ne sont pas journalisés individuellement.

## Export et résilience

Le navigateur et le serveur exportent en OTLP/HTTP vers le collecteur LAN. L'export est
asynchrone, borné et tolérant à la perte. Une panne du collecteur n'empêche ni la création d'une
room, ni son tick, ni la persistance des récompenses. Le serveur ne réessaie jamais une émission
OTLP sur le chemin critique.

La rétention reste de sept jours et le sampling `parentbased_always_on`, volume compatible avec
une ou deux rooms. Les variables d'endpoint et les ressources de déploiement sont configurées
uniquement au démarrage ; les secrets ne sont pas des attributs de ressource.

## Budgets et alertes de diagnostic

| Signal | Budget ou symptôme |
|---|---|
| `vs.game.tick.duration` | p95 < 1 ms sous 200 monstres |
| `vs.game.tick.lag` | aucune boucle au-delà du budget de 50 ms |
| commande→état client | p95 < 150 ms sur LAN |
| `vs.game.patch.size` | p95 < 64 Kio par client |
| commandes refusées | hausse anormale = client incompatible ou abus |
| reconnexions tardives | résultat `expired` attendu après 30 secondes |
| ferraille active | croissance continue sans retour = fuite de cycle de vie |
| persistance | tout échec ouvre `game.room.persistence` en erreur, sans double crédit au retry |

## Données interdites et tests

Un test inspecte les spans, métriques et logs générés avec des valeurs sentinelles. Toute
présence d'adresse e-mail, pseudonyme, JWT, secret TOTP, `SERVICE_ROLE_KEY` ou contenu complet
d'un message réseau bloque la release. Des tests séparés prouvent que le collecteur indisponible
n'affecte pas le déroulement et que `game-core` n'importe aucun SDK de télémétrie.

La fabrique de `MeterProvider` réellement appelée en production est aussi utilisée avec un
collecteur mémoire dans les tests : les frontières exportées doivent contenir 1 ms et rester
moins nombreuses que celles par défaut. Un garde de coût enregistre 200 000 mesures avec les
mêmes attributs de faible cardinalité que la production et impose moins de 20 µs par
enregistrement, soit au plus 0,04 % d'une seconde CPU à 20 Hz. Cette limite volontairement large
évite un faux échec sur un runner chargé ; la valeur réellement mesurée reste consignée à part.

La validation finale exige une partie solo et une partie coopérative sur deux postes, chacune
avec une trace distribuée complète consultable dans le backend LAN.
