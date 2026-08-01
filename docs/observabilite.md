# Village Survivor — Observabilité

> Statut : approuvé
> Version du projet : v1
> Propriétaire : Gayar
> Dernière revue : 1er août 2026
> Niveau : `distribue`

## Objectif de diagnostic

Trois questions doivent trouver réponse, et elles ne sont pas de même nature.

**Diagnostiquer.** Devant une partie qui s'est mal passée, retrouver en moins de dix minutes ce
qui a échoué : quel pair a divergé, quelle reconnexion a été refusée, quel appel au compte a
échoué, quelle image a décroché. Aujourd'hui, rien de tout cela n'est observable — il n'existe ni
trace, ni métrique, ni interface de débogage.

**Extrapoler.** Mesurer le coût réel d'une partie à deux, trois et quatre joueurs afin de prévoir
ce qui tiendra ou non, plutôt que de l'optimiser au jugé. Le benchmark hors ligne mesure
211 µs par tick sous 200 monstres, mais il ne dit rien du navigateur réel, ni de l'effet du
nombre de joueurs sur le lockstep.

**Décider.** La condition de victoire et la persistance entre les parties sont suspendues aux
tests à trois joueurs. Ces tests ne peuvent trancher que si l'on sait **combien de parties ont
été lancées, par qui, de sa propre initiative, combien de temps elles ont duré et comment elles
se sont terminées**. Le critère de réussite de l'objectif est lui-même un compte : sans mesure,
il est invérifiable.

Cette troisième finalité est inhabituelle pour de la télémétrie, et c'est pourtant la plus
importante ici.

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

`vs.seed`, `vs.mode` (`solo` ou `coop`), `vs.players.count`, `vs.player.account_id`,
`service.version`, `deployment.environment.name`.

`vs.player.account_id` est l'identifiant technique du compte — un UUID. Il est **nécessaire** :
le critère de réussite compte les parties par personne. Il est aussi **suffisant** : ni
l'adresse e-mail ni le pseudonyme ne sont jamais émis.

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

### Usage — pour décider du produit

| Métrique | Type | Attributs | Sert à |
|---|---|---|---|
| `vs.session.started` | compteur | `vs.player.account_id`, `vs.initiation` (`self`, `invited`), `vs.mode` | **compter le critère de réussite** |
| `vs.session.duration` | histogramme (s) | `vs.end.cause` | savoir si les parties tiennent les joueurs |
| `vs.session.end` | compteur | `vs.end.cause` (`defeat`, `quit`, `disconnect`) | distinguer une défaite d'un abandon |
| `vs.session.wave.reached` | histogramme | `vs.players.count` | situer la difficulté ressentie |
| `vs.meta.gold.earned` | histogramme | — | mesurer ce que la progression rapporte réellement |

`vs.end.cause = quit` est le signal le plus parlant du lot : **un joueur qui quitte avant de
perdre s'ennuie**. C'est cette proportion, croisée avec la durée, qui éclairera le débat sur la
condition de victoire — un jeu sans fin qu'on abandonne en cours de partie n'a pas de problème
de difficulté, il a un problème de raison de continuer.

`vs.initiation` distingue une partie lancée spontanément d'une partie rejointe sur invitation.
Le critère de réussite ne compte que les premières.

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
- **Pseudonymat** : seul l'identifiant technique de compte circule. Il permet de compter par
  personne sans révéler qui elle est à quiconque n'a pas déjà accès à la base.
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

| Indicateur | Budget | Aujourd'hui |
|---|---|---|
| Durée d'un tick de simulation | < 1 ms sous 200 monstres | 211 µs hors navigateur |
| Durée d'une image | < 16 ms pour tenir 60 images par seconde | non mesuré |
| Ticks rattrapés par image | 1 en régime normal | non mesuré |
| Retard d'entrée en coopération | < 4 ticks, soit 200 ms | non mesuré |

Trois lignes sur quatre ne sont pas mesurées : c'est précisément ce que cette phase corrige.

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
