# Village Survivor — Spécification fonctionnelle

> Statut : **en revue** — en attente de validation des comportements par le propriétaire
> Version du projet : v1
> Propriétaire : Gayar
> Dernière revue : 1er août 2026
> Niveau de garantie requis : `renforce`

**Le comportement du jeu ne change pas.** Cette version spécifie le produit tel qu'il
fonctionne aujourd'hui, correctifs du 31 juillet compris. Le seul apport de l'incrément à venir
est la **télémétrie**, qui n'altère aucune règle.

Décision du propriétaire, et elle est bonne : les deux questions produit encore ouvertes — la
condition de victoire et la persistance entre les parties — sont suspendues aux tests, et les
tests ont besoin de mesures. Figer le fonctionnel permet d'aller mesurer.

## Division du travail avec les autres documents

Pour éviter la redite, chacun répond à une question différente :

| Document | Répond à |
|---|---|
| Cette spécification | ce que le produit doit faire, comment on le vérifie, comment on le diagnostique |
| [`gameplay/current-rules.md`](gameplay/current-rules.md) | les valeurs exactes — dégâts, coûts, durées, budgets de vagues |
| [`observabilite.md`](observabilite.md) | la mécanique de la télémétrie et ses métriques |
| [`qualite/strategie-tests.md`](qualite/strategie-tests.md) | les types de tests et les gates |

## Parcours principal

1. Le joueur ouvre l'adresse du jeu sur le réseau local.
2. Il crée un compte ou se connecte, puis satisfait son second facteur.
3. Le menu principal s'affiche : partie solo, multijoueur, atelier de build, profil, réglages.
4. **En solo**, il lance une partie : la carte se génère depuis une graine, il défend le Cœur.
5. **En coopération**, il crée un salon ou rejoint celui d'un ami, puis l'hôte lance.
6. La partie se joue : vagues sans fin, améliorations de tourelles, montées de niveau.
7. La partie se termine par la chute du Cœur, la mort de l'avatar en solo, ou un abandon.
8. L'or gagné est crédité au compte, et alimente la méta-progression hors partie.

Ce parcours traverse toutes les couches significatives : navigateur, simulation déterministe,
authentification, base de données et — en coopération — le canal temps réel. C'est à ce titre
qu'il constitue le MVP.

## Périmètre du MVP

| Fonctionnalité | MVP | Pourquoi |
|---|:---:|---|
| Connexion et second facteur | oui | porte d'entrée obligatoire du lobby |
| Partie solo | oui | parcours le plus court traversant toutes les couches |
| Salon et partie coopérative | oui | c'est le mode que les tests doivent éprouver |
| Boucle de jeu, armes, vagues | oui | le produit lui-même |
| Atelier de tourelle et ferraille | oui | seul levier de progression en partie |
| Montée de niveau | oui | seul levier de progression personnelle |
| Fin de partie et crédit d'or | oui | relie la partie à la méta-progression |
| Atelier de méta-build | oui | c'est ce qui donne une raison de relancer |
| Reconnexion coopérative | oui | déjà implémentée, et sa limite doit être mesurée |
| **Télémétrie** | **oui** | **seul ajout de l'incrément ; sans elle le critère de réussite est incomptable** |
| Condition de victoire | non | suspendue aux tests |
| Modification de la persistance | non | suspendue aux tests |
| Enregistrement des statistiques de partie | non | fonctionnalité inachevée, voir « Écarté du MVP » |

## Fonctionnalités

### F-001 — Connexion et second facteur

Le joueur accède au lobby avec un compte. Tout compte créé par courriel doit valider un second
facteur avant d'obtenir le moindre accès.

**Critères d'acceptation**

- Une inscription par courriel aboutit sans qu'aucun message ne soit envoyé, et enchaîne
  immédiatement sur l'enrôlement du second facteur.
- Tant que le second facteur n'est pas validé, **aucune donnée de compte n'est lisible ni
  modifiable**, ni par l'interface ni par un appel direct à l'API.
- Un échec de vérification du niveau d'authentification **refuse l'accès** au lieu de l'accorder.
- Les fournisseurs externes sont visibles mais inopérants en réseau local ; leur échec est
  explicite et n'empêche pas la connexion par courriel.

**Modes de défaillance**

- Service d'authentification injoignable → message clair, aucune boucle de rechargement.
- Second facteur incorrect → refus, nouvelle tentative possible, aucun verrouillage de compte.
- Enrôlement abandonné en cours → le facteur non vérifié est nettoyé, une nouvelle tentative
  reste possible.

**Cas de test**

| ID | Cas | Attendu |
|---|---|---|
| T-F001-01 | inscription puis enrôlement complet | accès au menu |
| T-F001-02 | session au premier niveau d'authentification, appel direct à l'API | refus en lecture **et** en écriture |
| T-F001-03 | contrôle du niveau en erreur | accès refusé, écran de connexion |
| T-F001-04 | lecture des données d'un autre compte | refus |

**Diagnostic attendu**

| Élément | Décision |
|---|---|
| Opération/span stable | `lobby.signin` |
| Spans enfants utiles | `auth.password`, `auth.mfa.enroll`, `auth.mfa.verify` |
| Événements/logs | succès, refus, service injoignable — niveau `info` sauf refus en `warn` |
| Données interdites | adresse e-mail, mot de passe, secret et code TOTP, jeton |

### F-002 — Lancement d'une partie solo

Depuis le menu, le joueur lance une partie immédiatement, sans configuration.

**Critères d'acceptation**

- Une graine est tirée et transmise à la page de jeu ; la même graine rejoue le même monde.
- Le build de méta-progression actif est appliqué avant le premier tick, et reste figé pendant
  toute la partie.
- La page de jeu **démarre sans service externe joignable** : une panne d'authentification
  n'empêche pas de jouer en solo.

**Modes de défaillance**

- Build de méta indisponible → la partie démarre avec les statistiques de base, sans bloquer.
- Graine absente de l'URL → une graine est tirée localement.

**Cas de test**

| ID | Cas | Attendu |
|---|---|---|
| T-F002-01 | lancement nominal | partie démarrée, graine appliquée |
| T-F002-02 | service de compte injoignable | partie jouable, aucune erreur bloquante |
| T-F002-03 | deux parties de même graine | mondes identiques |

**Diagnostic attendu**

| Élément | Décision |
|---|---|
| Opération/span stable | `game.session` (racine), attribut `vs.mode=solo` |
| Spans enfants utiles | `game.session.start` |
| Événements/logs | démarrage, build appliqué ou ignoré |
| Données interdites | identifiant de compte en clair dans le nom du span |

### F-003 — Salon coopératif et lancement groupé

Un joueur crée un salon, ses amis le rejoignent par code ou invitation, l'hôte lance.

**Critères d'acceptation**

- Tous les pairs démarrent sur **la même graine** et au même tick de départ.
- Un pair qui n'a pas rejoint la barrière de démarrage n'empêche pas indéfiniment le lancement :
  l'attente est bornée.
- Le nombre d'avatars actifs est borné à dix.

**Modes de défaillance**

- Canal temps réel injoignable → message explicite, retour au menu possible.
- Pair silencieux au-delà du délai → il est retiré du roster par un événement ordonné, identique
  chez tous les pairs.

**Cas de test**

| ID | Cas | Attendu |
|---|---|---|
| T-F003-01 | trois pairs, lancement nominal | même graine, même tick de départ |
| T-F003-02 | un pair ne répond pas | barrière expirée, partie lancée sans lui |
| T-F003-03 | canal injoignable | échec explicite, pas de partie fantôme |

**Diagnostic attendu**

| Élément | Décision |
|---|---|
| Opération/span stable | `hub.launch`, puis `game.session` avec `vs.mode=coop` |
| Spans enfants utiles | `hub.roster.resolve`, `coop.channel.join`, `coop.start.barrier` |
| Événements/logs | jonction, barrière franchie ou expirée, retrait d'un pair |
| Données interdites | **code de salon en clair** — il ouvre le canal, il n'est émis que haché |

### F-004 — Déroulement d'une partie

Le joueur se déplace, vise, tire, et affronte des vagues qui ne s'arrêtent jamais.

**Critères d'acceptation**

- La simulation avance à pas fixe de 50 ms, indépendamment du nombre d'images par seconde.
- **Un projectile touche ce qu'il traverse pendant son tick**, et pas seulement ce qui se trouve
  à son point d'arrivée.
- Un kamikaze explose au contact **comme à sa mort**, quelle qu'en soit la cause.
- À graine et entrées identiques, deux exécutions produisent le même état — c'est la condition
  de la coopération.
- Une partie se termine par défaite uniquement : chute du Cœur, ou mort de l'avatar en solo.

**Modes de défaillance**

- Image très longue ou onglet suspendu → le rattrapage de ticks est borné, la partie ne
  « saute » pas arbitrairement.
- Divergence entre pairs → détectée par comparaison d'empreintes, journalisée.

**Cas de test**

| ID | Cas | Attendu |
|---|---|---|
| T-F004-01 | tir rapide sur petite cible | touche, sans traverser |
| T-F004-02 | kamikaze abattu à distance | explose là où il meurt |
| T-F004-03 | deux exécutions, même graine | états identiques |
| T-F004-04 | Cœur détruit | statut `defeat` |

**Diagnostic attendu**

| Élément | Décision |
|---|---|
| Opération/span stable | aucun — **jamais un span par tick** |
| Métriques | durée de tick, durée d'image, entités, ticks rattrapés, vague |
| Événements/logs | défaite, divergence d'empreinte |
| Données interdites | aucune donnée personnelle ; pas de span par entité |

### F-005 — Atelier de tourelle et ferraille commune

À proximité d'une tourelle, le joueur dépense la ferraille commune pour la renforcer.

**Critères d'acceptation**

- L'atelier ne s'ouvre qu'à portée d'une tourelle vivante, pour un joueur vivant.
- Tant que l'atelier est ouvert et validé par la simulation, **l'avatar est ignoré par les
  monstres** ; la tourelle, elle, reste vulnérable.
- Un achat impossible est refusé **avant** d'être tenté, pas signalé après coup.
- La ferraille est commune : une dépense d'un joueur est visible par tous.

**Modes de défaillance**

- Ferraille insuffisante → l'achat est indisponible à l'écran.
- Module déjà installé → proposé une seule fois par tourelle.

**Cas de test**

| ID | Cas | Attendu |
|---|---|---|
| T-F005-01 | achat nominal | effet appliqué, ferraille débitée |
| T-F005-02 | ferraille insuffisante | achat indisponible |
| T-F005-03 | atelier ouvert, monstre au contact | joueur épargné, tourelle touchée |

**Diagnostic attendu**

| Élément | Décision |
|---|---|
| Opération/span stable | aucun span ; l'action est trop fréquente |
| Métriques | achats par type, solde de ferraille |
| Événements/logs | achat refusé — niveau `debug` |
| Données interdites | aucune |

### F-006 — Montée de niveau

Le joueur gagne de l'expérience et choisit des améliorations sans que la partie s'arrête.

**Critères d'acceptation**

- La simulation **ne se met jamais en pause**, y compris pendant un choix.
- Les niveaux gagnés s'empilent ; le joueur résout ses choix quand il le peut.
- Trois cartes sont proposées, tirées selon des poids de rareté, et reproductibles à graine
  identique.

**Modes de défaillance**

- Choix envoyé deux fois → le second est ignoré, l'offre ne se dédouble pas.

**Cas de test**

| ID | Cas | Attendu |
|---|---|---|
| T-F006-01 | montée de niveau nominale | trois cartes, aucune pause |
| T-F006-02 | double envoi du même choix | appliqué une seule fois |

**Diagnostic attendu**

| Élément | Décision |
|---|---|
| Métriques | niveaux atteints, améliorations choisies par rareté |
| Événements/logs | choix appliqué — niveau `debug` |
| Données interdites | aucune |

### F-007 — Fin de partie et crédit d'or

À la défaite, l'or personnel gagné est crédité au compte.

**Critères d'acceptation**

- Le crédit n'a lieu **qu'une fois** par partie.
- Il exige un second facteur satisfait ; sinon la base refuse.
- Un échec de crédit **n'empêche pas** l'écran de fin de fonctionner ni de relancer.

**Modes de défaillance**

- Service injoignable → l'or de cette partie est perdu, le joueur peut rejouer, l'échec est
  journalisé en `error`.
- Montant nul ou négatif → aucun appel.

**Cas de test**

| ID | Cas | Attendu |
|---|---|---|
| T-F007-01 | défaite avec or | solde augmenté du montant exact |
| T-F007-02 | service injoignable | écran de fin utilisable, échec journalisé |
| T-F007-03 | session sans second facteur | crédit refusé par la base |

**Diagnostic attendu**

| Élément | Décision |
|---|---|
| Opération/span stable | `account.gold.credit`, enfant de `game.session` |
| Événements/logs | montant crédité, échec avec cause |
| Données interdites | jeton d'authentification |

### F-008 — Atelier de méta-build

Hors partie, le joueur dépense son or de compte en bénédictions, compétences et gemmes.

**Critères d'acceptation**

- Un profil neuf affiche **zéro éclat investi**, pas la capacité allouée.
- Un achat dépassant le budget est **indisponible à l'écran**, et non refusé après coup par la
  base.
- Le build résolu est borné : aucune valeur aberrante ne peut en sortir, même depuis un profil
  altéré.

**Modes de défaillance**

- Profil corrompu ou ancien → les rangs illisibles valent zéro, jamais le maximum.
- Base injoignable → l'écran signale l'échec et n'écrit rien à moitié.

**Cas de test**

| ID | Cas | Attendu |
|---|---|---|
| T-F008-01 | profil neuf | « 0 / 4 » investis |
| T-F008-02 | budget épuisé | achats indisponibles |
| T-F008-03 | rang non fini dans un profil | compté zéro |

**Diagnostic attendu**

| Élément | Décision |
|---|---|
| Opération/span stable | `meta.build.edit` |
| Spans enfants utiles | `meta.load`, `meta.purchase`, `meta.forge` |
| Événements/logs | achat, refus avec cause |
| Données interdites | pseudonyme du profil |

### F-009 — Reconnexion coopérative

Un joueur déconnecté peut revenir dans une partie en cours.

**Critères d'acceptation**

- Le revenant rejoue la graine et l'historique d'entrées, puis réintègre le roster à une
  frontière de tick identique chez tous les pairs.
- Au-delà de la fenêtre d'historique — **vingt minutes** — la reconnexion est **refusée
  explicitement**, avec un message compréhensible. Elle n'échoue jamais en silence.

**Modes de défaillance**

- Historique expiré → refus explicite, la partie des autres continue.
- Rejeu plus long que l'avance accordée → le revenant arrive en retard ; cas à mesurer.

**Cas de test**

| ID | Cas | Attendu |
|---|---|---|
| T-F009-01 | reconnexion dans la fenêtre | réintégration, état cohérent |
| T-F009-02 | reconnexion hors fenêtre | refus explicite et lisible |

**Diagnostic attendu**

| Élément | Décision |
|---|---|
| Opération/span stable | `coop.rejoin.replay` |
| Métriques | tentatives de reconnexion par issue |
| Événements/logs | refus avec cause — niveau `warn` |
| Données interdites | code de salon en clair |

### F-010 — Télémétrie

**Seule nouveauté de l'incrément.** Le jeu rend son fonctionnement observable.

**Critères d'acceptation**

- Chaque partie produit une trace identifiable, du lancement à la fin.
- Les enregistrements émis dans le contexte d'une partie portent les identifiants de
  corrélation.
- Le niveau de journalisation se change **sans reconstruire le jeu ni modifier le code**.
- **Aucune donnée interdite** n'est émise : ni adresse e-mail, ni pseudonyme, ni jeton, ni code
  de salon en clair.
- Collecteur éteint, une partie démarre, se déroule et se termine **sans ralentissement ni
  message**.
- `packages/game-core` ne dépend d'aucune bibliothèque de télémétrie et reste sans horloge.

**Modes de défaillance**

- Collecteur injoignable → mesures perdues silencieusement, jeu intact.
- File d'export saturée → rejets comptés et journalisés en `warn`.

**Cas de test**

| ID | Cas | Attendu |
|---|---|---|
| T-F010-01 | partie simulée | span racine présent, enfants attendus |
| T-F010-02 | inspection des émissions | aucune donnée interdite |
| T-F010-03 | collecteur éteint | partie normale |
| T-F010-04 | changement de niveau de log | seuil modifié sans reconstruction |
| T-F010-05 | garde d'architecture | `game-core` sans télémétrie ni horloge |

**Diagnostic attendu**

| Élément | Décision |
|---|---|
| Opération/span stable | l'ensemble décrit dans [`observabilite.md`](observabilite.md) |
| Données interdites | e-mail, pseudonyme, mot de passe, jeton, secret TOTP, code de salon |

## Rôles et droits

Un seul rôle existe : le **joueur authentifié**. Il ne voit et ne modifie que ses propres
données. Aucun rôle d'administration n'est exposé par le jeu ; l'administration passe par un
accès direct à la base, réservé au propriétaire.

## Écarté du MVP

Transmis au backlog de la phase 6.

- **Condition de victoire** et **modification de la persistance** — suspendues aux tests.
- **Enregistrement des statistiques de partie** : la fonction existe en base et côté client,
  mais rien ne l'appelle ; l'écran de profil affiche donc des compteurs éternellement à zéro.
  La corriger suppose de définir ce qu'est un résultat de partie dans un jeu sans victoire.
- **Points de reprise pour la reconnexion**, qui rendraient la fenêtre indépendante de la durée
  de la partie.
- **Amélioration « Fracture glaciale »**, qui incrémente un compteur que la simulation ne
  consomme jamais.
- **Mode invité**, préalable à tout test de bout en bout du lobby.
- Lutte contre la triche, ouverture publique, support mobile, direction artistique.

## Hypothèses ouvertes

| ID | Décision provisoire | Impact | Validation attendue |
|---|---|---|---|
| HYP-006 | Une partie « de sa propre initiative » est une partie solo lancée depuis le menu ou un salon créé par le joueur ; rejoindre une invitation ne compte pas | Un joueur qui ne fait que répondre aux invitations n'atteindra pas le critère, même en jouant beaucoup | Première lecture des mesures de la campagne |
| HYP-007 | Aucune limite basse de durée n'est imposée à une partie comptée | Une partie lancée puis quittée en dix secondes compte comme les autres | Écart visible entre parties comptées et parties réellement jouées |
