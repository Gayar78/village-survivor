# Cadrage technique initial

Statut : **normatif**
Source : cadrage fourni par le porteur du produit au démarrage du projet
Dernière consolidation : 20 juillet 2026

## 1. Objet et autorité

Ce document conserve les décisions techniques et non fonctionnelles formulées au
démarrage de *Village Survivor*. Il sert de référence durable pour l'architecture,
les incréments de développement et les revues de code.

Les règles d'application sont les suivantes :

1. les décisions produit confirmées dans
   [`../product/product-pillars.md`](../product/product-pillars.md) font autorité sur
   le gameplay ;
2. le présent document fait autorité sur le cadrage technique tant qu'une décision
   plus récente ne le remplace pas ;
3. une modification structurante doit être consignée dans un ADR ;
4. la documentation doit toujours décrire l'état réel du dépôt et distinguer la cible
   de ce qui est déjà implémenté.

Les identifiants `REQ-*` sont stables. Ils permettent de relier les exigences aux
composants, aux tests et aux contrôles de CI dans la
[`traceability-matrix.md`](traceability-matrix.md).

## 2. Répartition des responsabilités

### REQ-GOV-001 — Autonomie technique de l'agent

L'agent prend en charge environ 90 % des travaux techniques : architecture,
développement, tests, génération des assets temporaires, documentation, intégration
continue et déploiement.

Il prend de manière autonome les décisions techniques courantes, à condition de les
documenter et de respecter ce cadrage. Il ne demande pas une validation humaine pour
chaque choix mineur.

### REQ-GOV-002 — Décisions réservées aux humains

Les humains conservent la responsabilité de :

- définir et faire évoluer la vision du jeu ;
- valider le gameplay et déterminer s'il est amusant ;
- choisir la direction artistique définitive ;
- prioriser les évolutions fonctionnelles ;
- décider de la monétisation et de la collecte de données personnelles ;
- autoriser un coût d'hébergement significatif ;
- valider toute rupture importante avec l'architecture convenue.

## 3. Trajectoire produit

### REQ-SCOPE-001 — Livraison progressive

Le produit doit être construit par étapes :

1. une version locale mono-joueur pour valider le gameplay ;
2. une version multijoueur coopérative ;
3. éventuellement des comptes, une progression persistante, des classements et
   d'autres services en ligne.

La version locale est une étape intermédiaire. Elle ne doit pas créer une architecture
qu'il faudra réécrire pour introduire le multijoueur.

### REQ-SCOPE-002 — Petits incréments jouables

Chaque incrément doit produire la plus petite évolution jouable et vérifiable possible.
Les systèmes complets de combat, progression, village ou réseau ne doivent pas être
développés en une seule fois.

## 4. Principes directeurs

### REQ-PRINCIPLES-001 — Ordre des priorités

Lorsque plusieurs solutions sont valides, privilégier dans cet ordre :

1. la simplicité ;
2. la testabilité ;
3. la lisibilité du code ;
4. l'automatisation ;
5. les formats texte faciles à modifier par un agent ;
6. la compatibilité avec le futur multijoueur ;
7. des coûts d'hébergement faibles ;
8. des décisions réversibles.

### REQ-PRINCIPLES-002 — Contraintes de conception

Le projet doit éviter :

- la surarchitecture et les dépendances inutiles ;
- les éditeurs graphiques indispensables au fonctionnement du projet ;
- les formats binaires difficiles à versionner ;
- la logique de gameplay placée dans les scènes Phaser ;
- l'optimisation sans mesure ;
- les systèmes complexes sans utilité pour le prochain incrément jouable.

## 5. Plateforme et stack cible

### REQ-STACK-001 — Client

Le client cible un navigateur desktop et utilise :

- Phaser 4 ;
- TypeScript en mode strict ;
- Vite ;
- HTML5 Canvas ou WebGL selon le rendu choisi par Phaser.

Le support mobile est envisagé ultérieurement et ne constitue pas une contrainte de la
première version.

### REQ-STACK-002 — Serveur multijoueur

Lorsque le multijoueur sera introduit, le serveur utilisera :

- Node.js et TypeScript ;
- Colyseus ;
- WebSocket ;
- une simulation autoritaire côté serveur.

### REQ-STACK-003 — Outillage

Le projet cible :

- `pnpm` et ses workspaces ;
- un monorepo ;
- ESLint et Prettier ;
- Vitest et Playwright ;
- GitHub Actions ;
- Docker pour le serveur ;
- Cloudflare Workers Static Assets pour le client ;
- Colyseus Cloud ou un hébergement Docker simple pour le serveur.

Les versions exactes sont verrouillées dans le dépôt lors de l'initialisation et sont
mises à jour séparément de la logique de jeu.

### REQ-PERSISTENCE-001 — Persistance différée

Aucune base de données ne doit être ajoutée avant un besoin produit réel. Lorsque des
comptes, sauvegardes cloud ou progressions persistantes apparaîtront, la cible sera
PostgreSQL, éventuellement via Supabase, avec migrations versionnées et validation
systématique côté serveur.

## 6. Architecture logicielle

### REQ-ARCH-001 — Séparation des responsabilités

Séparer strictement :

- les règles et l'état du jeu ;
- le rendu graphique ;
- les entrées du joueur ;
- les communications réseau ;
- le protocole partagé ;
- les contenus et paramètres d'équilibrage ;
- les accès aux services externes.

La simulation ne dépend ni de Phaser, ni du navigateur, ni du réseau.

### REQ-ARCH-002 — Frontière de session

Le client consomme une abstraction commune :

```typescript
export interface GameSession {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendInput(input: PlayerInput): void;
  subscribe(listener: (state: PublicGameState) => void): () => void;
}
```

Deux implémentations sont prévues :

- `LocalSession`, qui exécute la simulation localement pour la version mono-joueur ;
- `NetworkSession`, qui échange avec le serveur Colyseus pour le multijoueur.

Les scènes Phaser ne connaissent pas les détails internes de la simulation ou du
serveur. Le passage du local au réseau doit principalement remplacer
l'implémentation de `GameSession`.

### REQ-ARCH-003 — Monorepo cible

La structure cible est :

```text
village-survivor/
  apps/
    client/
      src/
        scenes/
        rendering/
        ui/
        audio/
        input/
    server/
      src/
        rooms/
        matchmaking/
        persistence/
  packages/
    game-core/
      src/
        simulation/
        entities/
        systems/
        rules/
        random/
        state/
    protocol/
      src/
        commands/
        events/
        schemas/
    content/
      characters/
      enemies/
      weapons/
      waves/
      buildings/
      balancing/
  assets/
    sprites/
    animations/
    effects/
    sounds/
    maps/
  tests/
    simulation/
    balancing/
    multiplayer/
    browser/
  docs/
    architecture/
    decisions/
    gameplay/
  scripts/
    assets/
    balancing/
    deployment/
```

Cette structure peut être simplifiée tant qu'un ADR justifie l'écart et que les
frontières de responsabilité restent intactes. Les répertoires inutiles ne sont créés
que lorsque le premier fichier correspondant apparaît.

## 7. Simulation

### REQ-SIM-001 — Simulation autonome

La simulation doit être :

- indépendante de Phaser, du DOM, du navigateur et du réseau ;
- exécutable sans rendu graphique, notamment en ligne de commande et dans les tests ;
- pilotée par un pas de temps fixe ;
- indépendante de la fréquence d'affichage ;
- déterministe autant que raisonnablement possible ;
- initialisée avec une graine aléatoire explicite.

### REQ-SIM-002 — Évolution incrémentale

La simulation intégrera progressivement déplacement, ennemis, vagues, collisions,
points de vie, dégâts, expérience, niveaux, armes, améliorations, ressources,
bâtiments, victoire et défaite. Cette liste décrit la cible, pas le contenu obligatoire
du premier incrément.

### REQ-SIM-003 — État public

La simulation expose un état public sérialisable suffisant pour le rendu et le
débogage. Les objets propres au moteur de rendu ne doivent jamais devenir l'état de
référence du jeu.

## 8. Modèle réseau cible

### REQ-NET-001 — Serveur autoritaire

Dans la version multijoueur, le serveur décide de l'état officiel. Le client envoie
uniquement des intentions séquencées, par exemple :

```typescript
export type PlayerInput = {
  sequence: number;
  moveX: number;
  moveY: number;
  aimX?: number;
  aimY?: number;
};
```

Le client ne décide jamais directement des dégâts, de l'expérience, des récompenses,
de la mort d'un ennemi, du contenu d'un coffre, du résultat d'une collision ou de la
position officielle d'un personnage.

### REQ-NET-002 — Capacités multijoueurs différées

L'architecture doit permettre, sans les implémenter prématurément :

- des rooms de deux à quatre joueurs ;
- l'interpolation des joueurs distants ;
- la prédiction du déplacement local ;
- la correction par le serveur ;
- la gestion de la latence ;
- la déconnexion et la reconnexion.

## 9. Contenu piloté par les données

### REQ-CONTENT-001 — Données versionnées

Les personnages, ennemis, armes, disciplines, bâtiments, vagues et paramètres
d'équilibrage sont définis dans des fichiers texte versionnés, en JSON ou TypeScript
selon le niveau de validation nécessaire. Les paramètres d'équilibrage ne doivent pas
être dispersés dans le code de la simulation ou du rendu.

### REQ-CONTENT-002 — Validation du contenu

Le chargement de contenu doit fournir :

- des schémas explicites ;
- des identifiants stables ;
- une validation au démarrage et dans les tests ;
- très peu de valeurs implicites ;
- des messages d'erreur compréhensibles et localisant la donnée invalide.

## 10. Graphismes, animations et assets

### REQ-ASSET-001 — Assets temporaires

La priorité initiale est le gameplay. Les premières versions utilisent des formes
simples ou des sprites temporaires dans un style pixel art cohérent, avec des
dimensions standardisées telles que 32 × 32 ou 48 × 48 pixels.

Les animations initiales sont limitées aux besoins démontrés : repos, marche, attaque,
dégâts et mort. Les effets simples sont produits directement dans Phaser.

### REQ-ASSET-002 — Composition et automatisation

Les personnages peuvent être organisés en couches — corps, cheveux, vêtements, arme,
accessoires et palettes — lorsque cette composition apporte une valeur concrète.

Les pipelines d'assets doivent pouvoir automatiser le découpage, les contrôles de
dimensions et de transparence, l'alignement, les métadonnées, la détection des fichiers
manquants et la génération d'aperçus. Blender, Spine ou une chaîne graphique complexe
ne sont introduits qu'après démonstration du besoin.

### REQ-ASSET-003 — Provenance

Tout asset ajouté doit posséder une provenance et des droits d'utilisation explicites.
Le code et les assets du prototype historique ne sont pas réutilisables par défaut.

## 11. Stratégie de tests

### REQ-TEST-001 — Tests proportionnés au risque

Chaque fonctionnalité significative reçoit le niveau de test pertinent. Vitest couvre
notamment les règles de combat, les dégâts, le déplacement, la progression, les
vagues, la validation du contenu et le déterminisme.

### REQ-TEST-002 — Tests de simulation sans rendu

Les scénarios de simulation doivent vérifier, au fur et à mesure de leur apparition :

- les collisions et obstacles ;
- les dégâts attendus ;
- la composition des vagues ;
- la reproductibilité avec une même graine ;
- l'absence d'entités actives après leur mort ;
- les conditions de victoire et de défaite.

### REQ-TEST-003 — Tests multijoueurs

Lorsque le serveur existe, tester au minimum la connexion de plusieurs clients, le
cycle de vie d'une room, la synchronisation, le rejet des commandes invalides, la
déconnexion et, lorsqu'elle sera développée, la reconnexion.

### REQ-TEST-004 — Tests navigateur

Playwright doit pouvoir lancer le jeu, commencer une partie, envoyer des commandes,
observer des changements d'état, capturer des écrans, détecter les erreurs console et
vérifier le chargement des assets.

Les tests ne doivent pas dépendre uniquement de l'analyse visuelle du Canvas. Ils
s'appuient sur une API de débogage contrôlée.

## 12. API de débogage

### REQ-DEBUG-001 — Pilotage automatisable

En développement uniquement, le client expose une API inspirée de :

```typescript
window.__VILLAGE_SURVIVOR_DEBUG__ = {
  getState,
  setGameSpeed,
  pause,
  resume,
  spawnEnemy,
  damagePlayer,
  giveExperience,
  selectUpgrade,
  skipToWave,
  exportReplay,
};
```

Les méthodes sont ajoutées au fil des systèmes réellement présents. Cette API ne doit
pas être disponible dans le build de production.

## 13. Performance

### REQ-PERF-001 — Mesurer avant d'optimiser

Le jeu est destiné à afficher de nombreux ennemis, mais aucune optimisation importante
ne doit être introduite sans mesure. Chaque optimisation est précédée d'un scénario de
performance reproductible et suivie d'une comparaison des résultats.

### REQ-PERF-002 — Leviers prévus

Selon les mesures, le projet pourra introduire des pools d'objets, limiter les
allocations par frame, utiliser des structures simples, partitionner spatialement le
monde et réduire la fréquence de mise à jour des éléments éloignés. La séparation entre
simulation et rendu reste obligatoire.

Le mode développement doit rendre observables les FPS, le temps de simulation et le
nombre d'entités. Les budgets chiffrés et la machine de référence restent à fixer avant
un playtest public.

## 14. Intégration continue et déploiement

### REQ-CI-001 — Contrôles de qualité

À terme, les commandes suivantes fonctionnent depuis la racine :

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

GitHub Actions installe les dépendances, vérifie le formatage, exécute le lint, vérifie
les types, lance les tests et produit le build. Un déploiement ne peut avoir lieu que
si ces contrôles réussissent.

### REQ-DEPLOY-001 — Client statique

Le client est destiné à Cloudflare Workers Static Assets. Les environnements local,
preview ou staging, et production doivent être distincts.

### REQ-DEPLOY-002 — Serveur portable

Le serveur multijoueur sera livré sous forme d'image Docker et pourra fonctionner sur
Colyseus Cloud ou une plateforme Docker simple. La configuration reste portable entre
hébergeurs et passe par des variables d'environnement.

### REQ-DEPLOY-003 — Secrets

Aucun secret ne doit être commité. Les identifiants et jetons de déploiement sont
stockés dans les mécanismes sécurisés de l'environnement et de GitHub.

## 15. Documentation et décisions

### REQ-DOC-001 — Documentation minimale

Le dépôt maintient au minimum :

```text
README.md
ROADMAP.md
CHANGELOG.md
docs/architecture/overview.md
docs/gameplay/current-rules.md
docs/deployment.md
docs/decisions/
```

### REQ-DOC-002 — ADR

Un ADR est créé lorsqu'un choix est structurant ou difficilement réversible. Il
indique le contexte, la décision, les options étudiées, les conséquences et la date.

### REQ-DOC-003 — Documentation fidèle

La documentation distingue clairement les décisions acceptées, les propositions et
les fonctionnalités réellement implémentées. Elle est mise à jour dans le même
incrément que le code concerné.

## 16. Méthode de réalisation

### REQ-WORK-001 — Cycle d'un incrément

Pour chaque incrément :

1. inspecter l'état réel du dépôt ;
2. identifier le changement minimal nécessaire ;
3. l'implémenter ;
4. ajouter ou mettre à jour les tests ;
5. exécuter les contrôles ;
6. corriger les erreurs ;
7. mettre à jour la documentation ;
8. fournir un résumé clair des modifications.

### REQ-WORK-002 — Refactorings importants

Avant une refonte importante, documenter le problème, la solution proposée, ses
conséquences et les alternatives considérées.

## 17. Qualité du code

### REQ-QUALITY-001 — Règles générales

Le code respecte les règles suivantes :

- TypeScript strict et aucun `any` sans justification ;
- fonctions courtes et noms explicites ;
- injection des dépendances lorsqu'elle améliore les tests ;
- aucune logique métier dans les composants d'interface ;
- aucune duplication significative ;
- erreurs explicites ;
- validation des entrées réseau ;
- commentaires réservés aux informations non évidentes ;
- suppression du code mort ;
- aucun secret dans Git.

## 18. Sécurité

### REQ-SEC-001 — Sécurité proportionnée

La sécurité évolue avec le produit. Dès l'introduction du réseau, toutes les données du
client sont considérées comme non fiables. Le serveur valide les messages et les
transitions d'état, limite taille, fréquence et connexions, refuse l'exécution de
contenu fourni par les joueurs, journalise les anomalies utiles et n'expose aucune
information sensible dans les erreurs.

## 19. Feuille de route initiale conservée

Le cadrage initial définissait les étapes suivantes. La
[`ROADMAP.md`](../../ROADMAP.md) les affine sans en changer l'intention.

### Étape 0 — Initialisation

Monorepo, client Phaser, `game-core`, `protocol`, outils de qualité, premiers tests,
GitHub Actions et documentation initiale.

### Étape 1 — Prototype jouable

Petite carte, personnage, déplacement clavier, caméra, ennemi simple, collisions,
points de vie, défaite et sprites temporaires.

### Étape 2 — Boucle survivor

Apparition progressive, attaque automatique, expérience, niveaux, choix
d'améliorations, temps et difficulté progressive.

### Étape 3 — Village

Bâtiment principal, ressources, villageois ou structures à protéger, améliorations du
village et conséquences entre les vagues.

### Étape 4 — Préparation multijoueur

Serveur Colyseus minimal, room, `NetworkSession`, deux clients, synchronisation du
déplacement et simulation autoritaire.

### Étape 5 — Coopération

Deux à quatre joueurs, ennemis et récompenses partagés, réanimation, fin de partie
commune et reconnexion.

## 20. Objectif technique immédiat

Le premier travail de construction doit :

1. initialiser le monorepo ;
2. afficher un client Phaser minimal ;
3. créer une simulation indépendante de Phaser ;
4. établir la frontière `GameSession` ;
5. ajouter les premiers tests et la CI ;
6. documenter les commandes ;
7. produire le plus petit incrément jouable.

Il ne doit pas développer immédiatement l'ensemble du jeu. La cible est une base
saine, automatisée, testée et déployable sur laquelle les fonctionnalités seront
ajoutées progressivement.

## 21. Points non fonctionnels restant à chiffrer

Les décisions suivantes ne bloquent pas l'initialisation, mais doivent être prises
avant un playtest public :

- navigateurs et systèmes officiellement supportés ;
- résolution minimale et comportement lors du redimensionnement ;
- budget de performance, machine de référence et population d'ennemis cible ;
- objectifs de temps de chargement et de poids des assets ;
- exigences minimales d'accessibilité et de remappage des commandes ;
- langues livrées ;
- politique de télémétrie, qui reste désactivée tant qu'elle n'est pas autorisée ;
- URL, comptes et responsabilités des environnements de déploiement ;
- licence du dépôt public.

## 22. Gestion des changements

Une exigence ne disparaît pas silencieusement. Toute évolution doit être traitée par
l'un des mécanismes suivants :

- correction éditoriale sans changement d'intention ;
- nouvelle exigence avec un nouvel identifiant ;
- remplacement explicitement indiqué dans ce document ;
- ADR qui accepte, modifie ou abandonne une décision architecturale ;
- décision produit datée pour les règles de gameplay.
