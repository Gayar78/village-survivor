# Village Survivor — Observabilité

> Statut : approuvé — **implémenté le 1er août 2026**
> Version du projet : v1
> Propriétaire : Gayar
> Dernière revue : 1er août 2026
> Niveau : `distribue`

## Ce qui est en place

L'instrumentation est livrée. Ce document reste la spécification ; ce paragraphe dit où en est sa
réalisation.

| Élément | État | Où |
|---|---|---|
| SDK, export OTLP/HTTP, propagation W3C | livré | `apps/client/src/observability/telemetry.ts` |
| Span racine d'une partie | livré | `gameTelemetry.ts` |
| Frontières `coop.channel.join`, `coop.start.barrier`, `coop.rejoin.replay`, `account.gold.credit` | livré | `net/towerSession.ts`, `play.ts` |
| Frontières `game.session.start` et `game.session.end` | non livré — le span racine porte déjà ces instants | — |
| Métriques de performance et de santé coopérative | livré | `gameTelemetry.ts` |
| Journaux corrélés, seuil surchargeable | livré | `observability/logger.ts` |
| Collecteur et interface de consultation | livré | service `otel`, `http://<adresse>:3001` |
| Spans du lobby, de l'atelier et du lancement coopératif | **non livré** | voir « Reste à instrumenter » |

**Reste à instrumenter** : `lobby.signin`, `meta.build.edit` et `hub.launch`, c'est-à-dire les
trois unités d'exécution qui ne sont pas la partie elle-même. Elles sont spécifiées plus bas et
délibérément différées : le diagnostic demandé portait sur la partie, et instrumenter
l'authentification demande d'abord de décider ce qu'on a le droit d'en écrire.

**Chaîne vérifiée de bout en bout le 1er août 2026** : émission depuis la passerelle, réception
par le collecteur, trace relue dans Tempo avec ses attributs (`vs.mode`, `vs.seed`,
`vs.players.count`). Ce qui n'est **pas** encore vérifié : une partie réelle jouée à plusieurs,
qui reste le gate de sortie de la phase.

## Objectif de diagnostic

Trois questions doivent trouver réponse, et elles ne sont pas de même nature.

**Diagnostiquer.** Devant une partie qui s'est mal passée, retrouver en moins de dix minutes ce
qui a échoué : quel pair a divergé, quelle reconnexion a été refusée, quel appel au compte a
échoué, quelle image a décroché. Rien de tout cela n'était observable avant le 1er août 2026 : il
n'existait ni trace, ni métrique, ni interface de débogage. C'est ce manque que l'incrément
comble.

**Extrapoler.** Mesurer le coût réel d'une partie à deux, trois et quatre joueurs afin de prévoir
ce qui tiendra ou non, plutôt que de l'optimiser au jugé. Le benchmark hors ligne mesure
210 µs par tick sous 200 monstres, mais il ne dit rien du navigateur réel, ni de l'effet du
nombre de joueurs sur le lockstep.

> **Modification du 1er août 2026 — troisième finalité retirée.** Une troisième famille de
> mesures était prévue, destinée à compter les parties et les abandons pour éclairer le débat
> produit et vérifier le critère de réussite. Le propriétaire l'écarte : il parle directement à
> ses joueurs, et un compteur ne lui apprendra rien qu'une conversation ne dise mieux.
>
> La télémétrie se concentre donc sur **le diagnostic et la performance**. La décision touche
> une spécification verrouillée ; elle est consignée ici plutôt qu'appliquée en silence.
>
> Conséquence à assumer : le critère de réussite de l'objectif — cinq parties par personne sur
> un mois — devra être constaté à la main, et non par la mesure comme il était prévu.

## Contrainte qui prime sur toutes les autres

**Le cœur de simulation reste hors de portée de l'instrumentation.**

`packages/game-core` ne contient aucun appel à `Math.random`, `Date.now`, `performance.now`, ni
aucun accès au navigateur. C'est ce qui permet à plusieurs navigateurs d'exécuter la même partie
et de rester d'accord. Y introduire une bibliothèque de télémétrie — qui horodate, qui mesure,
qui appelle le réseau — casserait le déterminisme, donc la coopération.

La mesure se fait donc **depuis la couche client**, qui observe la simulation de l'extérieur :
elle chronomètre l'appel à `step()` sans que `step()` ne sache qu'il est chronométré. Un test
garde cette frontière.

## Unités d'exécution tracées

| Unité | Span racine | Spans enfants | Fin réussie | Fin en erreur |
|---|---|---|---|---|
| Une partie | `game.session` | `game.session.start`, `coop.channel.join`, `coop.start.barrier`, `coop.rejoin.replay`, `account.gold.credit`, `game.session.end` | statut `defeat` ou retour au menu | exception non rattrapée, divergence, échec de réintégration |
| Connexion | `lobby.signin` | `auth.password`, `auth.mfa.enroll`, `auth.mfa.verify` | session au niveau attendu | identifiants refusés, second facteur invérifiable |
| Atelier de méta-build | `meta.build.edit` | `meta.load`, `meta.purchase`, `meta.forge` | écriture confirmée | refus de la base, budget dépassé |
| Lancement coopératif | `hub.launch` | `hub.roster.resolve`, `hub.launch.broadcast` | tous les pairs ont reçu le lancement | pair manquant, diffusion perdue |

**Jamais de span par tick, par image ou par projectile.** À 20 ticks par seconde, un span par
tick produirait 72 000 traces par heure et par joueur : le coût dépasserait le jeu lui-même et
noierait le signal. La boucle est suivie par des métriques agrégées.

### Attributs du span racine d'une partie

`vs.seed`, `vs.mode` (`solo` ou `coop`), `vs.players.count`, `service.version`,
`deployment.environment.name`.

**Aucun identifiant de joueur n'est émis.** Il n'était nécessaire que pour compter les parties
par personne, finalité retirée du périmètre. Le diagnostic n'en a pas besoin : une divergence ou
un décrochage se caractérisent par la graine et le tick, non par l'identité du joueur.

## Métriques

Là où les traces répondent à « qu'est-il arrivé à cette partie ? », les métriques répondent à
« comment se comporte le jeu en général ? ». Trois familles, trois usages.

### Performance — pour extrapoler

| Métrique | Type | Attributs | Sert à |
|---|---|---|---|
| `vs.simulation.tick.duration` | histogramme (ms) | `vs.mode`, `vs.players.count`, `vs.monsters.bucket` | savoir si le tick tient sous le budget quand la population grimpe |
| `vs.render.frame.duration` | histogramme (ms) | `vs.monsters.bucket` | distinguer un problème de simulation d'un problème d'affichage |
| `vs.simulation.entities` | histogramme | `vs.kind` (`monster`, `projectile`, `scrap`) | relier le coût à la cause |
| `vs.simulation.catchup.ticks` | histogramme | — | détecter les images qui rattrapent plusieurs ticks, premier signe de saturation |
| `vs.simulation.wave` | jauge | — | situer une mesure dans la difficulté |

Les seaux de population (`vs.monsters.bucket`) évitent une cardinalité ingérable : `0-50`,
`50-100`, `100-200`, `200+`.

**C'est cette famille qui permet l'extrapolation demandée** : en croisant durée de tick,
population et nombre de joueurs, on obtient la courbe réelle plutôt qu'une intuition, et on sait
à quel effectif le budget d'une milliseconde par tick sera franchi.

### Santé de la coopération — pour diagnostiquer

| Métrique | Type | Attributs | Sert à |
|---|---|---|---|
| `vs.coop.peers` | jauge | — | savoir combien de pairs sont réellement actifs |
| `vs.coop.fingerprint.mismatch` | compteur | `vs.peer.role` | **détecter une divergence de simulation** — le signal le plus grave du lockstep |
| `vs.coop.input.delay` | histogramme (ticks) | — | mesurer le retard imposé par le pair le plus lent |
| `vs.coop.rejoin` | compteur | `vs.outcome` (`success`, `history-unavailable`, `timeout`) | mesurer la fréquence réelle du défaut de reconnexion |

La dernière est délibérée : la fenêtre de reconnexion a été portée de dix à vingt minutes sans
qu'on sache si le cas se produit une fois par mois ou trois fois par soirée. La mesure tranchera
avant qu'on investisse dans des points de reprise.

### Usage — retiré du périmètre

Une troisième famille devait compter les parties lancées, leur durée et leur cause de fin, afin
d'éclairer le débat sur la condition de victoire et de vérifier le critère de réussite.

**Elle est retirée le 1er août 2026**, sur décision du propriétaire : le cercle de joueurs est
si restreint qu'un échange direct renseigne mieux qu'un compteur. Deux durées de partie ne
disent pas pourquoi on s'est arrêté ; un joueur, si.

Ce qui subsiste des attributs prévus : **aucun identifiant de compte n'est émis**, puisque plus
rien n'exige de compter par personne. C'est autant de données personnelles en moins dans la
télémétrie, et cela simplifie la section « Données et sécurité » ci-dessous.

## Propagation et export

| Sujet | Décision |
|---|---|
| Propagation | W3C Trace Context |
| Exporteur | OTLP/HTTP |
| Endpoint OTLP | même origine que le jeu, `/otel/v1/...`, relayé par la passerelle vers le collecteur |
| Sampling normal | `parentbased_always_on` |
| Sampling diagnostic | `parentbased_always_on` (identique — le volume ne justifie aucun échantillonnage) |

L'endpoint passe par la passerelle existante pour conserver **l'origine unique** du déploiement
LAN : le navigateur n'émet aucune requête inter-origine, et aucune règle de partage entre
origines n'est à écrire ni à maintenir.

Le contexte de trace **n'est pas propagé entre pairs coopératifs**. Chaque navigateur trace sa
propre partie : les pairs ne partagent pas une exécution, ils exécutent la même simulation
chacun de leur côté. La corrélation entre pairs se fait par `vs.seed` et le code de salon
haché, pas par un identifiant de trace commun.

## Logs

| Sujet | Décision |
|---|---|
| Variable applicative | `VITE_APP_LOG_LEVEL`, valeurs `trace` `debug` `info` `warn` `error` `fatal` |
| Surcharge à l'exécution | clé `vs.log.level` du stockage local du navigateur |
| Développement et test | `debug` |
| Production | `info` |
| Troubleshooting | `trace`, temporairement |
| Corrélation | `trace_id` et `span_id` sur chaque enregistrement émis dans un contexte tracé |
| Flux d'audit | sans objet — aucune obligation d'audit à ce niveau de garantie |

**Pourquoi une surcharge par le stockage local.** Un navigateur ne lit pas de variable
d'environnement à l'exécution : Vite fige `VITE_APP_LOG_LEVEL` au moment de la compilation.
S'en tenir là obligerait à reconstruire le jeu pour élever le niveau de journalisation — ce qui
revient à modifier le produit pour le diagnostiquer, exactement ce que la méthode interdit. La
clé de stockage local rend le niveau modifiable **sur le poste du joueur, sans reconstruction et
sans changement de code**.

`OTEL_LOG_LEVEL` reste réservé aux diagnostics internes de la bibliothèque OpenTelemetry et ne
sert jamais de seuil applicatif.

## Ressources OpenTelemetry

Côté navigateur, figées à la compilation, avec des valeurs par défaut utilisables sans
configuration :

```text
VITE_OTEL_SERVICE_NAME=village-survivor-client
VITE_OTEL_RESOURCE_ATTRIBUTES=service.version=<version>,deployment.environment.name=<lan|dev>
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=/otel
VITE_OTEL_TRACES_SAMPLER=parentbased_always_on
VITE_APP_LOG_LEVEL=info
```

Côté collecteur, variables standard :

```text
OTEL_SERVICE_NAME=village-survivor-collector
OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=lan
OTEL_TRACES_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel:4318
OTEL_TRACES_SAMPLER=parentbased_always_on
OTEL_TRACES_SAMPLER_ARG=1.0
```

Le backend retenu est l'image `grafana/otel-lgtm` : un seul conteneur réunissant la réception
OTLP, le stockage des traces, des journaux et des métriques, et une interface de consultation.
Ce choix vaut pour un usage local et de diagnostic ; il n'est pas dimensionné pour de la
production publique, ce qui correspond exactement au périmètre.

## Données et sécurité

- **Données interdites, jamais émises** : adresse e-mail, pseudonyme d'affichage, mot de passe,
  jeton d'authentification, secret ou code TOTP, clé de service.
- **Redaction** : le code de salon coopératif n'est émis que **haché**. Il donne accès au canal
  temps réel, où l'identité est déclarative : le publier en clair dans la télémétrie
  reviendrait à distribuer une clé d'entrée.
- **Aucune identité** : ni identifiant de compte, ni pseudonyme. Le retrait des mesures d'usage a
  supprimé le seul besoin qui les justifiait ; le diagnostic se fait par la graine et le tick.
- **Accès** : l'interface du backend n'est exposée que sur le réseau local, jamais publiée.
- **Rétention** : 7 jours, puis purge.
- **Protection contre l'altération** : aucune. Assumé — la télémétrie sert au diagnostic et à la
  décision produit, pas de preuve opposable.
- **Assainissement** : toute valeur venant du réseau ou d'une saisie est bornée en longueur et
  échappée avant d'entrer dans un attribut ou un enregistrement.

## Résilience et coût

- **Si le backend est indisponible** : l'export est asynchrone, par lots, avec une file bornée
  et un délai d'attente court. Les données sont perdues silencieusement plutôt que mises en
  attente. **Le jeu ne ralentit pas, ne se bloque pas et ne prévient pas le joueur.** La
  télémétrie n'est jamais sur le chemin critique d'une partie.
- **Le jeu démarre sans collecteur.** L'absence de télémétrie n'empêche ni de jouer, ni de
  tester, ni de déployer.
- **Détection des pertes** : la bibliothèque expose ses rejets et saturations ; ils sont
  journalisés en `warn`. Un écart durable entre parties jouées et parties enregistrées est le
  symptôme à surveiller, et fait l'objet de l'hypothèse HYP-005.
- **Volume et coût attendus** : à trois joueurs et quelques parties par semaine, quelques
  dizaines de mégaoctets par semaine. Environ 1 Go de mémoire pour le conteneur. **0 €.**

## Budgets de performance

Aucun objectif de niveau de service n'est défini : le propriétaire a déclaré n'avoir aucune
conséquence à une indisponibilité, et un engagement que personne ne surveille serait une
fiction. En revanche, des budgets de performance ont un sens, parce qu'ils servent à décider
d'optimiser ou non.

| Indicateur | Budget | Mesuré par |
|---|---|---|
| Durée d'un tick de simulation | < 1 ms sous 200 monstres | `vs.simulation.tick.duration` — 210 µs hors navigateur |
| Durée d'une image | < 16 ms pour tenir 60 images par seconde | `vs.render.frame.duration` |
| Ticks rattrapés par image | 1 en régime normal | `vs.simulation.catchup.ticks` |
| Retard d'entrée en coopération | < 4 ticks, soit 200 ms | `vs.coop.input.delay` |

Les quatre indicateurs sont désormais instrumentés dans le navigateur. **Aucun n'a encore de
relevé en partie réelle** : un budget instrumenté n'est pas un budget tenu, et c'est la première
session à plusieurs qui le dira.

## Runbooks et validation

**Runbooks à écrire** au premier incident réellement rencontré, et pas avant — un runbook
inventé à froid décrit une panne imaginaire :

- divergence de simulation entre pairs (`vs.coop.fingerprint.mismatch` non nul) ;
- reconnexion impossible en fin de partie longue ;
- indisponibilité de la dépendance d'authentification et de temps réel.

**Tests du contrat d'observabilité** : détaillés dans
[`qualite/strategie-tests.md`](qualite/strategie-tests.md). Ils vérifient qu'une partie possède
un identifiant de trace, que les journaux portent les identifiants de corrélation, que le
service, sa version et son environnement sont identifiables, qu'aucune donnée interdite n'est
émise, que le niveau de journalisation se change sans reconstruire, et que la panne du backend
ne casse pas une partie.

**Exercice de panne**, en phase 5 : provoquer une divergence réelle entre deux pairs, puis
démontrer la chaîne complète — symptôme, trace, span fautif, journaux corrélés, cause, action.
La preuve rejoindra le rapport de tests.
