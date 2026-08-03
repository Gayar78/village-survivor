# Village Survivor — Feedback

> Statut : en cours
> Version du projet : v1
> Propriétaire : Gayar
> Dernière revue : 2 août 2026

Ce document est normalement ouvert en phase 5. Il l'est ici plus tôt : une session de jeu
réelle a eu lieu pendant la phase 4, avant l'incrément d'observabilité. Perdre ce retour aurait
coûté plus cher que d'anticiper un artefact.

## Session du 1er août 2026 — multijoueur familial

**Contexte** : partie à plusieurs postes sur le déploiement LAN, build du 1er août 11:20.
Aucune télémétrie n'était en place ; tout ce qui suit vient de l'observation directe et du
message affiché par le jeu.

### Constat 1 — Délai ressenti entre l'action et le déplacement

**Rapporté** : « de nombreux délais entre l'action de déplacement et le déplacement réel ».

**Mécanisme, établi par lecture du code** — `towerSession.ts`, boucle de frame : la simulation
n'avance au tick suivant que si les entrées de **tous** les pairs pour ce tick sont disponibles.
Sinon la boucle s'interrompt et l'affichage gèle jusqu'à leur arrivée. S'ajoutent
`TOWER_INPUT_DELAY_TICKS = 2`, soit **100 ms de retard par conception**.

Ce comportement n'est pas un défaut d'implémentation : c'est le modèle lui-même.
[ADR-0008](decisions/ADR-0008-p2p-lockstep-coop.md) l'annonçait déjà — « le rythme est celui du
pair le plus lent », « le lockstep interdit toute prédiction et toute correction ».

**Ce qui reste indéterminé** : la part du retard constant de 100 ms et celle des gels
intermittents dus à un pair en retard. Le mot « nombreux » suggère des à-coups plutôt qu'une
latence uniforme, ce qui orienterait vers des pairs qui décrochent — onglet en arrière-plan,
machine plus lente, ou saturation de la boucle. Aucune mesure ne permet de trancher aujourd'hui.

#### Correctif appliqué le 1er août 2026

Le retard **constant** est supprimé pour l'avatar local : il est désormais dessiné à l'heure du
joueur et non à celle de la simulation, à partir des entrées déjà diffusées sur le canal. La
caméra le suivant, tout le décor obéit sans délai. Reste au plus le temps de capture d'une
entrée, soit 50 ms, contre 150 à 200 ms auparavant.

Trois précisions comptent pour la recette :

- **rien n'est deviné.** Les entrées employées sont celles que tous les pairs vont appliquer :
  la position dessinée est celle que la simulation atteindra. Aucun recalage ne peut donc être
  visible ;
- **la simulation n'est pas touchée**, ni son empreinte. Un test compare la trace d'une partie
  ponctuée de prédictions à celle de la même partie sans aucune ;
- **le prix est un écart d'affichage** : l'avatar local est montré jusqu'à 150 ms en avance sur
  le monde autour de lui, soit une quarantaine de pixels à pleine course. Un monstre peut donc
  blesser un avatar qui paraît un peu à côté, et une balle partir légèrement en retrait du canon.
  C'est l'arbitrage arrêté par [ADR-0010](decisions/ADR-0010-local-render-prediction.md), et
  **c'est ce point précis qu'il faut juger en jouant**.

Les **gels** ne sont pas corrigés : ils tiennent au modèle lui-même, où le tick commun avance au
rythme du pair le plus lent. L'avatar local continue seulement d'obéir pendant les 200 premières
millisecondes d'un gel, au lieu de se figer avec le reste. Départager le retard constant des
gels reste un objectif de l'incrément d'observabilité.

### Constat 2 — Désynchronisation déclarée

**Rapporté** : bandeau « Désynchronisation Tower détectée au tick 2160 avec `a1f9e19f-f…` ».

**Ce qui est établi** :

- le tick 2160 correspond à **1 min 48 s** de jeu ;
- l'empreinte comparée couvre **tous les champs publics de l'état en pleine précision**, sans
  arrondi : un écart d'un dernier bit sur une position suffit à la déclencher ;
- les pages HTML sont servies **sans en-tête `Cache-Control`** ; un navigateur peut donc
  resservir une page ancienne, qui référence un paquet ancien ;
- le netcode **n'échange aucun identifiant de build** : deux pairs exécutant des versions
  différentes ne peuvent ni le détecter ni le refuser ;
- la simulation appelle `Math.hypot`, `Math.atan2`, `Math.cos` et `Math.sin` à vingt-huit
  endroits du chemin critique, alors que la spécification du langage autorise chaque moteur à
  les approximer différemment.

**Ce qui n'est pas établi** : laquelle de ces deux causes — versions différentes, ou arithmétique
divergente — a produit cette désynchronisation. Les deux sont réelles et suffisantes. Rien
aujourd'hui ne permet de les départager, et c'est le premier objectif de diagnostic assigné à
l'incrément d'observabilité.

**Éléments qui affaiblissent l'hypothèse des versions différentes**, précisés par le propriétaire
après coup :

- les deux postes venaient d'être démarrés, et la pile Docker de même ; aucune reconstruction du
  client n'a eu lieu entre le démarrage et la partie, donc tous les pairs téléchargeaient les
  mêmes fichiers ;
- un des joueurs découvrait le jeu : son navigateur n'avait aucun cache le concernant ;
- surtout, **une page périmée ne produirait pas une divergence discrète**. Les noms de fichiers
  produits par l'outil de construction contiennent une empreinte du contenu, et le dossier de
  sortie est vidé à chaque construction : une page ancienne référencerait un paquet supprimé et
  échouerait visiblement, au lieu de jouer une partie divergente. Il faudrait qu'un navigateur
  ait conservé en cache **à la fois** la page et le paquet correspondants.

Un redémarrage de poste ne vide toutefois pas le cache disque d'un navigateur : l'hypothèse est
affaiblie, pas éliminée.

**La seconde hypothèse devient donc la plus probable**, et un fait la renforce nettement : les
deux joueurs utilisaient **des moteurs JavaScript différents** — Firefox d'un côté, Edge de
l'autre. C'est exactement le cas de figure où des fonctions approximées par l'implémentation
peuvent diverger.

### Diagnostic en cours

Une page de contrôle a été ajoutée au déploiement, hors du paquet du jeu :
`http://<adresse>:8080/diagnostics/math-check.html`. Elle évalue 200 000 fois les quatre
fonctions concernées sur des entrées générées par arithmétique entière — donc rigoureusement
identiques d'un moteur à l'autre — et publie une empreinte par fonction.

Référence relevée sur moteur Chromium le 1er août 2026 :

```text
Math.hypot : f7f3f67607b620e6
Math.atan2 : 297ed15f72ad7f79
Math.cos   : 547d5fdb55663325
Math.sin   : fc8960a37b3a400b
```

### Cause établie le 1er août 2026

Relevé sur les trois postes :

| Fonction | Chromium 148 | Firefox 153 | Edge 150 |
|---|---|---|---|
| `Math.hypot` | `f7f3f67607b620e6` | `e28fa4b046ac2d9e` | `f7f3f67607b620e6` |
| `Math.atan2` | `297ed15f72ad7f79` | `297ed15f72ad7f79` | `c15c5453c345de92` |
| `Math.cos` | `547d5fdb55663325` | `a8631c792eb4f9ae` | `c836e13d9c4a7e1a` |
| `Math.sin` | `fc8960a37b3a400b` | `06b8429d1dbde769` | `b9fee2745a61f59e` |

**Les quatre fonctions divergent, et pas seulement entre moteurs différents.** Edge 150 et
Chromium 148 partagent le même moteur JavaScript, et leurs résultats diffèrent pourtant sur
`cos`, `sin` et `atan2`. Le critère n'est donc pas « même moteur » mais **« exactement le même
build de navigateur »**.

`Math.cos` et `Math.sin` produisent trois valeurs distinctes sur trois navigateurs.

`Math.atan2` concordait entre Firefox et Chromium 148 : on aurait pu le croire sûr. Edge 150 le
dément. Cette concordance était une coïncidence sur ces entrées, pas une propriété.

Ce qui est hors de cause : `Math.sqrt` et `Math.round`, exactement spécifiés par le langage, de
même que les opérateurs arithmétiques.

### Conséquence : aucune consigne d'usage ne protège

Une première lecture des mesures avait fait envisager une parade sans développement — demander
aux joueurs d'utiliser le même navigateur. **Le relevé d'Edge l'invalide** : il faudrait
imposer le même navigateur *et* la même version, sur des logiciels qui se mettent à jour
automatiquement et sans prévenir. Deux joueurs alignés aujourd'hui divergeront après une mise à
jour silencieuse, sans que rien ne le signale.

**Le correctif dans le code est donc la seule voie fiable.** Il cesse d'être une option de
confort pour devenir la condition d'existence du mode coopératif.

En attendant, une parade partielle reste possible sans toucher au cœur : **échanger l'identité
du moteur à la jonction** et avertir — ou refuser — quand les pairs ne partagent pas exactement
le même build. Cela ne répare rien, mais transforme une divergence inexplicable en un message
compréhensible avant la partie.

### Correctif appliqué le 1er août 2026

Les vingt-huit appels du chemin critique sont remplacés par des opérations que la spécification
du langage définit exactement. Une garde de lint interdit leur retour dans `game-core` ; c'est
elle qui a trouvé un vingt-neuvième cas, l'opérateur de puissance des seuils de niveau, que la
recherche manuelle avait manqué.

La page de diagnostic vérifie maintenant les deux côtés : les fonctions du moteur, qui **doivent**
différer d'un navigateur à l'autre, et leurs remplaçants, qui **doivent** concorder partout.
C'est le contrôle à faire avant la prochaine partie à plusieurs postes.

### Correctif vérifié le 2 août 2026

Relevé sur les **deux postes qui jouent**, plus deux moteurs de contrôle :

| Fonction | Firefox 153 | Edge 150 | Chromium 148 | Node 24 (V8 13.6) |
|---|---|---|---|---|
| `Math.hypot` | `e28fa4b0…` | `f7f3f676…` | `f7f3f676…` | `f7f3f676…` |
| `Math.atan2` | `297ed15f…` | `c15c5453…` | `297ed15f…` | `297ed15f…` |
| `Math.cos` | `a8631c79…` | `c836e13d…` | `547d5fdb…` | `709d0e69…` |
| `Math.sin` | `06b8429d…` | `b9fee274…` | `fc8960a3…` | `fd7f0bf3…` |
| **`exactLength`** | `e9a279fcfad73017` | `e9a279fcfad73017` | — | `e9a279fcfad73017` |
| **`exactCos`** | `8f1b7d6a9d60c48d` | `8f1b7d6a9d60c48d` | — | `8f1b7d6a9d60c48d` |
| **`exactSin`** | `289f59c496e56674` | `289f59c496e56674` | — | `289f59c496e56674` |

**Les trois remplaçants concordent exactement**, sur trois moteurs et sur les deux machines qui
vont jouer ensemble. C'est la propriété que le lockstep exige.

`Math.cos` et `Math.sin` donnent, eux, **quatre valeurs différentes sur quatre moteurs**. Le
quatrième relevé enfonce le clou : Node 24 embarque V8, comme Chromium 148 et Edge 150, et ne
s'accorde avec aucun des deux. Le critère n'est décidément pas la famille de moteur mais le build
exact.

Un détail vaut d'être noté : le relevé Node emploie **le module réellement embarqué dans le jeu**
(`packages/game-core/dist/exact-math.js`), tandis que les navigateurs exécutaient la copie inline
de la page de diagnostic. Les deux donnent la même empreinte, donc la page contrôle bien ce que
le jeu exécute — un diagnostic qui aurait dérivé de son sujet ne servirait à rien.

**Ce que cela ne prouve toujours pas** : qu'une partie coopérative ne divergera plus. L'empreinte
d'état compare *tout* l'état en pleine précision, et ces mesures ne couvrent que l'arithmétique.
La cause établie est supprimée et l'accord est vérifié entre les deux postes ; s'il existait une
seconde cause, seule une partie réelle la révélera.

## Session du 2 août 2026 — test invalidé par le cache

**Rapporté** : performances toujours mauvaises, correctes pour le propriétaire, mauvaises pour
son fils dès le début ; jeu quasiment injouable après la mort et la réapparition de ce dernier.

**Ce que la télémétrie a montré : rien.** Aucune requête `/otel` n'est parvenue à la passerelle
pendant la partie. La recherche de la cause a établi un fait plus gênant :

**Aucun des deux navigateurs n'a demandé le jeu au serveur.** Le journal de la passerelle montre,
pour la fenêtre de la partie, des appels à l'authentification, à l'API et au websocket temps réel
— mais **pas une seule requête pour `play.html` ni pour un paquet**. Les deux postes ont servi la
page et le code depuis leur cache local, sans même revalider.

**Ils ont donc joué une construction périmée** : ni la prédiction de rendu, ni l'instrumentation
n'en faisaient partie. Le ressenti rapporté porte sur le code d'avant les correctifs. Il reste
un fait — le jeu était injouable — mais il ne dit rien de ce qui a été livré depuis.

**Cause** : les pages étaient servies **sans en-tête `Cache-Control`**. Faute de consigne
explicite, un navigateur applique une heuristique de fraîcheur et peut resservir une page ancienne
sans interroger le serveur. Cette faiblesse était **déjà consignée** comme cause candidate de la
désynchronisation du 1er août, puis écartée au motif qu'il faudrait qu'un navigateur ait gardé en
cache à la fois la page et son paquet. C'est précisément ce qui s'est produit : ce n'est pas un
cas rare, c'est le comportement ordinaire d'un cache.

**Leçon de méthode** : la page de diagnostic, elle, portait `Cache-Control: no-store` et était donc
toujours fraîche. Les relevés d'arithmétique du 2 août sont valides ; c'est la partie qui ne
l'était pas. Un contrôle qui se rafraîchit alors que le produit ne se rafraîchit pas donne
l'illusion de tester la version qu'on croit.

### Correctifs du 2 août 2026

- **les pages sont désormais revalidées à chaque chargement** (`Cache-Control: no-cache`), et les
  paquets — dont le nom porte une empreinte du contenu — mis en cache définitivement
  (`immutable`). Une page ne peut plus référencer un paquet périmé ;
- **les pairs échangent l'identifiant de leur construction** à la jonction coopérative. S'il
  diffère, un message le dit **avant** la partie au lieu d'une divergence inexplicable après deux
  minutes. L'identifiant part aussi dans la télémétrie, pour que la question « jouaient-ils le
  même code ? » ait désormais une réponse ;
- **l'URL de la page de jeu porte l'identifiant de construction.** L'en-tête corrige la cause
  pour l'avenir, mais il ne peut rien pour une entrée **déjà** mémorisée sous l'ancienne règle :
  le navigateur ne redemande pas une page qu'il croit fraîche, donc n'apprend jamais la nouvelle
  consigne. Une URL qui change à chaque livraison est une autre entrée de cache, et force le
  chargement quoi qu'il arrive ;
- **une bascule reste nécessaire une fois**, sur le lobby seulement : un navigateur qui l'avait
  déjà en cache avant le correctif ne demandera pas le nouvel en-tête. Un rechargement forcé
  (Ctrl+Maj+R) sur la page d'accueil suffit, et une seule fois.

## Session du 2 août 2026 (seconde) — première partie réellement mesurée

**Contexte** : partie coopérative à deux postes, Firefox 153 et Edge 150, build `msc096xf`
vérifiée chargée par les deux navigateurs avant le lancement. Durée 2 min 26 s, vague 13, défaite.

**Rapporté** : « le ressenti est meilleur, mais au bout d'un moment — plus long — il se remet à
lagger ».

### Ce que la télémétrie établit

| Mesure | Valeur | Lecture |
|---|---|---|
| Ticks simulés | 2694 sur les deux pairs | accord parfait |
| Temps de jeu simulé | 134,7 s | |
| Durée réelle de la partie | 145,7 s et 146,0 s | **11 s de retard accumulé** |
| Période effective du tick | **54,1 ms** | conception : 50 ms |
| Fréquence effective | **18,5 Hz** | conception : 20 Hz |
| Durée d'un tick de simulation | 0,093 ms en moyenne, jamais plus de 5 ms | budget : 1 ms |
| Durée d'une image | 0,56 ms en moyenne, jamais plus de 10 ms | budget : 16 ms |
| Images par seconde | ≈ 59 | |
| Monstres présents | 18,7 en moyenne | budget : 200 |
| Ticks rattrapés par image | 1,0007 | la boucle ne rattrape jamais |
| **Avance d'entrée locale** | **nulle dans 83 % des images**, 0,65 tick en moyenne | conception : 3 ticks |
| Divergence d'empreinte | **aucune** | |

**Deux résultats positifs, à ne pas perdre de vue.** Les deux pairs finissent au **même tick**,
avec la même vague et la même issue, et le compteur de divergence n'a jamais été incrémenté : le
correctif de déterminisme tient en conditions réelles, sur deux navigateurs différents, pendant
2694 ticks. Et la machine mesurée est **oisive** : 0,09 ms de simulation et 0,56 ms de rendu par
image sur un budget de 16 ms. Le problème n'est ni la puissance des postes, ni le coût du jeu.

### Diagnostic

**Le jeu tourne 8 % trop lentement, et son horloge d'entrées perd du temps sans jamais le
rattraper.**

Deux horloges cohabitent dans `towerSession.ts`, et une seule est fiable :

- la **simulation** avance sur un accumulateur alimenté par `performance.now()`. Il ne perd
  jamais une milliseconde : si une image tarde, l'accumulateur le sait et réclame les ticks
  manquants ;
- la **capture des entrées** avance sur un `setInterval(50 ms)` qui produit **exactement un tick
  par déclenchement**. Un déclenchement en retard, ou fusionné avec un autre par le navigateur,
  est perdu définitivement. Aucun mécanisme ne le compense.

Entre les deux, la conception ménage une réserve de trois ticks — les deux ticks de
`TOWER_INPUT_DELAY_TICKS` plus la capture initiale. Cette réserve ne se reconstitue jamais : elle
se vide au rythme de la dérive du minuteur. Une fois vide, la simulation n'avance plus qu'au
rythme de la capture la plus lente du groupe, soit 54 ms au lieu de 50.

**La mesure discrimine, et c'est exactement ce pour quoi elle a été faite.** Si le jeu attendait
le réseau, notre capture locale continuerait pendant l'attente et l'avance mesurée **augmenterait**.
Elle tombe à zéro : le pair mesuré consomme tout ce qu'il capture, et c'est donc sa propre horloge
de capture qui le limite, pas la latence d'un autre poste.

**Conséquence directe sur le ressenti, et elle explique le « au bout d'un moment ».** La
prédiction de rendu introduite le 1er août ne fonctionne qu'à partir des entrées **déjà émises et
non encore jouées** : c'est précisément cette réserve. Tant qu'elle existe, l'avatar obéit sans
délai. Quand elle est vide — 83 % des images ici — la prédiction n'a plus rien à anticiper, se
désactive silencieusement, et les 150 à 200 ms de retard reviennent. Le joueur ne voit pas une
dégradation progressive : il voit un correctif qui cesse de fonctionner.

Cela explique aussi l'asymétrie de la session précédente : le pair dont le minuteur dérive le plus
impose son rythme à tout le monde **et** est celui qui n'a jamais de réserve, donc jamais de
prédiction. Il est doublement pénalisé.

### Ce que la télémétrie ne permet pas encore de dire

**Les deux postes écrivent dans la même série de mesures.** Aucun attribut ne les distingue :
le retrait des mesures d'usage a supprimé l'identifiant de compte, et rien de non identifiant ne
l'a remplacé. Conséquences constatées :

- les valeurs instantanées sont exploitables mais appartiennent à **un** pair, sans qu'on sache
  lequel ;
- toute évolution dans le temps est **inexploitable** : deux producteurs sur une même série
  cumulative produisent des sauts que `rate()` interprète de travers — jusqu'à 191 ticks d'avance
  moyenne là où le maximum observé est 10.

C'est le premier correctif à apporter à l'instrumentation elle-même : un identifiant de session
tiré au hasard, propre à l'onglet, sans lien avec le compte du joueur.

## Session du 2 août 2026 (troisième) — seize minutes, et une divergence

**Contexte** : partie coopérative de **16 min 32 s**, deux postes, vague 99, défaite. Build
`msc1f9ze` vérifiée chargée par les deux navigateurs. Une partie solo de 10 min 32 s a suivi.

**Rapporté** : « le ressenti est OK », « pas de bug ».

### Ce que les joueurs n'ont pas vu

**Une divergence de simulation s'est produite au tick 18220**, soit à la quinzième minute. Les
deux pairs l'ont signalée mutuellement, puis à chaque contrôle d'empreinte — 80 signalements
chacun — jusqu'au tick 19800. **Les 80 dernières secondes ont été jouées sur deux mondes
différents**, et personne ne s'en est aperçu.

Ce n'est pas un reproche aux joueurs : le bandeau est discret et l'écart, à ce stade d'une partie
perdue d'avance, ne change pas grand-chose à ce qu'on ressent. Mais cela dit deux choses.

D'abord que **le correctif de déterminisme du 1er août ne suffit pas**. Il a supprimé une cause —
l'arithmétique approximée — et il l'a bien supprimée : quinze minutes sans le moindre écart, là où
la partie du 1er août divergeait au bout de deux. Une autre cause subsiste, et elle met plus
longtemps à se manifester.

Ensuite que **l'empreinte ne sait pas dire où**. Elle compare l'état public entier et répond
« différent ». Pour la suite, il faut des empreintes par sous-système — joueurs, monstres,
projectiles, ferraille, Cœur, tourelles — afin que la prochaine divergence nomme son coupable au
lieu de le taire.

### Ce que la session valide

| Mesure | Valeur | Lecture |
|---|---|---|
| Écart temps simulé / temps réel | **0,08 %** sur 16 minutes | l'horloge d'entrées tient |
| Avance d'entrée, poste 1 / poste 2 | 3,32 / 3,59 ticks | conception : 3 |
| Durée d'un tick | 0,19 et 0,71 ms à 100-200 monstres | budget : 1 ms |
| Durée d'une image | 0,57 et 1,28 ms | budget : 16 ms |
| Images par seconde | 56 et 31 | — |

Le correctif d'horloge du 2 août est confirmé sur la durée. Les machines sont **loin d'être
saturées** : sur la plus lente, le jeu occupe 1,3 ms des 33 ms disponibles par image.

### Ce qui grossit sans fin

| Minute | Monstres | Projectiles | Ferraille au sol |
|---|---|---|---|
| 2 | 18 | 2 | 41 |
| 8 | 76 | 15 | 354 |
| 14 | 107 | 109 | 761 |
| 16 | 111 | 165 | **1005** |

Les monstres plafonnent, la ferraille non : environ soixante pièces par minute, et **rien ne la
supprime jamais** sauf un joueur passant à moins de soixante unités. En fin de partie il y en
avait dix fois plus que de monstres. Chacune coûte un calcul de distance par joueur et par tick,
une allocation d'objet par tick, sa part du hachage d'empreinte chaque seconde et un dessin par
image. Détail et correctifs proposés dans [`../ROADMAP.md`](../ROADMAP.md).

### Classement des retours

| Nature | Constat | Suite |
|---|---|---|
| Écart à la spécification | Divergence au tick 18220 | Correctif prioritaire, v2 |
| Diagnostic insuffisant | L'empreinte ne localise pas la divergence ; projection et empreinte non mesurées ; métrique de divergence perdue faute d'export | Dette d'observabilité, v2 |
| Besoin supplémentaire | Borner la ferraille au sol | Fonctionnalité, v2 |
| Spécification erronée | Aucune | — |

### Ce que cette session valide

Elle confirme la priorité décidée en phase 2 et 3 : **instrumenter avant de faire évoluer le
fonctionnel**. Deux incidents réels sont survenus, tous deux prévus par la documentation comme
risques du modèle, et **aucun des deux n'est diagnosticable en l'état**. C'est exactement le
manque que l'incrément doit combler.

### Suites décidées

Le propriétaire a demandé que ces deux points soient traités lors des prochaines itérations,
avant toute évolution fonctionnelle. Ils sont inscrits dans [`../ROADMAP.md`](../ROADMAP.md).

Précaution immédiate, sans développement : garder l'onglet du jeu au premier plan, comme
l'interface le demande déjà.

**Prochaine étape de diagnostic**, avant tout correctif : établir laquelle des deux causes est
la bonne. La plus probable se vérifie en quelques lignes — comparer, d'un poste à l'autre, le
résultat des fonctions mathématiques employées par la simulation. Corriger sans avoir tranché
reviendrait à remplacer une partie du cœur de simulation sur une intuition.

## Résolution v2 — serveur autoritaire (3 août 2026)

Les deux symptômes de la session longue sont désormais traités par conception : la ferraille ne
naît plus naturellement et expire après 600 ticks, tandis que la coopération n'exécute plus une
simulation par navigateur. Une `TowerRoom` calcule l'état unique et les clients ne font que
commander et rendre cet état ; la divergence au tick 18 220 n'est donc plus une classe de panne
possible entre pairs.

Le remplacement retire aussi les mécanismes de diagnostic devenus sans objet — historique de
replay et empreinte globale — au profit de mesures serveur directement actionnables : durée et
retard de tick, octets encodés par patch, commandes refusées, reconnexions et population de
ferraille. Le test de référence simule 24 000 ticks, quatre joueurs et 200 monstres ; les valeurs
finales sont consignées dans `qualite/rapport-tests.md`.

Cette résolution technique ne remplace pas un retour joueur. Une partie solo et une partie coop
sur deux postes LAN doivent encore confirmer le rendu, la reconnexion et la trace distribuée en
conditions réelles.
