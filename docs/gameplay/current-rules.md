# Règles de gameplay courantes

Statut : **règles V1 acceptées, sous-ensemble M1 implémenté**
Dernière mise à jour : 21 juillet 2026

Ce document est une photographie pratique des règles validées. Le document normatif
détaillé reste [`../product/product-pillars.md`](../product/product-pillars.md), et les
décisions numérotées sont conservées dans
[`../product/decisions/2026-07-20-product-workshop.md`](../product/decisions/2026-07-20-product-workshop.md).

## Sous-ensemble M1 implémenté

Le premier MVP est un POC solo local qui valide la boucle
fonctionnelle et les principaux garde-fous techniques :

- interface intégralement en français et partie reproductible à partir d'une graine ;
- carte de 2 200 unités avec village central, trois gisements de bois finis et gardés,
  groupes dormants et progression du danger avec la distance ;
- journées et nuits de 75 secondes, puis activation finale de 90
  secondes ;
- collecte limitée à 8 unités transportées, dépôt explicite avec `E` dans la zone du
  village et stock personnel sécurisé ;
- disciplines fixes Épée et Barrière : attaque automatique, Fente, protection passive
  et Dôme actif ;
- montée de niveau avec trois choix d'amélioration pondérés, variés et reproductibles
  à graine identique, sans pause de la simulation ; les niveaux gagnés s'accumulent et
  le panneau de choix ne s'ouvre qu'à la demande du joueur ;
- zone du village délimitée visuellement avec indication intérieur/extérieur ;
- fabrication de plusieurs balistes librement placées dans le village, avec chantier
  de cinq secondes interrompu par les dégâts, portée visible et tirs animés, puis
  amélioration du cœur jusqu'au déclenchement de la vague finale ;
- pression renforcée dès la première nuit : davantage de groupes dormants et de
  renforts, ennemis plus résistants et dangereux, personnage et village moins
  permissifs ;
- assauts croissants à chaque nuit : plus de pillards, apparition puis multiplication
  des brutes, et montée en puissance des points de vie et des dégâts des assaillants
  générés ;
- les assaillants vaincus laissent du bois, ce qui rend la ressource récupérable en
  défendant et empêche un joueur de rester bloqué sans bois pour gagner ;
- lisibilité du combat assurée par des ombres portées, un flash à l'impact, un ordre
  d'affichage par profondeur et une tombée de la nuit progressive ; ces retours sont
  purement visuels et ne modifient aucune règle ;
- victoire après l'activation finale, défaite à la mort du personnage ou à la
  destruction du village.

Les artefacts, le multijoueur, l'état à terre, la furtivité détaillée, les branches du
village et les autres disciplines restent dans la cible V1, pas dans M1. Les valeurs
d'équilibrage de M1 sont initiales et pourront évoluer sans remettre en cause cette
boucle.

## Partie

- Une partie est autonome et recommence de zéro.
- Il n'existe aucune sauvegarde de personnage, village, ressource ou progression entre
  les parties en V1.
- La partie alterne des journées d'exploration limitées et des nuits de défense.
- La difficulté nocturne augmente jusqu'à la victoire ou la défaite.

## Jour et exploration

- Les joueurs quittent le village pour trouver des ressources et des artefacts.
- Valeur et danger augmentent avec la distance au village.
- Les défenses et services du village ne soutiennent plus les personnages trop
  éloignés.
- Aucun rappel ni téléportation n'a lieu à la tombée de la nuit.
- La carte est générée à partir d'une graine au début de la partie et reste stable.
- L'exploration et les zones découvertes sont partagées par le groupe.
- Les gisements sont finis et ne se renouvellent pas.
- La génération doit garantir les ressources nécessaires à la victoire, avec une
  marge pour les erreurs et les stratégies facultatives. Le bois statique des seuls
  gisements couvre déjà le chemin obligatoire de victoire, et cet invariant est validé
  au chargement du contenu.
- En complément des gisements finis, les assaillants vaincus laissent du bois. Cette
  source renouvelable par le combat garantit qu'un joueur ne peut pas rester
  définitivement bloqué après avoir dépensé sa réserve, sans remettre en cause la
  finitude des gisements eux-mêmes.

## Nuit et monstres

- Les gardiens restent liés à un site de ressource ou de trésor.
- Les autres groupes dorment le jour, mais se défendent s'ils détectent un personnage.
- Les joueurs peuvent les éliminer préventivement pour réduire la menace nocturne.
- La détection diurne repose initialement sur perception, bruit et jauge de réveil.
- À la nuit, les groupes non gardiens vivants convergent vers le village.
- Chaque nuit est plus lourde que la précédente : le nombre d'assaillants augmente, les
  brutes apparaissent puis se multiplient, et les points de vie comme les dégâts des
  assaillants générés montent par cycle. Cette montée en puissance ne s'applique qu'aux
  assauts, pas aux renforts diurnes.
- La nuit possède une durée fixe.
- À l'aube, les survivants retournent dans le monde et restent présents sans changer
  de type ni perdre leurs caractéristiques.
- Des tanières ou portails indestructibles en V1 produisent de nouveaux groupes à
  chaque aube, selon l'avancement et le nombre de joueurs.

## Village

- Le village est à la fois l'objectif à protéger et un personnage collectif
  améliorable.
- Son cœur régénère modérément les personnages proches, surtout le jour ; cet effet
  diminue sous attaque et peut être amélioré.
- Une colonne vertébrale de prérequis mène au niveau ultime du cœur.
- Des branches facultatives améliorent soins, défense, production ou exploration.
- Les bâtiments structurants peuvent utiliser des emplacements prédéfinis.
- Les balistes sont des constructions tactiques librement placées dans la zone du
  village, à distance du Cœur et les unes des autres.
- Chaque baliste coûte 6 bois et demande cinq secondes de fabrication. Le personnage
  reste immobilisé et exposé ; tout dégât interrompt le chantier et rembourse le coût.
- Le nombre de balistes n'est pas plafonné autrement que par les ressources et les
  contraintes de placement.
- Une défense permanente financée par un joueur devient propriété du village et peut
  être améliorée par les autres ; sa contribution initiale reste attribuée.

## Ressources et propriété

- Les ressources appartiennent au personnage qui les collecte et lui seul décide de
  leur dépense.
- Ressources transportées et artefacts non équipés partagent une capacité en poids.
- Au village, les ressources rejoignent un stock personnel sécurisé et sans poids.
- Le stock personnel n'est accessible qu'à proximité du village.
- Une construction éloignée utilise uniquement les ressources réellement transportées.
- Les transferts entre joueurs sont volontaires et exigent la proximité ou un
  dispositif d'échange au village.
- Un joueur peut verser volontairement des ressources dans la réserve irréversible
  d'un projet collectif.

## Combat et progression

- Chaque personnage choisit deux disciplines distinctes pour toute la partie.
- Les huit disciplines cibles sont Épée, Bouclier, Arc, Marteau, Feu, Foudre, Barrière
  et Soin ; les quatre premières à concevoir sont Épée, Arc, Feu et Barrière.
- Chaque discipline fournit une capacité automatique, une compétence active et des
  améliorations.
- Un personnage possède au maximum deux compétences actives, une par discipline.
- Une amélioration rare peut remplacer une compétence active sans créer un nouvel
  emplacement.
- À chaque niveau, trois améliorations compatibles sont proposées.
- La simulation ne se met jamais en pause, en solo comme en multijoueur, et les choix
  restent disponibles jusqu'à sélection.
- Gagner un niveau ne suspend pas la progression : les choix dus s'empilent et le
  joueur les résout quand il le peut, sans jamais perdre la vue sur l'action.
- Chaque offre est tirée au moment où elle est présentée, jamais d'avance : deux
  niveaux empilés ne peuvent donc pas proposer deux fois la même amélioration.
- L'expérience doit reconnaître les contributions récentes ; la proximité constitue
  un premier remplacement acceptable.
- Les contributeurs admissibles reçoivent initialement une part égale.

## Artefacts

- Les artefacts se trouvent dans des lieux remarquables gardés.
- Ils appartiennent à leur découvreur et peuvent être donnés volontairement.
- Deux artefacts peuvent être équipés au maximum.
- Leur changement est possible partout par une courte canalisation interrompue par le
  mouvement ou les dégâts ; le jeu ne se met pas en pause.

## Mort

- À zéro point de vie, un personnage tombe à terre pour une durée limitée.
- Un allié peut le relever par une interaction interrompue par mouvement ou dégâts.
- À l'expiration, la mort devient définitive pour la partie.
- En solo, tomber provoque normalement la défaite, sauf auto-réanimation explicite.
- Un joueur définitivement mort devient spectateur sans pouvoir d'action en V1.
- Les possessions transportées tombent dans un sac permanent jusqu'à récupération ou
  fin de partie.
- Son stock sécurisé devient un coffre d'héritage accessible aux survivants.

## Victoire et défaite

- L'objectif de victoire est visible dès le début.
- Le niveau ultime du cœur du village déclenche une phase d'activation et une vague
  finale.
- La victoire est acquise après avoir survécu à cette activation.
- La partie est perdue si le village est détruit ou si aucun personnage vivant ne peut
  encore relever un allié.

## Valeurs et contenus encore ouverts pour la V1

- nom et fiction du niveau ultime du cœur ;
- durées, coûts, poids, portées et délais ;
- contenu exact des branches, artefacts et améliorations ;
- seuils de contribution à l'expérience ;
- disciplines et contenus à ajouter après Épée et Barrière.

Ces ouvertures sont des paramètres ou choix de contenu. Elles ne remettent pas en cause
les invariants d'architecture définis dans
[`../architecture/overview.md`](../architecture/overview.md).
