# ADR-0004 — Utiliser un serveur Colyseus autoritaire en multijoueur

- Statut : **Accepté**
- Date : 20 juillet 2026
- Exigences : `REQ-STACK-002`, `REQ-NET-001`, `REQ-NET-002`, `REQ-SEC-001`

## Contexte

La coopération future réunit deux à quatre joueurs dans une partie où collisions,
ressources privées, contributions, dégâts, expérience et mort doivent rester
cohérents. Un modèle pair-à-pair ou un client hôte donnerait à un navigateur la source
de vérité et compliquerait la validation des commandes, la lutte contre la triche et
la reconnexion.

Le serveur n'est toutefois pas nécessaire pour valider le premier gameplay solo.

## Décision

La version multijoueur utilisera un serveur Node.js/TypeScript avec Colyseus et
WebSocket. Chaque room exécutera l'instance officielle de `game-core`.

Les clients transmettent uniquement des intentions séquencées. Le serveur valide et
décide notamment des positions, collisions, dégâts, morts, récompenses, expérience et
contenus aléatoires.

La prédiction locale, l'interpolation, la correction, la reconnexion et les limites de
trafic sont ajoutées progressivement après une première room autoritaire minimale.

## Options étudiées

### Pair-à-pair

Rejeté : synchronisation, sécurité, NAT et résolution des divergences seraient trop
complexes pour la valeur attendue.

### Client hôte autoritaire

Rejeté : avantage indu pour l'hôte, fragilité à sa déconnexion et validation limitée.

### Serveur personnalisé sans framework

Non retenu initialement : Colyseus fournit rooms, transport et synchronisation adaptés
au périmètre. Cette décision pourra être réévaluée par ADR si ses contraintes dépassent
ses bénéfices.

### Serveur dès le premier prototype solo

Rejeté : il ralentirait la validation du gameplay et augmenterait les coûts
d'exploitation sans bénéfice immédiat.

## Conséquences

### Positives

- état partagé cohérent et validé ;
- modèle de confiance clair ;
- rooms et cycle de vie adaptés à des parties one-shot ;
- hébergement Docker portable.

### Négatives

- coût et complexité d'exploitation ;
- latence nécessitant interpolation puis prédiction ;
- tests réseau et observabilité supplémentaires ;
- reconnexion et reprise d'état à concevoir.

### Garde-fous

- aucune entrée client considérée comme fiable ;
- schémas, tailles et fréquences validés ;
- état officiel jamais décidé par le rendu ;
- aucun secret serveur envoyé au client ;
- image Docker sans dépendance obligatoire à un disque local.
