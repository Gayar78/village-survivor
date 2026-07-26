# Piliers produit de Village Survivor

Statut : décisions humaines confirmées le 20 juillet 2026.

Ce document décrit le socle fonctionnel qui fait autorité pour le nouveau jeu. Les
fonctionnalités du prototype historique sont des sources d'inspiration ; elles ne
remplacent pas ces décisions.

## Identité de la partie

Une partie de *Village Survivor* alterne des journées d'exploration et des nuits de
défense. Elle est autonome : en V1, personnages, compétences, artefacts, ressources et
village ne conservent aucune progression entre deux parties.

Le jeu doit créer un arbitrage permanent entre deux besoins : prendre des risques loin
du village pour préparer l'avenir, et revenir à temps pour survivre à la prochaine
nuit.

## Boucle principale

### Jour

- Les personnages explorent les environs du village.
- Ils cherchent des ressources et des artefacts.
- Le jour possède une durée limitée et lisible.
- La valeur potentielle des découvertes et le danger augmentent avec la distance au
  village.
- S'éloigner prive progressivement les personnages du soutien des défenses et des
  services du village.
- Les joueurs ne sont ni rappelés ni téléportés lorsque la nuit tombe. Leur position à
  cet instant est la conséquence de leur décision.

### Nuit

- Des vagues de monstres attaquent le village.
- Leur taille et leur difficulté augmentent au fil des nuits.
- Les personnages combattent et développent leurs compétences pendant la partie.
- Les défenses et améliorations construites par les joueurs soutiennent le combat.
- Un personnage surpris loin du village peut tenter de rentrer, survivre isolément ou
  continuer à explorer, mais le village doit alors se défendre sans lui.

## Le village comme personnage collectif

Le village central n'est pas seulement un objectif à protéger. Il possède son propre
état, des capacités et une progression pendant la partie.

Les ressources rapportées pendant la journée servent notamment à :

- renforcer sa résistance ;
- construire ou améliorer ses défenses ;
- développer des services utiles aux personnages ;
- satisfaire les prérequis de l'objectif de victoire.

Le cœur du village fournit une régénération modérée aux personnages proches. Elle est
surtout efficace pendant le jour et diminue lorsque le village est attaqué. Une
branche facultative permettra d'améliorer sa portée et sa vitesse.

Le développement suit deux axes complémentaires :

- une colonne vertébrale de prérequis obligatoires mène au niveau ultime du cœur et à
  la victoire ;
- des branches facultatives améliorent notamment les soins, la défense, la production
  ou l'exploration, au prix d'un retard sur l'objectif final.

Les bâtiments structurants du village peuvent occuper des emplacements prédéfinis. Les
personnages peuvent placer librement des balistes et autres constructions tactiques,
dans les limites des ressources et de l'espace disponible. Une défense financée par un joueur devient propriété du village
dès sa construction : elle protège le groupe et peut être réparée ou améliorée par
d'autres joueurs avec leurs propres ressources. La contribution initiale reste
visible.

## Ressources et propriété

Les ressources restent la propriété du personnage qui les a collectées. Il décide
librement de les employer pour une production, une défense ou un projet collectif.
Aucun autre joueur ne peut dépenser son stock.

Pendant l'exploration :

- ressources et artefacts non équipés partagent une capacité de transport exprimée
  en poids ;
- une mort définitive fait tomber les objets transportés dans un sac récupérable ;
- ce sac reste sur place sans limite de durée, jusqu'à sa récupération ou la fin de
  la partie.

Au village, les ressources sont déposées dans un stock personnel sécurisé. Ce stock
ne peut être dépensé, retiré ou transféré qu'à proximité du village. Une construction
tactique éloignée doit donc être financée avec les ressources effectivement
transportées.

Les joueurs peuvent :

- se transférer volontairement des ressources lorsqu'ils sont proches, ou via un
  dispositif d'échange au village ;
- verser volontairement leurs ressources dans la réserve dédiée d'un projet
  collectif ; une contribution ainsi réservée ne peut plus être utilisée ailleurs.

Après la mort définitive d'un personnage, son stock sécurisé devient un coffre
d'héritage accessible aux survivants. Avant cette mort, il demeure strictement privé.

## Artefacts

Les artefacts sont découverts dans des lieux remarquables et gardés — ruines,
sanctuaires, tanières ou coffres — plutôt que dans les gisements ordinaires. Chaque
partie n'en propose qu'une sélection.

Un artefact appartient au personnage qui le ramasse. Il peut être transporté, équipé
ou donné volontairement. Un personnage peut en équiper deux au maximum. Il peut
changer son équipement n'importe où, sans arrêter la simulation, mais l'opération
demande une courte canalisation interrompue par le mouvement ou les dégâts. Les
artefacts d'un personnage mort définitivement restent récupérables avec ses autres
possessions transportées.

## Carte, exploration et population hostile

Une carte est générée au début de chaque partie et reste stable jusqu'à sa fin. Elle
est renouvelée entre les parties. La découverte est progressive et partagée par le
groupe : chaque personnage conserve une vision locale, mais les zones reconnues sont
ajoutées à la carte commune.

Les gisements ont une quantité finie et ne se renouvellent pas. La génération doit
garantir que la carte contient assez de ressources pour atteindre la victoire, avec
une marge permettant plusieurs stratégies et des erreurs.

Deux comportements diurnes sont distingués :

- les gardiens restent attachés à une ressource ou à un trésor ;
- les autres groupes dorment dans le monde, mais se défendent s'ils détectent un
  personnage.

Les joueurs peuvent attaquer préventivement les groupes endormis afin de réduire la
menace de la nuit suivante. Une attaque peut réveiller tout le groupe proche. La
discrétion repose initialement sur une zone de perception, le bruit produit par le
personnage et une jauge de réveil lisible. Courir, combattre ou utiliser une capacité
bruyante augmente le risque ; marcher lentement le réduit.

À la tombée de la nuit, les monstres non gardiens encore vivants convergent vers le
village. La nuit possède une durée déterminée. À l'aube, les survivants cessent
l'assaut et retournent dormir dans le monde, où ils s'ajoutent à la pression future.
Des tanières ou portails persistants produisent à chaque aube les nouveaux groupes de
la prochaine vague, hors de la vision immédiate des joueurs. Leur puissance augmente
avec l'avancement de la partie et le nombre de personnages. Ces sources ne sont pas
destructibles en V1.

## Personnages, disciplines et progression

Chaque personnage choisit deux disciplines distinctes au début de la partie et les
conserve jusqu'à la fin. Aucun budget de « mains » ne limite les combinaisons.

Les huit disciplines cibles sont : Épée, Bouclier, Arc, Marteau, Feu, Foudre,
Barrière et Soin. Elles seront livrées progressivement. Le premier ensemble de combat
à concevoir comprend Épée, Arc, Feu et Barrière.

Le combat est hybride : chaque discipline apporte une capacité automatique, une
compétence active et ses propres améliorations. Un personnage possède donc deux
compétences actives au maximum, une par discipline. Une amélioration rare peut
remplacer une compétence active par une variante mutuellement exclusive, sans ajouter
de nouvel emplacement.

À chaque niveau, le personnage reçoit trois propositions compatibles avec ses deux
disciplines. Elles peuvent améliorer une capacité automatique, transformer une
compétence active, créer une synergie ou renforcer une statistique générale. La
simulation ne se met jamais en pause, en solo comme en coopération. Une proposition
non choisie reste disponible.

Gagner un niveau alors qu'une proposition attend déjà ne suspend pas la progression :
les choix dus s'accumulent et le joueur les résout au moment qui lui convient. L'écran
de sélection ne s'impose jamais pendant un combat, mais un rappel visible empêche
d'oublier une amélioration acquise.

L'expérience privilégie les contributions réelles et récentes : dégâts, soins,
protections, contrôle et autres aides mesurables. Si ce suivi est trop complexe pour
un premier incrément, la proximité du monstre sert temporairement d'approximation.
Les contributeurs admissibles reçoivent initialement une part égale, règle explicitement
prévue pour être affinée après les playtests.

## Mort et coopération

À zéro point de vie, un personnage passe à terre pendant une durée limitée. Un allié
peut le relever par une interaction interrompue par le mouvement ou les dégâts. À
l'expiration du délai, le personnage meurt définitivement pour cette partie.

La partie est perdue lorsqu'aucun personnage vivant ne peut encore relever un allié.
En solo, tomber à terre provoque donc normalement la défaite, sauf effet explicitement
prévu pour une auto-réanimation. Un joueur définitivement mort passe en mode
spectateur et n'influence plus la simulation en V1.

## Victoire et défaite

L'objectif de victoire est visible dès le début de la partie. La V1 en propose un
seul : faire atteindre au cœur du village son niveau ultime, après avoir satisfait un
arbre de prérequis difficile. La fiction et le nom de cette forme finale restent à
définir.

Son achèvement déclenche une dernière phase d'activation et une vague finale. La
victoire est acquise si la construction et le village survivent jusqu'à la fin de
cette activation.

La partie est perdue si :

- le village est détruit ; ou
- aucun personnage vivant ne peut encore relever un allié à terre.

La partie n'est donc pas un mode infini et sa durée ne dépend pas d'un nombre fixe de
nuits : les joueurs gagnent lorsqu'ils atteignent leur objectif avant que la pression
des vagues ne les dépasse.

## Règles de reprise du prototype historique

- Le dépôt historique est une référence fonctionnelle en lecture seule.
- Aucun code n'est repris par défaut.
- Le nouveau cadrage prévaut en cas de contradiction.
- Toute idée historique est classée selon son identité ludique, sa valeur de jeu, sa
  cohérence avec cette boucle, son coût et son intégration progressive possible.
- Les comportements confirmés, les intentions probables et les interprétations sont
  distingués explicitement.
- `Gayar78`, auteur du prototype historique, est crédité sans publier d'information
  personnelle.
- Une intention créative ambiguë doit être soumise à son auteur. Une intention déjà
  explicite dans le prototype n'a pas besoin d'être redemandée.
- L'analyse fonctionnelle est validée avant que ses conclusions influencent
  l'implémentation.
