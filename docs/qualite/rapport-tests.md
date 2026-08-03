# Village Survivor — Rapport de tests

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
| `pnpm test` | **PASS** | 34 fichiers, 195 tests |
| `pnpm benchmark` | **PASS** | 248 µs/tick avec 200 monstres ; 1 000 projections en 22 ms |
| `pnpm build` | **PASS** | protocol/content/core, serveur et client de production |
| `pnpm test:smoke` | **PASS** | Chromium, parcours solo complet, 1 scénario |
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
