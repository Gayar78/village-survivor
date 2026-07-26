# Journal des changements

Ce projet suit une adaptation de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Aucune politique de version
sémantique n'est encore appliquée, car aucune version jouable n'a été publiée.

## [Non publié]

### Ajouté

- premier MVP solo jouable avec carte issue d'une graine, cycles jour/nuit et vague
  finale ;
- disciplines Épée et Barrière, attaque automatique, compétences actives, expérience
  et choix d'améliorations sans pause ;
- gisements gardés, transport limité, stock personnel, baliste et progression du Cœur
  du village ;
- monorepo pnpm avec client Phaser 4, protocoles partagés, contenu Zod validé et
  simulation headless à pas fixe ;
- HUD français, minimap, sons synthétiques, métriques de développement et graphismes
  temporaires ;
- tests Vitest, parcours Playwright, smoke test du build de production, benchmark et
  workflow GitHub Actions ;
- piliers produit et décisions détaillées de l'atelier du 20 juillet 2026 ;
- inventaire fonctionnel et matrice de sélection du prototype historique ;
- cadrage technique initial avec exigences identifiées et règles de changement ;
- vue d'ensemble de l'architecture locale puis multijoueur ;
- ombres portées sous les entités, flash blanc à l'impact et gerbes de particules
  teintées par espèce à la mort d'un ennemi ;
- tri des entités par ordonnée, caméra lissée anticipant la direction visée et
  paramètres visuels de phase isolés en fonctions pures testées hors navigateur ;
- butin de bois laissé par les assaillants vaincus, source renouvelable qui débloque
  un joueur ayant épuisé sa réserve ;
- assauts nocturnes croissants : brutes apparaissant puis se multipliant et montée en
  puissance des points de vie et des dégâts des assaillants générés à chaque cycle ;
- ADR du monorepo, de la simulation, des sessions, du serveur autoritaire, du contenu
  piloté par les données, de la persistance différée et du rendu en mode immédiat ;
- matrice de traçabilité des exigences ;
- règles de gameplay courantes, feuille de route et cible de déploiement ;
- porte d'entrée documentaire du dépôt.

### Modifié

- les journées et les nuits durent désormais toutes deux 75 secondes ;
- la zone du village possède une limite visible et un indicateur intérieur/extérieur ;
- le dépôt des ressources exige maintenant `E` dans le village au lieu d'être
  automatique ;
- la portée de la baliste est visible et chaque tir prend la forme d'un carreau animé ;
- les balistes peuvent être fabriquées en plusieurs exemplaires à la position choisie
  dans le village ; leur chantier de cinq secondes est interrompu et remboursé si le
  personnage subit des dégâts ;
- l'équilibrage oppose désormais davantage de dormeurs et de renforts, des ennemis plus
  dangereux et une survie moins permissive dès la première nuit ;
- l'attaque automatique de l'Épée produit un arc de lame orienté vers sa cible ;
- le sol diurne utilise une teinte très claire avec des contrastes adaptés ;
- les paramètres de génération, détection, réparation et vagues sont regroupés dans le
  catalogue TypeScript validé de `packages/content` ;
- les trois améliorations sont tirées sans remise selon des poids, avec un flux
  aléatoire déterministe indépendant de la génération du monde ;
- les ennemis survivant à la nuit conservent leur type, leurs caractéristiques et leur
  récompense lorsqu'ils retournent dormir ;
- la simulation avance désormais sans produire automatiquement un instantané ; la
  session locale ne crée l'état public qu'au moment de le publier ;
- le mouvement, le combat, la construction, les phases, le ciblage et la projection
  d'état sont séparés de l'orchestrateur `GameSimulation` ;
- la nuit tombe désormais progressivement pendant les dernières secondes du jour, et
  l'aube revient de la même manière, au lieu d'un changement brutal de couleur ; la
  bascule vers l'activation finale reste une rupture assumée puisqu'elle est déclenchée
  par le joueur ;
- le rendu du monde est organisé en passes ordonnées, les ombres précédant tous les
  corps et les barres de vie les suivant, afin de rester lisible en cas de
  chevauchement ;

- gagner un niveau n'interrompt plus l'action : les améliorations dues s'empilent, un
  rappel pulsé les signale et le joueur ouvre le panneau avec `F` quand il le peut,
  puis choisit à la souris ou avec `1`, `2` et `3` ;
- un niveau gagné alors qu'un choix est déjà en attente ne suspend plus la
  progression, et chaque offre est tirée au moment d'être présentée pour qu'aucune
  amélioration ne soit proposée deux fois ;

### Corrigé

- les événements d'une frame traitant plusieurs ticks ne sont plus perdus : la session
  les collecte après chaque tick au lieu de ne publier que ceux du dernier, ce qui
  rétablit les flashes d'impact et les gerbes de particules manquants après un blocage
  du navigateur ou une accélération de la simulation ;
- les ombres portées étaient calées sous le centre des entités et restaient donc
  entièrement masquées par leur corps opaque ; elles sont désormais posées au pied de
  chaque entité. L'empreinte du personnage suit son anneau de garde et non son corps,
  faute de quoi son ombre restait cachée derrière cet anneau ;
- un joueur qui dépensait tout son bois en balistes sans jamais activer le Cœur se
  retrouvait sans ressource et ne pouvait plus gagner, la ressource statique étant
  finie ; les assaillants vaincus laissent désormais du bois et un invariant de contenu
  validé garantit que les seuls gisements couvrent déjà le chemin obligatoire.

### Sécurité

- l'API de débogage est limitée au développement et son absence du build est testée ;
- les données issues de l'URL sont échappées avant affichage et couvertes par le smoke
  test de production ;
- la provenance et les droits des futurs assets deviennent une exigence explicite ;
- la politique interdit les secrets dans Git et diffère toute télémétrie non validée.
