# Documentation de Village Survivor

## Références normatives

1. [`product/product-pillars.md`](product/product-pillars.md) — règles produit validées ;
2. [`requirements/initial-technical-baseline.md`](requirements/initial-technical-baseline.md)
   — architecture, qualité et exigences non fonctionnelles initiales ;
3. [`decisions/`](decisions/README.md) — décisions structurantes et leurs conséquences ;
4. [`gameplay/current-rules.md`](gameplay/current-rules.md) — photographie lisible des
   règles actuellement acceptées.

En cas de contradiction :

- la décision humaine la plus récente prévaut pour le gameplay ;
- l'ADR accepté le plus récent prévaut pour un choix architectural ;
- l'écart doit être rendu explicite et les documents contradictoires doivent se
  référencer au lieu d'être silencieusement réécrits.

## Navigation

- [`architecture/overview.md`](architecture/overview.md) — composants et flux ;
- [`requirements/traceability-matrix.md`](requirements/traceability-matrix.md) — liens
  entre exigences, implémentation et tests ;
- [`deployment.md`](deployment.md) — environnements et pipeline cible ;
- [`product/legacy-analysis/`](product/legacy-analysis/functional-inventory.md) —
  analyse en lecture seule du prototype historique ;
- [`../ROADMAP.md`](../ROADMAP.md) — ordre des incréments ;
- [`../CHANGELOG.md`](../CHANGELOG.md) — changements livrés.

## Fidélité à l'état réel

La documentation emploie les termes suivants :

- **normatif** ou **accepté** pour une décision à respecter ;
- **cible** ou **planifié** pour un élément non encore implémenté ;
- **implémenté** uniquement lorsqu'un chemin de code et une vérification existent.
