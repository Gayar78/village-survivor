# ADR-0012 — Mode solo local dégradé lorsque le serveur est confirmé indisponible

> Statut : accepté
> Date : 6 août 2026
> Décideur : Gayar
> Complète : [ADR-0011 — Serveur de jeu autoritaire pour toutes les parties](ADR-0011-authoritative-game-server.md)

## Contexte

L'ADR-0011 a fait du serveur Colyseus l'autorité de toutes les parties afin de valider les
commandes, la progression et les récompenses. Après son adoption, un repli local a néanmoins été
introduit pour garder le solo jouable sur un hébergement statique. Il contredisait l'ADR sans le
signaler au joueur : le navigateur pouvait démarrer une partie sans créditer l'or, les statistiques
ni une trace serveur distribuée.

Le repli initial confondait également un timeout de 1,5 seconde avec l'absence du serveur. Sur la
stack LAN, un `game-server` encore en démarrage répond à `/health` en environ deux secondes : une
partie pouvait donc quitter silencieusement la voie autoritaire alors que celle-ci devenait
disponible.

## Décision

Le serveur reste la voie par défaut de toute partie solo. Avant de choisir une session, le client
effectue **deux** requêtes `GET /health`, chacune bornée à trois secondes :

- une réponse JSON exacte `{ "status": "ok" }` démarre `TowerServerSession` ;
- une ou plusieurs **réponses HTTP reçues** mais non saines autorisent `TowerLocalSession` ;
- deux timeouts, aborts ou erreurs de transport ne prouvent pas l'absence du serveur : la partie
  affiche une erreur et ne démarre pas localement.

Le mode local partage `TowerSimulation` avec le serveur, mais constitue un chemin dégradé : il ne
peut ni coopérer, ni finaliser de récompense, ni écrire de statistique, ni produire une trace
distribuée côté serveur. Il affiche pendant toute la partie la mention non terminale **« Mode local
— progression non enregistrée »**.

Les multiplicateurs de méta-build lus depuis `sessionStorage` sont limités à la liste fermée du
protocole et bornés à `[0,5 ; 2]`, les mêmes bornes que la simulation. Cette validation ne rend pas
la progression locale fiable : elle évite seulement qu'un état de navigateur arbitraire entre dans
le moteur.

Le span navigateur de partie conserve son mode fonctionnel (`solo` ou `coop`) et reçoit, après la
sélection, `vs.execution.mode` avec l'une des deux valeurs fermées
`authoritative-server` ou `local-fallback`. Aucune identité, room, seed ou valeur de build ne
devient un attribut.

## Conséquences

- un hébergement statique garde un solo jouable lorsqu'aucun serveur de jeu n'est disponible et
  qu'une réponse HTTP le confirme ;
- le joueur ne peut pas confondre ce secours avec une partie qui sauvegarde sa progression ;
- une indisponibilité réseau ambiguë privilégie l'intégrité de la progression plutôt que la
  disponibilité immédiate ;
- deux chemins d'exécution subsistent et doivent rester couverts par des tests de sélection,
  d'abonnement, d'arrêt et de commandes ponctuelles.

## Alternatives écartées

**Conserver l'interdiction totale de solo local.** Elle maintient une seule autorité, mais retire
le jeu aux déploiements statiques que le propriétaire souhaite toujours supporter.

**Basculer dès le premier timeout ou échec réseau.** Cette option paraît plus disponible, mais
masque un démarrage à froid du serveur et peut faire jouer sans progression enregistrée alors que
l'autorité est présente quelques instants plus tard.

**Faire persister la progression locale puis la synchroniser.** Cela recréerait une seconde
autorité économique et des conflits de fusion. Le coût dépasse le périmètre du secours solo.

## Vérification

- `apps/client/src/net/TowerSoloFallbackSession.test.ts` couvre les réponses saine/non saine,
  l'incertitude de transport, la seconde tentative, les abonnements anticipés, le rejeu d'entrée
  et `stop()` pendant la sélection ;
- `apps/client/src/net/TowerLocalSession.test.ts` couvre la file d'actions ponctuelles, le signal
  local et la validation fermée des multiplicateurs ;
- `apps/client/src/observability/trace-contract.test.ts` reste le contrat des attributs de trace
  sans données interdites.
