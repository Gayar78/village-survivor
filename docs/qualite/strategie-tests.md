# Village Survivor — Stratégie de tests

> Statut : approuvé
> Version du projet : v1
> Propriétaire : Gayar
> Dernière revue : 1er août 2026
> Niveau de garantie requis : `renforce`

Le niveau `renforce` demande de couvrir la logique métier, les modes d'erreur, **les accès non
autorisés** et **les dépendances**. Les deux premiers le sont déjà ; les deux derniers ne le
sont pas du tout. Ce document dit quoi ajouter et pourquoi.

## Où en est la couverture

| Domaine | État | Volume |
|---|---|---|
| Logique métier de la simulation | **couvert** | 111 tests Vitest |
| Contrat de session et roster coopératif | **couvert** | inclus ci-dessus |
| Interface (HUD, boutique, méta-build) | **couvert** | inclus ci-dessus |
| Démarrage du jeu dans un navigateur réel | **couvert** | 1 smoke Playwright, en intégration continue |
| Performance de la simulation | **couvert** | 1 scénario, hors navigateur |
| **Accès non autorisés** | **absent** | — |
| **Dépendance externe indisponible** | **absent** | — |
| **Contrat d'observabilité** | **absent** | — |
| Parcours du lobby de bout en bout | **absent** | — |

La couverture mesurée, 86 % des instructions, ne porte que sur `game-core` et `content`. Les
services de compte, l'authentification, les canaux temps réel et le schéma SQL n'y figurent
pas — c'est-à-dire précisément les zones où les trous subsistent. Le pourcentage est donc
rassurant à tort, et ne doit pas servir d'indicateur de confiance globale.

## Risques couverts

| Risque | Niveau | Tests prévus | Gate |
|---|---|---|---|
| Une règle de jeu se comporte autrement qu'attendu | moyen | tests de simulation existants | `pnpm test` |
| Le jeu ne démarre plus dans un navigateur | élevé | smoke sur le build de production | intégration continue |
| **Une session sans second facteur accède aux données** | élevé | intégration contre la pile locale : une session `aal1` doit être refusée en lecture comme en écriture | avant release |
| **Un compte lit les données d'un autre** | élevé | intégration : lecture croisée refusée sur chaque table | avant release |
| **L'instrumentation casse le déterminisme** | élevé | garde d'import : `game-core` ne doit dépendre d'aucune bibliothèque de télémétrie ni de l'horloge | `pnpm test` |
| **Deux pairs divergent en coopération** | élevé | test d'empreinte sur une partie simulée à plusieurs avatars | `pnpm test` |
| Le service externe est indisponible | moyen | le jeu solo démarre et se termine sans Supabase joignable | `pnpm test:smoke` |
| Le backend de télémétrie est indisponible | moyen | une partie se déroule normalement, collecteur éteint | avant release |
| **Une donnée interdite part dans la télémétrie** | élevé | inspection des spans et journaux émis pendant une partie simulée | `pnpm test` |
| Une régression de performance passe inaperçue | moyen | budget de durée par tick | `pnpm benchmark` |

## Niveaux et types de tests

| Type | Périmètre | Environnement | Fréquence |
|---|---|---|---|
| Unitaire et simulation | règles, déterminisme, roster, quêtes, atelier, budget de bénédictions | Node, sans navigateur | à chaque commit |
| Contrat de session | barrière de démarrage, roster lockstep, empreintes | Node | à chaque commit |
| Contrat d'observabilité | trace d'une partie, corrélation, données interdites, niveau de journalisation | Node | à chaque commit |
| Garde d'architecture | `game-core` sans horloge, sans navigateur, sans télémétrie | Node | à chaque commit |
| Smoke de production | le jeu démarre, pas d'API de débogage, pas d'injection par la graine | navigateur, build de production | à chaque commit |
| **Intégration des autorisations** | politiques RLS, exigence de second facteur, isolation entre comptes | **pile Docker locale** | avant chaque release |
| Performance | coût par tick sous charge, coût d'une projection | Node | à la demande et avant release |
| Bout en bout du lobby | connexion, second facteur, salon, lancement | navigateur + pile locale | *différé — voir ci-dessous* |

**Pourquoi l'intégration des autorisations n'est pas en intégration continue.** Elle exige une
base Postgres avec les cinq migrations et un service d'authentification. La monter dans le
pipeline coûterait plusieurs minutes par exécution pour un projet qui n'a ni budget ni urgence.
Elle est donc **exécutée à la main contre la pile locale avant une release**, et cette exécution
fait partie des critères de sortie. C'est un compromis assumé, pas un oubli : le risque couvert
est élevé, et une vérification manuelle tracée vaut mieux qu'une automatisation absente.

**Pourquoi le bout en bout du lobby est différé.** Il bute sur l'authentification obligatoire et
son second facteur, qu'un scénario automatisé ne peut pas franchir sans soit un mode invité, soit
un mécanisme de contournement réservé aux tests. Créer ce contournement affaiblirait la seule
protection réellement en place. La décision est renvoyée à la phase fonctionnelle, où un mode
invité peut être arbitré pour lui-même et non comme un artifice de test.

## Données de test

- **Comptes** : créés dans le domaine réservé `.test` (par exemple `alpha@village.test`), jamais
  une adresse réelle, jamais celle d'un membre de l'équipe.
- **Anonymisation** : sans objet, aucune donnée réelle n'est copiée dans un environnement de
  test.
- **Remise à zéro** : `docker compose down -v` détruit la base locale ; les migrations la
  reconstruisent. Aucune donnée de test ne survit à un cycle.
- **Données interdites dans les tests comme ailleurs** : aucun secret réel, aucun jeton valide,
  aucune clé de service dans un fichier de test.

## Observabilité

Les tests ci-dessous matérialisent le contrat défini dans [`../observabilite.md`](../observabilite.md).
Ils sont exigés par la méthode et bloquent la release.

- **Trace complète** : une partie simulée produit un span racine `game.session` portant un
  identifiant de trace, et ses spans enfants aux frontières attendues.
- **Corrélation** : tout enregistrement émis dans le contexte d'une partie porte `trace_id` et
  `span_id`.
- **Identification** : le service, sa version et son environnement sont lisibles sur les
  ressources émises.
- **Filtrage des données sensibles** : aucune adresse e-mail, aucun pseudonyme, aucun jeton,
  aucun code de salon en clair dans un span ou un enregistrement. **La détection d'une seule de
  ces valeurs fait échouer le test et bloque la release.**
- **Niveau de journalisation** : le changer par la surcharge prévue modifie le seuil sans
  reconstruire ni toucher au code.
- **Panne du backend** : collecteur injoignable, une partie démarre, se déroule et se termine
  normalement ; aucune attente, aucun blocage, aucun message au joueur.
- **Garde de déterminisme** : `packages/game-core` ne dépend d'aucune bibliothèque de
  télémétrie, et ne contient toujours ni `Date.now`, ni `performance.now`, ni `Math.random`.
  Cette garde est la plus importante du lot : si elle tombe, la coopération tombe avec elle.

## Critères d'entrée et de sortie

**Entrée** — avant d'ouvrir un incrément :

- `pnpm check` vert sur la base de départ ;
- l'incrément sait quel risque il couvre et par quel test.

**Sortie** — avant de déclarer une release prête, sans dérogation possible :

1. `pnpm check` vert — formatage, règles, types, tests, build ;
2. `pnpm test:smoke` vert sur le build de production ;
3. tests d'intégration des autorisations exécutés contre la pile locale, résultat consigné ;
4. **une exécution réelle tracée de bout en bout**, montrée et non supposée ;
5. journaux corrélés à cette trace ;
6. aucune donnée interdite détectée dans la télémétrie ;
7. niveau de journalisation modifiable sans changement de code ;
8. **le produit a réellement été essayé** — une partie jouée, pas seulement compilée.

Les points 4 à 8 sont les gates de la méthode. Le point 8 mérite une insistance : ce projet a
passé un mois à livrer du code dont personne n'avait vérifié qu'il donnait envie d'y jouer.

## Preuves

| Preuve | Forme | Où |
|---|---|---|
| Résultat des contrôles automatiques | sortie de `pnpm check` | intégration continue, rattachée au commit |
| Smoke de production | rapport Playwright | intégration continue |
| Autorisations | relevé daté de l'exécution locale | `docs/qualite/rapport-tests.md`, en phase 5 |
| Trace de bout en bout | capture d'une trace réelle | `docs/qualite/rapport-tests.md` |
| Exercice de panne | chaîne symptôme → trace → span → journaux → cause → action | `docs/qualite/rapport-tests.md` |
| Performance | sortie de `pnpm benchmark`, avec la version mesurée | `docs/qualite/rapport-tests.md` |

Chaque preuve porte la version du produit et l'environnement où elle a été obtenue. Une preuve
sans version ne prouve rien.
