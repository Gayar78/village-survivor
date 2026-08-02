# Village Survivor — Gameplay cible

> **Statut : brouillon de discussion familiale**  
> **Version : 0.1 — 2 août 2026**  
> **Portée : gameplay uniquement**  
> Ce document rassemble les décisions prises pendant l'atelier. Les exemples
> signalés comme tels ne sont pas encore des décisions. Les nombres restant à
> équilibrer sont regroupés à la fin.

## 1. Promesse du jeu

*Village Survivor* est un jeu coopératif de construction, d'exploration et de
défense en temps réel.

Pendant le jour, les joueurs explorent un monde caché, affrontent ou évitent des
groupes de monstres, extraient des ressources et les rapportent au village. Ils
emploient ensuite ces ressources à trois fins concurrentes :

1. faire évoluer le Cœur afin de pouvoir gagner ;
2. construire et renforcer les défenses du village ;
3. fabriquer de meilleures armes pour les joueurs.

La nuit, une armée de plus en plus nombreuse attaque le village. Attendre permet
de mieux se préparer, mais augmente le budget de menace de toutes les nuits
suivantes et de l'assaut final. La question stratégique principale est donc :

> Combien investir dans notre puissance et nos défenses avant d'achever le Cœur
> et d'affronter l'assaut final ?

Une partie peut être gagnée. Elle n'est pas une survie sans fin.

## 2. Campagne et niveaux

### 2.1 Campagne séquentielle

- La campagne est composée de niveaux débloqués dans l'ordre.
- Chaque niveau possède une géographie, un biome, un édifice-Cœur, des recettes
  et un assaut final propres.
- Gagner un niveau débloque le suivant.
- Chaque niveau doit être gagnable dès son déblocage, en solo comme en
  coopération, sans exiger de progression permanente préalable.
- Un hôte peut inviter des joueurs qui n'ont pas encore débloqué son niveau. Une
  victoire le débloque également pour ces participants s'ils sont éligibles à la
  récompense.

### 2.2 Générations technologiques

- Les niveaux sont regroupés par générations de cinq.
- La campagne commence dans un univers médiéval et progresse graduellement
  jusqu'à des générations spatiales.
- Chaque génération introduit de nouvelles armes, constructions, défenses,
  menaces et manifestations du Cœur.
- Les anciennes technologies restent disponibles et utiles. Elles sont souvent
  moins coûteuses, plus rapides à bâtir ou plus simples à maîtriser.
- Les technologies avancées ouvrent de nouvelles possibilités sans rendre
  automatiquement tout l'ancien contenu inutile.

Le mécanisme exact par lequel une nouvelle génération ouvre ses recettes et ses
nœuds de compétence reste à décider.

### 2.3 Structure d'une tentative

- La cible d'équilibrage principale est une équipe de 2 à 4 joueurs.
- Le solo reste un mode complet, avec quelques règles adaptées.
- Tous les joueurs doivent être présents au lancement.
- Aucun nouveau joueur ne peut rejoindre une partie déjà commencée.
- Un membre du groupe initial déconnecté peut se reconnecter et reprendre son
  personnage.

## 3. Boucle d'une partie

### 3.1 Journée

Une journée ordinaire dure **5 minutes fixes**. Les joueurs ne peuvent ni
avancer ni retarder le coucher du soleil.

Pendant le jour, ils peuvent :

- dissiper le brouillard de guerre ;
- rechercher des gisements, trésors, campements et sources ennemies ;
- éviter ou réveiller des groupes endormis ;
- combattre préventivement les campements qui renforceraient la nuit ;
- extraire et rapporter des ressources ;
- placer des chantiers et ordonner des réparations ;
- fabriquer et changer leurs armes dans le village ;
- dépenser leurs points de compétence près du Cœur.

Les activités ne s'interrompent pas automatiquement au coucher du soleil.

### 3.2 Nuit

Une nuit ordinaire dure **2 minutes fixes**.

- Toutes les actions du jour restent possibles : explorer, extraire, ouvrir un
  trésor, construire ou combattre loin du village.
- Quitter le village prive cependant ses défenses d'un combattant au moment le
  plus dangereux.
- La visibilité de chaque joueur est réduite à un rayon limité. Les compétences
  d'Exploration et les éclairages construits peuvent l'augmenter.
- La carte déjà découverte reste consultable.
- Les campements ordinaires laissés vivants rejoignent l'assaut.
- Les gardiens de trésors restent auprès de leur trésor et ne rejoignent pas la
  vague.
- Une armée de base est produite par les sources ennemies.

### 3.3 Aube

À l'aube :

- un ennemi déjà engagé près d'un joueur ou du village reste actif jusqu'à sa
  mort ou la destruction du Cœur ;
- un ennemi nocturne qui n'est engagé nulle part disparaît ;
- les joueurs encore à terre reviennent si le Cœur a survécu ;
- les gardiens restés auprès de leur trésor ne sont pas dupliqués ;
- si un gardien a été attiré loin de son trésor et reste engagé, il continue son
  attaque et un nouveau gardien endormi apparaît auprès du trésor encore intact.

### 3.4 Croissance de la difficulté

Les monstres ne gagnent pas artificiellement de PV, de dégâts ou de vitesse au
fil des nuits. Chaque archétype conserve des caractéristiques stables.

La difficulté augmente par un **budget de menace** croissant :

- d'abord davantage de petits monstres ;
- puis davantage de monstres moyens ;
- puis une présence croissante de gros monstres et d'archétypes coûteux.

Chaque type possède un coût de menace fixe. Le budget nocturne dépend :

- du niveau joué ;
- du nombre de nuits écoulées ;
- du nombre de joueurs.

Le budget augmente de manière sous-linéaire avec le nombre de joueurs : un
joueur supplémentaire augmente fortement la menace, mais ne la double pas.

## 4. Objectif de victoire et Cœur

### 4.1 Construction du Cœur

Chaque niveau demande de faire évoluer un édifice central différent. Sa fiche
présente avant le départ :

- toutes ses étapes, dans leur ordre ;
- tous les matériaux nécessaires ;
- toutes les compétences obligatoires.

La construction suit une **suite linéaire**. Le nombre d'étapes et leur
complexité dépendent du niveau.

Une étape peut demander une compétence également utile ailleurs. Par exemple,
si le premier Cœur est une église en bois, savoir construire ses cloisons peut
être la même compétence que celle nécessaire à une barrière en bois.

Seul un joueur possédant la compétence requise peut placer le chantier. Une fois
lancé, le travail automatique continue sans lui, même s'il repart ou tombe à
terre.

### 4.2 Déclenchement de l'assaut final

- Si le dernier chantier se termine pendant le jour, l'assaut final commence à
  la tombée de la nuit suivante.
- S'il se termine pendant une nuit ordinaire, l'assaut final commence
  immédiatement.
- L'assaut final remplace alors entièrement la phase jour/nuit en cours.
- Son chronomètre repart de zéro.
- Tous les monstres déjà engagés restent présents.
- Les forces finales s'ajoutent au combat en cours.

### 4.3 Assaut final

- Il dure **2 minutes**.
- Les ennemis arrivent en flux continu, mais leur nombre total est fini et
  prédéterminé au déclenchement.
- Leur nombre et leur composition dépendent du niveau et du nombre de nuits
  écoulées.
- Chaque niveau possède un boss propre intégré à cet assaut.
- Tuer le boss n'est pas une condition de victoire indépendante.

Si le Cœur survit pendant deux minutes, il déclenche son pouvoir final. Cette
manifestation diffère selon le niveau, mais élimine toujours tous les attaquants
restants. Une église pourrait, par exemple, produire une bénédiction finale qui
détruit instantanément les monstres.

### 4.4 Défaite

La partie est perdue si :

- le Cœur est détruit ;
- le joueur solo tombe à zéro PV ;
- tous les joueurs sont simultanément à terre pendant l'assaut final.

## 5. Monde, brouillard et contenu variable

### 5.1 Géographie

- La structure générale et les lieux majeurs d'un niveau sont fixes.
- Les ressources, trésors et groupes ennemis varient entre les tentatives.
- Le brouillard de guerre revient entièrement au début de chaque partie.
- Le brouillard découvert est partagé immédiatement avec toute l'équipe.

### 5.2 Secteurs d'exploration

- La carte est divisée en secteurs possédant chacun un rang de difficulté.
- Le brouillard disparaît visuellement de façon continue.
- Lorsqu'un secteur est suffisamment révélé, il accorde une récompense unique
  d'expérience.
- Cette récompense est divisée entre les joueurs présents dans le secteur au
  moment de son achèvement.

### 5.3 Sources ennemies

- Les nuits sont alimentées par des sources persistantes propres au biome :
  tanières, portails ou équivalents.
- Elles sont indestructibles dans la première version.
- De nouvelles sources peuvent apparaître selon le biome et la progression de
  la difficulté.
- Leur apparition n'est jamais annoncée.
- Elles peuvent apparaître dans une zone déjà explorée ou actuellement visible.
- Une zone d'exclusion les empêche néanmoins d'apparaître trop près de
  l'enceinte.

### 5.4 Campements ordinaires

- Des groupes ordinaires dorment dans le monde pendant le jour.
- Les éliminer réduit la menace supplémentaire de la prochaine nuit.
- Les laisser vivants les fait rejoindre l'assaut nocturne.

### 5.5 Trésors et gardiens

- Les trésors contiennent de grands lots de ressources, sans artefact dans la
  première version.
- Leur contenu est normalement inconnu.
- Une compétence d'Exploration permet d'en estimer progressivement le contenu.
- Les gardiens restent auprès du trésor le jour comme la nuit.
- Tant que le trésor n'est pas récupéré, le site reste gardé.

Les groupes endormis possèdent une jauge d'éveil alimentée par :

- la proximité ;
- leur champ de vision ;
- le bruit produit par les joueurs.

Le réveil d'un groupe produit lui-même du bruit et peut accélérer localement
l'éveil des groupes voisins. Une compétence de discrétion est envisagée dans la
branche Exploration.

Un groupe réveillé pendant le jour peut perdre les joueurs, retourner à son
emplacement et se rendormir. Il régénère alors progressivement ses PV.

## 6. Ressources et transport

### 6.1 Ressources communes

Les quatre ressources de base existent dès le premier niveau et restent
présentes dans toute la campagne :

- **bois** ;
- **pierre** ;
- **métal** ;
- **essence**.

Leurs recettes se chevauchent. Elles financent le Cœur, les défenses, les
bâtiments et les armes. Après dépôt, elles appartiennent entièrement à l'équipe.

La quantité disponible augmente partiellement avec le nombre de joueurs, selon
une courbe sous-linéaire.

### 6.2 Extraction

- Un gisement est fini.
- L'extraction exige une action maintenue dont la durée dépend de sa difficulté.
- Plusieurs joueurs peuvent travailler ensemble et accélérer l'extraction.
- Certains gisements demandent une compétence d'Exploration.
- Un joueur non qualifié peut aider uniquement tant qu'au moins un joueur
  qualifié participe activement.
- Si tous les spécialistes cessent leur travail, l'extraction se met en pause.
- L'expérience est répartie selon le temps de contribution de chacun.

La production extraite est répartie entre les chargements selon la contribution,
dans la limite de la capacité de chaque joueur. L'excédent reste au sol dans un
paquet persistant.

### 6.3 Poids et capacité

- Chaque ressource possède un poids.
- Chaque joueur possède une capacité maximale.
- La branche Exploration peut augmenter cette capacité.
- Le chargement ne ralentit pas le personnage tant que sa limite est respectée.
- Aucun transfert volontaire n'est possible entre joueurs.
- Un joueur ne peut pas déposer volontairement une cache pour la reprendre plus
  tard.

### 6.4 Perte et récupération

Lorsqu'un joueur tombe ou meurt :

- son chargement complet tombe au sol ;
- il reste dans le monde sans disparaître ;
- il possède une apparence distincte, éventuellement clignotante ;
- une infobulle détaille son contenu ;
- n'importe quel allié peut le ramasser, dans la limite de sa capacité.

Entrer dans la zone de dépôt du Cœur transfère automatiquement tout le
chargement vers la réserve commune.

## 7. Contrôles et caméra

La référence de jouabilité souris-clavier est la grammaire standard de
*StarCraft II*. Le personnage du joueur est implicitement contrôlé.

### 7.1 Ordres fondamentaux

| Entrée de principe | Résultat |
|---|---|
| Clic droit au sol | Se rendre au point sans s'arrêter pour combattre |
| Clic droit sur un ennemi | Le poursuivre puis l'attaquer avec l'arme active |
| Clic droit sur une ressource | S'approcher puis commencer l'extraction |
| Clic droit sur un allié | Le suivre |
| Clic droit sur un bâtiment ou chantier | S'approcher puis effectuer l'interaction disponible |
| Attaquer puis cliquer au sol | Avancer en engageant les ennemis rencontrés |
| Arrêter | Annuler l'ordre courant |
| Tenir la position | Attaquer à portée sans poursuivre |
| Majuscule + ordres | Mettre plusieurs déplacements ou actions en file |

Les touches définitives seront choisies après la définition précise de l'arbre
de compétences.

### 7.2 Attaque

- Une cible hors de portée est poursuivie jusqu'à une position d'attaque.
- Une arme de mêlée amène le personnage au contact.
- Une arme à distance l'arrête dès qu'il peut tirer.
- Le personnage attaque automatiquement selon la cadence de son arme tant que
  son ordre et sa cible restent valides.
- Un déplacement simple permet de fuir sans s'arrêter pour combattre.
- L'attaque-déplacement engage automatiquement les ennemis rencontrés.

### 7.3 Caméra et retours

- La caméra peut être déplacée indépendamment du personnage.
- La minicarte permet de déplacer la vue et de donner des ordres lointains.
- Une touche recentre la caméra sur le personnage.
- Une autre permet de rejoindre la dernière alerte importante.
- Chaque ordre doit produire un retour visible : destination, cible, ordre en
  attente, curseur contextuel ou explication d'un refus.

## 8. Joueur, armes et combat

### 8.1 Arsenal initial

Chaque joueur commence avec :

- un **arc** à distance ;
- une **dague** au corps à corps.

Il équipe normalement une arme de chaque catégorie et choisit librement laquelle
est active. Il peut modifier son équipement à tout moment à l'intérieur de
l'enceinte, y compris pendant la nuit.

### 8.2 Déblocage des armes

- La branche Combat contient deux sous-arbres à embranchements : distance et
  mêlée.
- Les armes représentent des styles différents et ne forment pas seulement une
  suite de remplacements strictement supérieurs.
- Exemples à challenger : pistolet, fusil et mitraillette ; épée, hache et
  hallebarde.
- Débloquer un nœud donne le droit d'utiliser l'arme correspondante.
- L'arme elle-même doit ensuite être fabriquée avec les ressources communes.
- Les munitions sont illimitées.
- Les armes ne possèdent pas de durabilité.

### 8.3 Double arme

Une compétence de Combat permet de sacrifier une catégorie pour manier deux
armes identiques de l'autre catégorie : deux dagues ou deux pistolets, par
exemple.

- seules les armes à une main sont éligibles ;
- les deux exemplaires doivent être fabriqués ;
- le joueur ne possède alors plus d'arme équipée dans l'autre catégorie.

### 8.4 Atelier

- Les armes sont fabriquées dans un atelier construit à l'intérieur du village.
- L'atelier est améliorable et vulnérable.
- Une fabrication est instantanée lorsque recette, compétence et matériaux sont
  disponibles.
- Fabriquer une arme ne rapporte pas d'expérience.

### 8.5 Dégâts alliés et obstacles

- Aucun joueur ni aucune défense ne peut blesser un allié ou une construction
  amie.
- Les murs pleins bloquent les tirs directs.
- Les attaques en cloche, arcs, catapultes et défenses surélevées peuvent passer
  au-dessus selon leurs propriétés et le matériau de l'enceinte.

## 9. Santé, soin et mise à terre

### 9.1 Récupération des PV

Il n'existe ni régénération gratuite ni soin automatique à l'aube.

Deux moyens de soin sont prévus :

- **Infirmerie** : bâtiment intérieur qui soigne progressivement les joueurs
  présents dans l'enceinte tant qu'il fonctionne.
- **Compétence Soin** : soin instantané d'un allié proche, suivi d'un délai de
  recharge. Elle ne permet jamais de se soigner soi-même, même en solo.

Le soin rapporte de l'expérience selon les PV effectivement restaurés.

### 9.2 Relèvement coopératif

- Un seul allié à la fois peut relever un joueur.
- Le relèvement demande 5 secondes de base.
- Une compétence peut réduire cette durée.
- Se déplacer ou subir des dégâts interrompt l'action.
- Le sauveteur reçoit l'expérience du relèvement.

### 9.3 Conséquences selon la phase

**Pendant le jour :**

- un joueur à terre peut être relevé ;
- sinon il ressuscite automatiquement au village après 30 secondes.

**Pendant la nuit :**

- aucun retour automatique n'a lieu avant l'aube ;
- seul un allié peut relever le joueur pendant le combat ;
- si toute l'équipe est à terre, les défenses continuent seules ;
- les joueurs reviennent à l'aube si le Cœur n'a pas été détruit.

**Pendant l'assaut final :**

- aucun retour automatique ;
- seul un allié peut relever le joueur ;
- si toute l'équipe est à terre simultanément, la partie est perdue.

**En solo :** tomber à zéro PV provoque immédiatement la défaite, quelle que soit
la phase.

## 10. Progression personnelle pendant la partie

### 10.1 Arbre universel

La première version utilise un arbre commun à tous les personnages, avec trois
branches :

1. **Combat** : efficacité contre les monstres et maîtrise des armes ;
2. **Exploration** : brouillard, discrétion, extraction, lecture des trésors et
   capacité de transport ;
3. **Construction** : édifices, matériaux, réparations et développement du
   village.

- Les points dépensés ne peuvent pas être redistribués pendant la partie.
- Ils peuvent être investis uniquement près du Cœur pendant le jour.
- L'arbre ne met pas le jeu en pause en coopération et ne protège pas le joueur.
- Certaines compétences sont obligatoires pour achever le Cœur d'un niveau.
- Tous ces prérequis sont affichés avant le départ.
- Seul le joueur compétent peut lancer l'action correspondante.

### 10.2 Expérience individuelle

L'expérience n'est pas commune. Chaque action utile rapporte à son auteur selon
une échelle de difficulté partagée par toutes les activités.

- L'échelle est ouverte.
- Le premier niveau utilise les rangs 1 à 5.
- Les niveaux suivants peuvent introduire des rangs 6, 7 et au-delà.
- Un rang identique doit représenter un effort ou un risque comparable, qu'il
  s'agisse d'un monstre, d'une découverte, d'une construction ou d'une
  réparation.

Attribution décidée :

| Action | Attribution de l'expérience |
|---|---|
| Monstre blessé par plusieurs joueurs | Répartition proportionnelle aux dégâts de chacun |
| Dégâts d'une défense automatique | Valeur totale divisée entre tous les joueurs |
| Secteur exploré | Division entre les joueurs présents lors de son achèvement |
| Extraction collective | Répartition selon le temps de travail de chacun |
| Construction | Au poseur, uniquement lorsque l'ouvrage est achevé |
| Réparation | Au lanceur, selon les PV restaurés et la difficulté, uniquement à la fin |
| Relèvement | Au seul sauveteur |
| Soin | Selon les PV réellement rendus |

Un chantier ou une réparation détruit avant son achèvement ne rapporte rien.

## 11. Progression persistante

### 11.1 Points de maîtrise

- Chaque victoire accorde à chaque participant éligible une quantité fixe de
  points de maîtrise.
- Cette quantité dépend du niveau : les niveaux avancés rapportent davantage.
- La performance individuelle ne modifie pas la récompense.
- Les points s'investissent dans un arbre permanent.
- Acheter définitivement une compétence permet de commencer les futures parties
  avec cette compétence déjà acquise.
- Un joueur ayant répété un niveau peut donc commencer beaucoup plus fort qu'un
  nouveau joueur.

### 11.2 Paliers de campagne

- Les victoires du niveau 1 permettent d'acheter les compétences permanentes de
  rang 1.
- Les rangs permanents supérieurs exigent des victoires dans des niveaux plus
  avancés.
- Répéter le niveau le plus facile ne permet donc pas d'acheter tout l'arbre.
- Cette puissance facilite la campagne, mais aucun niveau ne doit l'exiger pour
  être gagnable.

### 11.3 Activité requise

Un participant ne reçoit la maîtrise de victoire que s'il est considéré actif.

- Après 10 secondes sans aucune commande volontaire, il devient inactif.
- Déplacements, attaques, interactions et utilisation réelle des menus comptent
  comme activité.
- L'interface avertit avant l'inactivité puis affiche clairement :
  **« Inactif — aucune maîtrise en cas de victoire »**.
- Après son retour, le joueur doit rester actif pendant 10 secondes continues
  pour redevenir éligible.
- Une jauge visible montre cette requalification.

La manière de traiter un joueur mécaniquement à terre dans ce calcul reste à
préciser : l'incapacité de jouer ne doit pas être confondue avec un abandon.

## 12. Village et constructions

### 12.1 Enceinte initiale

Le village commence avec une barrière complète autour du Cœur.

L'enceinte possède un arbre collectif financé par les ressources communes :

- **forme** : géométrie, taille, nombre de côtés et organisation des secteurs ;
- **matériau** : ronces, bois, bois renforcé, pierre, béton, acier, etc. ;
- **compléments** : poison, électricité, lasers et autres effets à imaginer.

Les trois axes peuvent progresser en parallèle, mais contiennent des choix
incompatibles. Une équipe ne peut pas acheter toutes les variantes dans une même
partie.

- Une enceinte ronde peut posséder une résistance globale.
- Une forme à plusieurs côtés peut être divisée en sections possédant leurs
  propres PV.
- Changer de forme fait partie de la progression de l'enceinte.

### 12.2 Placement

- Les constructions sont placées librement.
- Chaque type précise s'il doit être à l'intérieur, à l'extérieur ou dans l'une
  ou l'autre zone.
- Les joueurs traversent librement toutes les constructions alliées.
- Les monstres sont bloqués par elles.
- Les portes contrôlables ne font pas partie de la première version.

Défenses candidates : tourelles, balistes, catapultes, mines, améliorations et
compléments de l'enceinte. Leur catalogue initial exact reste à définir.

### 12.3 Chantiers

- Le joueur choisit l'emplacement et paie les ressources.
- La construction progresse ensuite automatiquement.
- Un chantier peut être lancé le jour, la nuit ou pendant l'assaut final.
- Tant qu'il est inachevé, il est vulnérable.
- Il devient une cible prioritaire pour les monstres proches.
- Il n'existe aucune limite arbitraire au nombre de défenses : ressources,
  espace, temps et pression croissante constituent les limites.

Si un chantier est détruit, **50 %** de ses matériaux tombent sous forme de
débris récupérables.

Si une défense achevée est totalement détruite, elle ne peut pas être réparée.
Ses débris permettent de récupérer **25 %** de son coût d'origine.

### 12.4 Réparations

- Une défense seulement endommagée peut recevoir un ordre de réparation
  automatique.
- Seul un joueur possédant la compétence Réparation peut lancer cet ordre.
- Une fois lancé, le joueur peut partir.
- La défense continue de fonctionner pendant la réparation.
- L'expérience n'est versée que si la réparation arrive à son terme.

### 12.5 Ciblage ennemi initial

Dans la première version, un monstre ordinaire :

1. suit la route la plus directe vers le Cœur ;
2. attaque la barrière ou le bâtiment le plus proche qui bloque sa trajectoire ;
3. attaque le Cœur une fois accessible ;
4. riposte temporairement au joueur qui l'agresse ;
5. abandonne cette poursuite après un délai ou au-delà d'une distance maximale,
   puis reprend sa route.

## 13. Ennemis et boss

### 13.1 Premiers niveaux de test

Les trois premiers niveaux utilisent au départ les quatre archétypes déjà
connus :

- combattant standard ;
- coureur fragile ;
- brute lente ;
- kamikaze.

Leur répartition par niveau sera ensuite retravaillée. Chaque biome ajoutera des
nouveautés propres.

### 13.2 Boss

- Chaque niveau possède un boss propre.
- Il apparaît pendant l'assaut final.
- Il compte dans la composition finie de l'assaut.
- Le tuer aide la défense, mais la victoire dépend seulement de la survie du
  Cœur jusqu'à la fin des deux minutes.

## 14. Coopération, reconnexion et pause

### 14.1 Roster figé

- Aucun joueur ne rejoint une partie en cours.
- Un joueur initialement présent peut se reconnecter.
- Pendant sa déconnexion, son avatar reste immobile et vulnérable.
- Son absence compte comme de l'inactivité.
- S'il tombe, son chargement est abandonné normalement.
- Le budget de menace ne diminue pas pendant son absence.

### 14.2 Pause

- Une partie solo peut être mise en pause.
- La pause solo suspend entièrement le monde et ne compte pas comme inactivité.
- Une partie coopérative ne peut jamais être mise en pause.

## 15. Exemple de premier niveau — à confirmer

Cet exemple illustre les règles, mais son identité définitive n'est pas encore
validée.

- **Génération :** médiévale.
- **Cœur :** église.
- **Condition de victoire :** achever toutes les étapes de l'église puis survivre
  deux minutes à l'assaut final.
- **Pouvoir final :** bénédiction détruisant tous les monstres restants.
- **Prérequis possible :** savoir construire des cloisons en bois, compétence
  également utilisée pour l'enceinte en bois.
- **Armes initiales :** arc et dague.
- **Ressources :** bois, pierre, métal et essence.
- **Bestiaire de test :** standard, coureur, brute et kamikaze.

Le biome, les étapes exactes de l'église, les recettes et le boss restent à
concevoir.

## 16. Backlog explicitement conservé

Ces idées ne font pas partie de la première version décrite ci-dessus :

- plusieurs arbres de personnage, chacun organisé en trois branches ;
- construction du Cœur en phases comprenant plusieurs chantiers parallèles ;
- neutralisation temporaire des sources ennemies ;
- artefacts temporaires dans les trésors ;
- ressources propres aux biomes ;
- file de fabrication temporisée pour les armes ;
- portes contrôlables dans l'enceinte ;
- progression plus fine du bestiaire entre les niveaux ;
- monstres spécialisés qui chassent les joueurs, attaquent les défenses,
  tirent au-dessus des murs ou construisent des armes de siège.

## 17. Décisions encore ouvertes

Le document ne doit pas masquer ce qui reste à débattre :

1. mécanisme exact de déblocage des technologies d'une nouvelle génération ;
2. identité, biome, Cœur, recettes, étapes et boss des trois premiers niveaux ;
3. nombre total de générations et chemin précis du médiéval vers le spatial ;
4. contenu complet des trois branches de l'arbre universel ;
5. coûts, prérequis et courbe des points de compétence ;
6. contenu et prix de l'arbre de maîtrise permanente ;
7. quantité de maîtrise accordée par chaque niveau ;
8. formule reliant rang de difficulté et expérience ;
9. valeurs des budgets nocturnes et de l'assaut final ;
10. coefficient de menace et de ressources selon le nombre de joueurs ;
11. fréquence, placement et zone d'exclusion des nouvelles sources ;
12. poids des quatre ressources, capacités initiales et rendements des sites ;
13. catalogue, zone de placement, coût et statistiques des défenses ;
14. contenu précis des branches forme, matériau et compléments de l'enceinte ;
15. temps et coût des constructions et réparations ;
16. montant, portée et recharge de la compétence Soin ;
17. vitesse de soin et propriétés de l'infirmerie ;
18. PV de retour après relèvement ou résurrection ;
19. traitement de l'inactivité lorsqu'un joueur est à terre ;
20. nombre maximal de joueurs, au-delà de la cible d'équilibrage 2 à 4 ;
21. raccourcis exacts des ordres et compétences ;
22. catalogue définitif des armes et règles d'équilibrage de la double arme ;
23. propriétés de visibilité et d'éclairage nocturne ;
24. devenir des quêtes, du marchand et des autres systèmes du jeu Tower actuel ;
25. statistiques et records affichés à la fin d'une victoire ou d'une défaite.

