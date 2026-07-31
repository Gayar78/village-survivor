# Village Survivor — Documentation

> Statut : en construction
> Version du projet : v1
> Propriétaire : l'équipe Village Survivor
> Dernière revue : 31 juillet 2026
> Niveau d'assurance : à classer *(classé en phase 2)*

Ce document est la porte d'entrée de la documentation. Le projet a été placé sous méthode le
31 juillet 2026, alors qu'il existait déjà et tournait.

## Lire d'abord

1. [Objectif](objectif.md) — *à produire en phase 1*
2. [Spécification non-fonctionnelle](spec-nf.md) — *à produire en phase 2*
3. [Spécification fonctionnelle](spec-fonctionnelle.md) — *à produire en phase 3*
4. [Feedback](feedback.md) — *à partir de la phase 5*

En attendant que ces documents existent, la navigation courante reste
[README.md](README.md), et l'état réel du produit est décrit par
[gameplay/current-rules.md](gameplay/current-rules.md) et
[architecture/overview.md](architecture/overview.md).

## Artefacts applicables

| Artefact | Statut | Pourquoi il existe | Dernière revue |
|---|---|---|---|
| Objectif | absent | cadrer le résultat attendu | — |
| Spécification non-fonctionnelle | absent | qualité, architecture, observabilité | — |
| Spécification fonctionnelle | absent | comportements et tests | — |
| Règles de gameplay courantes | approuvé | photographie des règles réellement codées | 31/07/2026 |
| Vue d'architecture | approuvé | composants et flux réels | 31/07/2026 |
| Décisions d'architecture (ADR) | approuvé | choix structurants et écarts constatés | 31/07/2026 |
| Matrice de traçabilité | approuvé | état réel de chaque exigence | 31/07/2026 |
| Déploiement | approuvé | intégration continue et environnements | 31/07/2026 |

## Décisions de la phase 0

**La méthode est appliquée en place, sur le dépôt existant.** La phase 0 prévoit soit un dépôt
neuf, soit l'ouverture d'un projet existant en lecture seule pour en reconstruire un autre à
côté. Aucune de ces deux formes ne correspondait au besoin : le produit existe, il tourne, et
c'est lui qu'il faut mettre sous méthode. `origine` vaut donc `existant`, aucun répertoire n'a
été créé, et le dépôt reste modifiable. Aucune dette n'est contractée par cette adaptation.

**Le profil de l'utilisateur est définitif** : il ne code pas, a déjà mis une application en
ligne une ou deux fois, et spécifiait parfois avant de construire. En conséquence, l'agent
tranche les décisions techniques et annonce leur coût, leur délai et leur risque en langage
clair, plutôt que de les soumettre à l'arbitrage.

## Hypothèses ouvertes

| ID | Décision provisoire | Impact | Validation attendue |
|---|---|---|---|
| — | *aucune à ce stade* | | |

## Points ouverts hérités de l'état du produit

Ces questions préexistent à la mise sous méthode. Elles sont détaillées dans
[../ROADMAP.md](../ROADMAP.md) et seront reprises par les phases 1 et 2.

- le jeu livré n'a **aucune condition de victoire** et fait **persister la progression entre
  les parties**, alors que les piliers produit du 20 juillet 2026 exigeaient l'inverse sur les
  deux points, sans qu'aucune décision datée ne les ait remplacés ;
- la coopération et la persistance de compte ont été livrées sans arbitrage préalable
  ([ADR-0008](decisions/0008-p2p-lockstep-coop.md),
  [ADR-0009](decisions/0009-account-persistence.md)) ;
- il n'existe **aucune télémétrie** : ni trace, ni métrique, ni API de débogage.

## Releases

- *aucune release figée à ce jour*

## Documents historiques

- *aucun document migré*
