# Village Survivor — Documentation

> Statut : en construction
> Version du projet : v1
> Propriétaire : Gayar
> Dernière revue : 1er août 2026
> Niveau de garantie requis : **`renforce`**, confirmé le 1er août 2026

Porte d'entrée de la documentation. Le projet a été placé sous méthode le 31 juillet 2026,
alors qu'il existait déjà et tournait.

## Lire d'abord

1. [Objectif](objectif.md) — **approuvé le 31 juillet 2026**
2. [Spécification non-fonctionnelle](spec-nf.md) — **approuvée le 1er août 2026**
3. [Spécification fonctionnelle](spec-fonctionnelle.md) — **en revue**, en attente de validation
4. `feedback.md` — *à partir de la phase 5*

Le dernier reste volontairement sans lien tant que le fichier n'existe pas : un lien mort dans
la porte d'entrée coûte plus qu'il ne rapporte.

En attendant, l'état réel du produit est décrit par [`gameplay/current-rules.md`](gameplay/current-rules.md)
et [`architecture.md`](architecture.md).

## Niveau de garantie requis

**`renforce`**, confirmé le 1er août 2026. Trois déclencheurs objectifs sont réunis, et le plus
élevé l'emporte :

- le produit est **partagé** avec d'autres personnes que son auteur ;
- il **dépend d'un service extérieur** (Supabase) pour l'authentification et la coopération ;
- il **traite des données de tiers** — les adresses e-mail des joueurs invités.

Le niveau `critique` n'est pas retenu : aucune réglementation, aucune donnée sensible, aucun
argent réel ou virtuel — exclusion assumée de l'objectif — et des conséquences explicitement
acceptées par le propriétaire du projet.

**À réviser si** le jeu s'ouvre à des inconnus, si de l'argent réel ou virtuel apparaît, si des
données personnelles s'ajoutent à l'adresse e-mail, ou si un classement introduit une compétition
entre joueurs. Chacun de ces faits ferait basculer le projet en `critique`.

Ce classement détermine quels artefacts sont attendus. Les tableaux ci-dessous s'y conforment.

### Complexité constatée

Elle impose des artefacts sans relever la criticité. Les quatre déclencheurs sont présents :
plusieurs services (base, authentification, temps réel, passerelle), de l'asynchrone (canal de
diffusion et lots d'entrées), une API exposée au navigateur, et des données persistantes.

Conséquence directe pour la suite : le tracing devra être **distribué**, et la boucle de jeu à
20 ticks par seconde interdit de tracer chaque tick — il faudra des métriques agrégées et des
spans aux seules frontières significatives.

## Artefacts de la méthode

| Artefact | Emplacement | Statut |
|---|---|---|
| Index | `index.md` | à jour |
| Objectif | [`objectif.md`](objectif.md) | approuvé |
| Spécification non-fonctionnelle | [`spec-nf.md`](spec-nf.md) | approuvée |
| Spécification fonctionnelle | [`spec-fonctionnelle.md`](spec-fonctionnelle.md) | **en revue** |
| Feedback | `feedback.md` | **absent** — phase 5 |
| Architecture | [`architecture.md`](architecture.md) | approuvé |
| Décisions | [`decisions/`](decisions/README.md) — 9 ADR | approuvé |
| Observabilité | [`observabilite.md`](observabilite.md) | approuvée |
| Stratégie de tests | [`qualite/strategie-tests.md`](qualite/strategie-tests.md) | approuvée |
| Rapport de tests | `qualite/rapport-tests.md` | **absent** — phase 5 |
| Runbooks | `runbooks/` | **absent** — au premier incident réellement rencontré |
| Releases | `releases/v<N>.md` | **absent** — phase 7 |

La traçabilité des exigences ([`qualite/traceabilite.md`](qualite/traceabilite.md)) est un
artefact du niveau `critique`. Elle existait avant la mise sous méthode et rend de vrais
services : elle est conservée, et rangée à l'emplacement que la méthode lui donnerait.

Les artefacts marqués **absent** ne sont pas des oublis : chacun appartient à une phase qui n'a
pas encore eu lieu. Les créer d'avance produirait des documents vides.

## Documents propres au projet

Hors taxonomie de la méthode, mais nécessaires au produit. Ils ne sont ni des doublons des
documents cœur, ni des artefacts que la méthode prescrirait.

| Document | Rôle |
|---|---|
| [`gameplay/current-rules.md`](gameplay/current-rules.md) | photographie des règles réellement codées |
| [`deployment.md`](deployment.md) | intégration continue, environnements, prérequis |
| [`SETUP_SUPABASE.md`](SETUP_SUPABASE.md) | procédure de configuration du service externe |
| [`../deploy/lan/README.md`](../deploy/lan/README.md) | déploiement LAN auto-hébergé |

## Documents historiques

Conservés intacts. Ils portent des décisions humaines datées, que le code contredit aujourd'hui
sur plusieurs points. **Ils ne sont pas réécrits** : les écarts sont recensés ailleurs et les
documents se référencent mutuellement.

| Document | Nature | État |
|---|---|---|
| [`product/product-pillars.md`](product/product-pillars.md) | piliers produit du 20 juillet 2026 | contredit par le code, non remplacé |
| [`product/decisions/2026-07-20-product-workshop.md`](product/decisions/2026-07-20-product-workshop.md) | compte rendu d'atelier | historique |
| [`requirements/initial-technical-baseline.md`](requirements/initial-technical-baseline.md) | cadrage technique initial, exigences `REQ-*` | normatif, écarts consignés au chapitre 23 |
| [`product/legacy-analysis/`](product/legacy-analysis/functional-inventory.md) | analyse du prototype de `Gayar78` | lecture seule |

## Décisions de structure

**La méthode est appliquée en place, sur le dépôt existant.** La phase 0 prévoit soit un dépôt
neuf, soit l'ouverture d'un projet existant en lecture seule pour en reconstruire un autre à
côté. Aucune de ces deux formes ne correspondait au besoin : le produit existe, il tourne, et
c'est lui qu'il faut mettre sous méthode. `origine` vaut donc `existant`, aucun répertoire n'a
été créé, et le dépôt reste modifiable. Aucune dette n'est contractée par cette adaptation.

**Le profil de l'utilisateur est définitif** : il ne code pas, a déjà mis une application en
ligne une ou deux fois, et spécifiait parfois avant de construire. En conséquence, l'agent
tranche les décisions techniques et annonce leur coût, leur délai et leur risque en langage
clair, plutôt que de les soumettre à l'arbitrage.

**Les ADR gardent leur en-tête propre.** La méthode demande statut, version, propriétaire et
date de dernière revue sur chaque document. Un ADR est une décision datée et non un document
vivant : il porte son statut et sa date, et n'est jamais révisé après coup. Lui ajouter une
« dernière revue » suggérerait l'inverse. Même raisonnement pour les documents historiques.

## Contrainte de publication

> **Le dépôt distant `Gayar78/village-survivor` est public.**
>
> **Aucun push n'est autorisé avant une passe de désensibilisation de la documentation.**
> Décision du 31 juillet 2026. Le travail est commité localement en attendant.
>
> Trois familles de contenu sont concernées, à traiter avant toute publication :
>
> 1. **les prénoms** de Gayar, Hida et Clem, qui apparaissent dans l'objectif et le critère de
>    réussite ;
> 2. **les faiblesses de sécurité assumées**, décrites précisément — le jeu croit le navigateur
>    du joueur sur parole, et l'or de compte est déclaré par le client. Écrit pour l'équipe,
>    c'est une information utile ; publié, c'est un mode d'emploi ;
> 3. **les écarts et anomalies** relevés par les audits, qui décrivent où le produit est faible.
>
> Cette contrainte tombe si le dépôt passe en privé — réglage qui appartient à ses
> propriétaires, et que l'agent ne modifie pas.

## Hypothèses ouvertes

| ID | Décision provisoire | Impact | Validation attendue |
|---|---|---|---|
| HYP-001 | Le critère de réussite est mesuré sur trois personnes nommées, pas sur un échantillon plus large | Un résultat positif ne prouve pas l'intérêt pour un joueur extérieur | Premiers retours d'un joueur invité hors du groupe |
| HYP-002 | Le jeu reste en réseau local ou en accès privé pendant la période d'observation | Aucune donnée d'usage venant d'inconnus ne sera collectée | Décision d'ouverture publique |

## Points ouverts hérités de l'état du produit

Antérieurs à la mise sous méthode, détaillés dans [`../ROADMAP.md`](../ROADMAP.md) et repris par
les phases 2 et 3.

- le jeu livré n'a **aucune condition de victoire** et fait **persister la progression entre les
  parties**, alors que les piliers produit du 20 juillet 2026 exigeaient l'inverse sur les deux
  points, sans qu'aucune décision datée ne les ait remplacés ;
- la coopération et la persistance de compte ont été livrées sans arbitrage préalable
  ([ADR-0008](decisions/ADR-0008-p2p-lockstep-coop.md),
  [ADR-0009](decisions/ADR-0009-account-persistence.md)) ;
- il n'existe **aucune télémétrie** dans le code : ni trace, ni métrique, ni API de débogage. Sa
  conception est arrêtée depuis le 1er août 2026 ([`observabilite.md`](observabilite.md)) ; son
  implémentation appartient à la phase 4 et conditionne la campagne d'observation d'un mois.

## Autres références

- [`../ROADMAP.md`](../ROADMAP.md) — ce qui est livré, ce qui reste, ce qui est à arbitrer ;
- [`../CHANGELOG.md`](../CHANGELOG.md) — changements livrés.

## Fidélité à l'état réel

- **normatif** ou **accepté** pour une décision à respecter ;
- **cible** ou **planifié** pour un élément non encore implémenté ;
- **implémenté** uniquement lorsqu'un chemin de code et une vérification existent ;
- **constaté** pour un comportement présent dans le code sans décision qui l'autorise ;
- **non tenu** pour une exigence que le code contredit.
