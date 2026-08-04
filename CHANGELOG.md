# Journal des changements

Ce projet suit une adaptation de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Aucune politique de version
sémantique n'est encore appliquée, car aucune version jouable n'a été publiée.

## [Non publié]

Le dépôt contient deux jeux successifs. Le MVP « M1 » (exploration diurne, défense nocturne) a
été livré du 20 au 26 juillet 2026, puis **remplacé** par le jeu « Tower » du 28 au 30 juillet.
Les deux sont consignés ci-dessous, dans cet ordre.

### Migration v2 — boucle 1 : ferraille bornée

- supprimé toute apparition automatique de ferraille ; seuls les monstres en déposent, à hauteur
  de leur récompense ;
- ajouté une expiration exacte après 600 ticks (30 secondes), avec priorité au ramassage au tick
  limite ;
- ajouté l'événement `scrap-expired` et les tests de partie longue ; les récompenses de quête
  continuent de créditer directement la caisse commune.

### Migration v2 — boucles 2 à 4 : serveur autoritaire

- ajouté `apps/server`, Colyseus et `TowerServerSession`; toutes les parties solo et coopératives
  utilisent une unique simulation serveur à 20 Hz, sans repli local ;
- ajouté roster réservé, attente de 15 secondes, reconnexion de 30 secondes, retrait volontaire,
  abandon et conservation des gains des participants retirés ;
- ajouté la migration `0006`, la RPC transactionnelle `finalize_game_run` réservée à
  `service_role` et le test de deux finalisations PostgreSQL concurrentes ; le crédit navigateur
  et son droit RPC ont été retirés ;
- ajouté le conteneur `game-server`, le proxy HTTP/WebSocket `/game/`, un healthcheck et une
  limite initiale de 512 Mio ;
- ajouté traces `game.room`, propagation W3C, métriques serveur et logs bornés sans identité,
  jeton, seed, `roomId` ou `runId` ;
- affiné l'histogramme des ticks autour du budget de 1 ms avec quatorze seuils ciblés, sans
  augmenter le nombre de buckets ni le coût du chemin de jeu ;
- retiré la session locale/lockstep, les replays, empreintes P2P et métriques de simulation côté
  navigateur ;
- ajouté les scénarios 2/4 clients, coupures 10/31 secondes, pannes serveur/OTLP et la charge de
  24 000 ticks avec quatre joueurs et 200 monstres.

---

## Correctifs de jouabilité — 1er août 2026

Trois correctifs issus de la première session de jeu réelle à plusieurs postes, décrite dans
[`docs/feedback.md`](docs/feedback.md), et l'instrumentation qui manquait pour diagnostiquer la
suivante.

### Corrigé

- **la simulation est reproductible d'un navigateur à l'autre.** Une partie coopérative
  divergeait après moins de deux minutes. Cause établie par mesure sur trois navigateurs :
  `Math.cos`, `Math.sin`, `Math.atan2` et `Math.hypot` sont approximés par l'implémentation et
  renvoient des valeurs différentes — **y compris entre deux versions du même moteur**. Les
  vingt-huit appels du chemin critique passent par `exact-math.ts`, qui n'emploie que des
  opérations exactement spécifiées par le langage. Une garde de lint interdit leur retour ; c'est
  elle qui a trouvé un vingt-neuvième cas, l'opérateur de puissance des seuils de niveau ;
- **le déplacement répond sans délai perceptible.** L'avatar local est désormais dessiné à
  l'heure du joueur, à partir des entrées déjà diffusées sur le canal — donc sans rien deviner et
  sans jamais rien recaler. De 150 à 200 ms de retard, on passe à 50 ms au plus. Le prix est un
  écart d'affichage entre l'avatar et le monde autour de lui, arbitré par
  [ADR-0010](docs/decisions/ADR-0010-local-render-prediction.md) ;
- **« Fracture glaciale » produit un effet.** L'amélioration mythique la plus rare du catalogue
  incrémentait un compteur que la simulation ne lisait jamais. Les coups critiques ralentissent
  désormais leur cible, par piles cumulées et plafonnées ; un monstre ralenti n'est jamais figé.

### Ajouté

- **le jeu est observable.** Traces d'une partie, mesures de performance et journaux corrélés
  partent du navigateur en OTLP vers un collecteur de la pile LAN, derrière la passerelle
  existante pour rester sur une seule origine. Sont mesurés : durée d'un tick de simulation,
  durée d'une image, population par nature d'entité, ticks rattrapés par image, pairs actifs,
  divergences d'empreinte, retard d'entrée en coopération et issues de réintégration. Le cœur de
  simulation n'est pas touché : la mesure entoure `step()` depuis la couche client, et une garde
  de lint doublée d'un test interdit d'y importer une bibliothèque de télémétrie. Le collecteur
  est facultatif — absent, éteint ou en panne, les parties se déroulent à l'identique.

### Modifié

- **la télémétrie est recentrée sur le diagnostic et la performance**, sur décision du
  propriétaire : les mesures d'usage produit sortent du périmètre. Conséquence assumée, le critère
  de réussite de l'objectif devra être constaté à la main. Effet de bord bienvenu, plus aucun
  identifiant de joueur n'est émis.

### Non corrigé, et documenté comme tel

- les **gels** dus au pair le plus lent : ils appartiennent au modèle lockstep ;
- l'**absence de mesure** permettant de départager le retard constant des gels.

## Correctifs d'audit — 31 juillet 2026

### Corrigé

- **les projectiles rapides ne traversent plus leurs cibles.** La collision ne testait que la
  position d'arrivée de la balle ; à 950 unités par seconde et 20 ticks par seconde, la
  Longue-vue avançait de 47,5 unités par tick contre une fenêtre de contact de 12 unités sur un
  coureur, et ratait donc visiblement ce qu'elle visait. Le trajet du tick est désormais résolu
  exactement, par intersection segment-cercle ;
- **un kamikaze abattu explose.** Le réglage et les règles annonçaient « au contact ou à sa
  mort », mais seul le contact était implémenté : le tirer de loin le désamorçait. La détonation
  appartient désormais à la mort du monstre, quelle qu'en soit la cause ;
- **la double authentification n'est plus contournable.** L'interface révélait le contenu
  authentifié dès que le contrôle du niveau d'assurance échouait — une simple panne réseau
  suffisait ; elle échoue maintenant fermé. Côté base, la migration `0005_require_mfa.sql`
  ajoute une politique restrictive par table et une garde sur le crédit d'or, les comptes
  fédérés restant dispensés comme à l'écran ;
- **le budget de bénédictions n'affiche plus un montant faux.** `blessingBudget` est une
  capacité constante, verrouillée à quatre par une contrainte en base ; l'utiliser comme montant
  dépensé faisait annoncer « 4 / 4 investis » à tout profil neuf. Le montant se déduit désormais
  des rangs acquis, et les achats sont refusés à l'écran plutôt que par un message d'erreur de
  la base ;
- **la fenêtre de reconnexion passe de dix à vingt minutes.** Elle reste bornée, non par la
  mémoire mais par le temps de rejeu, qui doit tenir dans l'avance accordée au joueur qui
  revient ;
- **`setup.mjs` ne détruit plus le `.env` racine.** Il fusionne clé par clé, conserve
  commentaires et variables inconnues, et écrit une sauvegarde avant modification ;
- **vulnérabilité transitive écartée** : `brace-expansion` est forcé en version corrigée par un
  override. Elle n'affectait que l'outillage de développement, jamais le paquet livré.

### Documentation

- corrige quatre incohérences relevées par l'audit : la feuille de route affirmait à la fois que
  l'ancien jeu subsistait et qu'il avait été supprimé, la matrice annonçait 167 tests au lieu de
  111, le document de déploiement disait qu'aucun hébergement n'existait alors que le
  déploiement LAN y est décrit, et la page d'accueil portait encore le titre et la description
  du MVP « M1 » ;
- consigne trois surfaces de sécurité **volontairement non traitées**, par cohérence avec la
  frontière de l'objectif : canaux temps réel usurpables, montant d'or déclaré par le client, et
  fonctions `security definer` autres que le crédit d'or.

---

## Déploiement LAN — 31 juillet 2026

### Ajouté

- **déploiement local complet, jouable en multijoueur sans internet** (`deploy/lan/`). Une
  stack Docker héberge Postgres, GoTrue, PostgREST et Realtime ; un nginx sert le jeu et fait
  passerelle vers ces trois services sur **une seule origine**, ce qui supprime toute question
  de CORS. Ni Studio, ni Storage, ni Edge Functions : le jeu ne s'en sert pas ;
- `setup.mjs` détecte l'adresse locale, écarte les interfaces virtuelles, génère le secret JWT
  et les clés `anon` et `service_role` qui en dérivent, et écrit les deux fichiers
  d'environnement ;
- `apply-migrations.ps1` applique les migrations du jeu après le démarrage de
  l'authentification — elles ne peuvent pas être jouées à l'initialisation de Postgres, la
  première référençant `auth.users`, table créée par GoTrue ;
- `check-realtime.mjs` vérifie le transport de la coopération en faisant dialoguer deux pairs
  sur un même canal, sans dépendance : c'est le contrôle qui distingue « le jeu démarre » de
  « le multijoueur fonctionne » ;
- ESLint connaît désormais les scripts d'exploitation Node de `deploy/`.

### Corrigé

- **la graine de partie n'est plus tirée avec `crypto.randomUUID`**, qui n'est exposée que dans
  un contexte sécurisé et valait donc `undefined` dès que le jeu n'était plus servi depuis
  `localhost` — le lancement d'une partie échouait sur toute adresse de réseau local. Les trois
  points d'appel partagent maintenant un seul assistant reposant sur `crypto.getRandomValues`,
  disponible dans tous les contextes.

### Limites connues du déploiement LAN

- tout circule en clair : ce déploiement vise un réseau local de confiance, pas internet ;
- **les connexions Google et GitHub ne fonctionnent pas en LAN** : elles exigent un contexte
  sécurisé et un fournisseur capable de rappeler l'adresse, ce qu'une adresse privée en HTTP
  n'offre pas. La connexion par courriel et mot de passe fonctionne ;
- l'adresse du serveur est figée dans le paquet à la compilation : en changer impose de
  reconstruire le client.

---

## Nettoyage — 31 juillet 2026

### Retiré

- **suppression de l'ancien jeu M1** : 38 fichiers et 7 612 lignes inatteignables depuis les
  points d'entrée du client — `GameScene`, `LocalSession`, `coopSession`, le module `render/`,
  les écrans d'inventaire, d'échange et de menu, `GameSimulation` et ses systèmes, l'ancien
  contenu validé par Zod, l'ancien protocole et leurs tests. La suite de tests passe de 167 à
  100 cas, tous portant désormais sur le jeu réellement exécuté ;
- la dépendance `zod` disparaît avec l'ancien contenu, seul à l'utiliser ;
- le script `test:e2e` disparaît avec le scénario navigateur qu'il exécutait.

### Ajouté

- **smoke test de production rétabli et remis en intégration continue.** Il vise `play.html`,
  qui démarre sans projet Supabase, et vérifie que le jeu se lance réellement, que le build
  n'expose aucune API de débogage et que la graine reçue par l'URL n'est jamais interprétée
  comme du HTML ;
- **scénario de performance rétabli** sur le jeu Tower : coût par tick sous 200 monstres, coût
  d'une projection d'état et contrôle de reproductibilité à graine identique. La mesure porte
  sur les ticks réellement simulés et s'arrête à la défaite, pour rester valable si
  l'équilibrage évolue.

### Documentation

- l'ensemble de la documentation décrivait encore le jeu M1 supprimé ; elle a été refaite à
  partir du code ;
- deux ADR consignent des décisions appliquées sans arbitrage préalable :
  [0008](docs/decisions/ADR-0008-p2p-lockstep-coop.md) pour la coopération pair-à-pair et
  [0009](docs/decisions/ADR-0009-account-persistence.md) pour la persistance de compte ; les ADR
  0004 et 0006 passent en « Remplacé » sans que leur contenu soit modifié ;
- la matrice de traçabilité recense onze exigences qui ne sont plus tenues.

---

## Jeu « Tower » — 27 au 30 juillet 2026

### Ajouté

- **Comptes et progression persistante** (27 juillet) : authentification Supabase par
  email/mot de passe, Google et GitHub, double authentification TOTP, profil joueur et
  statistiques de parties ;
- **Hub multijoueur** (27 juillet) : amis, code ami, présence temps réel, invitations, salon par
  code, chef de salon et lancement groupé ;
- **Séparation du lobby et du jeu** (28 juillet) : `index.html` porte l'authentification et le
  hub, `play.html` porte la partie ; les deux pages sont construites séparément ;
- **Nouveau jeu Tower** (28 juillet) : contrat de protocole dédié, moteur `TowerSimulation`,
  rendu, HUD et boutique de tourelle ; un Cœur, quatre tourelles fixes, des vagues sans fin, une
  arme à feu et une visée à la souris ;
- **Arsenal personnel** (29 juillet) : trois armes permutables — fusil, tromblon, longue-vue —
  avec progression propre à chaque arme, et or de compte crédité en fin de partie ;
- **Préférences visuelles** (30 juillet) : couleurs du joueur, des tourelles, des projectiles et
  du HUD, modifiables et sans effet sur la simulation ;
- **Arsenal de défense, Phase 3** (30 juillet) : modules uniques de tourelle, super-modules du
  marchand, priorités de ciblage et améliorations globales du réseau défensif ;
- **Méta-progression, Phase 4** (30 juillet) : jusqu'à trois profils de personnage, voies de
  bénédiction, compétences de compte, gemmes sertissables et forge, tous payés en or de compte ;
- **Monde vivant, Phase 5** (30 juillet) : quatre biomes en rotation déterministe, affinités
  élémentaires, raretés de monstres et boss périodique ;
- **Quêtes et marchand partagés** (30 juillet) : quête commune alimentée par les éliminations de
  toute l'équipe, récompensée en ferraille, et rotation d'offres rares par vague ;
- **Protection de l'atelier** (30 juillet) : un joueur dont l'atelier de tourelle est ouvert et
  validé par la simulation est ignoré par les monstres.

### Modifié

- **La coopération est passée d'un modèle hôte-autoritaire à un lockstep pair-à-pair**
  (30 juillet). Chaque navigateur exécute la même simulation et n'échange que des entrées ;
  Supabase Realtime ne sert plus que de bus de messages. Ajoute l'ordonnancement du roster à une
  frontière de tick, les empreintes d'état, et la réintégration d'un joueur en cours de partie.
  Consigné dans [ADR-0008](docs/decisions/ADR-0008-p2p-lockstep-coop.md) ;
- la partie n'a plus de condition de victoire : elle se termine uniquement par une défaite ;
- la mort n'est plus définitive : en coopération, un avatar tombé se relève seul après trente
  secondes ; en solo, elle reste une défaite immédiate ;
- **la minification de production est désactivée** (27 juillet) car rolldown/oxc cassait le rendu
  du canvas. Le paquet de la page de jeu pèse en conséquence 7,4 Mo non minifié.

### Retiré

- **les tests navigateur ont été retirés de la CI** (27 juillet) : l'authentification obligatoire
  interpose un écran de connexion, et la CI n'a pas de clés Supabase. Les scénarios existants
  n'ont jamais été adaptés et échouent aujourd'hui ;
- **l'API de débogage `window.__VILLAGE_SURVIVOR_DEBUG__` a disparu** avec l'ancien point
  d'entrée. Plus aucun fichier source ne la définit, alors que la documentation et les tests
  Playwright la supposent présente ;
- les métriques de développement — FPS, durée de tick, nombre d'entités — ne sont plus exposées ;
- les pages de diagnostic `phasertest.html` et `gametest.html`, ajoutées le 27 juillet pour
  isoler un problème de rendu, ont été supprimées après correction.

### Sécurité

- le schéma Supabase applique `row level security` sur toutes les tables exposées, avec des
  fonctions `security definer` à `search_path` fixé et une identité prise du JWT via
  `auth.uid()` ; aucun identifiant de compte n'est accepté en paramètre ;
- les crédits d'or passent exclusivement par une RPC atomique et bornée, sans politique
  d'écriture directe sur le portefeuille ;
- seule la clé publique `anon` est utilisée par le client, et `.env` est ignoré par Git ;
- **limite assumée** : la simulation étant hébergée par le navigateur, le montant d'or crédité
  en fin de partie est déclaré par le client. Voir
  [ADR-0009](docs/decisions/ADR-0009-account-persistence.md) ;
- **limite assumée** : le lockstep pair-à-pair n'offre aucune protection contre la triche ; les
  empreintes d'état détectent une divergence sans pouvoir l'arbitrer.

---

## MVP « M1 » — 20 au 26 juillet 2026 — remplacé

Ce jalon a été entièrement livré, puis rendu inatteignable par le passage au jeu Tower. Son code
subsiste dans le dépôt sans être exécuté ; sa suppression est en attente.

### Ajouté

- premier MVP solo jouable avec carte issue d'une graine, cycles jour/nuit et vague
  finale ;
- disciplines Épée et Barrière, attaque automatique, compétences actives, expérience
  et choix d'améliorations sans pause ;
- gisements gardés, transport limité, stock personnel, baliste et progression du Cœur
  du village ;
- monorepo pnpm avec client Phaser 4, protocoles partagés, contenu Zod validé et
  simulation headless à pas fixe ;
- HUD français, minimap, sons synthétiques, métriques de développement et graphismes
  temporaires ;
- tests Vitest, parcours Playwright, smoke test du build de production, benchmark et
  workflow GitHub Actions ;
- piliers produit et décisions détaillées de l'atelier du 20 juillet 2026 ;
- inventaire fonctionnel et matrice de sélection du prototype historique ;
- cadrage technique initial avec exigences identifiées et règles de changement ;
- vue d'ensemble de l'architecture locale puis multijoueur ;
- ombres portées sous les entités, flash blanc à l'impact et gerbes de particules
  teintées par espèce à la mort d'un ennemi ;
- tri des entités par ordonnée, caméra lissée anticipant la direction visée et
  paramètres visuels de phase isolés en fonctions pures testées hors navigateur ;
- butin de bois laissé par les assaillants vaincus, source renouvelable qui débloque
  un joueur ayant épuisé sa réserve ;
- assauts nocturnes croissants : brutes apparaissant puis se multipliant et montée en
  puissance des points de vie et des dégâts des assaillants générés à chaque cycle ;
- ADR du monorepo, de la simulation, des sessions, du serveur autoritaire, du contenu
  piloté par les données, de la persistance différée et du rendu en mode immédiat ;
- matrice de traçabilité des exigences ;
- règles de gameplay courantes, feuille de route et cible de déploiement ;
- porte d'entrée documentaire du dépôt.

### Modifié

- les journées et les nuits durent désormais toutes deux 75 secondes ;
- la zone du village possède une limite visible et un indicateur intérieur/extérieur ;
- le dépôt des ressources exige maintenant `E` dans le village au lieu d'être
  automatique ;
- la portée de la baliste est visible et chaque tir prend la forme d'un carreau animé ;
- les balistes peuvent être fabriquées en plusieurs exemplaires à la position choisie
  dans le village ; leur chantier de cinq secondes est interrompu et remboursé si le
  personnage subit des dégâts ;
- l'équilibrage oppose désormais davantage de dormeurs et de renforts, des ennemis plus
  dangereux et une survie moins permissive dès la première nuit ;
- l'attaque automatique de l'Épée produit un arc de lame orienté vers sa cible ;
- le sol diurne utilise une teinte très claire avec des contrastes adaptés ;
- les paramètres de génération, détection, réparation et vagues sont regroupés dans le
  catalogue TypeScript validé de `packages/content` ;
- les trois améliorations sont tirées sans remise selon des poids, avec un flux
  aléatoire déterministe indépendant de la génération du monde ;
- les ennemis survivant à la nuit conservent leur type, leurs caractéristiques et leur
  récompense lorsqu'ils retournent dormir ;
- la simulation avance désormais sans produire automatiquement un instantané ; la
  session locale ne crée l'état public qu'au moment de le publier ;
- le mouvement, le combat, la construction, les phases, le ciblage et la projection
  d'état sont séparés de l'orchestrateur `GameSimulation` ;
- la nuit tombe désormais progressivement pendant les dernières secondes du jour, et
  l'aube revient de la même manière, au lieu d'un changement brutal de couleur ; la
  bascule vers l'activation finale reste une rupture assumée puisqu'elle est déclenchée
  par le joueur ;
- le rendu du monde est organisé en passes ordonnées, les ombres précédant tous les
  corps et les barres de vie les suivant, afin de rester lisible en cas de
  chevauchement ;
- gagner un niveau n'interrompt plus l'action : les améliorations dues s'empilent, un
  rappel pulsé les signale et le joueur ouvre le panneau avec `F` quand il le peut,
  puis choisit à la souris ou avec `1`, `2` et `3` ;
- un niveau gagné alors qu'un choix est déjà en attente ne suspend plus la
  progression, et chaque offre est tirée au moment d'être présentée pour qu'aucune
  amélioration ne soit proposée deux fois ;
- une coopération hôte-autoritaire sur Supabase Realtime a été ajoutée le 28 juillet, avant
  d'être remplacée avec le jeu lui-même.

### Corrigé

- les événements d'une frame traitant plusieurs ticks ne sont plus perdus : la session
  les collecte après chaque tick au lieu de ne publier que ceux du dernier, ce qui
  rétablit les flashes d'impact et les gerbes de particules manquants après un blocage
  du navigateur ou une accélération de la simulation ;
- les ombres portées étaient calées sous le centre des entités et restaient donc
  entièrement masquées par leur corps opaque ; elles sont désormais posées au pied de
  chaque entité. L'empreinte du personnage suit son anneau de garde et non son corps,
  faute de quoi son ombre restait cachée derrière cet anneau ;
- un joueur qui dépensait tout son bois en balistes sans jamais activer le Cœur se
  retrouvait sans ressource et ne pouvait plus gagner, la ressource statique étant
  finie ; les assaillants vaincus laissent désormais du bois et un invariant de contenu
  validé garantit que les seuls gisements couvrent déjà le chemin obligatoire.

### Sécurité

- l'API de débogage était limitée au développement et son absence du build était testée ;
- les données issues de l'URL sont échappées avant affichage et étaient couvertes par le smoke
  test de production ;
- la provenance et les droits des futurs assets deviennent une exigence explicite ;
- la politique interdit les secrets dans Git et diffère toute télémétrie non validée.
