# Village Survivor — Observabilité v2

> Statut : cible approuvée — migration en cours
> Version du projet : v2
> Propriétaire : Gayar
> Dernière revue : 3 août 2026
> Niveau : `distribue`

## Objectif

L'observabilité doit expliquer la vie d'une room, localiser une panne entre navigateur, serveur
et base, et vérifier les budgets de charge. Elle ne mesure pas l'usage produit et ne doit jamais
ralentir ou arrêter une partie.

L'instrumentation P2P v1 reste utile pendant la transition, mais disparaît avec le netcode
lockstep. La v2 déplace l'autorité de mesure de la simulation vers `apps/server`.

## Traces

| Unité | Span | Enfants autorisés |
|---|---|---|
| Room serveur | `game.room` | `game.room.create`, `game.room.admit`, `game.room.start`, `game.room.reconnect`, `game.room.persist`, `game.room.end` |
| Session navigateur | `game.client.session` | création/jonction, état de connexion, retour au lobby |
| Lobby | `hub.launch` | résolution du roster, création de room, diffusion du `roomId` |

Le contexte W3C est propagé sur les appels HTTP et la jonction à la room quand le transport le
permet. Les traces ne contiennent jamais de JWT ni d'identité. `runId`, `roomId` et seed ne sont
acceptés que sous une forme opaque ou hachée et bornée.

**Interdiction absolue :** aucun span par tick, commande, image, projectile ou entité. Un tick
est une mesure agrégée, pas une unité de trace.

## Métriques serveur

| Métrique | Type | Attributs de faible cardinalité |
|---|---|---|
| `vs.game.rooms.active` | jauge | mode, phase |
| `vs.game.players.active` | jauge | mode |
| `vs.game.room.duration` | histogramme | mode, résultat |
| `vs.game.tick.duration` | histogramme ms | mode, tranche de monstres |
| `vs.game.tick.lag` | histogramme ms | mode |
| `vs.game.patch.size` | histogramme octets | mode |
| `vs.game.command.rejected` | compteur | type, raison fermée |
| `vs.game.reconnect` | compteur | résultat fermé |
| `vs.game.scrap.entities` | histogramme | mode |
| `vs.game.scrap.expired` | compteur | mode |
| `vs.game.gold.credited` | compteur | résultat fermé |

Le client conserve les métriques de rendu et de délai commande→état. Aucun identifiant de
compte, pseudonyme, courriel, adresse IP ou room brute ne devient un attribut de métrique.

## Logs

Le serveur lit `APP_LOG_LEVEL`, défaut `info` en LAN et `debug` en développement. Le client lit
`VITE_APP_LOG_LEVEL`. Les logs d'une trace portent `trace_id` et `span_id`, mais jamais de corps
de JWT, de secret, de courriel, de clé de service ou de message réseau brut.

Les événements utiles sont structurés : création/annulation de room, refus d'admission, changement
de phase, reconnexion, retrait, persistance et arrêt. Les commandes valides et ticks normaux ne
sont pas journalisés individuellement.

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
| persistance | tout échec ouvre le span `game.room.persist` en erreur, sans double crédit au retry |

## Données interdites et tests

Un test inspecte les spans, métriques et logs générés avec des valeurs sentinelles. Toute
présence d'adresse e-mail, pseudonyme, JWT, secret TOTP, `SERVICE_ROLE_KEY` ou contenu complet
d'un message réseau bloque la release. Des tests séparés prouvent que le collecteur indisponible
n'affecte pas le déroulement et que `game-core` n'importe aucun SDK de télémétrie.

La validation finale exige une partie solo et une partie coopérative sur deux postes, chacune
avec une trace distribuée complète consultable dans le backend LAN.
