# Village Survivor — Journal de développement

> Version du projet : v2
> Propriétaire : Gayar
> Dernière mise à jour : 6 août 2026

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
| 03/08 | Revue indépendante de la boucle 1 | Aucun P0–P2 ; deux P3 de preuve retenus et corrigés | Les vagues actives sans mort et le contact kamikaze sont désormais couverts explicitement | `qualite/rapport-tests.md` |
| 03/08 | Autorité solo | Le matchmaker Colyseus exige un ticket serveur opaque à usage unique en plus du JWT de jonction | Sans ce second verrou, son endpoint natif aurait pu tenter de forger roster, seed et bonus en contournant `POST /rooms` | `architecture.md`, `apps/server/README.md` |
| 03/08 | Dépendances Colyseus | Auto-installation des peers désactivée ; transports et scripts de build sont explicitement autorisés | Le peer `uWebSockets.js`, inutilisé, imposait une archive GitHub de 38,5 Mio et une surface native supplémentaire | `pnpm-workspace.yaml`, `deployment.md` |
| 03/08 | Revue indépendante de la boucle 2 | Aucun P0–P2 ; trois P3 retenus et corrigés | Les événements ne perdent plus de lot, la création est limitée et une panne terminale retourne au lobby | `qualite/rapport-tests.md` |
| 03/08 | Coopération autoritaire | Le lobby ne diffuse plus seed, roster, bonus ou autorité d'hôte : seulement le `roomId` opaque déjà réservé | L'admission et la reprise sont désormais décidées par la room ; Supabase reste un transport de lobby non fiable | `architecture.md`, `apps/server/README.md` |
| 03/08 | Reconnexion Colyseus | La coupure réseau est distinguée de la sortie volontaire par `onDrop`/`onLeave` | Cette frontière permet de neutraliser immédiatement sans supprimer l'avatar avant trente secondes | `gameplay/current-rules.md`, `qualite/rapport-tests.md` |
| 03/08 | Revue indépendante de la boucle 3 | Aucun P0–P2 ; deux P3 de minimisation retenus et corrigés | La seed quitte le Schema et les bonus persistants quittent la présence du hub | `qualite/rapport-tests.md` |
| 03/08 | Transport des contrôles | `control` utilise `send` malgré l'intention initiale « non fiable » | Le transport WebSocket Colyseus ignore `sendUnreliable`; séquence, cadence et expiration conservent la sémantique remplaçable | `ADR-0011`, `apps/server/README.md` |
| 03/08 | Récompenses autoritaires | Journal de run et crédit d'or réunis dans une RPC transactionnelle réservée à `service_role` | Deux appels concurrents doivent rester sans double crédit et le navigateur ne doit plus créer de valeur | `0006_authoritative_game_rewards.sql`, `spec-fonctionnelle.md` |
| 03/08 | Mesure des patches | Instrumentation du buffer réellement encodé autour de `broadcastPatch` | Une projection JSON complète surestimait le trafic et ne mesurait pas le contrat annoncé | `observabilite.md`, `TowerRoom.ts` |
| 03/08 | Propagation distribuée | Injection/extraction explicite du `traceparent` sur `POST /rooms` | Enregistrer des spans des deux côtés ne suffit pas à produire une trace distribuée | `observabilite.md`, `TowerServerSession.ts` |
| 03/08 | Revue indépendante de la boucle 4 | Aucun P0–P2 ; quatre P3 retenus et corrigés | La charge traverse le runtime, la mesure de patch est testée, les authentifications incomplètes expirent et une perte de persistance devient explicitement observable | `qualite/rapport-tests.md`, `apps/server/README.md` |
| 04/08 | Précision du p95 serveur | Les buckets OpenTelemetry par défaut `0–5 ms` ont produit un p95 apparent de 4,75 ms malgré 0,505 ms de moyenne | Le seuil produit de 1 ms exige une frontière dédiée ; quatorze frontières ciblées remplacent quinze frontières génériques sans alourdir la boucle | `observabilite.md`, `qualite/rapport-tests.md` |
| 06/08 | Bestiaire Torri | La spécification fournie décrit une cible plus large que le comportement réellement présent | La matrice espèce par espèce expose désormais les écarts `partiel` et `non tenu` au lieu de les masquer par une nomenclature commune | `gameplay/torri-monster-integration-spec.md` |
| 06/08 | Secours solo local | Un repli local est admis seulement après deux réponses de santé réellement en échec, à trois secondes d'intervalle | Une erreur de transport ou une annulation ne prouve pas l'état du serveur et doit échouer vers l'utilisateur, sans simulation locale silencieuse | `decisions/ADR-0012-solo-local-fallback.md`, `deployment.md` |
| 06/08 | Équilibrage des boss | Les rapports PV calculés à la vague 30, 60 et 90 sont conservés malgré leur niveau élevé | Changer ces valeurs sans décision produit modifierait la difficulté historique ; le point est ouvert dans l'état de projet | `gameplay/torri-monster-integration-spec.md`, `.sdp/etat.json` |
| 06/08 | Dette technique Torri | Signatures dérivées du catalogue, profils mémorisés, boucle de vague sans filtre répété et abonnements de fallback indépendants | Ces corrections réduisent les allocations et les ambiguïtés de typage sans scinder les longues transitions de simulation, dont le déterminisme reste prioritaire | `tower-monsters.ts`, `monster-behaviors.ts`, `simulation.ts`, `TowerSoloFallbackSession.ts` |
| 06/08 | Cerf du Temps | Retrait complet du roster et du protocole, conservation de la seule entrée `excluded` documentaire | La cible produit exclut cette créature passive ; la laisser accessible à la simulation contredisait cette décision | `gameplay/torri-monster-integration-spec.md`, `content/tower.ts` |
| 06/08 | Décalage de version client/serveur | **Une rupture de contrat annoncée dans le journal des changements ne protège rien** : le client doit tolérer une valeur hors contrat | Une partie réelle a tourné avec un client à jour et un serveur antérieur au bestiaire. Le jeu semblait fonctionner ; le rendu produisait en réalité des rayons `NaN` et des couleurs indéfinies, sans erreur ni trace | `protocol/tower.ts`, `TowerServerSession.ts`, `TowerScene.ts` |
| 06/08 | Tampon d'encodage Colyseus | Le défaut de 8 Kio a été dépassé en exploitation, sans que rien ne le signale hors des journaux du conteneur | L'avertissement `buffer overflow` du 4 août est la seule preuve : le « patch p95 » du test de charge est une projection JSON, borne supérieure de l'état, et ne se compare pas à un tampon binaire. Le test comme la télémétrie étaient aveugles à ce dépassement | `apps/server/src/index.ts`, `observabilite.md` |
| 06/08 | Diagnostic d'indisponibilité | Un échec de lancement observé n'a pas pu être expliqué : la trace disait « indisponible » sans distinguer expiration de délai et échec de transport | Le message d'erreur était un texte libre. Un code fermé (`vs.server.health`) était nécessaire pour filtrer une trace | `TowerSoloFallbackSession.ts`, `observabilite.md` |

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
- ~~la projection d'état et le calcul d'empreinte ne sont pas mesurés~~ — le P2P et ses empreintes
  ont été retirés ; la taille encodée des patches serveur est maintenant mesurée ;
- ~~la fenêtre de reconnexion P2P a été remplie à 83 %~~ — remplacée par un état complet serveur
  et une fenêtre fixe de trente secondes ;
- ~~une divergence est survenue au tick 18220~~ — la migration élimine cette classe de défaut en
  n'exécutant plus plusieurs simulations clientes ;
- ~~le crédit d'or est déclaré par le navigateur~~ — remplacé par `finalize_game_run`; les
  statistiques historiques de profil restent un sujet distinct.

## Ce que la méthode a fait gagner

Deux gardes ajoutées pendant le développement ont trouvé des défauts que la relecture n'avait pas
vus :

- la garde de lint sur les fonctions approximées a révélé un vingt-neuvième appel — l'opérateur de
  puissance des seuils de niveau — que la recherche manuelle avait manqué ;
- le test de contrat d'observabilité a révélé que les spans enfants n'étaient rattachés à rien.

Aucune des deux n'aurait été trouvée par un test fonctionnel.
