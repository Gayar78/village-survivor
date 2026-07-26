# Feuille de route

Dernière mise à jour : 21 juillet 2026

## Convention

- **Terminé** : livré et vérifié dans le dépôt.
- **Prochain** : prochain jalon à entreprendre.
- **Planifié** : intention acceptée, périmètre détaillé plus tard.
- **Différé** : volontairement hors de la version en cours.

La feuille de route décrit une progression technique et fonctionnelle. Les détails de
gameplay restent soumis à validation humaine avant développement approfondi.

## Jalon D0 — Cadrage initial — Terminé

- consolider les piliers produit ;
- analyser le prototype historique comme référence fonctionnelle ;
- conserver les décisions de l'atelier produit ;
- versionner le cadrage technique initial ;
- définir l'architecture cible et ses invariants ;
- créer les ADR structurants et la matrice de traçabilité ;
- établir les documents de projet minimaux.

## Jalon T0 — Initialisation technique — Terminé

Objectif : obtenir une base saine, automatisée et affichable, sans développer la boucle
complète du jeu.

- initialiser le monorepo et les workspaces `pnpm` ;
- verrouiller les versions de Node.js, pnpm, Phaser 4, TypeScript et Vite ;
- créer `apps/client`, `packages/game-core` et `packages/protocol` ;
- ajouter la configuration TypeScript stricte, ESLint et Prettier ;
- exposer les commandes racine `dev`, `build`, `test`, `lint` et `typecheck` ;
- afficher une scène Phaser temporaire ;
- exécuter un premier tick de simulation sans Phaser ;
- relier le client à une `LocalSession` minimale ;
- ajouter Vitest, un smoke test Playwright et GitHub Actions ;
- mettre à jour la matrice de traçabilité avec les chemins réels.

Critère de sortie : un clone neuf peut installer, contrôler, tester, construire et
lancer un écran connecté à une simulation minimale.

## Jalon P1 — Premier incrément jouable — Terminé

Objectif : prouver le déplacement et une interaction de combat sans construire trop
tôt la boucle complète.

- petite carte ;
- personnage contrôlé au clavier ;
- caméra et collisions ;
- ennemi simple et lisible ;
- points de vie et dégâts ;
- condition de défaite ;
- sprites ou formes temporaires ;
- état inspectable par l'API de débogage ;
- tests de simulation et parcours navigateur.

## Jalon P2 — Boucle survivor — Terminé

- attaques automatiques ;
- apparition et difficulté progressives ;
- expérience et niveaux ;
- trois propositions d'amélioration sans pause ;
- premières capacités active et automatique ;
- compteur de temps ;
- scénario de performance reproductible.

## Jalon M1 — Premier MVP Village Survivor — Terminé

Le contrat a été validé le 21 juillet 2026. Le MVP est une tranche solo de 10 à 15
minutes comportant :

- une carte petite et reproductible à partir d'une graine ;
- un personnage avec la paire fixe Épée et Barrière ;
- exploration d'une ressource gardée, transport et dépôt personnel ;
- alternance d'un jour et d'une nuit ;
- monstres présents le jour puis assaillant le village la nuit ;
- expérience et petit catalogue d'améliorations ;
- plusieurs balistes librement placées dans le village et fabriquées en temps réel ;
- un cœur de village améliorable ;
- un objectif final temporaire déclenchant une dernière vague ;
- victoire si le village survit à l'activation ;
- défaite si le personnage ou le village est perdu ;
- graphismes et sons temporaires.

Critère de sortie : la chaîne « explorer → prendre un risque → rapporter → construire
→ défendre → gagner ou perdre » est jouable, testable et suffisamment lisible pour un
premier playtest humain.

Vérification livrée : tests Vitest du parcours complet, test contractuel de
`LocalSession`, parcours Playwright jusqu'à la victoire, smoke test du build de
production et scénario reproductible de quinze minutes simulées avec plus de cent
entités.

## Jalon V1 — Boucle solo élargie — Prochain

- génération de carte respectant les garanties de ressources ;
- population diurne, gardiens et groupes endormis ;
- plusieurs nuits avec survivants et renforts persistants ;
- quatre premières disciplines : Épée, Arc, Feu et Barrière ;
- capacité de transport par poids ;
- branches principales du village ;
- artefacts initiaux ;
- furtivité par bruit, perception et jauge de réveil ;
- équilibrage par playtests ;
- déploiement client public.

## Jalon N0 — Préparation multijoueur — Planifié

- application serveur Node.js/TypeScript ;
- room Colyseus autoritaire minimale ;
- `NetworkSession` ;
- deux clients synchronisés ;
- déplacement officiel côté serveur ;
- validation des commandes ;
- image Docker et tests réseau.

## Jalon C1 — Coopération — Planifié

- rooms de deux à quatre joueurs ;
- ennemis et fin de partie partagés ;
- propriété individuelle des ressources ;
- transferts et réserves de projets ;
- attribution de l'expérience ;
- état à terre, relèvement et mort définitive ;
- interpolation, prédiction puis correction ;
- déconnexion et reconnexion.

## Différé au-delà de la V1

- comptes et authentification ;
- base de données et sauvegarde cloud ;
- progression persistante entre les parties ;
- classement ;
- support mobile ;
- télémétrie ou collecte de données personnelles ;
- direction artistique et pipeline graphique définitifs.

## Décisions à obtenir au moment utile

- licence du dépôt public ;
- budgets non fonctionnels chiffrés avant le premier playtest public ;
- fiction et nom du niveau ultime du cœur ;
- catalogue et valeurs d'équilibrage de chaque incrément ;
- accès et responsabilités du déploiement Cloudflare.
