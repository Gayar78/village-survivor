# Village Survivor — Stratégie de tests

> Statut : approuvé
> Version du projet : v2
> Propriétaire : Gayar
> Dernière revue : 3 août 2026
> Niveau de garantie requis : `renforce`

Le niveau `renforce` demande de couvrir la logique métier, les modes d'erreur, les accès non
autorisés et les dépendances. La v2 ajoute une autorité serveur : ses contrats, sa sécurité et
son cycle de vie deviennent des gates de release, au même titre que la simulation.

## Où en est la couverture

| Domaine | État | Volume |
|---|---|---|
| Logique métier et frontières solo | **couvert** | 198 tests Vitest après arbitrage Claude |
| Contrat de session et roster coopératif | **couvert** | inclus ci-dessus |
| Interface (HUD, boutique, méta-build) | **couvert** | inclus ci-dessus |
| Démarrage du jeu dans un navigateur réel | **couvert** | 6 scénarios Playwright, en intégration continue |
| Performance de la simulation | **couvert** | 1 scénario, hors navigateur |
| **Accès non autorisés** | **partiel** | JWT solo, roster, création Colyseus forgée et commandes |
| **Dépendance externe indisponible** | **partiel** | PostgREST et création solo |
| **Contrat d'observabilité** | **couvert** | trace réelle exportée et inspectée, données interdites, seuil de journalisation |
| **Garde d'architecture du moteur** | **couvert** | dépendances, imports, horloge, aléatoire, navigateur |
| Parcours du lobby de bout en bout | **absent** | — |
| Serveur autoritaire et contrats réseau | **solo et coop couverts** | Vitest serveur + clients Colyseus réels 2/4 et 10/31 s |
| Récompenses serveur idempotentes | **planifié v2** | boucle 4 |

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
| Deux clients observent des états différents | élevé | intégration à deux puis quatre clients sur une même room | avant release |
| JWT ou identité hors roster acceptés | élevé | JWT invalide, hors roster, double connexion et room pleine refusés | `pnpm test` |
| Message malformé ou abusif accepté | élevé | fuzz borné, nombres non finis, séquence, débit et file d'actions | `pnpm test` |
| Reconnexion incorrecte | élevé | coupures 10 s et 31 s, sortie volontaire, room vide, retour tardif | `pnpm test` et Playwright |
| Double crédit d'or | élevé | deux finalisations concurrentes sur la même partie | intégration SQL |
| Le serveur est indisponible | moyen | erreur lisible et retour propre au lobby, aucun fallback local | Playwright |
| Le backend de télémétrie est indisponible | moyen | une partie se déroule normalement, collecteur éteint | avant release |
| **Une donnée interdite part dans la télémétrie** | élevé | inspection des spans et journaux émis pendant une partie simulée | `pnpm test` |
| Une régression de performance passe inaperçue | moyen | budget de durée par tick | `pnpm benchmark` |

## Niveaux et types de tests

| Type | Périmètre | Environnement | Fréquence |
|---|---|---|---|
| Unitaire et simulation | règles, déterminisme, roster, quêtes, atelier, budget de bénédictions | Node, sans navigateur | à chaque commit |
| Contrat de session | création, admission, Schema, contrôles, actions et événements | Node | à chaque commit |
| Contrat d'observabilité | trace d'une partie, corrélation, données interdites, niveau de journalisation | Node | à chaque commit |
| Garde d'architecture | `game-core` sans horloge, sans navigateur, sans télémétrie | Node | à chaque commit |
| Smoke de production | le jeu démarre, pas d'API de débogage, pas d'injection par la graine | navigateur, build de production | à chaque commit |
| **Intégration des autorisations** | politiques RLS, exigence de second facteur, isolation entre comptes | **pile Docker locale** | avant chaque release |
| Performance | coût par tick sous charge, coût d'une projection | Node | à la demande et avant release |
| Charge serveur | 20 min, 4 joueurs, 200 monstres, ticks et patches | Node + serveur | avant release |
| Intégration SQL | finalisation concurrente, permissions `service_role` | pile Docker locale | avant release |
| Multi-client | roster 2/4, synchronisation et reconnexion | Playwright + pile locale | avant release |
| Bout en bout du lobby | connexion, second facteur, salon, lancement | navigateur + pile locale | *différé — voir ci-dessous* |

**Pourquoi l'intégration des autorisations n'est pas en intégration continue.** Elle exige une
base Postgres avec les cinq migrations et un service d'authentification. La monter dans le
pipeline coûterait plusieurs minutes par exécution pour un projet qui n'a ni budget ni urgence.
Elle est donc **exécutée à la main contre la pile locale avant une release**, et cette exécution
fait partie des critères de sortie. C'est un compromis assumé, pas un oubli : le risque couvert
est élevé, et une vérification manuelle tracée vaut mieux qu'une automatisation absente.

Les parcours serveur utilisent des JWT de test émis par une pile isolée ou un secret dédié à
l'environnement de test. Aucun contournement n'existe dans le build de production. Le scénario
final avec TOTP reste manuel sur les deux postes LAN.

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

- **Trace complète** : une partie produit `game.client.session`, une racine serveur `game.room`
  et ses enfants aux frontières attendues.
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
- **Garde du cœur** : `packages/game-core` ne dépend d'aucune bibliothèque de
  télémétrie, et ne contient toujours ni `Date.now`, ni `performance.now`, ni `Math.random`.
  L'autorité serveur ne justifie pas d'introduire des I/O ou une horloge dans le moteur.

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
9. une partie solo et une partie coopérative sur deux postes ont chacune une trace distribuée ;
10. la charge de 20 minutes respecte tick p95 < 1 ms, boucle < 50 ms, commande→état p95
    < 150 ms et patch p95 < 64 Kio.

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
