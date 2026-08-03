# Village Survivor — Journal de développement

> Version du projet : v2
> Propriétaire : Gayar
> Dernière mise à jour : 3 août 2026

Ce journal consigne les **écarts entre ce que les spécifications prévoyaient et ce que le code a
imposé**, ainsi que les décisions prises en chemin. Il ne raconte pas ce qui a été construit —
Git et le journal des changements s'en chargent — mais ce qui a surpris, et pourquoi.

## Écarts et décisions

| Date | Fonctionnalité | Écart ou décision | Raison | Document affecté |
|---|---|---|---|---|
| 31/07 | Purge de l'ancien jeu | 38 fichiers et 7 612 lignes supprimés, tests de 167 à 100 | La documentation décrivait un jeu qui n'existait plus dans le code | `ROADMAP.md`, `CHANGELOG.md` |
| 31/07 | Déploiement LAN | Pile Docker à cinq services au lieu d'un hébergement public | Aucun budget, aucune ouverture publique dans le périmètre | `deployment.md` |
| 01/08 | Déterminisme | **La spécification supposait le déterminisme acquis ; il ne l'était pas** | `Math.cos`, `sin`, `atan2`, `hypot` sont approximés par l'implémentation et diffèrent entre navigateurs | [ADR-0008](decisions/ADR-0008-p2p-lockstep-coop.md), `architecture.md` |
| 01/08 | Prédiction de rendu | L'ADR-0008 interdisait « toute prédiction » ; l'interdiction ne portait que sur la simulation | Le retard de 150 à 200 ms rendait le jeu désagréable et l'affichage n'engage pas le lockstep | [ADR-0010](decisions/ADR-0010-local-render-prediction.md) |
| 01/08 | Télémétrie | Troisième famille de mesures — usage produit — retirée du périmètre | Décision du propriétaire : un cercle de joueurs si restreint se renseigne mieux par la conversation | `observabilite.md`, `spec-nf.md` |
| 02/08 | Cache HTTP | Ajout d'un en-tête `Cache-Control` et d'un identifiant de build dans l'URL | Deux sessions de test ont mesuré une build périmée sans que rien ne le signale | `deployment.md`, `feedback.md` |
| 02/08 | Horloge d'entrées | Capture pilotée par le temps réel, non par le nombre de déclenchements d'un minuteur | Le jeu tournait 8 % trop lentement et la prédiction se désactivait en silence | `feedback.md` |
| 02/08 | Traces | Ancrage explicite du span de partie, faute de contexte propagé par le navigateur | Les spans enfants formaient chacun leur trace et les journaux partaient sans corrélation | `observabilite.md` |
| 03/08 | Ferraille bornée | Suppression complète de la génération naturelle et durée de vie fixée à 600 ticks, avec ramassage prioritaire au tick limite | Décision fonctionnelle validée : seuls les monstres créent des tas ; une borne temporelle préserve l'économie tout en supprimant la fuite | `spec-fonctionnelle.md`, `gameplay/current-rules.md` |

## Difficultés et dette potentielle

**Ce qui a coûté le plus cher n'a pas été le code, mais l'écart entre ce qu'on croyait mesurer et
ce qu'on mesurait.** Trois fois de suite, une conclusion s'est révélée fausse parce qu'une
hypothèse n'avait pas été vérifiée :

1. la cause de la désynchronisation a d'abord été attribuée à un cache, puis établie par mesure
   comme arithmétique ;
2. deux sessions de test ont porté sur une build périmée, ce que seul le journal de la passerelle
   a révélé ;
3. la télémétrie a semblé muette alors qu'elle émettait : le collecteur refusait les lots pour un
   en-tête dupliqué, en silence, par conception.

La leçon vaut pour la suite : **instrumenter le chemin de bout en bout avant d'en tirer une
conclusion**, y compris le chemin de la télémétrie elle-même.

Dette identifiée pendant le développement, reprise au backlog :

- ~~la ferraille au sol croît sans limite~~ — **résolu dans la boucle 1 de la v2** : aucun tas
  naturel et expiration après 600 ticks ;
- **la projection d'état et le calcul d'empreinte ne sont pas mesurés**, alors que leur coût croît
  avec la taille de l'état ;
- **la fenêtre de reconnexion** a été remplie à 83 % par une partie de seize minutes ;
- **une divergence est survenue au tick 18220** d'une partie de seize minutes, sans cause établie ;
- **le crédit d'or de fin de partie est déclaré par le navigateur**, et `recordGameResult` n'est
  toujours appelé par personne : les statistiques de profil restent à zéro.

## Ce que la méthode a fait gagner

Deux gardes ajoutées pendant le développement ont trouvé des défauts que la relecture n'avait pas
vus :

- la garde de lint sur les fonctions approximées a révélé un vingt-neuvième appel — l'opérateur de
  puissance des seuils de niveau — que la recherche manuelle avait manqué ;
- le test de contrat d'observabilité a révélé que les spans enfants n'étaient rattachés à rien.

Aucune des deux n'aurait été trouvée par un test fonctionnel.
