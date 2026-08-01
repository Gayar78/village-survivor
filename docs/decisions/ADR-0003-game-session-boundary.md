# ADR-0003 — Faire dépendre le client d'une frontière GameSession

- Statut : **Accepté**
- Date : 20 juillet 2026
- Exigences : `REQ-ARCH-002`, `REQ-SCOPE-001`, `REQ-NET-002`

## Contexte

Le client doit d'abord piloter une partie locale, puis une partie hébergée par un
serveur. Sans abstraction, les scènes Phaser appelleraient directement `game-core` et
devraient être réécrites pour envoyer des commandes réseau et consommer des snapshots.

## Décision

Le client dépend d'un port conceptuel `GameSession` :

```typescript
export interface GameSession {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendInput(input: PlayerInput): void;
  subscribe(listener: (state: PublicGameState) => void): () => void;
}
```

`LocalSession` adapte directement `game-core`. `NetworkSession` adaptera ultérieurement
le protocole Colyseus. Le client envoie les mêmes intentions et consomme la même forme
d'état public dans les deux modes.

Cette interface est un point de départ minimal, pas une promesse d'immuabilité de sa
signature. Elle évoluera par besoins observés, en conservant sa responsabilité.

## Options étudiées

### Appels directs à game-core puis refactoring

Rejetés : faible coût initial, mais le couplage se répandrait dans les scènes, l'UI et
les entrées avant l'arrivée du réseau.

### Introduire Colyseus dès le solo

Rejeté : cela augmenterait le temps de démarrage, les dépendances et la surface de
défaillance avant que le gameplay local soit validé.

### Simuler un réseau complet en local

Rejeté : complexité prématurée. `LocalSession` doit respecter le même contrat sans
imiter artificiellement latence, sérialisation et reconnexion.

## Conséquences

### Positives

- scènes indépendantes du mode de session ;
- tests contractuels communs aux implémentations ;
- développement local simple sans abandonner la cible multijoueur ;
- emplacement explicite pour le cycle de vie et les abonnements.

### Négatives

- couche d'adaptation supplémentaire dès le premier incrément ;
- nécessité de définir soigneusement l'état public ;
- risque que des besoins locaux non pertinents contaminent le protocole futur.

### Garde-fous

- les scènes ne peuvent importer l'implémentation interne de `game-core` ;
- l'interface ne contient aucun type Phaser ou Colyseus ;
- les deux adaptateurs doivent satisfaire les mêmes tests de contrat lorsqu'ils
  existent ;
- les fonctions de debug passent par une capacité dédiée et ne deviennent pas des
  commandes de production.
