# Village Survivor — Traçabilité des exigences

> Statut : approuvé
> Version du projet : v2
> Propriétaire : Gayar
> Dernière revue : 3 août 2026

Relevée sur le code. Révision précédente : 21 juillet 2026, après livraison de M1.

## 1. Usage

Cette matrice empêche qu'une exigence du cadrage disparaisse pendant les incréments. Elle relie
chaque groupe d'exigences à sa décision d'architecture, à son emplacement réel et à son mode de
vérification.

Aucune ligne n'est supprimée. Une exigence qui n'est plus tenue reste présente avec l'état
**Non tenu** et un renvoi vers la décision qui l'a contredite.

## 2. Traçabilité

| Exigence | Décision ou référence | Implémentation réelle | Vérification | État au 31/07/2026 |
|---|---|---|---|---|
| `REQ-GOV-001` | Cadrage initial | Processus d'incrément | Revue de chaque livraison | Documenté |
| `REQ-GOV-002` | Cadrage initial | Gouvernance produit | Journal des décisions humaines | **Non tenu** — deux ruptures majeures livrées sans arbitrage ([0008](../decisions/ADR-0008-p2p-lockstep-coop.md), [0009](../decisions/ADR-0009-account-persistence.md)) |
| `REQ-SCOPE-001` | [ADR-0008](../decisions/ADR-0008-p2p-lockstep-coop.md) | Solo puis coopération, sans serveur | Tests de session et de roster | Implémenté par un autre chemin que prévu |
| `REQ-SCOPE-002` | [ROADMAP](../../ROADMAP.md) | Incréments verticaux, phases 1 à 5 | Tests Vitest par phase | Implémenté |
| `REQ-PRINCIPLES-001` | Cadrage initial | Toutes les couches | Revue d'architecture | Documenté |
| `REQ-PRINCIPLES-002` | [Vue d'architecture](../architecture.md) | Frontières de packages | TypeScript, ESLint et revue | Tenu |
| `REQ-STACK-001` | Cadrage initial | `apps/client`, Phaser 4.2.1, Vite 8 | Build | Implémenté |
| `REQ-STACK-002` | [ADR-0008](../decisions/ADR-0008-p2p-lockstep-coop.md) | Aucun serveur | — | **Abandonné** — remplacé par le lockstep P2P |
| `REQ-STACK-003` | [ADR-0001](../decisions/ADR-0001-pnpm-monorepo.md) | `package.json`, workspace et lockfile | Commandes racine et CI | Implémenté |
| `REQ-PERSISTENCE-001` | [ADR-0009](../decisions/ADR-0009-account-persistence.md) | Supabase Postgres, 4 migrations | Inspection du schéma | **Non tenu** — persistance livrée sans décision produit |
| `REQ-ARCH-001` | [ADR-0002](../decisions/ADR-0002-headless-fixed-step-simulation.md) | `packages/game-core/src/tower` | Tests Node, lint et types | Implémenté |
| `REQ-ARCH-002` | [ADR-0003](../decisions/ADR-0003-game-session-boundary.md) | Port `TowerSession`, sessions locale et lockstep | Tests de contrat de session | Implémenté |
| `REQ-ARCH-003` | [ADR-0001](../decisions/ADR-0001-pnpm-monorepo.md) | Workspaces pnpm | Installation et build racine | Implémenté ; `apps/server` jamais créé |
| `REQ-SIM-001` | [ADR-0002](../decisions/ADR-0002-headless-fixed-step-simulation.md) | `TowerSimulation`, `SeededRandom` | Tests de déterminisme et d'empreinte | Implémenté et **critique** : le lockstep en dépend |
| `REQ-SIM-002` | [ROADMAP](../../ROADMAP.md) | Systèmes Tower dans `game-core` | Scénarios de simulation | Implémenté pour le jeu actuel |
| `REQ-SIM-003` | [Vue d'architecture](../architecture.md) | `TowerGameState` dans `packages/protocol` | Sérialisation et déterminisme | Implémenté |
| `REQ-NET-001` | [ADR-0008](../decisions/ADR-0008-p2p-lockstep-coop.md) | Chaque pair décide de sa propre simulation | Empreintes d'état (détection seulement) | **Non tenu** — aucun arbitre autoritaire |
| `REQ-NET-002` | [ADR-0008](../decisions/ADR-0008-p2p-lockstep-coop.md), [ADR-0010](../decisions/ADR-0010-local-render-prediction.md) | Lockstep sans prédiction de simulation ; l'avatar local est dessiné en avance à partir d'entrées déjà émises | Tests de roster, de réintégration et de prédiction | Partiellement tenu — reconnexion oui ; aucune prédiction dans la simulation, seulement au rendu |
| `REQ-CONTENT-001` | [ADR-0005](../decisions/ADR-0005-data-driven-content.md) | `packages/content/src/tower.ts` **et** `game-core/src/tower/tuning.ts` | — | **Non tenu** — l'équilibrage vit en partie dans le moteur |
| `REQ-CONTENT-002` | [ADR-0005](../decisions/ADR-0005-data-driven-content.md) | Aucun schéma pour le contenu Tower | — | **Non tenu** — Zod n'était utilisé que par l'ancien contenu |
| `REQ-ASSET-001` | Cadrage initial | Rendu géométrique de `TowerScene`, aucun asset | Revue visuelle | Tenu — toujours aucun asset |
| `REQ-ASSET-002` | Cadrage initial | `scripts/assets` | — | Différé au premier asset |
| `REQ-ASSET-003` | [Analyse historique](../product/legacy-analysis/selection-matrix.md) | Métadonnées de provenance | Contrôle de licence en revue | Sans objet à ce jour |
| `REQ-TEST-001` | Cadrage initial | Tests proches des packages | `pnpm test` — 159 tests | Implémenté |
| `REQ-TEST-002` | [ADR-0002](../decisions/ADR-0002-headless-fixed-step-simulation.md) | `packages/game-core/test/tower-*.test.ts` | Vitest sans navigateur | Implémenté |
| `REQ-TEST-003` | [ADR-0008](../decisions/ADR-0008-p2p-lockstep-coop.md) | `apps/client/src/net/towerSession.test.ts` | Barrière de démarrage, roster | Partiellement tenu — pas de test multi-pairs réel |
| `REQ-TEST-004` | Cadrage initial | `tests/smoke/production.spec.ts` | `pnpm test:smoke`, exécuté en CI | Partiellement tenu — le jeu est couvert, le lobby ne l'est pas |
| `REQ-DEBUG-001` | [Observabilité](../observabilite.md) | `apps/client/src/observability` | Contrat d'observabilité, trace exportée et inspectée | Tenu autrement — pas d'API de débogage, mais traces, métriques et journaux |
| `REQ-PERF-001` | Cadrage initial | `packages/game-core/test/tower-performance.test.ts` | `pnpm benchmark` | Implémenté — 210 µs/tick à 200 monstres, 19 µs/projection |
| `REQ-PERF-002` | [Observabilité](../observabilite.md) | Métriques `vs.simulation.*`, `vs.render.*`, `vs.coop.*` | Chaîne d'export vérifiée jusqu'à Tempo | Implémenté — reste à relever en partie réelle |
| `REQ-CI-001` | [ADR-0001](../decisions/ADR-0001-pnpm-monorepo.md), [déploiement](../deployment.md) | `.github/workflows/ci.yml` | Pipeline en 11 étapes, smoke de production inclus | Implémenté |
| `REQ-DEPLOY-001` | [Déploiement](../deployment.md) | `apps/client/dist`, `deploy/lan` | Build, stack Docker LAN vérifiée | Partiellement tenu — un environnement LAN existe, l'hébergement public non |
| `REQ-DEPLOY-002` | [ADR-0008](../decisions/ADR-0008-p2p-lockstep-coop.md) | Aucun serveur de jeu à empaqueter ; `deploy/lan` empaquette les services de compte et de temps réel | Stack Docker vérifiée | Réinterprété — voir ADR-0008 |
| `REQ-DEPLOY-003` | [Déploiement](../deployment.md) | `.gitignore`, clé `anon` publique par conception | Revue | Tenu |
| `REQ-DOC-001` | Cadrage initial | Documentation racine et `docs` | Contrôle des fichiers requis | Implémenté |
| `REQ-DOC-002` | [Index ADR](../decisions/README.md) | `docs/decisions` | Revue des changements structurants | Implémenté après coup — les ADR 0008 et 0009 constatent au lieu de décider |
| `REQ-DOC-003` | Cadrage initial | Tous les incréments | Revue documentation/code | **Non tenu jusqu'au 31 juillet** — la documentation décrivait un jeu supprimé ; corrigé par la présente révision |
| `REQ-WORK-001` | Cadrage initial | Processus de livraison | Checklist d'incrément | Partiellement tenu — étape « mettre à jour la documentation » systématiquement omise |
| `REQ-WORK-002` | Cadrage initial | ADR ou note de refactoring | Revue avant refonte | **Non tenu** — le changement de jeu n'a pas été documenté avant réalisation |
| `REQ-QUALITY-001` | Cadrage initial | TypeScript, ESLint, Prettier | Format, lint, types et CI | Tenu — code mort de l'ancien jeu supprimé le 31/07 |
| `REQ-SEC-001` | [ADR-0008](../decisions/ADR-0008-p2p-lockstep-coop.md), [ADR-0009](../decisions/ADR-0009-account-persistence.md) | RLS, RPC et exigence de double authentification (`0005_require_mfa.sql`) ; validation de grammaire côté pair | Inspection du schéma | Partiellement tenu — solide sur la base, absent sur la simulation et les canaux temps réel |

## 3. Synthèse des exigences non tenues

Huit exigences ne sont plus tenues, réparties en trois familles.

**Gouvernance** — `REQ-GOV-002`, `REQ-WORK-002`. Des ruptures majeures ont été livrées sans
décision humaine et sans note de refactoring préalable. C'est la cause des deux autres familles
plus qu'un problème distinct. `REQ-DOC-003` a été rétablie le 31 juillet 2026 en refaisant la
documentation à partir du code.

**Observabilité** — `REQ-DEBUG-001`, `REQ-PERF-002`. Le projet a perdu son API de débogage et
ses métriques de développement. C'est ce qui bloque aujourd'hui un vrai test de bout en bout :
sans elles, un scénario ne peut ni provoquer une situation ni lire l'état, seulement observer le
DOM. `REQ-TEST-004` et `REQ-PERF-001` ont été partiellement ou totalement rétablies le
31 juillet 2026.

**Modèle de confiance** — `REQ-NET-001`, `REQ-PERSISTENCE-001`, `REQ-CONTENT-001`,
`REQ-CONTENT-002`. Le client est devenu autorité sur sa simulation et sur son or de compte, et
le contenu n'est plus validé.

## 3 ter. Surfaces de sécurité restant ouvertes

Consignées à la suite d'un audit externe du 31 juillet 2026, et **non traitées** parce qu'elles
tombent dans les ajournements assumés de [`../objectif.md`](../objectif.md) — cercle fermé,
lutte contre la triche écartée, conséquences acceptées.

1. **Les canaux temps réel sont publics et l'identité y est déclarative.** Aucune politique ne
   protège `realtime.messages`, les canaux ne sont pas ouverts en `private`, et l'émetteur d'un
   message se nomme lui-même dans la charge utile. Quiconque connaît le code d'un salon peut
   donc simuler une présence, lancer une partie ou émettre des entrées au nom d'un autre.
2. **Le montant d'or reste déclaré par le client.** La migration `0005` exige désormais la
   double authentification pour créditer un compte, mais rien ne vérifie que le montant
   corresponde à une partie réellement jouée.
3. **Les autres fonctions `security definer` n'exigent pas la double authentification.** Seule
   `credit_account_gold` a été durcie, parce qu'elle est la seule à créer de la valeur ; les
   autres restent bornées au périmètre du compte appelant.

## 3 bis. Anomalie fonctionnelle relevée

`statsService.recordGameResult` et la RPC `record_game_result` existent, mais **aucun appelant
ne les invoque**. L'écran de profil lit `player_stats`, table que le jeu n'écrit jamais : les
compteurs de parties jouées, gagnées, perdues, de durée et de ressources restent donc
définitivement à zéro. Le correctif suppose de définir ce qu'est un résultat de partie dans un
jeu sans victoire ni ressources.

## 4. Contrôle à chaque incrément

1. remplacer l'emplacement cible par le chemin réel ;
2. référencer les tests concrets ;
3. ne jamais déclarer « implémenté » avant vérification ;
4. créer un ADR **avant** de s'écarter du cadrage, pas après ;
5. conserver la ligne même si l'exigence est remplacée, avec le lien vers la décision qui la
   remplace.

## 5. Addendum v2 — serveur autoritaire

La table historique ci-dessus reste inchangée pour conserver la preuve des écarts v1. Les
exigences approuvées par ADR-0011 sont suivies séparément pendant la migration.

| Exigence v2 | Décision | Implémentation réelle | Vérification | État boucle 2 |
|---|---|---|---|---|
| `REQ-V2-AUTH-001` — JWT et roster réservés | [ADR-0011](../decisions/ADR-0011-authoritative-game-server.md) | `apps/server/src/auth`, `http/createRoom.ts`, ticket interne | tests JWT/HTTP/registre + smoke JWT invalide et bypass | **Solo implémenté** |
| `REQ-V2-SIM-001` — simulation serveur unique à 50 ms | [Architecture v2](../architecture.md) | `TowerRoomRuntime`, `TowerRoom` | tests runtime, Schema et smoke réel | **Solo implémenté** |
| `REQ-V2-NET-001` — commandes bornées | [Spécification F-004](../spec-fonctionnelle.md) | union protocol, filtres débit/séquence/valeurs/file | tests de frontière autoritaire | **Implémenté** |
| `REQ-V2-NET-002` — état sans alias local | [Spécification F-005](../spec-fonctionnelle.md) | `TowerStateSchema`, `TowerServerSession` | tests Schema et conversion locale | **Implémenté** |
| `REQ-V2-UX-001` — interpolation et prédiction visuelle | [ADR-0010](../decisions/ADR-0010-local-render-prediction.md) | deux snapshots + avance locale de deux ticks | tests adaptateur et smoke | **Solo implémenté** |
| `REQ-V2-COOP-001` — roster, départs et reconnexion | [Spécification F-003/F-007](../spec-fonctionnelle.md) | à faire en boucle 3 | multi-client 2/4, 10 s/31 s | Planifié |
| `REQ-V2-GOLD-001` — crédit serveur idempotent | [Spécification F-008](../spec-fonctionnelle.md) | à faire en boucle 4 | concurrence SQL | Planifié |
| `REQ-V2-OPS-001` — Compose, Nginx et OTel | [Spécification F-009](../spec-fonctionnelle.md) | à faire en boucle 4 | santé, panne, charge et trace réelle | Planifié |
