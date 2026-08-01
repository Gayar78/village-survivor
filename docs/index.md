# Village Survivor — Documentation

> Statut : en construction
> Version du projet : v1
> Propriétaire : l'équipe Village Survivor
> Dernière revue : 31 juillet 2026
> Niveau d'assurance : à classer *(classé en phase 2)*

Ce document est la porte d'entrée de la documentation. Le projet a été placé sous méthode le
31 juillet 2026, alors qu'il existait déjà et tournait.

## Lire d'abord

1. [Objectif](objectif.md) — **approuvé le 31 juillet 2026**
2. `spec-nf.md` — spécification non-fonctionnelle, *à produire en phase 2*
3. `spec-fonctionnelle.md` — spécification fonctionnelle, *à produire en phase 3*
4. `feedback.md` — *à partir de la phase 5*

Les trois derniers restent volontairement sans lien tant que le fichier n'existe pas : un lien
mort dans la porte d'entrée de la documentation coûte plus qu'il ne rapporte. Ils deviendront
cliquables à mesure que les phases les produiront.

En attendant que ces documents existent, la navigation courante reste
[README.md](README.md), et l'état réel du produit est décrit par
[gameplay/current-rules.md](gameplay/current-rules.md) et
[architecture/overview.md](architecture/overview.md).

## Artefacts applicables

| Artefact | Statut | Pourquoi il existe | Dernière revue |
|---|---|---|---|
| Objectif | approuvé | cadrer le résultat attendu | 31/07/2026 |
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
> 3. **les écarts et anomalies** relevés par l'audit, qui décrivent où le produit est faible.
>
> Cette contrainte tombe si le dépôt passe en privé — réglage qui appartient à ses
> propriétaires, et que l'agent ne modifie pas.

## Hypothèses ouvertes

| ID | Décision provisoire | Impact | Validation attendue |
|---|---|---|---|
| HYP-001 | Le critère de réussite est mesuré sur trois personnes nommées, pas sur un échantillon plus large | Un résultat positif ne prouve pas l'intérêt pour un joueur extérieur | Premiers retours d'un joueur invité hors du groupe |
| HYP-002 | Le jeu reste en réseau local ou en accès privé pendant la période d'observation | Aucune donnée d'usage venant d'inconnus ne sera collectée | Décision d'ouverture publique |

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
