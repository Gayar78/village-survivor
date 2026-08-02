# Village Survivor — Spécification non-fonctionnelle

> Statut : approuvé
> Version du projet : v1
> Propriétaire : Gayar
> Dernière revue : 1er août 2026
> Niveau de garantie requis : `renforce`

Ce document dit **comment** le produit est construit, hébergé, sécurisé, éprouvé et
diagnostiqué. Pas ce qu'il fait : cela reste pour la spécification fonctionnelle.

## Classement

| Axe | Décision | Motifs |
|---|---|---|
| Niveau de garantie requis | `renforce` | produit partagé avec des tiers, dépendance à un service extérieur, traitement de données de tiers |
| Complexité | quatre déclencheurs sur six | plusieurs services, asynchrone, API exposée, données persistantes |
| Observabilité | `distribue` | imposé par `renforce`, et cohérent avec une pile à cinq services |

**Réévaluer si :** le jeu s'ouvre à des inconnus, de l'argent réel ou virtuel apparaît, des
données personnelles s'ajoutent à l'adresse e-mail, ou un classement introduit une compétition
entre joueurs. Chacun de ces faits ferait basculer le projet en `critique`.

## Déploiement et architecture

| Sujet | Décision | Pourquoi |
|---|---|---|
| Où ça tourne | pile Docker auto-hébergée sur une machine du réseau local | aucun budget autorisé, aucune ouverture publique dans le périmètre |
| Qui y accède | cercle fermé de 5 à 20 personnes, sessions de 2 à 4 joueurs | objectif validé |
| Composants | navigateur (jeu et lobby), Postgres, authentification, API REST, temps réel, passerelle, **collecteur de télémétrie** | le collecteur est le seul ajout de cette phase |
| Coût mensuel estimé | **0 €** | tout est auto-hébergé sur du matériel existant ; la seule dépense est l'électricité de la machine |

Le détail des composants et des flux vit dans [`architecture.md`](architecture.md), qui reste le
document de référence sur ce point.

## Technique

Ces choix sont hérités et confirmés, non rouverts : le produit existe et fonctionne.

| Sujet | Décision | Pourquoi |
|---|---|---|
| Langage | TypeScript strict | déjà en place, typage indispensable à un cœur déterministe |
| Framework | Phaser 4, Vite 8 | déjà en place ; le rendu ne porte aucune règle |
| Stockage | PostgreSQL via Supabase auto-hébergé | déjà en place, migrations versionnées |
| Framework de test | Vitest pour l'unitaire et la simulation, Playwright pour le navigateur | déjà en place |
| Télémétrie | OpenTelemetry, export OTLP/HTTP | standard ouvert, non lié à un fournisseur ; permet de changer de backend sans toucher au code |

## Données

| Sujet | Décision | Pourquoi |
|---|---|---|
| Nature et propriétaire | comptes, progression de compte, amitiés ; propriétaire : Gayar | le projet lui appartient |
| Données personnelles | **adresse e-mail uniquement**, plus un pseudonyme choisi | minimum nécessaire à l'authentification |
| Conservation | tant que le compte existe ; aucune purge automatique | cercle fermé, volume négligeable |
| Sauvegarde et restauration | **aucune aujourd'hui** — voir HYP-003 | la perte est explicitement assumée par le propriétaire |

Aucune donnée de partie n'est persistée : l'état d'une partie vit en mémoire et disparaît avec
elle.

## Sécurité

| Sujet | Décision | Pourquoi |
|---|---|---|
| Authentification | courriel et mot de passe, avec second facteur TOTP obligatoire | déjà en place, confirmé par le propriétaire |
| Autorisation | politiques RLS par ligne, identité prise du jeton et jamais d'un paramètre | chaque compte ne voit que ses propres données |
| Second facteur | exigé **aussi côté base** depuis `0005_require_mfa.sql` | sans cela, la double authentification coûtait sans rien protéger |
| Secrets | jamais dans Git ; générés par `deploy/lan/setup.mjs`, `.env` ignoré | contrôle automatisé au commit |
| Confidentialité des échanges | **aucun chiffrement de transport** sur le réseau local | HTTP en clair ; assumé pour un LAN de confiance, rédhibitoire pour une ouverture publique |
| Audit applicable | aucun journal d'audit séparé | aucune obligation réglementaire, aucun enjeu financier |

### Surfaces ouvertes, assumées

Trois faiblesses connues ne sont **pas** corrigées, parce qu'elles tombent dans les
ajournements de l'objectif — lutte contre la triche écartée, cercle fermé, conséquences
acceptées. Elles sont détaillées dans [`qualite/traceabilite.md`](qualite/traceabilite.md) :

1. les canaux temps réel sont publics et l'identité y est déclarative ;
2. le montant d'or crédité en fin de partie est déclaré par le navigateur ;
3. les fonctions `security definer` autres que le crédit d'or n'exigent pas le second facteur.

**Chacune redevient bloquante le jour d'une ouverture publique.**

## Tests

**Profondeur : `renforce`** — logique métier, modes d'erreur, accès non autorisés et
dépendances.

L'état actuel couvre bien la logique métier (137 tests) mais laisse trois trous que cette phase
rend obligatoires à combler : **les accès non autorisés** ne sont testés nulle part, **le
comportement en cas de panne de la dépendance externe** non plus, et **le contrat
d'observabilité** n'existe pas encore.

Le détail vit dans [`qualite/strategie-tests.md`](qualite/strategie-tests.md).

## Observabilité

| Sujet | Décision |
|---|---|
| Finalité | **diagnostic et performance uniquement** — les mesures d'usage produit sont retirées du périmètre le 1er août 2026 |
| Unité d'exécution tracée | **une partie**, du lancement à sa fin ; et, séparément, chaque parcours du lobby |
| Span racine et frontières enfant | racine `game.session` ; enfants aux seules frontières utiles au diagnostic |
| Export | OTLP/HTTP vers un collecteur de la pile locale |
| Niveau de logs | `VITE_APP_LOG_LEVEL`, surchargeable à l'exécution sans reconstruire |
| Défaut développement/test | `debug` |
| Défaut production | `info` |
| Sampling | `parentbased_always_on` — le volume à trois joueurs ne justifie aucun échantillonnage |
| Données interdites | adresse e-mail, pseudonyme, mot de passe, jeton, secret TOTP |
| Panne du backend | export asynchrone et borné ; le jeu ne ralentit ni ne s'arrête |

Le détail vit dans [`observabilite.md`](observabilite.md).

**Une contrainte domine tout le reste** : l'instrumentation ne doit jamais entrer dans le cœur
de simulation. `packages/game-core` ne contient aujourd'hui aucun appel à l'horloge, aucun accès
au navigateur et aucun aléatoire non maîtrisé — c'est ce qui rend la coopération en lockstep
possible. Y introduire une bibliothèque de télémétrie casserait le déterminisme et donc le
multijoueur. La mesure s'effectue **depuis la couche client**, qui observe la simulation de
l'extérieur.

## Charge et disponibilité

| Sujet | Valeur |
|---|---|
| Utilisateurs attendus | 5 à 20 comptes, 2 à 4 joueurs simultanés |
| Sessions simultanées | une, exceptionnellement deux |
| Budget de performance | un tick de simulation doit rester sous **1 ms** sous 200 monstres ; mesuré à 210 µs aujourd'hui |
| Rendu | 60 images par seconde visées sur un poste de bureau ordinaire |
| Indisponibilité acceptable | **illimitée** — le propriétaire a déclaré n'en subir aucune conséquence |

Aucun engagement de disponibilité n'est pris, et aucune astreinte n'existe. C'est cohérent avec
un jeu joué entre collègues, et ce serait intenable pour un produit public.

## Décisions prises par l'agent

Le profil du propriétaire prévoit que l'agent tranche les décisions techniques et en annonce les
conséquences. Les voici.

| Décision | Raison | Conséquence concrète |
|---|---|---|
| Télémétrie par **OpenTelemetry** | standard ouvert ; changer de backend ne touche pas le code du jeu | aucune dépendance à un fournisseur payant |
| Backend `grafana/otel-lgtm`, **un seul conteneur** | rassemble traces, journaux et métriques avec une interface, sans configuration | +1 conteneur, environ **1 Go de mémoire**, 0 € |
| Collecteur exposé **derrière la passerelle existante** (`/otel/v1/...`) | conserve l'origine unique du déploiement LAN | aucune règle de partage entre origines à écrire |
| Unité tracée = **une partie**, jamais un tick | 20 ticks par seconde produiraient 72 000 traces par heure et par joueur | la boucle de jeu est suivie par des métriques agrégées |
| **Aucun identifiant de joueur** dans la télémétrie | le diagnostic caractérise une panne par la graine et le tick, pas par l'identité | zéro donnée personnelle émise |
| Niveau de log surchargeable par le stockage local du navigateur | un navigateur ne lit pas de variable d'environnement à l'exécution | changer de niveau ne demande **ni reconstruction ni modification de code** |
| Rétention de télémétrie bornée à **7 jours** | le disque est celui d'un poste de travail | suffisant pour diagnostiquer, insuffisant pour une analyse à long terme |
| La télémétrie reste **facultative au démarrage** | le jeu doit rester jouable sans la pile complète | un collecteur absent n'empêche ni de jouer ni de tester |

### Ce que cela coûte, en clair

- **Argent** : 0 €. Tout tourne sur la machine qui héberge déjà le jeu.
- **Machine** : environ 1 Go de mémoire et quelques centaines de mégaoctets de disque par
  semaine, purgés au-delà de sept jours.
- **Travail** : l'instrumentation du client représente un incrément de développement à part
  entière, à faire avant la campagne d'observation d'un mois — sans elle, le critère de réussite
  ne peut pas être compté.
- **Risque** : faible et borné. Le principal est d'introduire par mégarde une dépendance
  temporelle dans le cœur de simulation, ce qui casserait la coopération. La stratégie de tests
  prévoit une garde explicite contre ce risque.

## Hypothèses ouvertes

| ID | Décision provisoire | Raison | Impact | Confiance | Validation attendue |
|---|---|---|---|---|---|
| HYP-003 | Aucune sauvegarde de la base n'est mise en place | La perte des comptes et de la progression est explicitement assumée | Une panne disque effacerait toute la progression des joueurs | haute | Premier joueur qui se plaindrait d'une perte, ou décision d'ouverture |
| HYP-004 | Sept jours de rétention de télémétrie suffisent | La campagne d'observation dure un mois mais s'analyse par sessions | Une question posée plus de sept jours après une session restera sans réponse | moyenne | Première analyse rétrospective impossible |
| HYP-005 | Un seul collecteur, sans redondance ni surveillance | Le volume est négligeable et l'indisponibilité sans conséquence | Une panne silencieuse du collecteur ferait perdre des mesures sans alerte | moyenne | Écart constaté entre parties jouées et parties enregistrées |
