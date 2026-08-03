# Village Survivor — Règles de gameplay courantes

> Statut : approuvé
> Version du projet : v2 — boucle 1
> Propriétaire : Gayar
> Dernière revue : 3 août 2026
> Portée : le jeu « Tower », seul jeu atteignable depuis les pages du client

Ce document décrit ce que le code fait réellement. Les valeurs proviennent de
[`packages/game-core/src/tower/tuning.ts`](../../packages/game-core/src/tower/tuning.ts) et de
[`packages/content/src/tower.ts`](../../packages/content/src/tower.ts) ; les structures d'état
proviennent de [`packages/protocol/src/tower.ts`](../../packages/protocol/src/tower.ts).

> **Rupture avec les piliers produit de juillet 2026.** Le jeu décrit ici n'est plus la boucle
> « explorer le jour / défendre la nuit » validée à l'atelier du 20 juillet et conservée dans
> [`../product/product-pillars.md`](../product/product-pillars.md). Il n'y a plus de cycle
> jour/nuit, plus d'exploration, plus de ressources transportées, plus de disciplines, plus de
> condition de victoire. Cette rupture n'a jamais été soumise à une validation produit datée :
> elle est constatée ici, pas entérinée. Voir « Écarts non arbitrés » en fin de document.

## Forme de la partie

Une partie est une **survie sans fin**. Le statut ne connaît que trois valeurs : `ready`,
`running` et `defeat`. **Il n'existe aucune condition de victoire.**

La partie est perdue si :

- le Cœur tombe à zéro point de vie ; ou
- en solo uniquement, l'unique avatar tombe à zéro point de vie.

En coopération, un avatar à zéro point de vie passe **à terre pendant 30 secondes**, puis
réapparaît près du Cœur avec ses points de vie pleins. Il n'existe ni relèvement par un allié,
ni mort définitive, ni mode spectateur. Tant qu'au moins deux joueurs sont dans la partie,
seule la chute du Cœur peut y mettre fin.

La simulation avance à pas fixe de **50 ms (20 Hz)** et n'est jamais mise en pause.

## Monde

- Carte de 12 000 × 12 000 unités, positions bornées à ±6 000 depuis le centre.
- Le **Cœur** occupe l'origine : 1 400 points de vie, rayon 55.
- **Quatre tourelles fixes** entourent le Cœur aux points cardinaux, à 240 unités.
- Les monstres apparaissent sur un anneau compris entre 0,6 et 0,95 fois le rayon de la zone
  d'apparition (4 000 unités), et jamais à moins de 720 unités d'un joueur.

### Biomes

Quatre biomes se succèdent par tranches de trois vagues : Bosquet (nature), Terres brûlées
(feu), Toundra (givre), Tempête (orage). La rotation ne dépend que de la graine et du numéro de
vague — aucun tirage aléatoire, aucune horloge. Chaque biome donne son affinité à **70 %** des
monstres ordinaires qu'il produit ; l'affinité détermine un trait visible (endurci, féroce,
blindé, vif).

## Joueur

- 300 points de vie, vitesse 260, rayon 14, rayon de ramassage 60.
- Déplacement au clavier, **visée à la souris**, tir au clic gauche maintenu.
- Trois armes personnelles, disponibles dès le départ, permutables par les touches `1`, `2`
  et `3` :

| Arme | Cadence | Dégâts | Portée | Particularité |
|---|---:|---:|---:|---|
| Fusil de garde | 0,40 s | 15 | 650 | arme initiale, polyvalente |
| Tromblon | 0,80 s | 5 × 10 | 360 | cinq plombs, dispersion 0,18 rad |
| Longue-vue | 1,05 s | 65 | 1 050 | traverse un ennemi |

Chaque arme possède son propre niveau et sa propre progression. L'arsenal, les points de vie,
le niveau et les améliorations sont **personnels** ; le Cœur, les tourelles, la ferraille et les
vagues sont **partagés**.

### Expérience et améliorations

L'expérience gagnée par élimination vaut la récompense du monstre × 4. Le premier niveau demande
55 points, puis chaque palier est multiplié par 1,11.

L'amélioration mythique **Fracture glaciale** fait ralentir les cibles touchées par un coup
critique : chaque pile retire 15 % de leur vitesse, jusqu'à trois piles, pendant deux secondes
rafraîchies à chaque nouveau coup critique. Un monstre ralenti n'est jamais immobilisé.

Une montée de niveau propose **trois cartes** et n'interrompt jamais la simulation. Les cartes
sont tirées selon des poids de rareté : commune 58,3 %, rare 25 %, épique 13 %, légendaire
2,7 %, mythique 0,9 %, divine 0,1 %. Les niveaux gagnés s'empilent ; le joueur résout ses choix
quand il le peut, au clic ou par les touches `1`, `2`, `3`.

## Monstres

| Type | PV | Vitesse | Dégâts de contact | Récompense | Coût de vague |
|---|---:|---:|---:|---:|---:|
| Poursuivant | 40 | 90 | 12 | 1 | 1 |
| Coureur | 20 | 170 | 8 | 1 | 1 |
| Brute | 160 | 55 | 25 | 3 | 4 |
| Kamikaze | 25 | 120 | 0 | 2 | 2 |

Le kamikaze n'inflige aucun dégât de contact : il explose au contact d'un joueur, d'une tourelle
ou du Cœur, comme à sa mort — 35 dégâts dans un rayon de 70. Un monstre inflige ses dégâts de
contact au plus une fois toutes les 600 ms. Au-delà de 900 unités, un monstre cesse de poursuivre
un joueur et se dirige vers le Cœur.

### Raretés

Les raretés supérieures n'entrent qu'à partir d'une vague donnée : commune dès la vague 1
(poids 70), inhabituelle dès la 2 (20), rare dès la 4 (8), élite dès la 7 (2). Les multiplicateurs
sont appliqués une seule fois, à l'apparition.

Toutes les **cinq vagues**, exactement un **boss** supplémentaire apparaît : une brute avec six
fois ses points de vie, 2,25 fois ses dégâts et douze fois sa récompense.

### Pression

Une vague part toutes les **10 secondes**. Son budget vaut 5, plus 2 par tranche de 30 secondes
écoulées, plafonné à 90. Chaque joueur supplémentaire ajoute un facteur de 0,6. Le budget est
dépensé en achetant des monstres au coût indiqué dans le tableau ci-dessus.

## Économie

Deux monnaies distinctes coexistent.

**La ferraille** est le fonds de défense **commun**. Elle n'apparaît jamais spontanément : toute
mort de monstre, quelle qu'en soit la cause, dépose exactement un tas dont la valeur est la
récompense du monstre. Un tas non ramassé disparaît après **600 ticks**, soit 30 secondes de
simulation. Le ramassage est traité avant l'expiration : un joueur à portée au tick limite
récupère encore le tas. Les quêtes communes versent leur récompense directement dans le fonds,
sans créer d'objet au sol. La ferraille finance tout ce qui touche à la base.

**L'or** est **personnel** : chaque élimination rapporte la récompense du monstre × 3. Il ne
sert à rien pendant la partie — il est crédité au compte du joueur en fin de partie et alimente
la méta-progression hors partie.

## Atelier de tourelle

En s'approchant à moins de 90 unités d'une tourelle vivante, le joueur ouvre l'atelier avec `E`.
Tout ce qui suit est payé sur la **ferraille commune**.

Tant que l'atelier est réellement ouvert et validé par la simulation, l'avatar est **ignoré par
les monstres**. Cette protection est vérifiée côté moteur : elle exige un joueur vivant,
effectivement à portée d'une tourelle vivante.

| Achat | Effet | Coût |
|---|---|---:|
| Dégâts | +15 dégâts par tir | 10 |
| Portée | +40 unités | 8 |
| Cadence | −7 % de temps de recharge | 12 |
| PV max | +110 PV et soin partiel | 11 |
| Régén énergie | +2 énergie par seconde | 11 |
| Capacité énergie | +30 énergie maximale | 9 |
| Réparer | 1 PV | 0,1 |

Une tourelle possède 500 PV, 100 d'énergie, en consomme 5 par tir et en régénère 4 par seconde.
Elle tire toutes les 1,2 s à 320 unités pour 42 dégâts, dans un arc de ±55° autour de son axe.

### Modules

Chaque module s'installe **une seule fois** par tourelle :

| Module | Effet | Coût |
|---|---|---:|
| Surcadence | −20 % de temps entre les tirs | 24 |
| Perforateur | +1 ennemi traversé | 28 |
| Condensateur | +50 énergie maximale, +50 à l'installation | 22 |

Le **marchand** propose deux super-modules par vague, en rotation déterministe : Surmultiplicateur
(−35 %, 45), Rail spectral (+3 traversés, 50), Batterie quantique (+120 énergie, 42).

### Priorité de ciblage

Gratuite et modifiable à volonté : *Plus proche*, *Plus robuste* (le plus de PV restants) ou
*Menace du Cœur* (le plus proche du Cœur).

### Défenses globales

Trois offres sont présentées par vague, en rotation déterministe. Elles s'appliquent à toute la
base et montent jusqu'au niveau 5 : Fortifier le Cœur (+250 PV max, 36), Puissance du réseau
(+12 % de dégâts de toutes les tourelles, 40), Portée du réseau (+60 unités, 32).

## Quêtes communes

Une seule quête est active à la fois, alimentée par les éliminations de **tous** les joueurs et
de toutes les tourelles. Sa complétion verse sa récompense une fois, puis active immédiatement
la suivante dans la rotation :

- **Éclaircir la horde** — éliminer 5 monstres — 18 ferraille ;
- **Prime d'élite** — éliminer un élite ou un boss — 25 ferraille.

Les récompenses sont exclusivement en ferraille commune : une quête ne touche jamais l'or
personnel ni la méta-progression.

## Coopération

Jusqu'à **dix avatars actifs** partagent une partie. Le modèle est un **lockstep pair-à-pair** :
chaque navigateur exécute la même simulation et n'échange que des entrées, jamais d'état. Les
arrivées et départs sont planifiés à une frontière de tick précise, identique chez tous les pairs.
Un joueur peut rejoindre une partie en cours : il rejoue la graine et l'historique d'entrées
avant de demander sa réintégration.

**La reconnexion a une limite de temps.** Le rejeu part du premier tick de la partie, et
l'historique conservé couvre **vingt minutes**. Au-delà, un joueur déconnecté ne peut plus
revenir : il reçoit un refus explicite et la partie continue sans lui. Le correctif de fond —
des points de reprise périodiques, qui rendraient le rejeu proportionnel au temps écoulé depuis
le dernier d'entre eux — est consigné dans la feuille de route.

Voir [ADR-0008](../decisions/ADR-0008-p2p-lockstep-coop.md) pour la décision et ses limites.

## Méta-progression (hors partie)

Elle vit sur le compte, pas dans la partie, et **persiste entre les parties**. Elle exige un
compte Supabase — voir [ADR-0009](../decisions/ADR-0009-account-persistence.md).

L'accès aux données de compte exige une **double authentification satisfaite** : un compte
créé par courriel doit avoir validé son second facteur, faute de quoi la base refuse aussi bien
la lecture que l'écriture. Les comptes fédérés en sont dispensés, comme à l'écran.

- jusqu'à **3 profils** de personnage, un seul actif ;
- une **voie** parmi Bastion, Chasseur, Éclaireur ;
- **6 bénédictions** (rang maximal 2) réparties dans les trois voies, limitées par un budget de
  4 points et payées en or de compte ; seules celles de la voie du profil sont accessibles ;
- **4 compétences** (rang maximal 3) achetées pour le compte, dont 3 équipables ;
- **4 gemmes** dont 3 sertissables, et **3 recettes de forge** pour en produire de meilleures.

Tous les effets sont des bonus additifs appliqués à une base de 1, puis **bornés à
l'intervalle [0,1 ; 3]**. Un profil altéré ou obsolète ne peut donc pas produire de valeur
aberrante. Le build est résolu avant le lancement et reste figé pendant toute la partie.

## Écarts non arbitrés

Ces points contredisent des décisions produit ou techniques encore formellement en vigueur. Ils
sont listés ici pour qu'aucun ne disparaisse silencieusement.

1. **Aucune condition de victoire.** Les piliers produit en exigent une (niveau ultime du Cœur,
   phase d'activation, vague finale). Le code n'en implémente aucune.
2. **La progression persiste entre les parties.** Le pilier produit n°13 impose l'inverse.
   Constaté par [ADR-0009](../decisions/ADR-0009-account-persistence.md), pas validé par une décision
   produit datée.
3. **Il n'y a plus de mort définitive ni d'état à terre relevable** — seulement une réapparition
   automatique après 30 secondes en coopération.
4. **Le contenu Tower n'est pas validé.** ADR-0005 exige un schéma explicite et une validation au
   chargement pour chaque catégorie de contenu. Le catalogue Tower est un ensemble de constantes
   TypeScript sans schéma, et une partie du réglage vit dans le moteur plutôt que dans le contenu.
5. **L'or de compte est déclaré par le client.** La simulation étant hébergée par le navigateur,
   rien n'empêche un client modifié de déclarer un montant arbitraire en fin de partie.
