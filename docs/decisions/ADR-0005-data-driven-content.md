# ADR-0005 — Piloter le contenu et l'équilibrage par des données validées

- Statut : **Accepté**
- Date : 20 juillet 2026
- Exigences : `REQ-CONTENT-001`, `REQ-CONTENT-002`, `REQ-QUALITY-001`

## Contexte

Le jeu prévoit plusieurs disciplines, améliorations, ennemis, vagues, ressources,
bâtiments et artefacts. Leur contenu et leur équilibrage évolueront souvent pendant
les playtests. Disperser ces valeurs dans les systèmes ou les scènes rendrait les
changements risqués, difficiles à comparer et peu automatisables.

Le projet doit par ailleurs rester facile à modifier par un agent et éviter un éditeur
graphique obligatoire.

## Décision

Définir le contenu et les paramètres d'équilibrage dans des fichiers texte versionnés.
JSON est préféré pour les données pures et TypeScript peut être utilisé lorsque la
composition ou le typage apporte un bénéfice démontré.

Chaque catégorie possède un schéma explicite. Le chargement valide :

- les types, bornes et unités ;
- l'unicité et la stabilité des identifiants ;
- les références entre contenus ;
- les champs obligatoires ;
- les incohérences métier détectables sans lancer une partie.

La validation s'exécute en développement, dans les tests et en CI. Une erreur nomme le
fichier, l'identifiant et le champ concernés.

## Options étudiées

### Constantes dans le code des systèmes

Rejetées pour le contenu : simples au début, mais difficiles à inventorier, comparer et
faire évoluer sans toucher aux règles.

### Éditeur de contenu propriétaire

Rejeté au démarrage : dépendance lourde, formats potentiellement binaires et faible
valeur avant un catalogue conséquent.

### JSON sans validation

Rejeté : les erreurs seraient découvertes tardivement et les relations resteraient
fragiles.

### TypeScript exclusivement

Non imposé : très bon typage, mais peut mélanger logique et données et rendre les
transformations externes moins simples. Le choix se fait par catégorie.

## Conséquences

### Positives

- équilibrage centralisé, diffable et révisable ;
- génération de scénarios et outils possible ;
- erreurs détectées avant le lancement ;
- contenu indépendant des scènes Phaser.

### Négatives

- schémas et chargeur à maintenir ;
- migrations nécessaires lors d'une évolution de format ;
- risque de créer un système générique trop complexe.

### Garde-fous

- aucun mini-langage ou moteur de script sans besoin démontré ;
- valeurs par défaut rares et explicites ;
- tests d'exemple valide et invalide pour chaque schéma ;
- unités visibles dans les noms, par exemple `cooldownMs` ;
- règles comportementales dans `game-core`, paramètres dans le contenu.
