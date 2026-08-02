# ADR-0010 — Dessiner l'avatar local en avance sur la simulation

- Statut : **Accepté**
- Date : 1er août 2026
- Complète : [ADR-0008 — Coopération en lockstep pair-à-pair sans serveur](ADR-0008-p2p-lockstep-coop.md)
- Exigences concernées : `REQ-NET-002`, `REQ-ARCH-002`, `REQ-SIM-001`

## Contexte

La première session de jeu multijoueur réelle, le 1er août 2026, a produit un retour sans
ambiguïté : « de nombreux délais entre l'action de déplacement et le déplacement réel »
([`../feedback.md`](../feedback.md), constat 1).

La lecture du code chiffre ce délai. Entre l'instant où le joueur pousse une touche et l'instant
où son avatar bouge à l'écran s'accumulent :

| Étape | Retard |
|---|---|
| L'entrée attend la prochaine capture, qui a lieu vingt fois par seconde | 0 à 50 ms |
| Elle est mise en file deux ticks pour laisser aux pairs le temps de la recevoir (`TOWER_INPUT_DELAY_TICKS`) | 100 ms |
| L'affichage interpole entre les deux derniers ticks, donc montre le tick précédent | 50 ms |
| **Total** | **150 à 200 ms** |

S'y ajoutent les gels : la boucle n'avance au tick suivant que si l'entrée de **tous** les pairs
est arrivée. Un pair en retard fige l'image de tout le monde.

Aucun de ces retards n'est un défaut d'implémentation. Ce sont les conditions d'existence du
lockstep, que l'ADR-0008 énonçait déjà : « le rythme est celui du pair le plus lent ».

## Décision

**L'avatar local est dessiné à l'heure du joueur ; le reste du monde reste à l'heure de la
simulation.**

`TowerSimulation.predictPlayerPosition` rejoue la règle de déplacement à partir de la position
courante et des entrées locales **déjà diffusées**. La scène l'utilise pour la seule position de
l'avatar local ; la caméra le suit, donc le décor entier obéit sans délai.

Trois propriétés délimitent la décision.

1. **Aucune spéculation.** Les entrées employées sont celles que le joueur a déjà émises sur le
   canal : tous les pairs les appliqueront telles quelles. La position dessinée n'est pas un pari
   sur l'avenir, c'est un résultat connu d'avance. Il n'y a donc **rien à corriger**, et aucun
   recalage n'est jamais visible — contrairement à une prédiction classique, qui doit rattraper
   ses erreurs par un glissement ou un saut.
2. **Une seule règle de déplacement.** `movedPlayerPosition` est appelée par le pas de simulation
   et par la prédiction. Deux copies de la même formule dériveraient tôt ou tard ; une seule ne
   le peut pas.
3. **Le cœur de simulation n'est pas touché.** `predictPlayerPosition` ne modifie aucun état,
   n'avance aucun compteur, n'est jamais appelée par `step` et n'entre dans aucune empreinte. Un
   test le vérifie en comparant l'empreinte d'une partie ponctuée de prédictions à celle de la
   même partie sans aucune.

L'avance est **bornée à quatre ticks** (`TOWER_MAX_RENDER_LEAD_TICKS`, 200 ms, au plus 52 pixels
à pleine vitesse) et calculée pour ne jamais décroître dans le temps réel : un avatar dont
l'avance reculerait sauterait en arrière à chaque hoquet du réseau.

## Ce que cela coûte

**L'avatar local est montré ailleurs qu'où le monde le croit**, d'au plus 150 ms en marche
normale. Deux conséquences visibles :

- un monstre peut blesser un avatar qui paraît à quelques dizaines de pixels de lui ;
- une balle part de la position que la simulation fait autorité, donc légèrement en retrait du
  canon dessiné.

C'est l'arbitrage classique des jeux en réseau : ou bien l'avatar obéit et ment un peu sur sa
place, ou bien il dit vrai et n'obéit qu'après un délai. Le retour des joueurs tranche pour la
première branche — le délai a été rapporté, l'écart de position ne l'a pas été puisqu'il
n'existait pas encore.

**La valeur de quatre ticks demande une validation en partie réelle.** Elle arbitre entre
nervosité et fidélité de l'affichage, et cet arbitrage se juge manette en main, pas sur une
feuille.

## Ce que cela ne corrige pas

- **Les gels.** Quand un pair retarde le tick commun, le monde se fige toujours ; l'avatar local
  continue seulement d'obéir jusqu'au plafond d'avance. La cause — le rythme du pair le plus lent
  — appartient au modèle et relève d'une autre décision.
- **Les avatars alliés**, qui restent interpolés : leurs entrées futures ne sont pas connues de
  ce poste, et les anticiper serait, cette fois, un vrai pari.

## Alternatives écartées

- **Réduire `TOWER_INPUT_DELAY_TICKS`.** Cela raccourcit la file mais augmente mécaniquement les
  gels, puisque le délai existe précisément pour absorber la latence réseau. On échangerait un
  retard régulier contre des à-coups, ce que le retour décrit déjà comme le plus gênant.
- **Prédire puis corriger** (extrapoler l'entrée courante avant sa capture). Gagnerait au plus
  50 ms de plus, au prix de corrections visibles à chaque changement de direction. Le rapport
  entre le gain et l'artefact est mauvais.
- **Un serveur autoritaire avec rollback** ([ADR-0004](ADR-0004-authoritative-multiplayer-server.md)).
  Répond mieux au problème, mais c'est un projet, pas un correctif, et il rouvre l'hébergement et
  son coût.

## Vérification

- `packages/game-core/test/tower-prediction.test.ts` — égalité stricte entre prédiction et
  simulation, prorata de tick, normalisation diagonale, bornes du monde, avatar à terre,
  non-modification de l'état.
- `apps/client/src/net/towerSession.test.ts` — monotonie de l'avance à l'instant d'une capture,
  plafond en cas de blocage, fractions aberrantes.
