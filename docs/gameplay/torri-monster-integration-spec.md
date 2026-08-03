# Spécification d’intégration du bestiaire de Torri

> Document de référence autonome — résultat du Grill Me validé avec le porteur du projet.
>
> Statut : **spécification de production**. Une IA ou une personne qui implémente le bestiaire doit pouvoir travailler à partir de ce document sans relire la conversation.
>
> Sources auditées : `TorriTime/Tentative-remi` (catalogue `MONSTER_TYPES`, comportements, effets, spawner, raretés et mini-boss) et l’implémentation Tower actuelle de Village Survivor.

## 1. Objectif produit

Village Survivor doit remplacer son petit roster générique (`chaser`, `runner`, `brute`, `kamikaze`) par les monstres mobiles de Torri qui participent réellement à un assaut. Les comportements qui donnent leur identité aux monstres doivent être conservés, puis adaptés à un jeu coopératif où les cibles possibles sont :

1. un joueur actif ;
2. une tourelle ;
3. le Cœur du village.

La priorité absolue est une **variété immédiatement perceptible**. Deux espèces ne peuvent pas se distinguer uniquement par leurs statistiques. Chaque espèce doit différer d’une autre sur au moins deux axes, dont au moins un visible sans consulter d’interface : déplacement, attaque, cible, capacité, réaction ou mort.

Les valeurs numériques brutes de Torri ne sont pas contractuelles. La vie, les dégâts, les vitesses, les portées, les cadences, les récompenses et le coût de menace seront rééquilibrés pour les dimensions et le rythme de Village Survivor. L’identité comportementale et la lisibilité visuelle, elles, sont contractuelles.

## 2. Périmètre validé

### 2.1 Inclus

- Tous les monstres mobiles qui attaquent un joueur, une tourelle, le Cœur, ou qui soutiennent activement un assaut.
- Les soutiens sans dégâts directs : Protecteur, Berger, Nécromancien, Virus F, Soigneur, Urgentiste, Porte-étendard, Invocateur, etc.
- Les unités secondaires invoquées lorsqu’elles attaquent réellement.
- Les formes transitoires indispensables à une mécanique, par exemple les bandelettes d’une Momie à terre.
- Le Gardien Ancien, adapté en mini-boss de vague.
- Les effets visuels procéduraux nécessaires à la compréhension des capacités.

### 2.2 Exclus

- Les monstres génériques actuels de Village Survivor : ils sont supprimés, pas remaquillés.
- Les créatures purement passives ou uniquement destinées à fournir du butin.
- Les structures hostiles stationnaires : Camp de monstres, Statue, Canon déployé, Mortier stationnaire et équivalents.
- Le Cerf du Temps de Torri, qui évite le combat et sert principalement de récompense ambulante.
- Le bestiaire dans le menu principal ; il fera l’objet d’une production ultérieure.
- Les nouveaux sons et la grammaire sonore ; ce n’est pas une priorité de cette production.
- Les éléments, résistances élémentaires et faiblesses élémentaires. Les champs d’affinité élémentaire actuellement présents dans Tower ne doivent pas guider ce roster.
- Le vol de ferraille et la suppression d’améliorations.
- Toute modification de l’or du compte ou de la progression permanente par un monstre.

### 2.3 Adaptations obligatoires par rapport à Torri

- Le **Pilleur** ne collecte plus la ferraille : il devient un opportuniste qui attaque la structure la plus endommagée, frappe rapidement, puis recule.
- Le **Super Pilleur** ne vole plus de ferraille : il désactive brièvement une tourelle après une attaque fortement télégraphiée.
- Le **Contrôleur** ne vole plus la dernière amélioration du joueur : sa seconde signature devient une altération temporelle de position ou de rythme, limitée à la partie.
- Le **Défourailleur** ne collecte aucune ferraille appartenant au joueur : il se renforce par paliers visibles tant qu’il reste actif au combat.
- Le **Voleur de vie** draine uniquement la santé actuelle ; il ne réduit jamais définitivement la vie maximale.
- Le **Truand** peut copier temporairement un effet positif visible, mais ne le retire pas au joueur.
- Le **Cannonier** reste mobile et tire lui-même ; il ne déploie pas de Canon stationnaire.
- Le **Nécromancien** utilise des marques d’âme temporaires puisque les cadavres ne persistent pas.

### 2.4 Traçabilité du catalogue audité

Le catalogue source contient **80 entrées ordinaires/émergentes**, auxquelles s’ajoute le Gardien Ancien dans un registre séparé. Chacune de ces 81 entrées possède une section explicite dans le présent document, y compris les exclusions. Après retrait des cinq entrées exclues et traitement des Bandelettes comme simple état de la Momie, la cible comprend **74 espèces ou sous-unités actives**, plus le Gardien Ancien.

Anomalie source corrigée : la fiche `giantSpider` possède une faction vide dans la version auditée de Torri ; l’Araignée géante est explicitement rattachée aux **Grottes** dans Village Survivor.

## 3. Contrat global de gameplay

### 3.1 Ciblage

Chaque espèce déclare un profil de ciblage :

- **Anti-village** : vise d’abord le Cœur. Elle ne change de cible que si elle est bloquée ou explicitement provoquée.
- **Anti-tourelle** : vise d’abord une tourelle. Foreuse, Engin de siège, Kamikaze, Scarabée, Super Pilleur et spécialistes comparables appartiennent à ce profil.
- **Chasseur de joueurs** : vise un joueur actif selon son rôle. Les assassins peuvent préférer un joueur isolé ou fragile.
- **Polyvalent** : choisit entre joueur, tourelle et Cœur selon rôle, portée et proximité.
- **Soutien** : choisit d’abord un allié ou un groupe à aider, puis se repositionne.

En multijoueur, un monstre ordinaire choisit le joueur actif le plus proche dans son rayon d’agression. La cible est verrouillée pendant quelques secondes afin d’empêcher l’oscillation entre joueurs. Un départ, une mort ou une cible devenue invalide déclenche une nouvelle sélection déterministe.

### 3.2 Attaques contre les structures

- Aucun dégât n’est causé simplement par un chevauchement continu.
- Une attaque possède une préparation, une cadence, un impact et une récupération.
- Un attaquant de mêlée s’arrête brièvement pour frapper.
- Un tireur garde sa distance et produit un projectile ou un impact esquivable.
- Un spécialiste reçoit un bonus contre sa cible préférée, mais ne tue jamais instantanément une tourelle saine ou le Cœur.
- Les monstres ne subissent pas les attaques de leurs alliés, sauf capacité exceptionnelle explicitement conçue autour du sacrifice.

### 3.3 Déplacements et collisions

- Les monstres utilisent une **séparation souple** : légère répulsion, chevauchement partiel autorisé, aucune simulation physique lourde.
- Les grands monstres repoussent davantage les petits.
- Les rapides peuvent se faufiler momentanément dans la foule.
- Les volants ignorent obstacles et collisions terrestres, survolent les défenses, restent atteignables par toutes les armes et affichent une ombre sous leur véritable collision.
- Les fouisseurs sont intouchables sous terre, mais leur trajectoire et leur sortie restent visibles. Ils ne causent aucun dégât sous terre et restent exposés après l’émergence.
- Les téléporteurs affichent une trace au départ et un symbole à l’arrivée. Ils ne frappent pas pendant la téléportation et respectent un délai après l’arrivée.

### 3.4 Contrôles et équité

- Les contrôles importants sont télégraphiés.
- Un joueur récemment contrôlé obtient une courte résistance temporaire.
- Les contrôles successifs ont une durée décroissante.
- Gel, immobilisation, enlèvement et pétrification ne peuvent pas créer une boucle infinie.
- Les ralentissements se cumulent uniquement jusqu’à un plafond.
- La durée restante est indiquée visuellement.
- Le Kidnappeur saisit et éloigne une cible, qui peut continuer à tirer. La prise se brise par dégâts, contrôle du Kidnappeur, mort ou durée maximale.
- L’Enchaîneur limite le déplacement à un rayon visible ; la victime peut agir dans ce rayon et la chaîne est destructible ou temporaire.

### 3.5 Fenêtres de réaction

| Danger | Préavis cible |
|---|---:|
| Attaque rapide et peu dangereuse | 0,3 à 0,5 s |
| Attaque spéciale standard | 0,6 à 0,9 s |
| Charge, contrôle ou explosion importante | 1 à 1,5 s |
| Attaque potentiellement dévastatrice | au moins 1,8 s |

La difficulté peut réduire légèrement les délais, jamais les supprimer.

### 3.6 Soutiens et invocations

- Le meilleur soin, bouclier ou bonus identique s’applique à 100 % ; un second effet identique est atténué. Aucun empilement infini.
- Chaque soutien limite ses cibles simultanées.
- Chaque invocateur possède un plafond individuel et le moteur possède un plafond global d’invocations.
- Une unité invoquée hérite de la faction et, si nécessaire, de la rareté de l’invocateur, mais sa récompense est réduite ou nulle.
- Les invocations déjà créées continuent le combat après la mort du créateur si elles ont une cible valide.
- Les invocations sans cible ni fonction disparaissent progressivement.

### 3.7 Mort

- Aucun cadavre physique persistant.
- Mort ordinaire en moins d’une seconde : fragmentation, dissolution, effondrement ou implosion selon l’identité.
- Animation un peu plus longue pour un légendaire ou un mini-boss.
- Les zones, divisions et invocations produites à la mort ne restent que si elles constituent la signature du monstre.
- Les fragments graphiques sont plafonnés.

## 4. Vagues, difficulté et performances

### 4.1 Incursions thématiques

- Une série de vagues met principalement en avant une ou deux factions.
- Quelques intrus compatibles peuvent créer une surprise contrôlée.
- Les quinze premières vagues présentent successivement Forêt/Grottes, Désert/Cimetière,
  Mercenaires/Montagne, Tribu/Enfer, puis Machines. À partir de la vague 16, les factions déjà
  apprises peuvent être combinées librement.
- Vagues 1–5 : coût de menace maximal 3, monstres simples et communs uniquement.
- Vagues 6–10 : coût maximal 6, premiers rapides, tireurs et anti-village légers.
- Vagues 11–15 : coût maximal 9, soins, explosions, résistances et zones persistantes.
- Vagues 16–20 : coût maximal 11, invocations, contrôleurs et spécialistes anti-tourelles.
- Vagues 21–25 : coût maximal 13, siège, résurrection et compositions dangereuses.
- Vagues 26–30 : coût maximal 15, élites et ennemis exceptionnels.
- La vague 31 ouvre les Terres du Temps et l’endgame sans plafond de coût.
- Aucun panneau de découverte n’interrompt la partie : le joueur apprend par observation.

Le coût n’est pas l’unique verrou. Une table de garde retarde les mécaniques à fort impact
(résurrection, invocation, contrôle de position, réparation, siège mobile et zones persistantes)
jusqu’à leur phase pédagogique. Les raretés Rare, Épique et Légendaire commencent
respectivement aux vagues 6, 16 et 26.

Les coûts 8–10, 11–13 et 14+ possèdent chacun un plafond de créations par vague et un plafond
de survivants actifs. En solo, ces plafonds sont respectivement de 2/4, 1/2 et 1/1
(créés/actifs) ; ils augmentent par paliers avec le nombre de joueurs. Un gros budget coop ne
peut donc plus être converti intégralement en monstres lourds.

Les boss suivent une escalade fixe et lisible : Truand en vague 10, Défourailleur en 15, Yéti en
20, Tank infernal en 25 et Gardien Ancien en 30.

### 4.2 Budget de menace

Chaque définition possède un `threatCost` qui représente son danger réel, pas seulement ses PV. Le budget d’une vague augmente systématiquement. La composition peut reproduire une sensation `1 → 3 → 8 → 20`, sans supposer qu’un Ours polaire équivaut à un Slime.

Multiplicateur validé selon les joueurs actifs :

| Joueurs | Budget relatif |
|---:|---:|
| 1 | 100 % |
| 2 | 165 % |
| 3 | 220 % |
| 4 | 265 % |
| 5 | 310 % |
| 6 | 355 % |
| 7 | 400 % |
| 8 | 445 % |
| 9 | 490 % |
| 10 | 535 % |

Un départ ne supprime pas les ennemis déjà créés. Les prochains groupes et vagues utilisent le nouveau roster. Une arrivée augmente progressivement le budget, sans pic immédiat. Les PV individuels ne sont presque pas multipliés avec le nombre de joueurs : le surcroît vient surtout d’une composition plus riche.

### 4.3 Limite active déterministe

- Solo : 70 monstres actifs maximum.
- Ajouter 10 places par joueur actif supplémentaire.
- Dix joueurs : 160 maximum.
- Les renforts au-delà du plafond attendent dans une file déterministe et entrent par groupes.
- Les invocations consomment des places réservées.
- La limite ne dépend jamais des FPS locaux, afin de préserver le lockstep.

## 5. Récompenses et raretés

### 5.1 Récompenses

Les récompenses de cette production sont principalement l’XP et la ferraille. Elles appartiennent au système de partie ; aucun ennemi ne modifie l’or du compte.

| Rareté | XP | Ferraille |
|---|---:|---:|
| Commun | ×1 | ×1 |
| Rare | ×1,3 | ×1,3 |
| Épique | ×1,75 | ×1,75 |
| Légendaire | ×2,5 | ×2,5 |

L’arrondi garantit au moins une unité supplémentaire lorsqu’une récompense de base existe.

### 5.2 Raretés

| Rareté | Renforcement initial | Signature visuelle |
|---|---|---|
| Commun | base | aucun effet supplémentaire |
| Rare | environ +20 % PV, +10 % dégâts | contour bleu électrique fin et étincelles discrètes |
| Épique | environ +45 % PV, +20 % dégâts, capacité renforcée | aura violette pulsante et fragments géométriques en orbite |
| Légendaire | environ +80 % PV, +35 % dégâts, variante avancée | contour jaune doré animé, petites pointes en couronne et traînée dorée |

La vitesse varie très peu avec la rareté afin de conserver les fenêtres d’esquive. La rareté ne change jamais le rôle fondamental ou la forme dominante. Le palier Mythique de Torri n’est pas repris dans ce contrat.

## 6. Grammaire visuelle

### 6.1 Forme dominante = rôle

| Forme | Rôle principal |
|---|---|
| Cercle | combattant simple ou organique |
| Triangle | rapide, chargeur ou explosif |
| Carré | tank, bloqueur ou siège lourd |
| Pentagone | tireur et artillerie mobile |
| Hexagone | soutien, invocateur ou contrôleur |
| Étoile | ennemi exceptionnel, temporel ou mini-boss |

Une silhouette peut combiner 2 à 5 primitives animées, mais une forme reste dominante. Exemple : Chauve-souris = petit noyau circulaire et ailes triangulaires ; Ours polaire = grand corps carré arrondi, tête et pattes circulaires.

### 6.2 Couleur principale = faction

| Faction | Palette principale |
|---|---|
| Forêt | vert émeraude |
| Grottes | violet sombre |
| Désert | orange et sable |
| Cimetière | vert spectral |
| Montagne | bleu glacier |
| Mercenaires | rouge brique |
| Tribu | turquoise |
| Enfer | rouge incandescent |
| Machines | gris acier et éclairages cyan |
| Terres du Temps | violet cosmique et magenta |

Les réglages de couleur du joueur ne remplacent pas les couleurs de faction ennemies. L’information importante ne dépend jamais uniquement de la teinte : forme, marque intérieure, motif et animation doivent suffire. Une option haute lisibilité renforce contours et contraste.

### 6.3 Taille

- Très petit : Chauve-souris, Mini-slime, Petit scarabée, Recrue.
- Petit : Gobelin, Araignée, Hyène et rapides comparables.
- Moyen : majorité du roster.
- Grand : Yéti, Ours polaire, golems, tanks et machines de siège.
- Très grand : Manieur du Temps et Gardien Ancien.

Au moins 90 % de la silhouette solide doit rester dans la collision. Ailes, cornes, antennes et pointes peuvent dépasser de 10 à 15 % maximum. Les appendices physiques importants élargissent la collision ou utilisent une collision composée. Glow, ombre, aura, traînée et particules sont immatériels et peuvent dépasser. Une taille minimale à l’écran protège la lisibilité des petits ennemis.

### 6.4 Marque intérieure = pouvoir

Les marques sont simples et répétables : goutte pour poison, spirale pour téléportation, croix ou pulsation pour soin, petit bouclier pour protection, œil barré pour invisibilité, explosion radiale pour kamikaze, chaîne pour immobilisation, flocon pour glace, sablier pour temps, silhouettes multiples pour invocation.

### 6.5 Effets de capacité

- **Explosion** : cercle d’avertissement, contraction lumineuse, onde et fragments.
- **Orbite/synergie** : petites formes satellites et trajectoire ou lien discret entre partenaires.
- **Rayon** : ligne de visée fine au chargement, puis faisceau épais à cœur lumineux.
- **Soin** : anneaux ascendants, pulsation et marque animée.
- **Contrôle** : lien entre source et victime plus une représentation propre (chaîne, glace, cage, spirale).
- **Zone persistante** : contour exact au sol, remplissage semi-transparent et animation de durée restante.

### 6.6 Animation minimale par espèce

Chaque espèce reçoit : une locomotion propre, une préparation d’attaque, une réaction aux dégâts et une mort cohérente. Le rendu peut réduire les particules et animations secondaires lorsque la foule est dense, mais jamais supprimer un télégraphe de gameplay.

## 7. Catalogue fonctionnel et visuel

Les niveaux de menace ci-dessous sont relatifs et servent à initialiser le `threatCost` : **faible**, **modéré**, **élevé**, **très élevé**, **mini-boss**. Ils ne remplacent pas les tests d’équilibrage.

### 7.1 Forêt — vert émeraude

#### Slime (`slime`)

- **Rôle/cible** : combattant organique simple, polyvalent ; menace faible ; introduction immédiate.
- **Comportement Torri** : poursuit joueur ou tourelle et fusionne au contact de n’importe quel membre de la famille des slimes.
- **Adaptation** : avance par bonds courts vers la cible valide la plus proche. Deux slimes compatibles qui se touchent fusionnent après une pulsation de 0,6 s, laissant une possibilité de les séparer par dégâts ou recul. La fusion crée un Slime avide et conserve la rareté la plus haute.
- **Visuel** : cercle vert émeraude légèrement aplati, petit reflet rond, bord inférieur ondulant. La locomotion comprime puis étire le corps. Avant une fusion, les deux noyaux clignotent en rythme et un pont gélatineux apparaît.
- **Collision** : cercle correspondant au corps ; déformation uniquement graphique.

#### Gobelin (`goblin`)

- **Rôle/cible** : petit combattant opportuniste ; joueurs puis structures proches ; menace faible.
- **Signature** : approche en zigzag, donne deux coups rapides, puis effectue un petit pas de côté avant de recommencer. Il n’est pas un simple Slime plus rapide.
- **Visuel** : cercle-tête et torse triangulaire court, deux oreilles triangulaires, petites mains. Vert vif avec bandes émeraude sombre ; marque intérieure en double chevron.
- **Animation** : course saccadée, oreilles inclinées avec la direction, mort en trois petites pièces qui se dissolvent.

#### Loup (`wolf`)

- **Rôle/cible** : chasseur de joueur ; préfère une cible isolée ; menace modérée.
- **Signature** : tourne brièvement autour de sa cible, accélère, puis bondit en ligne droite. Le bond est annoncé par un abaissement du corps et une ligne courte au sol.
- **Visuel** : noyau circulaire allongé, museau triangulaire, deux oreilles et queue en petits triangles. Une entaille intérieure indique la direction du bond.
- **Collision** : corps principal seulement ; museau et queue dépassent de moins de 15 %.

#### Harpie (`harpy`)

- **Rôle/cible** : tireuse volante et harceleuse d’XP ; joueur isolé ; menace modérée à élevée.
- **Comportement Torri** : garde environ 260 px de distance, tire toutes les 1,1 s et retire une fraction d’XP.
- **Adaptation** : survole les obstacles, maintient sa distance et lance une plume géométrique. Une plume spéciale, précédée d’un éclat distinct, retient une petite quantité d’XP de partie. L’XP retenue est automatiquement rendue quand la Harpie meurt ; aucun niveau déjà acquis n’est retiré.
- **Visuel** : petit pentagone central et deux grandes ailes triangulaires articulées, vert émeraude tirant vers le jade. Marque intérieure en plume. Une petite orbe d’XP tourne autour d’elle lorsqu’elle en retient.
- **Collision** : noyau et base des ailes dans un cercle ; extrémités immatérielles limitées au dépassement autorisé.

#### Protecteur (`protector`)

- **Rôle/cible** : tank de soutien ; reste au milieu des alliés ; menace élevée.
- **Comportement Torri** : bouclier de zone périodique sur les alliés proches.
- **Adaptation** : avance lentement avec le groupe, frappe au contact et déclenche toutes les quelques secondes un bouclier limité à plusieurs cibles. Le bouclier absorbe un montant fini et ne se cumule pas entièrement avec un second Protecteur.
- **Visuel** : grand carré arrondi vert sombre, quatre petits panneaux carrés aux coins, marque de bouclier au centre. Lors de l’activation, les panneaux s’ouvrent et projettent un anneau translucide.
- **Collision** : grand carré inscrit dans un cercle de collision cohérent ; aura immatérielle.

#### Berger (`shepherd`)

- **Rôle/cible** : soutien de formation sans dégâts directs ; menace modérée.
- **Comportement Torri** : rassemble les monstres dispersés dans un rayon important lorsque le groupe est assez menaçant.
- **Adaptation** : se place en retrait et émet une impulsion qui attire doucement les alliés vers un point de rassemblement, créant une vague compacte. L’impulsion ne déplace pas les mini-boss, n’interrompt pas une attaque et respecte la séparation souple.
- **Visuel** : hexagone vert olive, deux petits satellites circulaires comme des clochettes, marque intérieure en arcs convergents. Des lignes courbes très discrètes relient temporairement les alliés rappelés.
- **Animation** : oscillation lente et pulsation du centre avant chaque rassemblement.

#### Grand loup (`gwolf`)

- **Rôle/cible** : meneur de meute et chasseur ; joueur isolé ; menace très élevée.
- **Comportement Torri** : invoque deux Loups environ toutes les 11 s ; population fortement limitée.
- **Adaptation** : hurle pour appeler un nombre plafonné de Loups, puis mène une charge coordonnée. Le hurlement est interruptible par un contrôle. Ses Loups continuent après sa mort.
- **Visuel** : grand cercle allongé avec tête triangulaire, crinière composée de pointes courtes et marque intérieure à trois griffes. Le hurlement produit des anneaux verts et les Loups appelés reçoivent brièvement un chevron commun.

#### Slime avide (`slime_avide`)

- **Rôle/cible** : résultat émergent de fusion, absorbeur croissant ; polyvalent ; menace variable.
- **Comportement Torri** : n’apparaît jamais directement ; cumule les PV, grandit avec les fusions et conserve les effets de slime transmissibles.
- **Adaptation** : sa taille, sa vie, son coût de menace et sa récompense augmentent avec chaque absorption, sous plafond. Il ne vole ni ferraille ni amélioration. Les effets héritables — résistance, explosion, division — sont représentés par des marques internes distinctes.
- **Visuel** : grand cercle gélatineux contenant plusieurs noyaux visibles ; diamètre croissant mais collision mise à jour avec lui. Une animation d’engloutissement montre les noyaux rejoindre le centre.

#### Camp de monstres (`monsterCamp`) — **exclu**

Structure stationnaire d’invocation. Exclue par décision produit.

### 7.2 Grottes — violet sombre

#### Chauve-souris (`bat`)

- **Rôle/cible** : très petit volant de harcèlement ; joueur proche ; menace faible individuellement.
- **Signature** : attaque en essaim, alterne approche rapide et bref écart latéral. Les individus décalent leurs battements pour rester lisibles.
- **Visuel** : minuscule cercle violet, deux ailes triangulaires, deux points lumineux. Le corps reste dans la collision et les ailes ne dépassent que légèrement.
- **Animation** : battements rapides, piqué court annoncé par ailes repliées, dissolution en poussière violette.

#### Slime sombre (`darkSlime`)

- **Rôle/cible** : slime résistant ; polyvalent ; menace modérée.
- **Comportement Torri** : subit environ 75 % des dégâts et transmet cette résistance au Slime avide après fusion.
- **Signature** : absorbe visiblement une partie de chaque impact, puis avance par bonds lourds. La réduction de dégâts est indiquée par une coque sombre qui ondule, pas par du texte.
- **Visuel** : cercle violet presque noir, noyau carré sombre et reflets violets. La coque se fend brièvement quand elle absorbe un tir.

#### Araignée (`spider`)

- **Rôle/cible** : petit empoisonneur de mêlée ; joueurs ; menace modérée.
- **Comportement Torri** : poison sur coup pendant plusieurs secondes.
- **Adaptation** : se déplace en diagonales rapides, marque une courte pause, puis pique. Le poison inflige des dégâts sur la durée avec plafond de cumul.
- **Visuel** : petit cercle central, quatre paires de segments fins contenus près du corps, marque-goutte. Violet sombre avec abdomen magenta discret.

#### Flipette (`coward`)

- **Rôle/cible** : saboteur anti-structure qui fuit les joueurs ; menace modérée.
- **Comportement Torri** : évite fortement le joueur dans un rayon d’environ 240 px et attaque les tourelles partout sur la carte.
- **Adaptation** : contourne les joueurs, cherche une ouverture vers une tourelle ou le Cœur, frappe puis fuit. Coincée, elle panique et change fréquemment de direction sans traverser les défenses.
- **Visuel** : triangle inversé violet avec deux petits yeux, marque intérieure en flèche de recul. Son corps s’étire à l’opposé du joueur évité.

#### Géant des grottes (`golem`)

- **Rôle/cible** : tank anti-structure ; menace élevée.
- **Comportement Torri** : n’attaque un joueur que très proche, mais détecte les tourelles sans limite pratique.
- **Adaptation** : ignore les provocations lointaines, avance lourdement vers une structure, puis utilise un coup lent en arc. Un joueur au contact peut l’intercepter.
- **Visuel** : grand carré rocheux violet, tête carrée encastrée et poings circulaires. Fissures intérieures lumineuses ; chaque pas produit un petit anneau de poussière.

#### Bouleur (`bowler`)

- **Rôle/cible** : lanceur d’alliés ; soutien offensif mobile ; menace élevée.
- **Comportement Torri** : saisit un allié léger proche et le projette, en s’infligeant une petite part de dégâts.
- **Adaptation** : affiche la cible saisie, arme son lancer, puis projette l’allié vers joueur ou structure. Le projectile-monstre reste attaquable et subit un étourdissement bref à l’impact. Aucun allié lourd, boss ou soutien critique ne peut être lancé.
- **Visuel** : pentagone massif violet, deux bras en segments circulaires, marque intérieure en arc balistique. L’arc prévu est visible pendant le chargement.

#### Araignée géante (`giantSpider`)

- **Rôle/cible** : contrôle de terrain et créatrice de réseau ; menace très élevée.
- **Comportement Torri** : crée trois Araignées tisseuses ; la longueur de toile influence leur vitesse.
- **Adaptation** : pond un groupe limité de Tisseuses qui tracent des fils ralentissants. Elle défend le centre du réseau et charge les joueurs qui détruisent ses filles.
- **Visuel** : grand hexagone-abdomen, tête circulaire et pattes articulées courtes. Motif intérieur en toile. Les fils sont fins mais contrastés, avec leur largeur de danger exacte.

#### Araignée tisseuse (`weaverSpider`)

- **Rôle/cible** : invocation de contrôle de terrain ; menace faible à modérée.
- **Signature** : fuit légèrement devant sa cible tout en déposant une toile persistante limitée. La toile ralentit mais ne bloque pas et s’efface progressivement.
- **Visuel** : petit hexagone violet clair, pattes courtes et fil blanc-violet attaché à l’arrière. Marque intérieure en nœud.
- **Récompense** : fortement réduite car unité invoquée.

#### Pondeuse (`spiderQueen`)

- **Rôle/cible** : invocatrice mobile ; menace très élevée.
- **Comportement Torri** : fenêtre d’invocation d’environ 15 s, avec deux araignées toutes les 2,5 s prises dans un pool Araignée/Tisseuse.
- **Adaptation** : ouvre une phase de ponte clairement visible et libère plusieurs petites unités jusqu’à son plafond. La phase peut être interrompue par un contrôle. Hors ponte, elle utilise une morsure lente.
- **Visuel** : grand hexagone violet, abdomen circulaire segmenté et petites formes ovales visibles à l’intérieur avant l’éclosion.

### 7.3 Désert — orange et sable

#### Slime sableux (`sandslime`)

- **Rôle/cible** : slime de contrôle léger ; polyvalent ; menace faible à modérée.
- **Comportement Torri** : faible chance de créer une flaque de sable lorsqu’il est touché.
- **Adaptation** : chaque palier de dégâts peut déclencher, sous plafond, une petite zone sableuse qui ralentit les joueurs. Il fusionne avec les autres slimes et transmet cette capacité au Slime avide.
- **Visuel** : cercle sable granuleux, noyau orange, motif de grains tournants. La flaque affiche un contour net et une densité décroissante.

#### Momie (`mummy`)

- **Rôle/cible** : combattante persistante ; joueurs puis structures ; menace élevée.
- **Comportement Torri** : accélère à faible vie, tombe en bandelettes pendant environ 5 s, puis revient avec une fraction de sa vie si elle n’est pas achevée par le feu.
- **Adaptation** : plus sa vie baisse, plus ses pas deviennent rapides. À zéro PV, elle devient un paquet de bandelettes vulnérable pendant une courte fenêtre ; si celui-ci n’est pas détruit, la Momie se relève une fois. Aucune arme élémentaire n’est requise : tous les dégâts peuvent l’achever.
- **Visuel** : corps rectangulaire étroit entouré de bandes claires, tête circulaire, œil orange. À terre, spirale de bandes dans la même collision réduite.

#### Bandelettes (`mummyBandages`) — **forme transitoire**

- Ne compte pas comme espèce de vague ni comme attaquant.
- Reste ciblable, immobile et très lisible pendant la fenêtre de résurrection.
- Ne donne aucune récompense séparée.

#### Hyène (`hyena`)

- **Rôle/cible** : chasseuse de meute ; joueur isolé ; menace modérée.
- **Comportement Torri** : chasse en groupe et accélère selon la distance, avec plafond.
- **Adaptation** : plusieurs Hyènes encadrent la cible au lieu de suivre exactement la même ligne. Leur bonus de poursuite augmente lorsqu’elles sont espacées, puis elles convergent pour une morsure coordonnée.
- **Visuel** : petit cercle allongé orange sombre, museau triangulaire et taches en points. Un chevron commun relie brièvement la meute au déclenchement.

#### Ver des sables (`sandWorm`)

- **Rôle/cible** : fouisseur d’embuscade ; joueur ou structure ; menace élevée.
- **Comportement Torri** : émergence télégraphiée d’environ 1,5 s dans une large zone, dégâts différenciés joueurs/tourelles.
- **Adaptation** : choisit une destination valide, trace une bosse au sol, affiche un grand cercle d’arrivée, puis jaillit. Après l’impact, il reste complètement exposé avant de replonger.
- **Visuel** : grand corps composé de 3 à 5 cercles orange décroissants et tête triangulaire. Sous terre, seule une onde de sable animée est visible.

#### Scorpion (`scorpion`)

- **Rôle/cible** : tireur empoisonneur à courte portée ; joueurs ; menace modérée.
- **Comportement Torri** : garde environ 50 px, tire périodiquement et empoisonne.
- **Adaptation** : recule si la cible colle au corps, lève sa queue, affiche une ligne courte, puis lance un dard. Poison plafonné et indiqué par goutte.
- **Visuel** : pentagone orange, pinces circulaires, queue en trois petits segments avec triangle final.

#### Scarabée (`beetle`)

- **Rôle/cible** : spécialiste anti-tourelle et invocateur ; menace élevée.
- **Comportement Torri** : ignore le joueur, cherche les tourelles et invoque des Petits scarabées de plus en plus vite et nombreux.
- **Adaptation** : avance vers la tourelle la plus pertinente, s’ancre brièvement, puis libère une couvée plafonnée. Les joueurs peuvent interrompre l’ancrage en le contrôlant.
- **Visuel** : grand carré arrondi orange avec carapace divisée, marque intérieure en trois petits points. La carapace s’ouvre pendant la ponte.

#### Petit scarabée (`miniBeetle`)

- **Rôle/cible** : très petite invocation d’assaut ; joueurs proches puis tourelles ; menace faible.
- **Signature** : avance par accélérations très courtes, s’accroche brièvement à une cible pour une morsure, puis tombe et repart.
- **Visuel** : minuscule cercle-carapace orange à ligne centrale. Récompense fortement réduite.

#### Djinn (`djinn`)

- **Rôle/cible** : téléporteur alternant distance et mêlée ; joueur ; menace élevée.
- **Comportement Torri** : cycle d’environ 1,5 s, téléportations courtes, choix entre attaque à distance et mêlée.
- **Adaptation** : alterne projectile spiralé et apparition latérale suivie d’un coup. Point d’arrivée visible, aucun dégât pendant le déplacement et délai minimum avant impact.
- **Visuel** : étoile à six branches souples, base en spirale et noyau orange lumineux. Une silhouette résiduelle persiste au départ.

#### Golem de sable (`sandGolem`)

- **Rôle/cible** : grand tank de contrôle, préférence tourelles ; menace très élevée.
- **Comportement Torri** : forte chance de produire une flaque de sable lorsqu’il est touché.
- **Adaptation** : frappe le sol pour créer volontairement une zone sableuse télégraphiée plutôt que de produire trop de flaques aléatoires. Son attaque de structure est lente et lourde.
- **Visuel** : grand carré sable, deux poings circulaires, noyau orange en losange. Des grains s’écoulent de ses fissures à mesure qu’il perd des PV.

### 7.4 Cimetière — vert spectral

#### Zombie (`zombie`)

- **Rôle/cible** : combattant régénérant ; polyvalent ; menace modérée.
- **Comportement Torri** : régénération continue importante.
- **Adaptation** : marche lente et irrégulière, tente d’agripper une cible, puis récupère de la vie après quelques secondes sans subir de dégâts. Les impacts interrompent temporairement la régénération afin d’éviter un mur de PV opaque.
- **Visuel** : cercle vert spectral décentré sur torse carré incliné, bras pendants courts et fissure intérieure. Les morceaux se rapprochent pendant la régénération.

#### Nécromancien (`necromancer`)

- **Rôle/cible** : invocateur à distance ; menace très élevée.
- **Comportement Torri** : garde environ 300 px de distance et ressuscite périodiquement des morts proches.
- **Adaptation validée** : une mort éligible laisse brièvement une marque d’âme. Le Nécromancien canalise plusieurs marques proches et les transforme en petits squelettes. Boss, légendaires et unités lourdes ne sont jamais ressuscités. Les marques expirent rapidement ; le nombre de squelettes est plafonné.
- **Visuel** : hexagone vert sombre, capuche triangulaire, deux petites orbites spectrales. Marque intérieure en crâne minimal. La canalisation relie les marques par des traits verts qui se contractent.

#### Virus F (`virusF`)

- **Rôle/cible** : soutien furtif ; menace élevée par synergie.
- **Comportement Torri** : cherche des alliés proches et leur donne une longue invisibilité.
- **Adaptation** : se colle à un allié prioritaire et lui accorde un camouflage temporaire contre les tourelles. Le monstre camouflé reste visible pour les joueurs sous forme de silhouette translucide et redevient ciblable par les tourelles lorsqu’il attaque ou subit un coup.
- **Visuel** : très petit hexagone vert acide, trois satellites ronds et marque d’œil barré. Un fil pointillé relie la cible camouflée.

#### Harceleur (`stalker`)

- **Rôle/cible** : sniper mobile et frappeur téléporté ; joueur isolé ; menace élevée.
- **Comportement Torri** : reste extrêmement loin, tire lentement à haute vitesse et se téléporte près de la cible pour infliger un coup.
- **Adaptation** : alterne un tir longue portée à ligne de visée claire et une frappe téléportée. Après chaque téléportation, il reste vulnérable et ne peut pas attaquer immédiatement.
- **Visuel** : pentagone étroit vert spectral, œil central, cape en triangle. Une ligne verte pâle relie l’œil à la cible pendant le chargement.

#### Chevalier sombre (`dknight`)

- **Rôle/cible** : très grand duelliste, priorité joueur ; menace très élevée.
- **Comportement Torri** : détecte les joueurs partout, mais ne frappe une tourelle que pratiquement au contact.
- **Adaptation** : choisit un joueur, lève un bouclier frontal qui réduit les projectiles venant de face, puis exécute une large attaque en arc. Son dos reste vulnérable ; il se tourne lentement.
- **Visuel** : grand carré vert presque noir, bouclier carré décalé, épée triangulaire courte et fente lumineuse. Le cône défensif est visible sur le contour.

#### Squelette petit (`skeleton_small`)

- **Rôle/cible** : petite unité de mêlée ; polyvalente ; menace faible.
- **Signature** : avance en pas mécaniques, donne un coup sec, puis recule d’un demi-pas. Sert de résultat final aux divisions et résurrections.
- **Visuel** : petit cercle-crâne, cage thoracique en trois traits et bassin carré, vert os spectral.

#### Squelette moyen (`skeleton_medium`)

- **Rôle/cible** : combattant divisible ; menace modérée.
- **Comportement Torri** : crée quatre petits squelettes à sa mort.
- **Adaptation** : garde une attaque en fente distincte. À la mort, ses os se regroupent en un nombre plafonné de petits squelettes avec positions déterministes ; ceux-ci donnent peu ou pas de récompense.
- **Visuel** : corps circulaire moyen et cage hexagonale. Quatre petits noyaux sont visibles avant la division.

#### Squelette grand (`skeleton_large`)

- **Rôle/cible** : tank divisible ; menace très élevée.
- **Comportement Torri** : crée quatre squelettes moyens, qui peuvent ensuite se diviser.
- **Adaptation** : frappe le sol en cône court et se divise en moins d’unités si le plafond actif est proche. La chaîne de division est incluse dans son coût de menace initial.
- **Visuel** : grand carré osseux, crâne circulaire et cage thoracique épaisse. Les noyaux de futurs squelettes sont visibles dans le torse.

#### Statue (`statue`) — **exclue**

Structure stationnaire utilisant une pétrification. Exclue par décision produit.

#### Vampire (`vampire`)

- **Rôle/cible** : assassin traversant ; joueurs ; menace élevée.
- **Comportement Torri** : dash à travers une cible à très grande vitesse, sur une courte durée et avec recharge.
- **Adaptation** : se transforme brièvement en triangle effilé, affiche un couloir d’attaque puis traverse la cible. Il ne peut pas corriger sa trajectoire pendant le dash et reste exposé à la fin.
- **Visuel** : cercle sombre, cape en deux triangles verts, marque intérieure en crocs. Traînée spectrale limitée pendant le dash.

#### Voleur de vie (`lifeThief`)

- **Rôle/cible** : draineur de santé ; joueur fragile ; menace élevée.
- **Adaptation obligatoire** : ne réduit jamais la vie maximale. Il canalise un rayon court qui transfère une partie de la santé actuelle vers ses propres PV. Le lien se rompt par distance, obstacle, contrôle ou dégâts suffisants. Après un drain réussi, il recule brièvement mais n’emporte aucun « butin » permanent.
- **Visuel** : hexagone creux vert sombre, noyau rouge-vert et marque en goutte inversée. Le rayon montre des particules allant du joueur vers le monstre.

#### Slime décomposé (`decomposedSlime`)

- **Rôle/cible** : slime divisible ; polyvalent ; menace modérée.
- **Comportement Torri** : fusionne avec les slimes et crée quatre Mini-slimes à sa mort ; transmet sa division lors d’une fusion.
- **Adaptation** : corps instable qui perd de petits fragments pendant les bonds. Sa mort ou celle d’un Slime avide l’ayant absorbé libère une quantité plafonnée de Mini-slimes.
- **Visuel** : cercle vert spectral troué, quatre petits noyaux visibles, bord irrégulier mais collision circulaire claire.

#### Mini-slime (`miniSlime`)

- **Rôle/cible** : très petite invocation de mêlée ; menace faible.
- **Signature** : sauts rapides mais très courts, faible vie, groupe dispersé à l’apparition pour éviter une masse illisible.
- **Visuel** : minuscule cercle spectral à un noyau. Récompense fortement réduite.

### 7.5 Mercenaires — rouge brique

#### Tireur (`shooter`)

- **Rôle/cible** : tireur de ligne ; joueurs ; menace modérée.
- **Comportement Torri** : garde environ 250 px, tire toutes les 1,5 s et cherche un partenaire tank ou géant autour duquel se placer.
- **Adaptation** : se met à couvert derrière une unité lourde compatible, conserve un rayon orbital souple, puis tire des projectiles standards. Si son partenaire meurt, il en cherche un autre après un délai.
- **Visuel** : pentagone rouge brique, canon rectangulaire court et marque de réticule. Un lien pointillé discret indique sa synergie avec le tank.

#### Truand (`thug`)

- **Rôle/cible** : imitateur de buffs et bagarreur ; joueurs ; menace élevée.
- **Comportement Torri** : vole un effet positif au joueur à portée.
- **Adaptation** : copie temporairement un effet positif visible sans le retirer au joueur. Il doit canaliser la copie à courte portée ; la capacité est interrompable. Une icône intérieure montre l’effet copié et disparaît à expiration.
- **Visuel** : cercle rouge sombre avec masque carré et petit miroir en losange. Après copie, la marque du pouvoir concerné apparaît en miniature.

#### Sniper (`sniper`)

- **Rôle/cible** : tireur très longue portée ; joueur isolé ou immobile ; menace élevée.
- **Comportement Torri** : garde environ 500 px et tire un projectile très rapide toutes les 2,7 s.
- **Adaptation** : verrouille une cible, affiche une ligne de visée qui devient progressivement opaque, puis tire. Perdre la ligne de vue ou contrôler le Sniper annule le tir.
- **Visuel** : pentagone très fin rouge, long canon contenu près du corps, œil blanc central. Recul net après le tir.

#### Mauga (`minigun`)

- **Rôle/cible** : mitrailleur de suppression ; joueurs et tourelles proches ; menace très élevée.
- **Comportement Torri** : maintient environ 210 px et tire extrêmement vite.
- **Adaptation** : phase de montée en régime, rafale soutenue avec dispersion croissante, puis refroidissement obligatoire. La cible peut sortir du cône ; Mauga tourne plus lentement pendant la rafale.
- **Visuel** : grand pentagone rouge brique, trois petits canons rotatifs, marque intérieure en trois points. Le canon passe du sombre au jaune chaud avant de tirer.

#### Pilleur (`looter`) — **comportement remplacé**

- **Rôle/cible** : opportuniste anti-structure ; menace modérée.
- **Comportement final** : sélectionne la tourelle ou structure valide ayant le plus faible pourcentage de vie, s’approche rapidement, exécute une courte série de frappes, puis recule et change d’angle. Il ne collecte ni ne retire aucune ferraille.
- **Visuel** : triangle rouge brique avec sac purement décoratif en petit cercle, marque intérieure en fissure. La structure ciblée reçoit un chevron discret visible des joueurs.

#### Super Pilleur (`superLooter`) — **comportement remplacé**

- **Rôle/cible** : saboteur de tourelle ; menace très élevée.
- **Comportement final** : ignore les joueurs tant qu’il prépare son sabotage. Il projette une impulsion sur une tourelle après un long télégraphe ; si elle touche, la tourelle est désactivée brièvement, sans perdre modules, niveaux, énergie maximale ou amélioration. Le saboteur fuit ensuite quelques secondes.
- **Visuel** : grand hexagone rouge sombre, deux pinces triangulaires et marque d’éclair barré. Un câble lumineux relie la tourelle pendant la préparation.

#### Chef (`chief`)

- **Rôle/cible** : meneur évolutif ; polyvalent ; menace très élevée.
- **Comportement Torri** : statistiques renforcées selon son niveau.
- **Adaptation** : au lieu d’être seulement plus fort numériquement, il donne des ordres cycliques à son groupe : avancer, se disperser, concentrer une cible. Chaque ordre possède une animation et une durée limitée. Son niveau de puissance suit la vague.
- **Visuel** : étoile courte rouge brique, casque carré, marque en trois chevrons. Les ordres apparaissent comme flèches au-dessus des alliés concernés.

#### Grenadier (`grenadier`)

- **Rôle/cible** : artillerie mobile de zone ; joueurs groupés ; menace élevée.
- **Comportement Torri** : garde environ 280 px et lance rapidement des grenades dans une dispersion donnée, avec zone d’environ 60 px.
- **Adaptation** : choisit une zone où plusieurs joueurs pourraient rester, affiche l’arc et les cercles d’impact, puis lance une courte salve. Les explosions suivent la grammaire visuelle validée.
- **Visuel** : pentagone rouge, trois orbes circulaires attachées et marque radiale. Chaque grenade est un petit cercle noir-rouge à mèche géométrique.

### 7.6 Montagne — bleu glacier

#### Glacié (`frosty`)

- **Rôle/cible** : tireur ralentisseur ; joueurs ; menace modérée.
- **Comportement Torri** : garde environ 230 px, projectile toutes les 1,8 s, ralentissement d’environ 50 % pendant 2 s.
- **Adaptation** : projectile de glace lentement traçable, ralentissement plafonné et résistance temporaire aux contrôles successifs. Ne nécessite aucun système élémentaire.
- **Visuel** : pentagone bleu glacier, pointe de cristal au centre et marque flocon. Une fine trace glacée disparaît rapidement derrière le projectile.

#### Nainsatisfait (`grumpyDwarf`)

- **Rôle/cible** : réparateur de structures ennemies mobiles et combattant ; menace élevée.
- **Comportement Torri** : soigne et augmente progressivement la vie de constructions alliées.
- **Adaptation sans structures stationnaires** : répare les machines et armures des monstres mécaniques ou lourds proches. Le bonus maximal de vie est plafonné et disparaît avec lui ; il combat au marteau si un joueur approche.
- **Visuel** : petit hexagone bleu, tête carrée, marteau en rectangle court et marque de clé. Un arc bleu relie la cible réparée.

#### Cannonier (`cannoneer`) — **comportement adapté**

- **Rôle/cible** : tireur lourd mobile ; joueurs groupés ou tourelles ; menace très élevée.
- **Comportement Torri** : porte puis déploie un Canon stationnaire.
- **Adaptation obligatoire** : aucun Canon séparé. Le Cannonier s’arrête, ancre ses pieds, charge son canon porté, tire un boulet lent à petite explosion, puis replie l’arme et se déplace. Il est vulnérable pendant l’ancrage.
- **Visuel** : grand pentagone bleu acier, canon circulaire intégré au torse, deux pieds carrés. Ligne balistique et cercle d’impact affichés pendant la charge.

#### Canon (`cannon`) — **exclu**

Invocation stationnaire du Cannonier de Torri. Supprimée au profit du tir porté.

#### Yéti (`yeti`)

- **Rôle/cible** : tank protecteur contre les ralentissements ; polyvalent ; menace très élevée.
- **Comportement Torri** : réduction de dégâts et aura immunisant les alliés proches aux ralentissements.
- **Adaptation** : avance lourdement, frappe en cône et projette légèrement. Son aura réduit fortement les ralentissements sur les alliés sans les rendre tous absolument immunisés.
- **Visuel** : grand carré arrondi bleu pâle, tête circulaire et bras massifs. Marque intérieure en flocon barré ; aura en anneau glacé discret.

#### Esprit du blizzard (`blizzardSpirit`)

- **Rôle/cible** : petit contrôleur volant ; joueur ; menace modérée.
- **Comportement Torri** : gèle au contact et crée une zone glacée à sa mort.
- **Adaptation** : effectue un piqué clairement annoncé. Un contact applique un gel très court soumis à l’anti-enchaînement. À la mort, une zone glissante/ralentissante persiste brièvement avec contour exact.
- **Visuel** : petit hexagone flottant, trois éclats triangulaires en orbite et noyau bleu blanc.

#### Ours polaire (`polarBear`)

- **Rôle/cible** : très grand transporteur anti-tourelle ; menace très élevée.
- **Comportement Torri** : ignore les joueurs, attaque les tourelles et transporte un budget d’unités de la faction montagne.
- **Adaptation** : porte visiblement une à plusieurs petites unités autorisées. À un seuil de distance ou après avoir subi assez de dégâts, il les dépose, puis charge une tourelle. Sa charge est lente à armer et très lisible.
- **Visuel** : très grand corps carré arrondi bleu très clair, tête circulaire, pattes rondes et dos plateforme. Les formes transportées restent visibles sans dépasser fortement la collision du corps.

### 7.7 Tribu — turquoise

#### Invocateur (`summoner`)

- **Rôle/cible** : soutien d’invocation ; reste en retrait ; menace élevée.
- **Comportement Torri** : garde sa distance, cherche un Porte-étendard compatible et invoque trois Slimes environ toutes les 12 s.
- **Adaptation** : maintient une orbite souple autour d’un Porte-étendard, canalise un portail visible, puis libère un petit groupe plafonné. Le portail est annulé si la canalisation est interrompue.
- **Visuel** : hexagone turquoise, deux petites formes en orbite et marque de silhouettes multiples. Le portail est un anneau au sol avec compteur visuel de progression.

#### Soigneur (`healer`)

- **Rôle/cible** : soin de zone ; suit un allié lourd blessé ; menace élevée.
- **Comportement Torri** : recherche les blessés, reste près d’un tank/géant compatible et soigne en zone périodiquement.
- **Adaptation** : cible l’allié ayant le meilleur rapport entre importance et PV manquants. Une pulsation soigne un nombre limité de cibles. Le soin ne se cumule pas entièrement avec d’autres Soigneurs.
- **Visuel** : hexagone turquoise clair, croix géométrique abstraite et deux anneaux ascendants au soin. L’allié suivi reçoit un lien doux.

#### Porte-étendard (`banner`)

- **Rôle/cible** : buffer de groupe et combattant ; menace élevée.
- **Comportement Torri** : cherche un Invocateur, augmente dégâts et vitesse des alliés dans une large aura.
- **Adaptation** : plante brièvement un étendard porté — sans créer de structure persistante — et pulse un bonus plafonné. Il reprend ensuite sa marche. Le bonus cesse rapidement à sa mort ou hors rayon.
- **Visuel** : hexagone turquoise avec mât rectangulaire intégré et fanion triangulaire, marque intérieure en flèche montante. Cercle d’aura segmenté.

#### Urgentiste (`paramedic`)

- **Rôle/cible** : soin mono-cible puissant ; menace élevée.
- **Comportement Torri** : rejoint un allié blessé à grande distance et lui rend une forte quantité de vie à courte portée.
- **Adaptation** : fonce vers la cible critique, canalise un rayon court et fournit un gros soin. Une même cible reçoit un délai avant de pouvoir être soignée de nouveau par un autre Urgentiste.
- **Visuel** : petit hexagone turquoise avec deux triangles latéraux, marque en pulsation cardiaque. Traînée droite pendant sa course d’urgence.

#### Chanteur (`chanter`)

- **Rôle/cible** : soutien cumulatif temporaire ; accompagne la foule ; menace élevée.
- **Comportement Torri** : cri de bataille périodique qui renforce les alliés par pulsations.
- **Adaptation** : charge visiblement un chant, émet plusieurs ondes concentriques et donne un bonus temporaire plafonné. Le contrôle interrompt le chant en cours.
- **Visuel** : hexagone turquoise, bouche en losange et deux notes sous forme de petits cercles orbitaux. Les ondes sont segmentées pour ne pas ressembler à une explosion hostile.

### 7.8 Enfer — rouge incandescent

#### Kamikaze (`kamikaze`)

- **Rôle/cible** : explosif anti-tourelle ; menace modérée à élevée.
- **Comportement Torri** : ignore les joueurs, atteint une tourelle et explose à sa mort dans un large rayon.
- **Adaptation** : choisit une tourelle, accélère progressivement, clignote, puis arme son explosion. Être tué déclenche aussi l’explosion après un très court délai, laissant le temps de s’éloigner. Les dégâts contre structures sont plafonnés.
- **Visuel** : petit triangle rouge, noyau circulaire jaune et marque radiale. Le cercle exact d’explosion se remplit avant l’impact.

#### Démon (`demon`)

- **Rôle/cible** : combattant maudisseur ; joueurs ; menace modérée.
- **Comportement Torri** : applique une courte malédiction au contact.
- **Adaptation** : effectue une attaque en griffe qui marque le joueur ; pendant une seconde environ, la prochaine action offensive du joueur est légèrement affaiblie ou retardée, sans supprimer de compétence.
- **Visuel** : cercle rouge sombre, deux cornes triangulaires et rune intérieure. La marque de malédiction se fissure puis disparaît.

#### Tank infernal (`tank`)

- **Rôle/cible** : très grand bloqueur anti-structure ; menace très élevée.
- **Comportement Torri** : n’attaque le joueur que très proche et cherche les tourelles à longue distance.
- **Adaptation** : avance vers Cœur ou tourelle, bloque physiquement une partie du passage par sa grande collision et utilise un coup de bélier lent. Les joueurs peuvent l’attirer seulement en restant proches.
- **Visuel** : énorme carré rouge noir, plaques rectangulaires, noyau incandescent et petites cheminées. Mouvement lourd en quatre temps.

#### Kidnappeur (`kidnapper`)

- **Rôle/cible** : contrôleur de position ; joueur isolé ; menace élevée.
- **Comportement final validé** : annonce sa charge, saisit un joueur, puis tente de l’éloigner du village pendant une durée courte. La victime continue de tirer. Dégâts suffisants, contrôle, mort ou fin de durée brisent la prise. La même victime obtient une immunité temporaire.
- **Visuel** : triangle rouge en forme de pince, deux bras crochus contenus près de la collision et marque de crochet. Le trajet de fuite est indiqué par une flèche au sol.

#### Enchaîneur (`enchainer`)

- **Rôle/cible** : contrôleur à distance ; joueur ; menace élevée.
- **Comportement Torri** : projectile périodique puis immobilisation.
- **Adaptation validée** : ligne de visée, projectile-chaîne, puis limitation du joueur à un rayon visible. La victime peut tirer et se déplacer dans ce rayon. Chaîne destructible, temporaire et non cumulable sur une même cible.
- **Visuel** : pentagone rouge, deux maillons intérieurs et chaîne formée de petits rectangles.

#### Âme brûlante (`burningSoul`)

- **Rôle/cible** : invocation globale volatile ; joueur ; menace faible mais urgente.
- **Comportement Torri** : peut émerger à la mort d’un ennemi, poursuit pendant environ 4 s et inflige une fraction de la vie.
- **Adaptation** : chance contrôlée et déterministe d’apparition selon la vague, jamais sur chaque mort sans plafond. L’âme poursuit le joueur le plus proche, se dissipe après sa courte durée et provoque une petite explosion proportionnelle plafonnée.
- **Visuel** : petite étoile rouge-orange flottante, traînée courte et noyau pulsant de plus en plus vite avant disparition.

#### Slime explosif (`explosiveSlime`)

- **Rôle/cible** : slime explosif fusionnable ; polyvalent ; menace modérée.
- **Comportement Torri** : explosion à la mort transmissible au Slime avide.
- **Adaptation** : bondit normalement mais affiche son noyau explosif. À la mort, cercle de danger puis explosion. Une fusion conserve la capacité avec rayon plafonné ; plusieurs explosions héritées n’augmentent pas sans limite.
- **Visuel** : cercle rouge gélatineux, noyau étoilé jaune et bulles internes. Le noyau clignote avant l’explosion.

#### Ange infernal (`infernalAngel`)

- **Rôle/cible** : volant ressuscitant et aura de brûlure ; menace très élevée.
- **Comportement Torri** : revient une fois à 60 % de vie, devient invincible environ 4 s et inflige une aura plus brûlure.
- **Adaptation** : à la première mort, se replie en étoile sombre, annonce sa résurrection, puis revient une fois. L’invincibilité est visuelle et courte ; son aura dangereuse possède un contour exact. À la seconde mort, disparition définitive.
- **Visuel** : étoile rouge à ailes triangulaires, halo noir-rouge et noyau blanc. Les segments du halo se rallument pendant la résurrection.

### 7.9 Machines — gris acier et cyan

#### Robot explosif (`anti_player`)

- **Rôle/cible** : explosif chasseur de joueur ; menace élevée.
- **Comportement Torri** : poursuit toujours le joueur, s’autodétruit et produit une explosion plus forte que le Kamikaze.
- **Adaptation** : verrouille un joueur, affiche sa cible, accélère en ligne avec corrections limitées puis explose. Sa spécialisation joueur le distingue du Kamikaze anti-tourelle.
- **Visuel** : triangle acier, œil cyan, noyau rouge et petites roues circulaires. Sirène uniquement visuelle par alternance cyan/rouge puisque l’audio est hors périmètre.

#### Défourailleur (`scrapReaver`) — **comportement remplacé**

- **Rôle/cible** : combattant qui se renforce avec le temps ; menace croissante.
- **Comportement Torri** : collecte de la ferraille puis gagne PV et vitesse d’attaque.
- **Adaptation obligatoire** : ne touche à aucune ferraille. Sa batterie se charge lorsqu’il reste engagé et inflige ou reçoit des dégâts. Chaque palier visible renforce temporairement vie récupérable et cadence ; sortir du combat décharge progressivement la batterie.
- **Visuel** : carré acier, batterie cyan en trois segments et bras circulaires. Les segments allumés montrent exactement son palier.

#### Foreuse (`drillbot`)

- **Rôle/cible** : fouisseur anti-tourelle ; menace très élevée.
- **Comportement Torri** : choisit une tourelle, s’enfouit à portée et inflige une frappe lourde.
- **Adaptation** : suit les règles globales d’enfouissement. Une trajectoire cyan au sol conduit à la tourelle ciblée, puis un cercle prévient l’émergence. La Foreuse reste exposée et ralentie après son coup.
- **Visuel** : triangle/foret cyan sur corps carré acier, chenilles courtes. Sous terre, chevrons rotatifs dans la bosse au sol.

#### Mortier (`mortar`) — **exclu**

Artillerie stationnaire sans comportement de déplacement dans Torri. Exclue par décision produit.

#### Engin de siège (`siege`)

- **Rôle/cible** : très grande machine anti-tourelle transportant des troupes ; menace très élevée.
- **Comportement Torri** : ignore le joueur, fonce vers une tourelle, s’autodétruit et libère un budget de Gobelins, Loups, Géants ou Soigneurs.
- **Adaptation** : convoi lent dont les compartiments rendent la cargaison visible. À proximité de la cible ou à sa destruction, il ouvre ses panneaux et libère un groupe plafonné ; son explosion de coque est télégraphiée et moins létale que celle d’un Kamikaze.
- **Visuel** : très grand carré acier, quatre roues circulaires, panneaux cyan et formes de cargaison visibles derrière des fenêtres.

#### Lance-troupe (`squadLauncher`)

- **Rôle/cible** : lanceur mobile anti-tourelle ; menace élevée.
- **Comportement Torri** : ignore le joueur, garde sa distance d’une tourelle et projette trois Recrues environ toutes les 4 s.
- **Adaptation** : affiche trois arcs balistiques, tire les Recrues vers des points distincts autour de la cible et respecte les plafonds d’invocation. Il doit se réancrer entre deux salves.
- **Visuel** : grand pentagone acier, tube cyan orientable et trois voyants. Chaque voyant s’éteint lorsqu’une Recrue est lancée.

#### Recrue (`squadling`)

- **Rôle/cible** : très petite unité anti-tourelle invoquée ; menace faible.
- **Signature** : atterrit avec un petit rebond, se remet debout, puis avance droit vers la tourelle. Faible vie mais attaque rapide au contact.
- **Visuel** : minuscule carré acier, œil cyan et deux pieds. Récompense fortement réduite.

### 7.10 Terres du Temps — violet cosmique et magenta

#### Manieur du Temps (`timeWarden`)

- **Rôle/cible** : très grand contrôleur anti-tourelle et meneur temporel ; menace très élevée.
- **Comportement Torri** : unique à l’écran, contrôle périodiquement un monstre, peut le ressusciter avec forte vie et lui attribuer lenteur, accélération ou téléportation ; se téléporte à faible vie.
- **Adaptation** : sélectionne un allié par un rayon-sablier, le suspend brièvement, puis lui applique une altération visible. La résurrection utilise une marque d’âme et respecte les exclusions boss/légendaire. Sous un seuil de vie, le Manieur prépare une unique téléportation défensive clairement annoncée.
- **Visuel** : très grande étoile violette, cadran circulaire central, aiguilles magenta et trois anneaux orbitaux. Chaque altération possède un motif, pas seulement une couleur.

#### Cerf du Temps (`timeDeer`) — **exclu**

Créature passive qui ignore joueurs et tourelles, garantit un butin et crée des portails lorsqu’elle est touchée. Exclue du roster d’assaut.

#### Contrôleur (`timeController`) — **vol d’amélioration supprimé**

- **Rôle/cible** : frappeur temporel de joueur ; menace élevée.
- **Comportement Torri** : frappe le joueur, disparaît après le coup, le gèle et peut voler sa dernière amélioration.
- **Adaptation obligatoire** : la suppression d’amélioration disparaît. Le Contrôleur prépare un coup, applique un gel court soumis aux résistances, puis renvoie la victime vers sa position déterministe d’il y a environ une seconde avant de disparaître. Aucun état de compte ou de build n’est modifié.
- **Visuel** : étoile magenta asymétrique, cadran cassé et image résiduelle. Le point de retour potentiel est affiché par un cercle fantôme avant le coup.

#### La Montre (`timeWatch`)

- **Rôle/cible** : combattant chaotique à effet de mort ; menace élevée.
- **Comportement Torri** : déclenche aléatoirement à sa mort un ralentissement global, une accélération globale, un ralentissement du joueur ou une forte accélération du joueur.
- **Adaptation lockstep** : l’effet est tiré par le générateur déterministe et annoncé avant la mort par la position de ses aiguilles. L’effet reste court, plafonné et ne modifie jamais le temps réel ou le réseau.
- **Visuel** : grand cercle-cadran violet, douze points, deux aiguilles magenta. À faible vie, les aiguilles se fixent sur le futur effet.

### 7.11 Mini-boss unique

#### Gardien Ancien (`ancientGuardian`)

- **Rôle/cible** : mini-boss de vague ; joueurs et tourelles ; menace mini-boss.
- **Comportement Torri** : arène dédiée, écrasement périodique télégraphié, enragement sous 30 % de vie, poursuite limitée à l’arène, repli et régénération complète en une douzaine de secondes si le combat est abandonné.
- **Adaptation validée** : apparaît lors de certaines vagues importantes dans une zone temporaire autour du village, sans téléporter les joueurs. Il alterne coups de mêlée, écrasement circulaire et déplacement lourd. Sous environ 30 % de vie, son contour et son rythme changent avant l’augmentation de puissance. Il peut viser joueurs et tourelles, mais ne détruit jamais instantanément le Cœur. Le système de repli est adapté à l’arène locale : s’il perd toutes ses cibles valides, il revient au centre et régénère progressivement.
- **Récompense** : grande quantité d’XP et de ferraille de partie ; aucune récompense de compte n’est imposée par cette spécification.
- **Visuel** : très grande étoile à branches épaisses, noyau circulaire violet royal, plaques carrées et anneau de runes. Son écrasement montre un anneau qui se contracte pendant au moins 1,1 s. L’enragement ajoute des fissures magenta, sans utiliser le jaune réservé à la rareté légendaire.
- **Rareté** : boss fixe, hors tirage Commun/Rare/Épique/Légendaire.

## 8. Registre des exclusions et transformations

| Entrée Torri | Décision Village Survivor | Motif |
|---|---|---|
| Camp de monstres | exclu | structure stationnaire |
| Statue | exclue | structure stationnaire |
| Canon | exclu | invocation stationnaire ; Cannonier rendu autonome |
| Mortier | exclu | artillerie stationnaire |
| Cerf du Temps | exclu | passif, n’attaque ni ne soutient l’assaut |
| Bandelettes | forme transitoire seulement | état de résurrection de la Momie |
| Pilleur | conservé, mécanique remplacée | aucun vol de ferraille |
| Super Pilleur | conservé, mécanique remplacée | aucun vol de ferraille/amélioration |
| Défourailleur | conservé, mécanique remplacée | aucune collecte de ferraille joueur |
| Contrôleur | conservé, mécanique remplacée | aucune suppression d’amélioration |
| Voleur de vie | conservé, drain limité | aucune perte de vie maximale permanente |
| Truand | copie au lieu de voler | le joueur conserve son effet |
| Cannonier | tir porté mobile | aucune structure stationnaire |
| Nécromancien | marques d’âme | aucun cadavre persistant |

## 9. Modèle de données attendu

L’implémentation doit être pilotée par les données. Une définition doit pouvoir exprimer au minimum :

```ts
type MonsterDefinition = Readonly<{
  id: string;
  label: string;
  faction: MonsterFaction;
  roleShape: 'circle' | 'triangle' | 'square' | 'pentagon' | 'hexagon' | 'star';
  sizeClass: 'very-small' | 'small' | 'medium' | 'large' | 'very-large';
  targeting: 'heart' | 'turret' | 'player' | 'isolated-player' | 'support' | 'hybrid';
  threatCost: number;
  introductionTier: 'early' | 'mid' | 'late' | 'boss';
  stats: { hp: number; damage: number; speed: number; radius: number; range: number };
  behaviours: readonly BehaviourConfig[];
  abilities: readonly AbilityConfig[];
  visuals: MonsterVisualDefinition;
  spawnRules?: SpawnRules;
}>;
```

Le moteur ne doit pas contenir une longue succession de conditions propres à chaque nom. Les primitives réutilisables attendues incluent au moins : attaque de mêlée, projectile, maintien de distance, charge, dash, vol, enfouissement, téléportation, invocation, soin, bouclier, aura, contrôle, zone persistante, division, résurrection, transport, synergie/partenaire et explosion.

Tous les timers, choix de cible, tirages de composition, raretés, invocations et effets temporels doivent utiliser l’état déterministe de la simulation. Aucun `Math.random()`, temps mural, FPS local ou ordre de collection instable ne doit influencer l’état partagé.

## 10. État réseau minimal

Le snapshot doit exposer uniquement les données nécessaires au rendu et à la reprise déterministe, par exemple : phase de comportement, cible, progression d’un télégraphe, état de contrôle, partenaire, niveau de charge, nombre d’invocations et altération temporelle. Les effets purement décoratifs sont reconstruits localement à partir du tick, de l’identifiant et de la seed ; ils ne sont jamais envoyés image par image.

Le départ d’un joueur ne détruit pas la partie. Les cibles invalides sont relâchées au même tick sur tous les pairs. Une reconnexion reçoit un snapshot complet et reprend ensuite le flux d’inputs. L’intégration du bestiaire ne doit pas réintroduire l’envoi continu de la position de chaque monstre par chaque client.

## 11. Critères d’acceptation

### 11.1 Catalogue

- Chaque entrée incluse possède une définition de contenu, un rendu et au moins une capacité distinctive.
- Aucun des quatre monstres génériques historiques n’apparaît dans une nouvelle vague.
- Les cinq exclusions principales ne peuvent pas être tirées par le spawner.
- Pilleur, Super Pilleur, Défourailleur et Contrôleur respectent leurs comportements remplacés.

### 11.2 Lisibilité

- Un test visuel peut reconnaître rôle, faction, taille et rareté sans lire le nom.
- Au moins 90 % de la silhouette physique est contenue dans la collision.
- Une zone de dégâts affichée correspond à sa zone de collision réelle.
- Les télégraphes critiques restent visibles au niveau de détail minimal.
- Le commun n’a aucun effet de rareté ; bleu = Rare, violet = Épique, jaune = Légendaire.

### 11.3 Gameplay

- Chaque espèce diffère sur deux axes minimum, dont un immédiatement observable.
- Aucun vol de ferraille ou d’amélioration n’est possible.
- Aucun effet ne modifie la progression permanente ou l’or du compte.
- Les contrôles successifs respectent l’anti-enchaînement.
- Les soutiens et invocations respectent leurs plafonds.
- Les dégâts contre structures passent par une animation d’attaque.

### 11.4 Déterminisme et performances

- Deux simulations avec même seed et mêmes inputs produisent le même hash après des vagues contenant toutes les familles de capacités.
- Les plafonds 70 à 160 sont respectés exactement.
- Un départ et une reconnexion pendant une invocation, une téléportation ou une division ne désynchronisent pas la partie.
- Le rendu dense simplifie les décorations, jamais la simulation ni les télégraphes.
- Les particules et cadavres ne s’accumulent pas.

### 11.5 Tests minimums

- Tests unitaires de chaque primitive de comportement et effet.
- Tests de données garantissant identifiants uniques, coûts positifs, cibles valides et références d’invocation existantes.
- Tests de remplacement des mécaniques interdites.
- Tests de budget de menace pour 1, 2, 3 et 10 joueurs.
- Tests de limite active et file de renforts.
- Tests de contrôle anti-enchaînement.
- Tests de rareté et multiplicateurs de récompense.
- Tests déterministes de scénarios combinés : fusion + division, résurrection + invocation, téléportation + départ joueur, Gardien Ancien + reconnexion.
- Captures visuelles ou scènes de démonstration pour chaque faction, chaque rareté et chaque grande famille d’effet.

## 12. Ordre de production recommandé

1. Étendre le protocole et le catalogue piloté par les données ; retirer les types génériques.
2. Construire les primitives déterministes de mouvement, ciblage, attaques, télégraphes et états.
3. Intégrer une faction simple de bout en bout, puis valider tests et rendu.
4. Ajouter invocations, soutiens, contrôles, divisions, résurrections et transports.
5. Ajouter les factions par lots, sans dupliquer la logique moteur.
6. Ajouter raretés, budget de menace, plafonds et récompenses.
7. Ajouter Terres du Temps et Gardien Ancien après stabilisation des primitives.
8. Exécuter les scénarios multijoueurs déterministes et les scènes de charge.

Cette séquence est technique, pas une réduction de périmètre : la cible finale reste l’intégration complète de tous les monstres inclus dans ce document.
