# Village Survivor — Feedback

> Statut : en cours
> Version du projet : v1
> Propriétaire : Gayar
> Dernière revue : 1er août 2026

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

Relevé depuis Firefox 153 sur le second poste :

| Fonction | Chromium | Firefox 153 | |
|---|---|---|---|
| `Math.hypot` | `f7f3f67607b620e6` | `e28fa4b046ac2d9e` | **diffère** |
| `Math.atan2` | `297ed15f72ad7f79` | `297ed15f72ad7f79` | identique |
| `Math.cos` | `547d5fdb55663325` | `a8631c792eb4f9ae` | **diffère** |
| `Math.sin` | `fc8960a37b3a400b` | `06b8429d1dbde769` | **diffère** |

**Trois fonctions sur quatre ne calculent pas la même chose selon le moteur.** La simulation les
emploie à chaque tick pour produire des positions et des vitesses ; l'écart se réinjecte dans
l'état et s'accumule jusqu'à franchir une frontière de décision. Le lockstep ne peut pas tenir
entre Firefox et un navigateur Chromium. Ce n'est plus une hypothèse.

`Math.atan2` concorde sur ces 200 000 entrées, mais **cela ne le garantit pas** : la
spécification l'autorise à diverger comme les autres. Il doit être traité comme non fiable.

Ce qui est hors de cause : `Math.sqrt` et `Math.round`, exactement spécifiés par le langage, de
même que les opérateurs arithmétiques.

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
