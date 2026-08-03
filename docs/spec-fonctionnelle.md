# Village Survivor — Spécification fonctionnelle v2

> Statut : approuvé — cible en cours de réalisation
> Version du projet : v2
> Propriétaire : Gayar
> Dernière validation : 3 août 2026
> Niveau de garantie requis : `renforce`

Cette spécification traduit le plan validé du 3 août 2026 en comportements observables. Les
valeurs de combat qui ne sont pas citées restent celles de
[`gameplay/current-rules.md`](gameplay/current-rules.md). La stratégie de vérification complète
est dans [`qualite/strategie-tests.md`](qualite/strategie-tests.md).

## Parcours principal

1. Le joueur s'authentifie dans le lobby Supabase et satisfait le second facteur requis.
2. En solo, le lobby demande une room à une place. En coopération, le chef réserve le roster,
   crée la room et diffuse seulement son `roomId`.
3. Chaque navigateur rejoint la room avec son identité authentifiée. Le serveur charge les
   bonus persistants, produit la seed et démarre exactement le roster attendu.
4. Le navigateur envoie des commandes ; le serveur simule ; le client interpole les états reçus
   et prédit visuellement son avatar sur une courte distance.
5. Les monstres produisent la ferraille au sol. Les quêtes créditent directement la caisse
   commune. Les tas non ramassés disparaissent après 600 ticks.
6. Une coupure permet de reprendre le même avatar pendant 30 secondes. Au-delà, le joueur est
   expulsé définitivement de cette partie.
7. À la défaite, le serveur finalise une seule fois l'or de tous les participants. Une room
   abandonnée ne crédite rien.

Toutes les parties exigent le serveur. Il n'existe ni solo hors ligne, ni fallback P2P.

## Périmètre de la migration

| Fonctionnalité | Incluse |
|---|:---:|
| Ferraille produite uniquement par les monstres et bornée à 30 s | oui |
| Solo entièrement autoritaire | oui |
| Coopération à 2–10 joueurs et roster exact | oui |
| Reconnexion 30 s, expulsion et abandon | oui |
| Récompenses d'or idempotentes côté serveur | oui |
| Déploiement LAN, santé et télémétrie serveur | oui |
| Persistance d'une room après redémarrage | non |
| Mode hors ligne | non |
| Ouverture Internet et TLS | non |
| Condition de victoire | non, inchangée |

## F-001 — Créer une room authentifiée

Le lobby demande au serveur une room solo ou coopérative avec le JWT Supabase courant.

**Critères d'acceptation**

- le solo réserve uniquement l'identité portée par le JWT ;
- la coopération accepte un roster unique de 2 à 10 identités, comprenant le créateur ;
- la réponse contient seulement un `roomId` et une échéance d'admission ;
- `runId`, seed et bonus persistants sont produits ou chargés côté serveur ;
- aucun jeton n'est écrit dans `sessionStorage`, un log ou une émission de télémétrie.

**Erreurs et accès**

- JWT absent, invalide ou expiré → `unauthorized`, aucune room créée ;
- roster dupliqué, trop grand ou sans le créateur → `invalid-roster` ;
- PostgREST indisponible → erreur lisible et retour au lobby, pas de bonus par défaut silencieux ;
- débit de création excessif → `rate-limited`.

| Cas | Attendu |
|---|---|
| JWT valide, solo | room à une place réservée au demandeur |
| JWT invalide | refus sans allocation persistante |
| roster `[A, A]` ou 11 joueurs | refus déterministe |
| valeurs sentinelles dans JWT/courriel | absentes des logs et spans |

**Diagnostic :** span `game.room.create`, erreurs structurées à code fermé. Données interdites :
identité, courriel, JWT, `SERVICE_ROLE_KEY`, `JWT_SECRET`.

## F-002 — Démarrer une partie solo autoritaire

Le joueur rejoint sa room et reçoit un état complet avant le premier rendu jouable.

**Critères d'acceptation**

- une seule `TowerSimulation` serveur avance toutes les 50 ms ;
- le bonus chargé est figé pendant la partie ;
- l'état partagé expose `players`, jamais l'alias personnalisé `player` ;
- l'adaptateur client reconstruit `player` depuis l'identité locale ;
- scène, HUD, niveau et boutiques continuent de consommer `TowerRenderableSession` ;
- serveur absent ou coupé → message lisible et retour au lobby, sans simulation locale.

| Cas | Attendu |
|---|---|
| lancement nominal | état initial puis ticks croissants |
| seconde connexion de la même identité | refus `already-connected` |
| navigateur seul sans serveur | erreur visible, aucun monde simulé |
| état reçu | `player` local égal à l'entrée correspondante de `players` |

**Diagnostic :** racine serveur `game.room`, enfants `game.room.admit` et `game.room.start` ;
session navigateur `game.client.session`.

## F-003 — Démarrer une coopération avec roster exact

Le chef crée la room et le lobby Supabase diffuse uniquement son `roomId` aux invités.

**Critères d'acceptation**

- seuls les membres réservés peuvent rejoindre ;
- la room attend exactement le roster au plus 15 secondes ;
- tous les membres présents démarrent sur le même tick et le même état partagé ;
- un membre manquant annule la room ; aucun roster partiel ne démarre ;
- une room pleine, une identité étrangère et une double connexion sont refusées.

| Cas | Attendu |
|---|---|
| deux puis quatre membres présents | démarrage simultané |
| un membre manque à 15 s | phase `abandoned`, aucun tick de jeu |
| identité hors roster | refus `not-in-roster` |
| deux clients connectés | même tick et même état ; seul l'alias local `player` diffère |

**Diagnostic :** `game.room.admit`, `game.room.start`, durée d'attente et motif d'annulation ;
aucun roster nominatif dans les signaux.

## F-004 — Envoyer des commandes sans autorité cliente

Le client envoie une commande continue `control` et des actions discrètes `action`.

**Critères d'acceptation**

- `control` contient séquence, déplacement, visée, tir et état d'atelier, au plus 30/s ;
- `action` est une union fermée niveau/arme/boutique, fiable, au plus 10/s ;
- chaque action porte un `actionId`, dédupliqué ; la file n'excède jamais 16 ;
- les nombres doivent être finis et bornés ; les séquences anciennes sont ignorées ;
- la dernière commande continue expire après 250 ms, puis devient neutre ;
- le client n'envoie jamais position, dégâts, récompense, tick, seed, roster effectif ou état.

| Cas | Attendu |
|---|---|
| contrôle valide | appliqué au tick suivant disponible |
| `NaN`, infini, axe > 1 ou séquence ancienne | refus compté, simulation intacte |
| même `actionId` deux fois | effet appliqué une fois |
| 17 actions en attente ou débit dépassé | excédent refusé sans déconnecter la room |
| silence > 250 ms | déplacement et tir neutralisés |

**Diagnostic :** compteur `vs.game.command.rejected` par type et raison fermée ; aucune commande
valide journalisée ou tracée individuellement.

## F-005 — Rendre l'état et les événements

Le serveur synchronise phase, tick, monde, joueurs, Cœur, tourelles, monstres, projectiles,
ferraille, vague, boutiques et quête par Schema. Les événements éphémères utilisent un canal
fiable et ordonné.

**Critères d'acceptation**

- un événement `TowerEvent` n'est traité qu'une fois grâce à son identifiant ;
- les deux derniers états sont interpolés ;
- la prédiction locale reste purement visuelle et bornée à deux ticks ;
- tout état serveur réinitialise la prédiction ;
- un patch malformé ou une version incompatible provoque un retour propre au lobby.

| Cas | Attendu |
|---|---|
| événement retransmis | un seul effet visuel/sonore |
| correction autoritaire | avatar local recollé sans modifier l'état serveur |
| patch p95 en charge | inférieur à 64 Kio par client |

**Diagnostic :** histogrammes de taille des patches et délai commande→état ; aucun span par patch.

## F-006 — Produire et retirer la ferraille

La ferraille au sol provient exclusivement de la mort d'un monstre, quelle qu'en soit la cause.

> État : **implémenté et vérifié le 3 août 2026**. Les autres fonctionnalités de cette
> spécification restent la cible des boucles suivantes.

**Critères d'acceptation**

- aucune apparition périodique, minuterie naturelle ou position aléatoire de ferraille n'existe ;
- chaque mort produit un tas de valeur `monster.reward` au tick de la mort ;
- le tas expire à `dropTick + 600`, soit 30 secondes de simulation ;
- le ramassage est traité avant l'expiration : au tick limite, un joueur à portée le collecte ;
- `expiresAtTick` reste interne au moteur et n'est pas exposé dans `ScrapPickupState` ;
- une expiration émet `scrap-expired` pour les tests et métriques ;
- les quêtes continuent de créditer directement `scrapFund`, sans tas au sol.

| Cas | Attendu |
|---|---|
| 1 000 ticks sans mort | aucun tas apparu |
| monstre récompense 3 tué par joueur, tourelle, brûlure ou contact kamikaze | un tas de 3 |
| tas non ramassé | présent jusqu'au tick 599, absent après traitement du tick 600 |
| joueur à portée au tick limite | ferraille créditée, aucun `scrap-expired` |
| quête terminée | caisse créditée directement, nombre de tas inchangé |
| partie longue | aucun tas plus vieux que 600 ticks, population bornée par les morts récentes |

**Diagnostic :** `monster-killed` matérialise la source, `scrap-collected` le ramassage et
`scrap-expired` l'expiration. Les métriques serveur agrégées de population/expiration arrivent
avec la boucle d'exploitation ; aucun span n'est créé par tas.

## F-007 — Gérer coupure, reconnexion et départ

Une coupure réseau ne retire pas immédiatement l'avatar de la partie.

**Critères d'acceptation**

- dès la coupure, l'entrée devient neutre ; l'avatar reste présent et vulnérable ;
- pendant 30 secondes, une reconnexion récupère le même avatar et un état complet ;
- après 30 secondes, l'avatar est retiré à la prochaine frontière de tick ;
- une identité expirée ne peut jamais rejoindre à nouveau cette room ;
- une sortie volontaire retire immédiatement l'avatar ;
- si aucun joueur actif ne reste, la room passe à `abandoned`.

| Cas | Attendu |
|---|---|
| coupure 10 s | même identifiant d'avatar et état complet au retour |
| coupure 31 s | avatar retiré, retour `reconnect-expired` |
| sortie volontaire | retrait au tick suivant sans fenêtre d'attente |
| dernier joueur parti | phase `abandoned` et aucune récompense persistée |

**Diagnostic :** span `game.room.reconnect`, compteur par `success`, `expired`, `voluntary` et
`room-abandoned`. Aucun identifiant de joueur dans les attributs.

## F-008 — Finaliser les récompenses

Le serveur conserve l'or gagné par tous les participants, y compris ceux retirés avant la fin.

**Critères d'acceptation**

- une défaite normale crédite chaque participant du montant enregistré par le serveur ;
- une room abandonnée ne crédite personne ;
- `finalize_game_run` valide les montants, insère les récompenses absentes, crédite les
  portefeuilles dans la même transaction et marque la partie terminée ;
- `(run_id, user_id)` est unique et deux appels concurrents n'ajoutent jamais deux fois l'or ;
- seul `service_role` peut exécuter la RPC ; le navigateur ne crédite plus l'or ;
- la room terminale reste disponible 60 secondes pour résultat et persistance.

| Cas | Attendu |
|---|---|
| joueur expulsé puis défaite normale | son or est crédité |
| deux finalisations simultanées | chaque portefeuille augmente une seule fois |
| montant négatif/non entier/hors borne | transaction refusée, aucun crédit partiel |
| room abandonnée | `game_runs` terminal sans récompense de portefeuille |
| PostgREST temporairement indisponible | résultat affiché, échec visible et retry idempotent côté serveur |

**Diagnostic :** span `game.room.persist`, compteur de crédits par résultat sans montant ni
identité en attribut. Une erreur est journalisée avec `runId` opaque, jamais un jeton.

## F-009 — Modes d'échec et exploitation

**Critères d'acceptation**

- `/game/health` distingue processus vivant et serveur prêt ;
- la télémétrie indisponible n'affecte aucune partie ;
- un redémarrage interrompt les rooms actives et les clients retournent au lobby ;
- les rooms, joueurs, retards de tick, patches, refus, reconnexions, ferraille et crédits sont
  mesurables sans données personnelles ;
- une room produit une trace `game.room`, jamais un span par tick ou commande.

| Cas | Attendu |
|---|---|
| collecteur éteint | solo et coop continuent normalement |
| serveur tué | clients informés puis ramenés au lobby |
| charge 20 min, 4 joueurs, 200 monstres | tick p95 < 1 ms, boucle < 50 ms, commande→état p95 < 150 ms, patch p95 < 64 Kio |
| solo et coop réels sur deux postes | traces distribuées complètes consultables |

## Rôles et droits

| Rôle | Droits |
|---|---|
| Joueur authentifié | créer/rejoindre une room autorisée, envoyer ses propres commandes, lire l'état de sa room |
| Chef coopératif | définir le roster et diffuser le `roomId` ; aucun pouvoir sur la simulation |
| Serveur `service_role` | charger les bonus et finaliser les récompenses |
| Administrateur de la machine | déployer et diagnostiquer ; aucun rôle exposé dans le jeu |

## Hypothèses maintenues

- réseau privé et de confiance, HTTP sans TLS ;
- 5 à 20 comptes, une ou deux rooms, dix joueurs maximum ;
- rooms en mémoire, aucune reprise après redémarrage ;
- indisponibilité sans conséquence métier ;
- condition de victoire et autres écarts produit historiques inchangés par cette migration.
