# ADR-0007 — Rendre les entités en mode immédiat trié par profondeur

- Statut : **Accepté**
- Date : 21 juillet 2026
- Exigences : `REQ-ASSET-001`, `REQ-PERF-001`, `REQ-PERF-002`

## Contexte

M1 dessine le monde entier dans un unique objet `Graphics` effacé et redessiné à
chaque frame, sans aucun asset. Le rendu est lisible mais statique : rien ne réagit aux
impacts, aucune entité n'est posée sur le sol, la caméra se recadre sèchement et le
passage du jour à la nuit est une rupture de couleur de fond.

Pour un jeu du genre survivor, la qualité perçue vient d'abord du mouvement et de la
lumière, pas de la finesse du dessin. Six effets ont donc été retenus avant tout travail
graphique : ombres portées, flash d'impact, tri en profondeur, caméra lissée, particules
de mort et transition jour/nuit progressive.

Le réflexe naturel était de migrer vers des `GameObjects` Phaser persistants réconciliés
par identifiant, comme l'autorise la vue d'architecture. L'analyse a montré que cette
migration n'est pas nécessaire pour ces six effets, et qu'elle serait même moins directe
pour le tri en profondeur : un tri de tableau remplace un `setDepth` par entité et par
frame.

## Décision

Conserver un `Graphics` unique en mode immédiat pour le monde, organisé en passes
explicites et ordonnées :

1. sol et grille ;
2. marquages au sol : auréole du village, portées des balistes ;
3. **toutes** les ombres ;
4. corps des entités, triés par ordonnée croissante ;
5. barres de vie ;
6. dôme de barrière.

Les ombres sont posées avant tous les corps : une ombre ne peut donc jamais recouvrir
une entité déjà dessinée. Les barres de vie sont posées après tous les corps : elles
restent lisibles quel que soit le chevauchement.

Le tri en profondeur utilise un tampon d'entrées recyclées d'une frame à l'autre, afin
de ne rien allouer dans la boucle de rendu.

L'état visuel transitoire qui n'appartient pas à la simulation — l'intensité résiduelle
d'un impact — est détenu côté client dans `apps/client/src/render`, indexé par
identifiant d'entité. Les paramètres visuels dépendant de la phase sont résolus par une
fonction pure, sans dépendance à Phaser, donc testable sans navigateur.

Les particules utilisent un émetteur par espèce d'ennemi, créé au démarrage de la scène
et réutilisé, plutôt qu'un émetteur par mort.

Cette décision est explicitement bornée. Le jour où des sprites, des animations par
entité ou un tri hors ordonnée seront nécessaires, la réconciliation d'objets persistants
mis en pool redeviendra le bon choix et devra remplacer cet ADR.

## Options étudiées

### Réconciliation de `GameObjects` persistants

Reportée. Indispensable pour des sprites, des animations d'apparition et de disparition
ou des shaders par entité, mais sans bénéfice pour les six effets retenus, et coûteuse en
allocations si le pool est mal maîtrisé sur plus de cent entités.

### Mode immédiat sans tri ni état visuel

Rejetée : c'est l'état de départ. Elle interdit tout retour d'impact et laisse les
entités hautes de l'écran passer devant les entités basses.

### Pipeline `Light2D` de Phaser

Différée. C'est la piste la plus prometteuse pour l'ambiance nocturne, parce qu'elle sert
directement la fiction du cycle jour/nuit et rendrait le niveau du Cœur lisible d'un coup
d'œil. Elle demande un travail technique supérieur aux six effets et sera traitée à part.

### Migration vers des assets dessinés

Hors périmètre. La direction artistique définitive reste différée au-delà de la V1. Le
style géométrique actuel est cohérent et lisible ; l'assumer coûte moins cher qu'une
migration partielle vers un autre style.

## Conséquences

### Positives

- retour d'impact, profondeur et atmosphère obtenus sans aucun asset ;
- `game-core`, `protocol` et `content` intacts : aucun risque pour le déterminisme ;
- tri en profondeur obtenu par un simple tri de tableau, sans objet par entité ;
- logique de couleur et d'impact isolée en fonctions pures testées hors navigateur ;
- coût de rendu mesuré à 60 FPS avec 169 entités.

### Négatives

- les sprites et les animations par entité restent inaccessibles sans revenir sur cette
  décision ;
- le fond et la grille sont redessinés intégralement à chaque frame, la couleur du sol
  variant désormais en continu pendant les transitions ;
- l'état visuel transitoire vit côté client et n'est pas reproductible à partir d'une
  graine, contrairement à la simulation.

### Garde-fous

- aucun état visuel ne doit influencer une décision de gameplay : le recul et
  l'écrasement d'un impact sont purement graphiques et ne modifient jamais une position
  de simulation ;
- `GameEvent` ne transporte pas d'identifiant d'entité : un événement est rattaché à
  l'entité la plus proche de la position publiée, dans un rayon de 24 unités. Ce
  rattachement a été mesuré sur données réelles à 16 correspondances sur 16, avec une
  distance maximale nulle, un ennemi au corps à corps étant immobile. Ajouter un
  identifiant d'entité à l'événement rendrait ce contournement inutile et reste la
  correction propre ;
- la boucle de rendu ne doit rien allouer par entité et par frame ;
- toute passe supplémentaire doit préciser sa position dans l'ordre ci-dessus.

## Limite identifiée puis corrigée

`GameSimulation.step()` réinitialise ses événements à chaque tick, alors que
`LocalSession` ne publie qu'une fois par frame après avoir consommé son accumulateur.
Lorsqu'une frame traitait plusieurs ticks, seuls les événements du dernier tick
parvenaient au client, et souvent aucun : les flashes et les gerbes correspondants
étaient perdus.

Le cas ne se produisait pas au rythme nominal de vingt ticks par seconde pour soixante
images par seconde, mais apparaissait dès qu'une frame dépassait cent millisecondes ou
que la vitesse de simulation de débogage dépassait environ trois.

La correction appartient à la session, parce que c'est elle qui détient la cadence de
publication : `GameSimulation` expose `getEvents()` et `LocalSession` collecte les
événements après chaque tick, puis les substitue à ceux de l'instantané au moment de
publier. Les sémantiques de `game-core` restent inchangées, et un futur serveur
autoritaire devra appliquer la même collecte avec sa propre cadence de diffusion.

Un test de contrat vérifie qu'une frame avançant plusieurs ticks livre des événements
provenant de plus d'un tick ; il échoue si la collecte est retirée.

Le tampon est borné. Ce plafond n'est pas une protection contre une fuite mais une
politique de rendu assumée : après une avance rapide de débogage ou un blocage long du
navigateur, on montre les effets les plus récents au lieu de rejouer d'un coup tout ce
qui a été sauté. Il n'est pas atteignable dans le jeu actuel, dont les parties se
terminent avant.
