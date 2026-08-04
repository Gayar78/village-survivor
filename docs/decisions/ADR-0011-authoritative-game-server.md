# ADR-0011 — Serveur de jeu autoritaire pour toutes les parties

> Statut : accepté
> Date : 3 août 2026
> Décideur : Gayar
> Remplace : ADR-0008

## Contexte

La coopération v1 exécute la même simulation dans chaque navigateur et échange les entrées par
Supabase Realtime. Une divergence réelle a été observée et diagnostiquée. Même après correction
des fonctions mathématiques non reproductibles entre moteurs, le modèle conserve plusieurs
faiblesses : chaque pair reste une autorité, la reconnexion dépend d'un historique complet, le
client déclare l'or et la validation est répliquée dans un environnement non maîtrisé.

Le réseau visé est privé, compte 5 à 20 comptes, une ou deux parties simultanées et dix joueurs
maximum. Une machine LAN héberge déjà une pile Docker et aucun coût logiciel mensuel n'est
autorisé.

## Décision

Toutes les parties, solo et coopératives, utilisent un serveur Node.js/TypeScript autoritaire.
Une `TowerRoom` Colyseus possède l'unique `TowerSimulation` et avance à 20 Hz. Le client envoie
des commandes, reçoit des états différentiels et conserve uniquement une interpolation et une
prédiction visuelle bornée.

Le déploiement retenu utilise WebSocket derrière Nginx. Ce transport est fiable et ordonné ; le
SDK Colyseus ignore `sendUnreliable` avec WebSocket. Les contrôles continus utilisent donc
`send`, mais restent remplaçables : cadence de 30/s, séquence croissante, rejet des anciennes
valeurs et neutralisation après 250 ms. Un transport réellement non fiable nécessiterait
WebTransport et une autre frontière de déploiement, hors de cette décision.

Colyseus serveur est fixé à `0.17.10`, son SDK client à `0.17.43` et Schema à `4.0.30` pendant
la migration. Supabase reste l'autorité des comptes et du lobby. Le serveur vérifie les JWT,
charge les bonus avec `service_role` et persiste les récompenses par une RPC idempotente.

Les rooms vivent en mémoire. Un redémarrage serveur interrompt les sessions. Il n'existe aucun
mode hors ligne. En coopération, le roster exact est réservé avant création et doit rejoindre
dans les 15 secondes. La reconnexion conserve le même avatar 30 secondes, puis l'expulse sans
retour possible.

## Conséquences positives

- un seul état autoritaire élimine la divergence entre simulations de navigateurs ;
- le serveur valide commandes, roster, cadence, récompenses et cycle de vie ;
- la reconnexion restitue un état complet sans rejouer l'historique ;
- le navigateur ne peut plus déclarer l'or ni l'état du monde ;
- les métriques de simulation et de charge proviennent d'un point unique.

## Coûts et limites

- une panne du serveur interrompt le solo comme la coopération ;
- le déploiement gagne un conteneur limité initialement à 512 Mio ;
- les contrats réseau, l'adaptateur client, la persistance idempotente et les tests multi-clients
  augmentent la surface à maintenir ;
- aucune reprise de room après redémarrage n'est fournie ;
- HTTP sans TLS reste acceptable uniquement sur le LAN de confiance.

## Alternatives rejetées

**Conserver le P2P corrigé.** Moins de code serveur, mais conserve plusieurs autorités, un
historique de replay et le crédit client. Le diagnostic d'août 2026 montre que le coût
d'exploitation n'est plus acceptable.

**Serveur seulement pour la coopération.** Le solo garderait un chemin d'exécution différent,
donc des bugs et règles de persistance propres. Le petit volume LAN ne justifie pas cette
duplication.

**Persister les rooms actives.** Une reprise exacte de simulation augmenterait fortement la
complexité pour une indisponibilité explicitement sans conséquence. Cette option est différée.

## Critères de validation

- solo et coopération utilisent `TowerServerSession` en production ;
- deux clients voient le même tick et le même état partagé ;
- une reconnexion à 10 secondes restaure l'avatar et une reconnexion à 31 secondes est refusée ;
- deux finalisations concurrentes ne doublent jamais l'or ;
- la charge de 20 minutes respecte les budgets de la spécification non-fonctionnelle ;
- une partie solo et une coop sur deux postes produisent une trace distribuée complète.

## État d'application au 3 août 2026

Les quatre boucles techniques sont implémentées : session serveur unique en solo/coop, roster et
reconnexion, ferraille bornée, finalisation transactionnelle, conteneur, proxy et observabilité.
Le code local/lockstep, les replays et les empreintes P2P ont été retirés. Les tests automatiques
et l'intégration SQL/Docker sont verts ; le dernier critère ci-dessus, sur deux postes avec
inspection de traces, reste une validation manuelle à réaliser.
