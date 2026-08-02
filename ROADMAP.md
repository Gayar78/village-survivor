# Feuille de route

Dernière mise à jour : 1er août 2026

## Convention

- **Terminé** : livré et vérifié dans le dépôt.
- **Remplacé** : livré, puis rendu obsolète par une évolution ultérieure.
- **Prochain** : prochain jalon à entreprendre.
- **Planifié** : intention acceptée, périmètre détaillé plus tard.
- **À arbitrer** : dépend d'une décision humaine qui n'a pas été prise.

## Avertissement

Le projet a changé de jeu en cours de route. Les jalons D0 à M1 décrivaient une boucle
« explorer le jour, défendre la nuit ». Les phases 1 à 5 décrivent le jeu réellement jouable
aujourd'hui, un twin-stick shooter de survie sans fin. **Ce basculement n'a pas fait l'objet
d'une décision produit datée** ; il est constaté ici comme il l'est dans les ADR 0008 et 0009.

---

## Socle technique

### Jalon D0 — Cadrage initial — Terminé

Piliers produit, analyse du prototype historique, décisions de l'atelier, cadrage technique,
architecture cible, ADR structurants et matrice de traçabilité.

### Jalon T0 — Initialisation technique — Terminé

Monorepo et workspaces pnpm, versions verrouillées, TypeScript strict, ESLint et Prettier,
commandes racine, Vitest, smoke test Playwright et GitHub Actions.

---

## Premier jeu — remplacé

### Jalons P1, P2 et M1 — Terminés, puis Remplacés

Le MVP M1 a été livré et vérifié le 21 juillet 2026 : carte issue d'une graine, cycle jour/nuit,
gisements gardés, transport et dépôt, disciplines Épée et Barrière, balistes, progression du Cœur
du village, vague finale, victoire et défaite.

Il a été remplacé fin juillet par le jeu Tower, puis **son code a été supprimé du dépôt le
31 juillet 2026** — 38 fichiers, 7 612 lignes. Il reste consultable dans l'historique Git.

### Jalon V1 — Boucle solo élargie — Abandonné de fait

Ce jalon prolongeait le jeu M1 : génération garantie, quatre disciplines, transport par poids,
branches du village, artefacts, furtivité. Rien n'en a été implémenté, et son objet a disparu avec
le jeu auquel il s'appliquait. Il est conservé ici pour mémoire, pas comme intention active.

---

## Jeu Tower — livré

### Phase 0 — Comptes et hub — Terminé (27 juillet 2026)

Authentification Supabase, double authentification TOTP, profil et statistiques, amis, présence,
invitations et salon par code. Séparation du lobby et de la page de jeu.

### Phase 1 — Premier jouable — Terminé (28 juillet 2026)

Contrat de protocole dédié, moteur `TowerSimulation`, rendu, HUD, boutique de tourelle et
assemblage : un Cœur, quatre tourelles, des vagues sans fin, une arme à feu et une visée souris.

### Phase 2 — Arsenal personnel — Terminé (29 juillet 2026)

Trois armes permutables avec progression indépendante, et or de compte crédité en fin de partie.

### Phase 3 — Arsenal de défense — Terminé (30 juillet 2026)

Modules uniques de tourelle, super-modules du marchand, priorités de ciblage et améliorations
globales du réseau défensif.

### Phase 4 — Méta-progression — Terminé (30 juillet 2026)

Profils de personnage, voies de bénédiction, compétences de compte, gemmes et forge.

### Phase 5 — Monde vivant — Terminé (30 juillet 2026)

Biomes en rotation déterministe, affinités élémentaires, raretés de monstres, boss périodique,
quêtes communes et rotations du marchand.

### Coopération lockstep — Terminé (30 juillet 2026)

Remplacement du netcode hôte-autoritaire par un lockstep pair-à-pair déterministe : roster
ordonné à la frontière de tick, empreintes d'état et réintégration en cours de partie.

---

### Déploiement LAN auto-hébergé — Terminé (31 juillet 2026)

Le jeu est jouable en multijoueur sur un réseau local sans internet : stack Docker
(Postgres, GoTrue, PostgREST, Realtime) et nginx servant le jeu et faisant passerelle sur une
seule origine. Voir [`deploy/lan/README.md`](deploy/lan/README.md).

C'est le premier environnement réellement déployé du projet. La cible Cloudflare reste ouverte
et suppose, elle, un projet Supabase hébergé.

---

## Correctifs de jouabilité du 1er août 2026

- **Déterminisme entre navigateurs rétabli.** Les vingt-huit appels à des fonctions approximées
  par l'implémentation sont remplacés par des opérations exactement spécifiées, et une garde de
  lint interdit leur retour. C'est ce qui conditionnait l'existence du mode coopératif.
- **« Fracture glaciale » agit enfin.** L'amélioration mythique la plus rare — 0,9 % de chance
  d'être proposée — incrémentait un compteur que la simulation ne lisait jamais. Les coups
  critiques ralentissent désormais leur cible. Les valeurs de réglage sont prudentes et
  **demandent une validation en partie réelle** : cette amélioration n'avait jamais été
  équilibrée, faute d'exister.
- **Le déplacement répond sans délai.** L'avatar local est dessiné à l'heure du joueur, à partir
  des entrées déjà diffusées : de 150-200 ms de retard, on passe à 50 ms au plus. Le prix, arbitré
  par [ADR-0010](docs/decisions/ADR-0010-local-render-prediction.md), est un écart d'affichage
  entre l'avatar et le monde autour de lui, **à juger en jouant**. Les gels dus à un pair en
  retard, eux, ne sont pas corrigés : ils appartiennent au modèle lockstep.
- **Le jeu est enfin observable.** Traces d'une partie, mesures de performance et journaux
  corrélés partent du navigateur vers un collecteur de la pile LAN, consultable sur
  `http://<adresse>:3001`. C'est ce qui permettra, à la prochaine session, de départager le
  retard constant des gels au lieu d'en discuter. Détail dans
  [`docs/observabilite.md`](docs/observabilite.md).

## Dette résorbée le 31 juillet 2026

- **Ancien jeu supprimé** : 38 fichiers, 7 612 lignes. Les tests passent de 167 à 100, tous
  portant désormais sur le jeu réellement exécuté.
- **Scénario de performance rétabli** sur le jeu Tower : coût par tick sous 200 monstres et coût
  d'une projection d'état, mesurés sur les ticks réellement simulés.
- **Smoke test de production rétabli et remis en CI.** Il vise `play.html`, qui démarre sans
  Supabase, et vérifie que le jeu démarre, que l'API de débogage est absente du build et que la
  graine reçue par l'URL n'est pas interprétée comme du HTML.
- **Documentation remise en phase** avec le code, écarts consignés plutôt qu'effacés.
- **Graine de partie corrigée hors contexte sécurisé** : `crypto.randomUUID` n'existe pas sur
  une page servie en HTTP depuis une adresse de réseau local, ce qui faisait échouer le
  lancement d'une partie. Les trois points d'appel partagent désormais un assistant unique.

## Correctifs du 31 juillet 2026 — audit externe

Un audit indépendant a relevé dix constats. Ceux qui ont été vérifiés dans le code sont corrigés :

- **projectiles traversants** — la collision ne testait que la position d'arrivée. À 47,5 unités
  par tick, la Longue-vue sautait par-dessus les petits monstres. Remplacée par un test exact du
  segment parcouru ;
- **kamikaze désamorcé par les tirs** — il n'explosait qu'au contact, alors que le réglage et les
  règles annonçaient « au contact ou à sa mort ». L'abattre le neutralisait purement ;
- **double authentification contournable** — l'interface révélait le contenu authentifié dès que
  le contrôle échouait, et la base ne vérifiait aucun niveau d'assurance. L'interface échoue
  désormais fermé, et `0005_require_mfa.sql` ajoute des politiques restrictives ainsi qu'une
  garde sur le crédit d'or ;
- **budget de bénédictions affiché à tort** — une capacité constante était présentée comme un
  montant dépensé, si bien qu'un profil neuf annonçait « 4 / 4 investis » ;
- **fenêtre de reconnexion** — portée de dix à vingt minutes, bornée par le temps de rejeu ;
- **`setup.mjs` écrasait le `.env` racine** — il fusionne désormais clé par clé, avec sauvegarde ;
- **vulnérabilité transitive** — `brace-expansion` forcé en version corrigée par un override ;
- **incohérences documentaires** — suppression du M1, nombre de tests, statut d'hébergement et
  titre de page.

Trois constats de sécurité ne sont **pas** traités, par cohérence avec la frontière de
l'objectif : canaux temps réel usurpables, montant d'or déclaré par le client, et fonctions
`security definer` autres que le crédit d'or. Ils sont consignés dans la matrice de traçabilité.

## Remontées de la session du 1er août 2026 — Corrigées, à revérifier en jeu

Constatées en partie réelle à plusieurs postes, **à traiter avant toute évolution
fonctionnelle** sur décision du propriétaire. Détail dans [`docs/feedback.md`](docs/feedback.md).

Les deux constats ont reçu leur correctif le jour même — voir « Correctifs de jouabilité du
1er août 2026 » plus haut. **Ni l'un ni l'autre n'est vérifié en conditions réelles** : le
déterminisme demande une partie à plusieurs navigateurs, le confort de déplacement demande un
jugement de joueur. L'énoncé du problème est conservé ci-dessous tel qu'il a été établi ; il
reste la référence pour la recette.

Ce qui n'est **pas** corrigé, et reste ouvert :

- **les gels dus au pair le plus lent**, inhérents au lockstep. L'avatar local continue d'obéir
  200 ms au plus, le monde se fige toujours ;
- **la part respective du retard constant et des gels**, toujours non mesurée : c'est un objectif
  de l'incrément d'observabilité ;
- **l'échange de l'identité du build à la jonction** et l'en-tête `Cache-Control` explicite, qui
  transformeraient une divergence d'une autre origine en message compréhensible avant la partie.

1. **Désynchronisation entre pairs — cause établie, et bloquante pour la coopération.** Mesurée
   le 1er août 2026 sur trois navigateurs : `Math.cos`, `Math.sin` et `Math.atan2` renvoient des
   valeurs différentes **y compris entre deux versions du même moteur** — Chromium 148 et
   Edge 150 ne s'accordent pas — et `Math.hypot` diffère entre moteurs. La simulation les appelle
   à vingt-huit endroits du chemin critique, à chaque tick.

   **Aucune consigne d'usage ne peut protéger** : il faudrait imposer le même navigateur *et* la
   même version, sur des logiciels qui se mettent à jour seuls. Une mise à jour silencieuse chez
   un seul joueur rompt l'accord. Le correctif dans le code est donc la seule voie fiable, et il
   conditionne l'existence du mode coopératif.

   Le correctif n'exige **pas** d'implémenter des fonctions trigonométriques déterministes. Les
   appels se répartissent en trois motifs, tous remplaçables par des opérations exactement
   spécifiées par le langage — `+ - * /`, `Math.sqrt` et `Math.round` :

   - **aller-retour vecteur → angle → vecteur** (`redirectBullet`, tir de tourelle, tir joueur) :
     calculer directement la direction normalisée. Supprime `atan2`, `cos` et `sin` d'un coup,
     et coûte moins cher que le détour par l'angle ;
   - **angles constants** des quatre tourelles (0°, 90°, 180°, −90°) : table de vecteurs
     unitaires exacts, aucun calcul ;
   - **tirage d'un angle aléatoire** pour l'apparition de ferraille et de vagues : tirer un
     vecteur de direction plutôt qu'un angle.

   Ainsi que `Math.hypot(x, y)` → `Math.sqrt(x * x + y * y)`, exact et sans risque de
   dépassement à l'échelle du jeu.

   Deux précautions à prendre au passage : les valeurs produites changeront légèrement, donc les
   tests portant sur des positions exactes seront à revoir ; et il faut ajouter une **garde
   d'architecture interdisant tout appel à une fonction non exactement spécifiée** dans
   `game-core`, faute de quoi le problème reviendra sans prévenir.

   **Parade partielle, applicable avant le correctif** : échanger à la jonction l'identité du
   navigateur en plus de celle du build du jeu, et avertir — ou refuser — quand les pairs ne
   partagent pas exactement le même build. Cela ne répare rien, mais transforme une
   désynchronisation inexplicable en un message compréhensible **avant** la partie plutôt qu'au
   bout de deux minutes. Utile aussi contre une divergence d'origine différente, tout comme
   servir les pages avec un en-tête `Cache-Control` explicite.
2. **Délai ressenti entre l'action et le déplacement.** Comportement inhérent au lockstep, déjà
   consigné comme conséquence négative dans l'ADR-0008 : 100 ms de retard par conception, plus
   l'attente du pair le plus lent. Deux pistes :
   - **prédiction de l'avatar local au rendu seulement** — la simulation reste autoritaire et
     déterministe, seul l'affichage anticipe. C'est le seul correctif qui améliore le ressenti
     sans toucher au modèle ;
   - abaisser le retard d'entrée de deux ticks à un, au prix d'une moindre tolérance aux à-coups.

   Mesurer avant de choisir : la part du retard constant et celle des gels intermittents ne sont
   pas connues.

## Correctifs proposés après la mesure du 2 août 2026 — À arbitrer

Établis par la télémétrie, détaillés dans [`docs/feedback.md`](docs/feedback.md). **Aucun n'est
implémenté** : ils demandent un arbitrage, et le troisième touche le modèle lui-même.

### 1. Aligner l'horloge de capture sur celle de la simulation — *corriger un défaut*

La capture des entrées avance sur un `setInterval` qui perd un tick à chaque déclenchement tardif
ou fusionné ; la simulation avance sur un accumulateur qui n'en perd aucun. La réserve de trois
ticks entre les deux se vide et ne se reconstitue jamais.

**Proposition** : capturer depuis le même accumulateur que la simulation — produire autant de
ticks d'entrée que le temps réel en réclame, au lieu d'un par déclenchement de minuteur. La
réserve redevient alors auto-stabilisée.

Portée : `towerSession.ts` seul, une trentaine de lignes. Aucun changement de protocole, aucun
effet sur le déterminisme — les entrées produites sont les mêmes, seule leur cadence de production
change. **Risque faible, bénéfice attendu élevé** : c'est ce qui rétablit à la fois la cadence de
20 Hz et le fonctionnement de la prédiction de rendu.

À faire en premier, et à mesurer avant d'aller plus loin. Il est possible que cela suffise.

### 2. Distinguer les pairs dans la télémétrie — *rendre la mesure exploitable*

Les deux postes écrivent dans la même série : aucune évolution temporelle n'est lisible, et on ne
sait pas de quel pair viennent les valeurs.

**Proposition** : un identifiant de session tiré au hasard à l'ouverture de l'onglet, attaché aux
ressources OpenTelemetry. Il ne désigne ni le compte ni la personne — il distingue deux
exécutions, ce qui est exactement le besoin, et rien de plus.

Portée : quelques lignes dans `observability/telemetry.ts`. Sans lui, la prochaine session sera
aussi difficile à lire que celle-ci.

### 3. Rendre l'avance d'entrée adaptative — *atténuer, sans changer de modèle*

Le retard d'entrée est figé à deux ticks. Trop court, la réserve se vide au moindre à-coup ; trop
long, le jeu répond moins bien pour tout le monde.

**Proposition** : faire varier ce retard selon la réserve réellement observée, en le faisant
annoncer par le coordinateur à une frontière de tick — le mécanisme d'événements de roster existe
déjà et garantit que tous les pairs changent au même tick.

Portée : moyenne, et elle touche le protocole. À n'entreprendre que si le correctif 1 ne suffit
pas.

### 4. Découpler la simulation du temps réel des autres — *changer de modèle*

C'est la remise en cause de fond, et elle est proposée sans être recommandée aujourd'hui.

Le lockstep couple les horloges d'entrée, de simulation et d'affichage de tous les pairs en une
seule, dont la cadence est celle du plus lent. Aucun mécanisme ne rattrape le temps perdu, et
**un défaut local devient définitivement un défaut collectif**. Les correctifs 1 et 3 déplacent
le seuil de tolérance ; ils ne suppriment pas la propriété.

Deux sorties existent, toutes deux importantes :

- **Rejeu avec retour arrière (« rollback »).** Chaque pair simule immédiatement avec des entrées
  distantes supposées, puis rembobine et rejoue quand les vraies arrivent. L'entrée locale est
  appliquée sans aucun délai, quelles que soient les autres machines. C'est le modèle des jeux
  d'action en réseau. Il exige que la simulation sache **prendre un instantané complet de son
  état et y revenir** — ce que `TowerSimulation` ne sait pas faire aujourd'hui.

  À noter : **c'est exactement ce que réclame déjà la dette n°7** (points de reprise pour la
  reconnexion, aujourd'hui bornée par un rejeu depuis le tick zéro). Un même travail — un
  instantané sérialisable de l'état — sert les deux besoins. C'est l'argument le plus fort en sa
  faveur.

- **Serveur autoritaire**, c'est-à-dire le retour à l'[ADR-0004](docs/decisions/ADR-0004-authoritative-multiplayer-server.md)
  que l'[ADR-0008](docs/decisions/ADR-0008-p2p-lockstep-coop.md) a remplacé sans arbitrage. Il
  supprime le couplage entre pairs et règle du même coup la question de la triche, laissée
  ouverte. Il rouvre en revanche l'hébergement, son coût et son exploitation — que l'objectif
  écarte aujourd'hui.

**Recommandation** : appliquer 1 et 2, remesurer, et ne trancher entre 3 et 4 qu'avec ces
chiffres en main. Décider aujourd'hui reviendrait à choisir une architecture sur une seule partie
de deux minutes.

## Dette à résorber — Prochain

Ces travaux ne demandent aucune décision produit.

1. **Enregistrer les résultats de partie.** `statsService.recordGameResult` existe et la RPC
   `record_game_result` est en base, mais **rien ne les appelle** : l'écran de profil lit une
   table que le jeu n'écrit jamais, et affiche donc des statistiques éternellement à zéro. Le
   correctif suppose de redéfinir ce qu'est un résultat de partie pour Tower — il n'y a plus ni
   victoire ni ressources.
2. **Tester le lobby de bout en bout.** Un mode invité, ou un mock d'authentification, est le
   préalable.
3. **Ajouter un `.gitattributes`.** Sans lui, `pnpm format:check` échoue sur toute machine
   Windows où Git convertit les fins de ligne.
4. **Réactiver la minification.** Elle est désactivée depuis le 27 juillet parce que rolldown/oxc
   cassait le rendu du canvas ; le paquet de jeu pèse 7,2 Mo non minifié. À reprendre quand la
   chaîne de build le permettra.
5. **Valider le contenu Tower.** ADR-0005 exige un schéma explicite et une validation au
   chargement ; le catalogue Tower n'en a aucun, et une partie du réglage vit dans le moteur.
6. **Nettoyer le schéma Supabase.** Les tables `coffre_balances`, `unlocked_spells` et
   `account_items` de la migration `0001` ne sont référencées par aucun code.
7. **Points de reprise pour la reconnexion.** Tant que le rejeu part du premier tick, la fenêtre
   de reconnexion restera bornée par le temps de rejeu. Des instantanés périodiques de l'état de
   simulation la rendraient indépendante de la durée de la partie — condition nécessaire pour
   des sessions longues, qui sont précisément ce que vise un jeu de survie sans fin.

## Décisions à arbitrer

Elles ne relèvent pas de la technique et personne ne peut les prendre à la place des porteurs du
produit. Chacune est détaillée dans l'ADR indiqué.

1. **Le jeu Tower remplace-t-il officiellement le concept Village Survivor ?** Si oui, les piliers
   produit du 20 juillet doivent être remplacés par une décision datée, et non simplement
   contredits par le code.
2. **La progression persistante de compte est-elle acceptée ?** Elle contredit le pilier n°13
   (partie one-shot) — [ADR-0009](docs/decisions/ADR-0009-account-persistence.md).
3. **Le lockstep pair-à-pair est-il la cible, ou une étape avant un serveur autoritaire ?**
   [ADR-0008](docs/decisions/ADR-0008-p2p-lockstep-coop.md).
4. **La triche est-elle assumée ?** Le client déclare son or de compte et exécute sa propre
   simulation. Sans classement ni économie payante, c'est peut-être acceptable — c'est à dire
   explicitement.
5. **Le jeu doit-il rester jouable sans compte ?** Un mode invité débloquerait la CI navigateur.
6. **Quelle politique de rétention et de suppression des données de compte ?** Des adresses email
   sont stockées et rien n'est défini.
7. **Faut-il une condition de victoire ?** Le jeu n'en a aucune ; les piliers en exigeaient une.
8. **Licence du dépôt public**, toujours absente.
9. **Accès et responsabilités du déploiement**, jamais fournis : le jeu n'est hébergé nulle part.

## Différé

- support mobile ;
- direction artistique et pipeline graphique définitifs ;
- classement ;
- télémétrie ou collecte de données personnelles au-delà du compte.
