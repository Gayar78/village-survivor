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

Il a été remplacé fin juillet par le jeu Tower. Son code reste dans le dépôt sans être atteignable
depuis aucune page, et sa suppression est en attente. Ses tests continuent de passer et couvrent
donc du code que personne n'exécute.

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

## Décisions à arbitrer

Elles ne relèvent pas de la technique et personne ne peut les prendre à la place des porteurs du
produit. Chacune est détaillée dans l'ADR indiqué.

1. **Le jeu Tower remplace-t-il officiellement le concept Village Survivor ?** Si oui, les piliers
   produit du 20 juillet doivent être remplacés par une décision datée, et non simplement
   contredits par le code.
2. **La progression persistante de compte est-elle acceptée ?** Elle contredit le pilier n°13
   (partie one-shot) — [ADR-0009](docs/decisions/0009-account-persistence.md).
3. **Le lockstep pair-à-pair est-il la cible, ou une étape avant un serveur autoritaire ?**
   [ADR-0008](docs/decisions/0008-p2p-lockstep-coop.md).
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
