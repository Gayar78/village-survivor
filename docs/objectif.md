# Village Survivor — Objectif macro

> Statut : approuvé
> Version du projet : v1
> Propriétaire : Gayar
> Dernière revue : 31 juillet 2026

## En une phrase

Livrer un vrai jeu, pour de vrais joueurs — et le prouver d'abord en donnant à Gayar, Hida et
Clem l'envie d'y revenir d'eux-mêmes.

## Le problème

Il existe un jeu jouable, mais **personne n'a encore établi qu'il donne envie d'y revenir**.
Le produit a été construit vite et a changé de nature en cours de route ; sa qualité technique
est réelle, son intérêt ludique n'a jamais été vérifié auprès de personnes qui jouent
librement.

Tant que ce point n'est pas tranché, tout travail supplémentaire — architecture comme
fonctionnalités — se fait à l'aveugle.

## Pour qui

Un **cercle fermé de 5 à 20 personnes** : l'équipe, ses collègues et quelques proches invités.
Des sessions de **2 à 4 joueurs simultanés**, par parties.

Aucun inconnu n'accède au jeu à ce stade. L'ouverture publique reste l'horizon, pas le
périmètre courant.

## Critère de réussite

Sur une période d'**un mois** :

1. **Gayar, Hida et Clem lancent chacun au moins cinq parties de leur propre initiative** ;
2. le groupe produit au moins **cinq propositions d'amélioration écrites**.

Les deux conditions doivent être remplies. La première se constate par la télémétrie de
parties, la seconde par le dépôt.

**« De sa propre initiative »** signifie : avoir lancé une partie solo, ou avoir créé soi-même
un salon coopératif. Rejoindre l'invitation d'un autre joueur ne compte pas. Chacun peut donc
satisfaire le critère sans devoir héberger, et l'on distingue celui qui a envie de jouer de
celui qui répond présent.

> **Modification du 1er août 2026.** Le seuil est passé de trois à cinq parties, et la
> répartition dans le temps a été explicitement écartée : les cinq parties peuvent avoir lieu
> le même jour. Cette décision appartient au propriétaire, et elle durcit le critère plutôt
> qu'elle ne l'allège. Elle a toutefois une conséquence à assumer à la lecture des résultats :
> le critère mesure désormais un **volume de jeu**, et non un retour étalé dans le temps. Cinq
> parties enchaînées un même samedi le valideraient.
>
> La décision précédente reste consultable dans l'historique Git. Le reste de l'objectif est
> inchangé et demeure verrouillé.

Ce critère mesure **cette version**, pas la finalité. Trois personnes qui redemandent à jouer
sont le premier signal crédible qu'un joueur extérieur y prendrait plaisir ; ce n'en est pas la
preuve.

## Conséquence d'un résultat faux ou indisponible

**Aucune.** L'indisponibilité du jeu, la perte de la progression des joueurs et la divulgation
des adresses e-mail stockées sont explicitement assumées par le propriétaire du projet. Pas
d'enjeu financier, juridique ou professionnel, personne en difficulté.

Réserve consignée : les adresses e-mail stockées appartiennent à des tiers — collègues et
proches — qui n'ont, eux, rien assumé. L'enjeu reste mince tant que le cercle est fermé et
connu. Il redeviendrait réel le jour d'une ouverture publique, qui devra donc rouvrir ce point.

## Ce que le projet ne fera pas

Deux natures de frontière, à ne pas confondre.

**Exclusion assumée, sans échéance de réexamen :**

- aucun argent, ni réel ni virtuel : pas de monétisation, pas d'achat, pas de classement.

**Ajournement — écarté maintenant, réexaminable « quand le jeu sera top » :**

- ouverture publique à des inconnus ;
- lutte contre la triche : le jeu continue de croire le navigateur du joueur sur parole ;
- support mobile ;
- direction artistique définitive : le rendu géométrique actuel est conservé.

## L'existant

Le jeu lui-même existe et fonctionne : solo, coopération jusqu'à dix joueurs, déploiement local
complet livré le 31 juillet 2026. Ce qui manque n'est pas du code, c'est **la preuve que le jeu
est agréable**, et les moyens d'en juger.

Un prototype historique ([Gayar78/village-survivors-v2](https://github.com/Gayar78/village-survivors-v2))
a été analysé en juillet 2026 comme référence fonctionnelle en lecture seule. Il ne suffit pas :
il n'a pas de condition de victoire, sa Tour ne se développe pas, ses personnages ressuscitent
automatiquement et sa persistance est incohérente. Son code n'est pas repris.

## Contraintes

| Contrainte | Valeur |
|---|---|
| Échéance | aucune date couperet ; le mois d'observation du critère est la seule échéance qui compte |
| Temps disponible | quelques heures par semaine, pour l'ensemble du groupe |
| Budget | aucun budget autorisé — toute solution doit rester gratuite ou auto-hébergée |

## Idées de fonctionnalités

> Non validées ; matière première de la phase 3.

- **Condition de victoire** — faut-il qu'une partie puisse se gagner, et pas seulement se
  perdre plus ou moins tard ? Le groupe n'est pas d'accord.
- **Progression entre les parties** — faut-il conserver l'or, les personnages et les
  améliorations d'une partie à l'autre, comme aujourd'hui ? Le groupe n'est pas d'accord.

Ces deux points contredisent les piliers produit du 20 juillet 2026, qui exigeaient une
victoire et des parties sans progression conservée. **La décision est explicitement suspendue
aux tests à trois joueurs**, menés à partir du jeu tel qu'il est aujourd'hui.

Conséquence directe sur la suite : ces tests ne sont pas une simple recette, ce sont un
**instrument de décision produit**. Ce qui sera mesuré pendant les sessions doit permettre de
répondre à « est-ce que ces parties donnent envie d'y revenir », et pas seulement à « est-ce
que ça tient techniquement ». C'est une exigence pour la phase 2.

## Hypothèses ouvertes

| ID | Décision provisoire | Raison | Impact | Confiance | Validation attendue |
|---|---|---|---|---|---|
| HYP-001 | Le critère de réussite est mesuré sur les trois personnes nommées, pas sur un échantillon plus large | Le cercle est fermé et le groupe est le seul public réel à ce stade | Un résultat positif ne prouve pas l'intérêt pour un joueur extérieur | moyenne | Premiers retours d'un joueur invité hors du groupe |
| HYP-002 | Le jeu reste jouable uniquement en réseau local ou en accès privé pendant la période d'observation | Aucune licence, aucun hébergement, aucun budget | Aucune donnée d'usage venant d'inconnus ne sera collectée | haute | Décision d'ouverture publique |
