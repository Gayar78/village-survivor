# Documentation de Village Survivor

## Par où commencer

Le jeu réellement jouable est décrit par deux documents, tenus à jour d'après le code :

1. [`gameplay/current-rules.md`](gameplay/current-rules.md) — les règles implémentées ;
2. [`architecture/overview.md`](architecture/overview.md) — les composants et les flux réels.

## Références historiques et normatives

Ces documents restent la référence des décisions prises, **mais le code les contredit
aujourd'hui sur plusieurs points**. Ils ne sont pas réécrits : les écarts sont consignés dans des
ADR et dans la matrice de traçabilité.

- [`product/product-pillars.md`](product/product-pillars.md) — règles produit validées le
  20 juillet 2026 ;
- [`product/decisions/2026-07-20-product-workshop.md`](product/decisions/2026-07-20-product-workshop.md)
  — compte rendu de l'atelier produit ;
- [`requirements/initial-technical-baseline.md`](requirements/initial-technical-baseline.md)
  — architecture, qualité et exigences non fonctionnelles initiales ;
- [`decisions/`](decisions/README.md) — décisions structurantes, leurs remplacements et les
  écarts constatés.

## Navigation

- [`requirements/traceability-matrix.md`](requirements/traceability-matrix.md) — état réel de
  chaque exigence, y compris celles qui ne sont plus tenues ;
- [`SETUP_SUPABASE.md`](SETUP_SUPABASE.md) — configurer le projet Supabase dont dépend le lobby ;
- [`deployment.md`](deployment.md) — intégration continue, variables d'environnement et
  prérequis d'hébergement ;
- [`product/legacy-analysis/`](product/legacy-analysis/functional-inventory.md) — analyse en
  lecture seule du prototype historique de `Gayar78` ;
- [`../ROADMAP.md`](../ROADMAP.md) — ce qui est livré, ce qui reste et ce qui est à arbitrer ;
- [`../CHANGELOG.md`](../CHANGELOG.md) — changements livrés.

## Résolution des contradictions

En cas de contradiction entre deux documents :

- la décision humaine datée la plus récente prévaut pour le gameplay ;
- l'ADR accepté le plus récent prévaut pour un choix architectural ;
- l'écart doit être rendu explicite et les documents contradictoires doivent se référencer au
  lieu d'être silencieusement réécrits.

**Un cas particulier occupe aujourd'hui le projet** : plusieurs choix ont été implémentés sans
décision préalable. Ils ne peuvent donc « prévaloir » sur rien. Ils sont consignés avec le statut
**Constaté** — ADR [0008](decisions/0008-p2p-lockstep-coop.md) et
[0009](decisions/0009-account-persistence.md) — ce qui signifie : le code fait ceci, personne ne
l'a décidé, et l'arbitrage reste à rendre.

## Fidélité à l'état réel

La documentation emploie les termes suivants :

- **normatif** ou **accepté** pour une décision à respecter ;
- **cible** ou **planifié** pour un élément non encore implémenté ;
- **implémenté** uniquement lorsqu'un chemin de code et une vérification existent ;
- **constaté** pour un comportement présent dans le code sans décision qui l'autorise ;
- **non tenu** pour une exigence que le code contredit.
