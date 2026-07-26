# Inventaire fonctionnel du prototype historique

Statut : première passe factuelle, 20 juillet 2026.

## Source et méthode

- Dépôt : [Gayar78/village-survivors-v2](https://github.com/Gayar78/village-survivors-v2)
- Commit analysé : `2ca967c196404c83823e265c1348db3b4e4cc5f5`
- Auteur crédité : `Gayar78`
- Nouveau dépôt : [HidaAkawa/village_survivor](https://github.com/HidaAkawa/village_survivor)

L'audit a couvert les 85 fichiers du commit, ses documents de contrats, ses données de
jeu et ses 15 302 lignes ajoutées. Le prototype a aussi été lancé localement jusqu'à
une partie solo : connexion invitée, création du personnage, lobby, carte, HUD et
interface de production de la Tour ont été observés.

Les auto-vérifications embarquées de la génération du monde, du combat, de l'économie
et des quêtes passent. Celle du gestionnaire de monstres échoue sur la répétition des
attaques télégraphiées. Aucun effort n'a été consacré à réparer cette version.

Limites de l'audit :

- le dépôt ne contient qu'un commit, donc aucun historique de conception exploitable ;
- une seule partie solo a été parcourue ;
- le cycle complet jour/nuit et le multijoueur sont confirmés par le code, pas par une
  longue session de jeu ;
- le dépôt ne contient pas de licence autorisant la reprise de son code ;
- les assets de sorts sont annoncés CC0 par un script de téléchargement, mais leur
  provenance et leur licence devront être vérifiées à la source avant toute
  réutilisation.

## Niveaux de confiance

- **Confirmé** : observé en fonctionnement ou directement exercé par une
  auto-vérification réussie.
- **Implémenté** : chemin de code complet et relié au jeu, sans observation exhaustive.
- **Conçu seulement** : contenu présent dans des données ou documents, mais non relié à
  la boucle jouable.
- **Incohérent** : le comportement ou les données se contredisent.

## Synthèse

Le prototype n'est pas dépourvu de conception. Il contient une boucle produit
cohérente et plusieurs systèmes déjà détaillés. Sa valeur principale réside dans :

1. l'exploration concentrique où rareté et danger augmentent avec la distance ;
2. l'alternance entre collecte diurne et vagues nocturnes ;
3. la combinaison de deux identités de combat par personnage ;
4. la distinction entre monstres gardiens, chasseurs et assaillants ;
5. la collecte, la production et la construction défensive ;
6. un catalogue créatif très riche de compétences et de variantes ;
7. des intentions de game feel précises : télégraphes, esquive, recul, effets, audio
   et lisibilité du combat.

Il ne réalise cependant pas encore le concept produit désormais validé. La Tour ne se
développe pas comme un personnage, aucune construction ne provoque la victoire, les
personnages ressuscitent automatiquement et la seule défaite possible est la
destruction de la Tour.

## Monde et exploration

| Élément | État | Comportement du prototype |
|---|---|---|
| Carte | Confirmé | Carte carrée de 6 000 × 6 000 unités, Tour au centre. |
| Anneaux de distance | Confirmé | Cinq anneaux jusqu'aux confins ; la rareté moyenne augmente avec la distance. |
| Biomes | Confirmé | Forêt, montagne, plaine et marais répartis en secteurs autour de la Tour. |
| Gisements | Confirmé | Environ 90 gisements déterministes par graine, aucun à moins de 400 unités de la Tour. |
| Ressources lointaines | Confirmé | Les gisements lointains sont plus rares et moins abondants. |
| Danger diurne | Implémenté | Tout gisement de rareté 2 à 5 possède un monstre campeur de poids équivalent. |
| Brouillard/exploration | Absent | La carte et la minimap donnent immédiatement une vue étendue du monde. |
| Artefacts dans le monde | Conçu seulement | Des récompenses portent le type `artefact`, mais aucun artefact n'est découvert ni équipé sur la carte. |

Le monde utilise un générateur pseudo-aléatoire reproductible. La graine ne rend pas
toute la partie déterministe : le placement initial des joueurs, les vagues et les
loots emploient encore `Math.random()`.

## Cycle jour/nuit et pression des vagues

| Élément | État | Comportement du prototype |
|---|---|---|
| Journée | Implémenté | 90 secondes d'exploration et de récolte. |
| Transitions | Implémenté | Quatre secondes entre jour et nuit, puis entre nuit et jour. |
| Nuit | Implémenté | Pas de durée fixe ; elle se termine lorsque tous les monstres de la vague sont morts. |
| Difficulté | Implémenté | Le budget de poids de la vague augmente avec le palier et le nombre de joueurs, avec un plafond. |
| Fin de partie | Implémenté | Destruction de la Tour uniquement. |
| Victoire | Absente | La partie continue de palier en palier sans objectif final. |

La vague apparaît sur six origines disposées autour de la Tour. Il n'existe pas de
téléportation des joueurs à la tombée de la nuit. En revanche, le prototype ne crée
pas explicitement un danger nocturne croissant aux confins : ce risque résulte surtout
de l'éloignement des défenses et de la difficulté à revenir.

## Personnages et combat

La création impose deux classes distinctes dont le budget total ne dépasse pas deux
mains.

| Classe | Coût | Orientation | Capacités actives de base |
|---|---:|---|---|
| Épée | 1 | Offensive | Taillade, Fente |
| Bouclier | 1 | Défensive | Charge, Posture |
| Arc | 2 | Offensive | Tir perçant, Salve |
| Marteau | 2 | Offensive | Onde de choc, Brise-crâne |
| Feu | 1 | Offensive | Boule de feu, Mur de flammes |
| Barrière | 1 | Défensive | Bouclier magique, Dôme |
| Soin | 0 | Soutien | Soin, Régénération |
| Foudre | 2 | Offensive | Éclair, Orage |

Chaque classe possède aussi un tir de base. Les quatre capacités issues des deux
classes sont affectées aux touches A/Z/E/R. Le client envoie des intentions et le
serveur vérifie portée, cooldowns et dégâts.

Les attaques ennemies sont conçues en deux temps : une zone annonce l'impact pendant
0,6 seconde, puis les dégâts sont appliqués si les conditions restent valides. Le
recul dépend du poids du monstre. Cette intention de rendre l'esquive lisible est
forte, même si l'auto-vérification correspondante échoue dans le commit analysé.

Les éliminations donnent de l'expérience au tueur. Le niveau augmente les points de
vie maximaux et applique un bonus de 4 % par niveau à plusieurs valeurs de combat. Le
prototype persiste ensuite ce niveau entre les parties, ce qui contredit la règle V1
désormais validée.

### Catalogue de compétences non intégré

Le dépôt contient un catalogue de 136 compétences — exactement 17 par classe — et
680 runes, cinq par compétence. Les déblocages s'étendent des niveaux 1 à 70 et
couvrent des styles offensifs, défensifs, de soutien, de mobilité, de contrôle et de
coopération.

Ce catalogue n'est importé ni par le serveur ni par le client : il décrit une vision,
pas un système jouable. De plus, le niveau maximal du moteur est 50 alors que certains
déblocages exigent le niveau 60, 65 ou 70. Les identifiants de runes de quatre classes
ne sont pas uniques dans leur propre catalogue.

Cette matière doit être conservée comme bibliothèque d'idées, puis fortement éditée et
validée. L'intégrer telle quelle créerait un volume de contenu disproportionné avant
que la boucle principale soit éprouvée.

## Monstres

Le bestiaire contient 15 variantes : trois comportements multipliés par cinq poids.

| Famille | Intention | Cible principale |
|---|---|---|
| Campeur | Défend une ressource et retourne à son poste | Joueur qui approche du gisement |
| Chasseur | Met les personnages sous pression | Joueur le plus proche |
| Assaillant | Force la défense collective | Tour, puis constructions rencontrées |

Le poids augmente les points de vie, les dégâts, la portée et l'expérience accordée,
mais réduit légèrement la vitesse. Les noms vont du Guetteur, Rôdeur ou Piétaille aux
Colosse minier, Grand Fauve ou Béhémoth.

Il n'existe pas de boss singulier, de composition scénarisée, d'affixes ou de
synergies de vague. Le système de budget est néanmoins une bonne base conceptuelle
pour composer une pression adaptée au nombre de joueurs.

## Ressources, métiers et production

Huit ressources récoltables sont définies : bois, pierre, fibres, fer, argent,
cristal, rubis et cœur d'ombre. Leur rareté va de 1 à 5 et dépend du biome et de la
distance.

La récolte :

- dure deux secondes et peut être interrompue ;
- exige que le métier de récolteur atteigne la rareté de la ressource ;
- ajoute les ressources à un inventaire individuel ;
- fait progresser le métier de récolteur.

Le métier de crafteur progresse avec les constructions et productions. Les ressources
peuvent financer deux défenses :

- mur : structure résistante sans attaque ;
- tourelle : cible automatiquement le monstre le plus proche à portée.

La Tour produit quatre recettes : planches, lingot de fer, potion de soin et balise de
rappel. Deux modes sont proposés : production différée moins chère dans une file
séquentielle, ou production instantanée plus coûteuse avec canalisation.

La potion fonctionne. La balise de rappel est produite, mais aucun comportement ne la
consomme. Les productions sont livrées à l'inventaire du joueur initiateur, y compris
lorsqu'il s'est éloigné.

## Village et défenses

Le « village » est représenté par une Tour de 2 000 points de vie. Elle :

- constitue la cible des assaillants ;
- porte la file de production ;
- possède une interface dédiée ;
- provoque la fin de partie lorsqu'elle est détruite.

La Tour ne possède aucun arbre de développement, niveau, compétence, capacité de
soin, défense intégrée ou prérequis de victoire. Les murs et tourelles sont placés
librement par les joueurs, payés depuis leur inventaire individuel et peuvent être
détruits. Leur réparation n'est pas implémentée.

## Mort, coopération et fin de partie

Un personnage mort ressuscite automatiquement après huit secondes avec la moitié de
ses points de vie, près de la Tour, quelle que soit la phase du cycle. Tous les joueurs
morts ne provoquent donc pas de défaite.

Le prototype prend en charge des salons d'un à dix joueurs, un leader, un code de
salon, un chat, une interpolation simple et un serveur autoritaire. La partie continue
si un joueur se déconnecte et la room est détruite lorsqu'elle devient vide. La
reconnexion à une partie en cours n'est pas réellement exposée par le parcours.

Ces règles sont des références, pas le modèle cible : le nouveau cadrage prévoit deux
à quatre joueurs à terme et une V1 locale, sans compte.

## Quêtes et persistance

Neuf quêtes sont présentes : premières actions, compteurs de partie, palier 10,
partie à cinq joueurs et course de récolte chronométrée. Leurs récompenses annoncent
armes, sorts, artefacts ou plans.

Les récompenses sont ajoutées à une réserve persistante, mais aucun système ne permet
de les équiper ou de leur appliquer un effet. Les comptes, personnages, niveaux,
métiers, réserve et quêtes accomplies sont enregistrés dans un fichier JSON ou dans
PostgreSQL.

Cette persistance ne correspond pas à la V1 one-shot. Les quêtes peuvent néanmoins
inspirer plus tard des objectifs facultatifs propres à une partie.

## Interface et game feel

Le rendu emploie des formes géométriques et quelques projectiles pixel art. Il propose
notamment :

- caméra centrée sur le joueur ;
- minimap ;
- anneaux de distance ;
- teintes de biomes et voile nocturne ;
- points de vie, expérience, inventaire et métiers ;
- cooldowns des quatre capacités ;
- panneau de quêtes ;
- interface de production de la Tour ;
- télégraphes, nombres de dégâts, recul, particules et secousse d'écran ;
- sons synthétisés pour les principales actions.

Le style graphique n'est pas une direction artistique à reprendre. Les intentions de
lisibilité, de feedback et de réglages d'accessibilité constituent en revanche une
bonne référence fonctionnelle.

## Constats techniques qui affectent l'interprétation

Ces constats n'ont pas pour but de réhabiliter l'ancien code ; ils indiquent seulement
le degré de confiance à accorder aux fonctionnalités observées.

- Les règles serveur sont partiellement séparées en modules sans réseau, ce qui rend
  plusieurs concepts lisibles et testables.
- La simulation complète dépend de minuteries réelles, de deux fréquences de boucle et
  de plusieurs appels à `Math.random()` ; elle n'est pas déterministe.
- Les auto-vérifications sont intégrées aux fichiers source et ne forment pas une suite
  de régression standard.
- Le catalogue de compétences est entièrement dormant.
- Plusieurs récompenses et objets n'ont aucun effet jouable.
- Les paramètres d'équilibrage sont en partie centralisés, mais beaucoup de valeurs
  restent dans les implémentations.
- Le dépôt public contient des identifiants de secours codés en dur. Leurs valeurs ne
  doivent pas être reproduites ; elles doivent être révoquées si elles sont utilisées
  ailleurs.
- Le dépôt ne contient pas de licence. Aucun code ou asset ne doit être copié dans le
  nouveau projet sans autorisation et vérification de provenance distinctes.
