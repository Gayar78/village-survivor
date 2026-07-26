# ADR-0002 — Isoler une simulation à pas fixe exécutable sans rendu

- Statut : **Accepté**
- Date : 20 juillet 2026
- Exigences : `REQ-ARCH-001`, `REQ-SIM-001`, `REQ-SIM-003`, `REQ-TEST-002`

## Contexte

La première version s'exécute localement dans le navigateur, tandis que la version
coopérative devra exécuter les mêmes règles sur un serveur autoritaire. Phaser possède
sa propre boucle, ses objets physiques et ses contraintes de rendu. En faire la source
de vérité empêcherait les tests rapides sans navigateur et imposerait une réécriture
pour le serveur.

Le gameplay comporte en outre des vagues, de nombreux ennemis, une carte générée et des
choix d'équilibrage qui nécessitent des simulations reproductibles.

## Décision

Placer l'état et les règles dans `game-core`, sans dépendance à Phaser, au DOM, au
navigateur, à Colyseus ou au stockage externe.

La simulation :

- avance avec un pas de temps fixe ;
- reçoit des intentions normalisées ;
- utilise une source aléatoire injectée à partir d'une graine explicite ;
- produit un état public sérialisable et des événements ;
- peut exécuter une partie accélérée dans Vitest ou en ligne de commande ;
- maintient un ordre de traitement stable lorsque celui-ci influence le résultat.

Le rendu peut interpoler et mettre en pool ses objets, mais ne modifie jamais l'état
officiel.

## Options étudiées

### Logique directement dans les scènes Phaser

Rejetée : excellente vitesse pour une démonstration visuelle, mais couplage élevé,
tests lents et impossibilité de partager proprement la simulation avec Node.js.

### Simulation à temps variable

Rejetée pour les règles : elle lie les résultats aux performances de rendu, complique
les replays et rend les tests moins reproductibles.

### Simulation intégralement déterministe au bit près

Non exigée à ce stade : son coût peut être disproportionné. Le projet vise une
reproductibilité raisonnable, testée sur les environnements supportés, et documentera
les limites observées.

## Conséquences

### Positives

- règles testables rapidement sans Canvas ;
- partage réel entre session locale et serveur ;
- reproduction des erreurs grâce à la graine ;
- scénarios d'équilibrage et de performance automatisables.

### Négatives

- adaptation nécessaire entre état logique et objets Phaser ;
- gestion explicite du temps, des collisions et de l'aléatoire ;
- discipline requise pour empêcher les dépendances de rendu de remonter dans le cœur.

### Garde-fous

- tests d'import garantissant que `game-core` fonctionne dans Node.js ;
- test de reproductibilité pour une graine et une séquence d'entrées ;
- aucune lecture directe de l'horloge système dans une règle ;
- aucune utilisation directe de `Math.random()` dans le gameplay.
