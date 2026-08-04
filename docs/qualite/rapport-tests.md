# Village Survivor — Rapport de tests

> Statut : en cours — validation LAN finale de la v2
> Version du projet : v2
> Propriétaire : Gayar
> Dernière revue : 4 août 2026

## Validation v2 — premier essai LAN solo (4 août 2026)

Le propriétaire a lancé une partie solo sur le déploiement LAN de la v2 et confirme que tout
s'est déroulé normalement. Aucune anomalie fonctionnelle ou de rendu n'a été observée pendant
cet essai.

| Gate réelle | Résultat | Source |
|---|:---:|---|
| Partie solo LAN | **PASS** | validation explicite du propriétaire le 4 août 2026 |
| Partie coopérative sur deux postes | **EN ATTENTE** | prochain essai réel |
| Trace distribuée et journaux corrélés de la v2 | **EN ATTENTE** | à inspecter pendant les essais LAN |

Cette preuve valide le parcours solo du produit réel. Elle ne remplace ni le test coopératif sur
deux postes ni la lecture de la trace distribuée exigée avant le passage en phase 5.

## Validation v2 — boucle 1 « ferraille bornée »

> Statut : contrôles automatiques et revue indépendante terminés, constats arbitrés
> Version testée : v2, boucle 1
> Commit fonctionnel : `db98ed5`
> Commit de renforcement après revue : `b378312`
> Environnement : Windows 11, Node.js/pnpm du workspace, exécution locale
> Date : 3 août 2026

| Contrôle | Résultat | Preuve observée |
|---|:---:|---|
| Tests moteur complets | **PASS** | 15 fichiers, 73 tests |
| Scénarios ciblés ferraille + quêtes + simulation | **PASS** | 3 fichiers, 17 tests |
| Typecheck `protocol` et `game-core` | **PASS** | `tsc --noEmit`, deux packages |
| Lint des fichiers touchés | **PASS** | ESLint, aucune erreur |
| Benchmark isolé | **PASS** | 560 ticks en 142 ms, **254 µs/tick** sous plus de 200 entités |

Les six preuves fonctionnelles spécifiques sont : aucune apparition sans mort sur 2 000 ticks
avec vagues et monstres présents, un tas par monstre de la valeur de sa récompense, la voie
indirecte d'un kamikaze mort au contact, expiration au tick `drop + 600`, ramassage prioritaire
au tick limite, et population bornée sur 1 200 ticks. Le test de quête vérifie en plus que sa
récompense augmente directement `scrapFund` sans créer de sixième tas.

La revue indépendante a conclu « conforme », sans P0–P2. Ses deux suggestions P3 ont été
retenues et sont à l'origine des deux renforcements de preuve ci-dessus. Aucune contre-revue n'a
été lancée.

La garde d'architecture fait partie des 72 tests réussis : l'événement `scrap-expired` reste une
donnée déterministe du moteur et aucune instrumentation OpenTelemetry n'entre dans `game-core`.

---

> Statut : approuvé, avec une anomalie ouverte
> Version testée : v1
> Commit : `214dc0f` (produit essayé : `msc1f9ze`, fusionné en `d354c10`)
> Environnement : déploiement LAN auto-hébergé, Firefox 153 et Edge 150
> Date : 2 août 2026

## Résumé

| Total | Réussis | Échoués | Ignorés | Non exécutés |
|---:|---:|---:|---:|---:|
| 167 | 167 | 0 | 0 | 0 |

Exécution automatique : `pnpm check` — formatage, règles, types, tests, build. 26 fichiers de
test. Le scénario de performance mesure 210 µs par tick sous 200 monstres, pour un budget d'une
milliseconde.

**Trois sessions de jeu réelles** ont été jouées à deux postes, plus une en solo :

| Session | Durée | Mode | Fin | Ce qu'elle a établi |
|---|---|---|---|---|
| 18:21 | 2 min 26 | coop | vague 13 | Horloge d'entrées dérivante : 54,1 ms par tick au lieu de 50 |
| 19:19 | 3 min 37 | coop | vague 21 | Correctif d'horloge validé : 50,1 ms |
| 19:24 | **16 min 32** | coop | vague 99 | Tenue longue durée, **et divergence au tick 18220** |
| 21:45 | 10 min 32 | solo | vague 63 | Aucune anomalie |

## Gates

| Gate | Résultat | Preuve |
|---|:---:|---|
| Tests applicables | **PASS** | `pnpm check`, 167 tests, exécuté en session |
| Trace complète | **PASS** | Trace `fa5f1083a75081641663c47a4fb570ed` relue dans le backend : span `game.session`, graine `preuve-correlation`, issue `left`. Rattachement parent-enfant couvert par `trace-contract.test.ts` |
| Logs corrélés | **PASS** | Le journal « partie lancée » porte `trace_id=fa5f1083…` et `span_id=938ae751…`, relus dans le backend |
| Données interdites absentes | **PASS** | Test dédié : ni adresse, ni pseudonyme, ni jeton, ni code de salon en clair dans un span. Aucun identifiant de joueur n'est émis |
| Niveau de log configurable | **PASS** | Surcharge par le stockage local, sans reconstruction ; quatre tests |
| Télémétrie non bloquante | **PASS** | Deux sessions entières se sont déroulées normalement pendant que le collecteur refusait tous les lots par un 415, sans qu'aucun joueur ne s'en aperçoive |

La dernière ligne mérite d'être lue deux fois : la panne du backend a été éprouvée **par accident
et en conditions réelles**, ce qui vaut mieux qu'une injection de panne. Le jeu n'a ni ralenti,
ni bloqué, ni prévenu le joueur — comportement exactement conforme à la spécification.

## Exercice de diagnostic

La méthode demande de provoquer une défaillance et de dérouler la chaîne. Trois défaillances
réelles se sont produites, et la chaîne a été déroulée sur chacune.

**Cas 1 — le jeu tourne trop lentement.**

```
symptôme : « au bout d'un moment il se remet à lagger »
  → traces   : temps simulé 134,7 s pour 145,7 s réelles, deux pairs concordants
  → métrique : vs.coop.input.delay nul dans 83 % des images, conception à 3 ticks
  → cause    : l'horloge de capture perd un tick par déclenchement de minuteur tardif
  → action   : capture pilotée par le temps réel — écart ramené à 0,08 % sur 16 minutes
```

Discrimination décisive : si le jeu attendait le réseau, l'avance locale aurait **augmenté**.
Elle tombait à zéro. La mesure a écarté la latence sans avoir à en discuter.

**Cas 2 — la télémétrie semble muette.**

```
symptôme : aucune donnée après une partie entière
  → journal de la passerelle : les lots partent bien, et reviennent en 415
  → mesure ciblée : ajout du type de contenu au journal
  → cause : « application/json, application/json » — deux en-têtes fusionnés par fetch
  → action : ne plus fixer le type de contenu ; vérifié à 200 depuis un navigateur réel
```

**Cas 3 — les tests portaient sur une autre version.**

```
symptôme : aucun effet des correctifs livrés
  → journal de la passerelle : aucune requête pour la page ni pour le paquet
  → cause : pages servies sans Cache-Control, servies depuis le cache sans revalidation
  → action : revalidation obligatoire, paquets immuables, identifiant de build dans l'URL
```

## Échecs et anomalies

| ID | Test | Résultat | Issue | Bloque la release |
|---|---|---|---|:---:|
| ANO-001 | Partie coopérative de 16 min | **Divergence de simulation au tick 18220**, répétée toutes les 20 ticks jusqu'à la fin | Cause non établie | **non**, voir ci-dessous |
| ANO-002 | Métrique `vs.coop.fingerprint.mismatch` | Incrémentée mais jamais exportée | Fenêtre d'export de 15 s plus longue que la fin de partie | non |
| ANO-003 | Coût de projection d'état et d'empreinte | Non mesuré | Angle mort de l'instrumentation | non |

### ANO-001 — divergence au tick 18220

**Établi.** Les deux pairs ont signalé la divergence, mutuellement, au **même tick 18220** — soit
15 min 11 s de jeu — puis à chaque contrôle d'empreinte jusqu'au tick 19800. **80 signalements
par pair, environ 80 secondes jouées sur deux mondes différents.** Les joueurs n'ont rien
remarqué.

**Non établi.** La cause. L'empreinte compare l'état public entier et ne dit que « différent »,
jamais « où ». Les quinze premières minutes se sont déroulées sans écart, ce qui écarte une
divergence d'arithmétique systématique — elle serait apparue bien plus tôt, comme le 1er août au
tick 2160.

**Pourquoi cela ne bloque pas la version.** Le mode coopératif est utilisable : trois sessions,
dont une de seize minutes, ont été jouées avec plaisir, et l'anomalie survient au-delà de la
quinzième minute sans que les joueurs la perçoivent. La version n'est pas une release publique
mais un incrément joué en cercle fermé, où la conséquence d'une divergence est de finir la partie
sur deux écrans légèrement différents. C'est **le premier élément du backlog de la v2**, et la
première chose à instrumenter : des empreintes par sous-système nommeraient le coupable au lieu
de signaler un désaccord.

## Risques résiduels

- **Divergence non expliquée en partie longue** — acceptée pour cette version, portée en tête du
  backlog v2. Propriétaire : Gayar.
- **La ferraille au sol croît sans limite** — mille pièces après seize minutes, contre cent onze
  monstres. Aucune conséquence observée sur le ressenti, mais tous les coûts par entité en
  dépendent. Backlog v2.
- **Fenêtre de reconnexion remplie à 83 %** par une partie de seize minutes. Au-delà de vingt
  minutes, un joueur déconnecté ne peut plus revenir. Backlog v2.
- **Trois surfaces de sécurité assumées** — canaux temps réel usurpables, or de compte déclaré par
  le client, fonctions `security definer` sans second facteur. Cohérentes avec le périmètre, elles
  redeviennent bloquantes à toute ouverture publique.
- **Aucune sauvegarde de la base** (HYP-003). Une panne disque effacerait comptes et progression.
- **Prénoms publiés** — la contrainte de désensibilisation listait les prénoms des joueurs ; le
  contrôle avant publication a cherché des secrets et n'a pas appliqué cette liste. Décision de
  correction à prendre par le propriétaire.

## Boucle v2.2 — serveur autoritaire solo (3 août 2026)

### Périmètre éprouvé avant revue indépendante

- création solo par `POST /rooms`, JWT HS256 Supabase et réservation de quinze secondes ;
- ticket interne à usage unique entre l'API authentifiée et le matchmaker Colyseus ;
- chargement du profil actif par PostgREST avec la clé `service_role` ;
- simulation unique à 50 ms, Schema partagé sans `player` ni `events` ;
- contrôles non fiables bornés, actions fiables dédupliquées et neutralisation après 250 ms ;
- reconstruction de l'alias local, interpolation et prédiction visuelle limitée à deux ticks ;
- parcours Chromium réel avec le vrai serveur, un PostgREST hermétique et un JWT sentinelle.

### Résultats

| Contrôle | Résultat | Preuve |
|---|:---:|---|
| `pnpm format:check` | **PASS** | tous les fichiers suivis hors audits immuables conformes |
| `pnpm lint` | **PASS** | aucune erreur |
| `pnpm typecheck` | **PASS** | cinq workspaces typés, client et serveur inclus |
| `pnpm test` | **PASS** | 35 fichiers, 198 tests après corrections de revue |
| `pnpm benchmark` | **PASS** | 250 µs/tick avec 200 monstres ; 1 000 projections en 22 ms |
| `pnpm build` | **PASS** | protocol/content/core, serveur et client de production |
| `pnpm test:smoke` | **PASS** | Chromium, parcours solo et retour après panne, 2 scénarios |
| `pnpm peers check` | **PASS** | aucun peer manquant ; transport uWebSockets explicitement hors périmètre |

Le smoke refuse aussi un JWT invalide et une création directe forgée sur
`/matchmake/create/tower`. Les tests unitaires refusent identité étrangère, nombres non finis,
valeurs hors bornes, séquence ancienne, champ de position injecté, dépassements 30/s et 10/s,
file supérieure à 16 et action dupliquée. Une panne ou une réponse invalide de PostgREST empêche
la création au lieu de démarrer avec un build inventé.

### Limites explicites de cette preuve

Cette boucle ne valide pas encore coopération, reconnexion 10/31 secondes, retrait volontaire,
crédit d'or serveur, conteneur/Nginx, instrumentation `game.room` ni charge de vingt minutes.
Ces critères restent attachés respectivement aux boucles 3 et 4. Le benchmark mesure le moteur,
pas encore la taille des patches ou la latence commande→état sur LAN.

### Arbitrage de la revue Claude

Le rapport indépendant `2026-08-03-200923-loop2-serveur-autoritaire-solo-claude.md` ne relève
aucun P0–P2 et trois P3. Les trois sont retenus : les lots d'événements sont désormais accumulés
entre deux patches, `POST /rooms` est réellement limité à cinq créations par minute et une panne
terminale ramène automatiquement le solo au lobby après avoir affiché son motif. Les nouveaux
tests couvrent accumulation/déduplication, fenêtre de débit, HTTP 429 et retour navigateur.

## Boucle v2.3 — coopération autoritaire et reconnexion (3 août 2026)

### Périmètre éprouvé avant revue indépendante

- création de room coopérative par le chef et broadcast Supabase réduit au seul `roomId` ;
- admission exacte de deux puis quatre identités réservées, sans démarrage partiel ;
- annulation réelle après quinze secondes quand un membre manque ;
- état Schema identique au même tick pour tous les clients, sans alias local `player` ;
- neutralisation immédiate à la coupure, même avatar/session après dix secondes ;
- retrait après trente secondes, refus de reconnexion à trente et une secondes ;
- départ volontaire immédiat et room vide `abandoned` au niveau du runtime ;
- interpolation des deux snapshots et prédiction visuelle locale toujours bornée à deux ticks.

### Résultats

| Contrôle | Résultat | Preuve |
|---|:---:|---|
| `pnpm check` | **PASS** | format, lint, types, 35 fichiers/204 tests et cinq builds |
| `pnpm benchmark` | **PASS** | 286 µs/tick avec 200 monstres ; 1 000 projections en 25 ms |
| `pnpm peers check` | **PASS** | aucun peer manquant |
| `pnpm test:smoke` | **PASS** | 6 scénarios sur vrai serveur, faux PostgREST et vrais clients Colyseus |

Le premier passage du nouveau cas d'attente a observé le snapshot immédiatement après
`joinById`, avant que le SDK Node ait appliqué le handshake Schema. L'assertion a été alignée sur
la frontière asynchrone réelle, puis le cas ciblé a prouvé une annulation en 15,1 secondes. Aucun
code de production n'a été assoupli.

### Limites explicites de cette preuve

Le lancement visuel du lobby n'est pas piloté par deux navigateurs authentifiés ; son contrat
fermé `roomId` est vérifié unitairement, puis l'admission est éprouvée directement avec les
clients Colyseus. La charge de vingt minutes, les métriques de patches/latence, la persistance de
l'or, Compose/Nginx et l'observabilité serveur restent dans la boucle 4. La validation finale sur
deux postes LAN n'est pas remplacée par ces tests locaux.

### Arbitrage de la revue Claude

Le rapport indépendant `2026-08-03-204700-development-loop-ready-claude.md` rend un verdict
favorable, sans P0–P2, et formule deux P3 de minimisation. Les deux sont retenus : la seed
autoritaire est retirée du Schema et remplacée côté rendu par une sentinelle, tandis que les
bonus persistants sont retirés de la présence du hub puisqu'aucune UI ne les consomme plus. Les
tests verrouillent désormais l'absence de `seed` dans les snapshots réseau et la projection
minimale de présence. Après correction, la suite compte 205 tests Vitest ; aucune contre-revue
n'est lancée sans confirmation explicite du propriétaire.

## Boucle v2.4 — récompenses, exploitation et retrait du P2P (3 août 2026)

### Périmètre éprouvé avant revue indépendante

- registre d'or serveur conservant les gains après retrait d'un participant ;
- tables `game_runs`/`game_run_rewards` et RPC `finalize_game_run` transactionnelle, idempotente
  et réservée à `service_role` ;
- suppression du crédit navigateur et révocation de `credit_account_gold` pour `authenticated` ;
- rétention terminale de 60 secondes et retry de persistance toutes les 5 secondes ;
- conteneur `game-server`, healthcheck, limite 512 Mio et proxy HTTP/WebSocket `/game/` ;
- racine `game.room`, propagation W3C et métriques agrégées sans identité, jeton, seed, `roomId`
  ou `runId` ;
- retrait physique de la session locale/lockstep, des replays, empreintes P2P et métriques de
  simulation navigateur devenues mortes ;
- charge de vingt minutes simulées, pannes serveur/OTLP et délai commande→état.

### Résultats avant revue

| Contrôle | Résultat | Preuve |
|---|:---:|---|
| `pnpm check` | **PASS** | format, lint, types, 37 fichiers/175 tests et tous les builds |
| `pnpm benchmark` | **PASS** | 263 µs/tick avec 200 monstres ; 1 000 projections en 20 ms |
| charge 24 000 ticks | **PASS** | 4 joueurs/200 monstres, tick p95 0,096 ms, maximum < 50 ms, projection p95 36 Kio, ferraille max 9 |
| `pnpm test:smoke` | **PASS** | 7 scénarios ; 2/4 clients, 10/31 s, pannes serveur/OTLP, commande→état p95 79,2 ms |
| migrations rejouées | **PASS** | six migrations appliquées une seconde fois sur PostgreSQL LAN |
| `check-game-rewards.ps1` | **PASS** | deux appels concurrents, refus d'un montant négatif, aucun crédit partiel, droits RPC fermés |
| image et Compose | **PASS** | configuration valide, image reconstruite, conteneur sain, 536 870 912 octets, `/game/health` 200 |

Le harnais de charge a d'abord laissé les vagues invulnérables s'accumuler au-delà du scénario :
2,922 ms p95 et 915 Kio décrivaient plusieurs milliers de monstres, pas la charge demandée de
200. Après borne explicite du harnais, les 24 000 ticks restent réellement exécutés et la
projection est échantillonnée chaque seconde simulée. De même, la première mesure de latence
alternait les directions et comptait le temps d'annulation du mouvement précédent ; chaque
impulsion part désormais d'une entrée neutre stabilisée.

### Limite explicite de cette preuve

Les clients automatisés tournent sur une seule machine. La gate finale reste une partie solo et
une partie coopérative sur deux postes LAN, avec inspection d'une trace distribuée complète dans
le backend.

### Arbitrage de la revue Claude

Le rapport indépendant
`2026-08-03-214806-loop4-recompenses-exploitation-p2p-claude.md` rend un verdict favorable, sans
P0–P2, et formule quatre P3. Les quatre sont retenus :

- la charge passe désormais par `TowerRoomRuntime.step` et sa validation de commandes, tout en
  conservant 24 000 ticks et 200 monstres ;
- un test initialise réellement une room Colyseus et prouve que `client.raw` reçoit un patch non
  vide dont la taille est transmise à la métrique ;
- une authentification interrompue avant `onJoin` est libérée après cinq secondes, avec test de
  retry ;
- les appels PostgREST bloqués expirent après quatre secondes et une persistance encore absente
  à la disposition produit un span/log d'erreur terminal sans identifiant.

### Contrôles après correction

| Contrôle | Résultat | Preuve |
|---|:---:|---|
| `pnpm check` | **PASS** | 38 fichiers/179 tests, format, lint, types et tous les builds |
| `pnpm benchmark` | **PASS** | 232 µs/tick ; 1 000 projections en 20 ms |
| charge via runtime | **PASS** | 24 000 ticks, p95 0,169 ms, projection p95 48 Kio, ferraille max 9 |
| `pnpm test:smoke` | **PASS** | 7 scénarios ; commande→état p95 143,0 ms, sous le budget de 150 ms |
| image LAN finale | **PASS** | reconstruite, conteneur sain, limite 512 Mio, `/game/health` 200 |

Aucune contre-revue n'a été demandée ni lancée. La résolution séparée conserve l'arbitrage ; les
artefacts de revue restent non committés conformément à la politique.
