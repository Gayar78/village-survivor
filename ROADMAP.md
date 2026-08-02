# Feuille de route

Dernière mise à jour : 31 juillet 2026

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

## Remontées de la session du 1er août 2026 — Prochain

Constatées en partie réelle à plusieurs postes, **à traiter avant toute évolution
fonctionnelle** sur décision du propriétaire. Détail dans [`docs/feedback.md`](docs/feedback.md).

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

## Dette à résorber — Prochain

Ces travaux ne demandent aucune décision produit.

1. **Rétablir une observabilité.** Il n'existe plus d'API de débogage ni de métriques de
   développement (FPS, durée de tick, nombre d'entités), ce qui empêche tout pilotage automatisé
   du jeu et interdit un vrai test de bout en bout.
2. **Enregistrer les résultats de partie.** `statsService.recordGameResult` existe et la RPC
   `record_game_result` est en base, mais **rien ne les appelle** : l'écran de profil lit une
   table que le jeu n'écrit jamais, et affiche donc des statistiques éternellement à zéro. Le
   correctif suppose de redéfinir ce qu'est un résultat de partie pour Tower — il n'y a plus ni
   victoire ni ressources.
3. **Tester le lobby de bout en bout.** Un mode invité, ou un mock d'authentification, est le
   préalable.
4. **Ajouter un `.gitattributes`.** Sans lui, `pnpm format:check` échoue sur toute machine
   Windows où Git convertit les fins de ligne.
5. **Réactiver la minification.** Elle est désactivée depuis le 27 juillet parce que rolldown/oxc
   cassait le rendu du canvas ; le paquet de jeu pèse 7,2 Mo non minifié. À reprendre quand la
   chaîne de build le permettra.
6. **Valider le contenu Tower.** ADR-0005 exige un schéma explicite et une validation au
   chargement ; le catalogue Tower n'en a aucun, et une partie du réglage vit dans le moteur.
7. **Nettoyer le schéma Supabase.** Les tables `coffre_balances`, `unlocked_spells` et
   `account_items` de la migration `0001` ne sont référencées par aucun code.
8. **Points de reprise pour la reconnexion.** Tant que le rejeu part du premier tick, la fenêtre
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
