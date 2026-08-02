# Village Survivor — Backlog v2

> Statut : proposé, en attente d'arbitrage
> Version visée : v2
> Propriétaire : Gayar
> Établi le : 2 août 2026

Contenu proposé pour la prochaine version. Chaque élément porte son origine et son critère
d'acceptation. Le dépôt distant existe, mais rien n'y est écrit sans accord : cette liste tient
lieu d'issues tant qu'elle n'est pas arbitrée.

Sources balayées : [`docs/feedback.md`](docs/feedback.md),
[`docs/journal-dev.md`](docs/journal-dev.md),
[`docs/qualite/rapport-tests.md`](docs/qualite/rapport-tests.md),
[`ROADMAP.md`](ROADMAP.md), et les sept hypothèses ouvertes de `.sdp/etat.json`. **Aucune
dérogation n'a été accordée pendant la v1** : rien à solder de ce côté.

## Priorité haute

Bloque l'usage, la sécurité, une gate de la méthode, ou constitue une dette critique.

### V2-01 — Localiser une divergence de simulation *(dette d'observabilité)*

**Résultat attendu.** Quand deux pairs divergent, la télémétrie nomme le sous-système fautif.

**Contexte.** L'empreinte compare l'état public entier et répond « différent », jamais « où ».
Devant la divergence du tick 18220, on sait qu'elle a eu lieu et rien de plus.

**Proposition.** Émettre une empreinte par sous-système — joueurs, monstres, projectiles,
ferraille, Cœur, tourelles — en plus de l'empreinte globale. Le surcoût est faible : la
sérialisation existe déjà, seule sa découpe change.

**Critère d'acceptation.** Une divergence provoquée sur un sous-système désigne ce sous-système et
lui seul dans le journal et dans la métrique.

**Origine.** Rapport de tests, ANO-001. *Bloque V2-02.*

### V2-02 — Corriger la divergence en partie longue *(bug)*

**Résultat attendu.** Une partie coopérative d'une heure se termine sans divergence.

**Contexte.** Divergence au tick 18220 — quinzième minute — signalée mutuellement par les deux
pairs, puis répétée jusqu'à la fin. Le correctif du 1er août a supprimé la cause arithmétique :
quinze minutes sans écart, là où la partie précédente divergeait en deux. Une autre cause
subsiste, non identifiée.

**Critère d'acceptation.** Deux parties consécutives de plus de vingt minutes, sur deux
navigateurs différents, sans aucun signalement.

**Origine.** Session du 2 août, rapport de tests ANO-001. *Dépend de V2-01.*

### V2-03 — Borner la ferraille au sol *(bug de croissance)*

**Résultat attendu.** Le nombre d'objets au sol ne croît plus indéfiniment avec la durée.

**Contexte.** Mille pièces après seize minutes, contre cent onze monstres — environ soixante par
minute, sans limite. Chaque pièce coûte un calcul de distance par joueur et par tick, une
allocation d'objet par tick dans la projection d'état, sa part du hachage d'empreinte chaque
seconde, et un dessin par image.

**Proposition.** Fusion de proximité — une pièce déposée près d'une autre s'y ajoute — plus un
plafond avec éviction de la plus ancienne. Purement déterministe, sans effet sur le protocole.

**Critère d'acceptation.** Sur une partie de trente minutes, la population d'objets au sol reste
sous un plafond connu, et le coût par tick ne croît plus avec la durée.

**Origine.** Session du 2 août, `ROADMAP.md`.

## Priorité moyenne

Dégrade l'usage ou le diagnostic sans l'empêcher.

### V2-04 — Mesurer la projection d'état et le calcul d'empreinte *(dette d'observabilité)*

`vs.simulation.tick.duration` n'entoure que `step()`. La projection et l'empreinte sont juste à
côté, hors mesure, alors que leur coût croît avec la taille de l'état. À ajouter également : un
journal en `warn` lorsqu'une image rattrape plus de dix ticks, avec les populations au moment du
blocage — treize blocages de plus d'une seconde restent aujourd'hui inexpliqués.

**Critère.** Les deux coûts apparaissent dans le backend, et un blocage produit une ligne
exploitable.

### V2-05 — Points de reprise de la simulation *(dette)*

La fenêtre de reconnexion a été **remplie à 83 %** par une partie de seize minutes ; au-delà de
vingt minutes, un joueur déconnecté ne peut plus revenir, et l'historique retenu approche
15 Mo. Des instantanés périodiques rendraient le rejeu proportionnel au temps écoulé depuis le
dernier point de reprise. **C'est aussi le prérequis d'un rejeu avec retour arrière**, si cette
architecture est retenue : un seul travail sert les deux besoins.

### V2-06 — Enregistrer les résultats de partie *(bug fonctionnel)*

`statsService.recordGameResult` existe, la procédure `record_game_result` est en base, **rien ne
les appelle** : l'écran de profil affiche des statistiques éternellement à zéro. Le correctif
suppose de définir ce qu'est un résultat de partie pour ce jeu — il n'y a ni victoire, ni
ressources conservées.

### V2-07 — Décider du sort des prénoms publiés *(documentation, sécurité)*

La contrainte de désensibilisation listait les prénoms des joueurs. Le contrôle avant publication
a cherché des secrets et **n'a pas appliqué cette liste** : les prénoms sont partis avec la
branche fusionnée. L'historique Git les conserve même après correction. Décision du propriétaire.

### V2-08 — Ajouter un `.gitattributes` *(dette)*

Sans lui, `pnpm format:check` échoue sur toute machine où Git convertit les fins de ligne, ce qui
rend l'intégration continue dépendante du poste qui a commité.

### V2-09 — Rendre l'avance d'entrée adaptative *(amélioration)*

Le retard d'entrée est figé à deux ticks. À n'entreprendre que si une session montre encore des
gels après V2-03 : les mesures actuelles ne le justifient pas.

## Priorité basse

Confort, ou idée à creuser.

| ID | Élément | Origine |
|---|---|---|
| V2-10 | Instrumenter le lobby, l'atelier de méta-build et le lancement coopératif — trois unités d'exécution spécifiées et non livrées | `observabilite.md` |
| V2-11 | Faire apparaître la ferraille naturelle près des joueurs plutôt que n'importe où — question de conception, pas de performance | Session du 2 août |
| V2-12 | Réactiver la minification — le paquet pèse 7,2 Mo non minifié | `ROADMAP.md` |
| V2-13 | Valider le contenu du jeu par un schéma explicite, comme l'exige l'ADR-0005 | `ROADMAP.md` |
| V2-14 | Nettoyer trois tables mortes du schéma de base | `ROADMAP.md` |
| V2-15 | Tester le lobby de bout en bout — suppose un mode invité | `qualite/strategie-tests.md` |

## Décisions à prendre avant de figer le contenu de la v2

Ces points ne sont pas des tâches : ils déterminent ce que la v2 contient.

1. **Conserver le lockstep pair-à-pair, ou revenir à un serveur autoritaire ?** Le propriétaire a
   annoncé trancher avec son fils. Le choix change la portée de l'itération : mineure si le modèle
   est conservé, majeure sinon. Voir [ADR-0008](docs/decisions/ADR-0008-p2p-lockstep-coop.md).
2. **Le jeu visé par [`gameplay.md`](gameplay.md) remplace-t-il le jeu livré ?** Le brouillon
   d'atelier décrit une campagne par niveaux avec cycle jour/nuit et condition de victoire, que le
   jeu actuel n'a pas. Tant que la décision n'est pas datée, les deux coexistent dans le dépôt.
3. **Faut-il une condition de victoire ?** Question ouverte depuis les piliers produit du
   20 juillet.

## Hypothèses à valider pendant la v2

Sept restent ouvertes dans `.sdp/etat.json`. Deux deviennent vérifiables maintenant que la
télémétrie fonctionne :

- **HYP-004** — sept jours de rétention suffisent-ils ? La première analyse rétrospective
  impossible tranchera.
- **HYP-005** — un collecteur sans surveillance suffit-il ? Un écart entre parties jouées et
  parties enregistrées le dira. *Rappel : la v1 a connu deux sessions entières perdues pour cause
  de rejet silencieux — l'hypothèse est déjà fragilisée.*

Les cinq autres portent sur l'usage et attendent la campagne d'observation.
