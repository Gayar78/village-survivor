# Matrice de sélection du prototype historique

Statut : recommandations mises à jour avec les décisions du 20 juillet 2026.

Cette matrice applique les piliers décrits dans
[`../product-pillars.md`](../product-pillars.md). « Reprendre » signifie reprendre le
concept dans une nouvelle implémentation, jamais copier le code historique.

## Reprendre comme fondation fonctionnelle

| Concept historique | Recommandation | Raison |
|---|---|---|
| Alternance jour/nuit | Reprendre | Structure le rythme et le contraste exploration/défense. |
| Journée limitée | Reprendre | Crée le risque d'être surpris loin du village. La durée exacte reste à tester. |
| Anneaux de distance | Reprendre | Rend le rapport risque/récompense compréhensible et mesurable. |
| Rareté croissante avec la distance | Reprendre | Donne une raison claire de quitter la sécurité du village. |
| Monstres gardiens de ressources | Reprendre | Transforme la récolte en décision de combat plutôt qu'en tâche passive. |
| Chasseurs et assaillants | Reprendre | Sépare la pression sur les personnages de la pression sur le village. |
| Budget de vague | Reprendre | Permet une difficulté progressive et adaptable au nombre de joueurs. |
| Combinaison de deux identités de combat | Reprendre | Produit des rôles hybrides et des choix coopératifs distinctifs. |
| Huit thèmes de classe | Reprendre comme catalogue | Les identités sont lisibles et couvrent attaque, défense et soutien. |
| Collecte, production et construction | Reprendre | Relie directement l'exploration à la survie nocturne. |
| Défenses automatiques et obstacles | Reprendre | Rend le développement du village visible pendant les combats. |
| Télégraphes et esquive | Reprendre | Améliore l'équité et la lisibilité des affrontements. |
| Minimap et lecture de la distance | Reprendre | Indispensable pour gérer le temps de retour au village. |
| Feedback de combat et réglages | Reprendre comme exigences UX | Effets, sons et secousses configurables soutiennent le game feel. |

## Adapter au nouveau cadrage

| Concept historique | Adaptation recommandée |
|---|---|
| Tour centrale | En faire un véritable village-personnage avec état, niveaux, services, défenses et arbre d'amélioration. |
| Paliers sans fin | Les faire monter en pression jusqu'à ce que les joueurs terminent la construction de victoire ou perdent. |
| XP et niveau du personnage | Limiter toute progression à la partie et proposer des choix qui changent réellement le build. |
| 136 compétences et 680 runes | Traiter comme bibliothèque créative ; sélectionner un petit ensemble cohérent par incrément. |
| Huit classes dès le départ | Conserver la cible, mais n'en implémenter que le nombre nécessaire pour tester les rôles de base. |
| Ressources par joueur | Conserver la propriété individuelle, ajouter stockage personnel au village, transferts volontaires et contributions réservées aux projets collectifs. |
| Métiers récolteur/crafteur | Simplifier ou transformer en spécialisations temporaires de partie ; ne pas créer de barrières persistantes. |
| Production instantanée/différée | Conserver seulement si l'arbitrage apporte des décisions intéressantes pendant une journée courte. |
| Murs et tourelles libres | Les intégrer à un système de village lisible, réparable et compatible avec les chemins ennemis. |
| Quêtes | Les transformer éventuellement en objectifs facultatifs de partie, sans réserve persistante en V1. |
| Artefacts de récompense | Les placer dans des sites gardés, limiter l'équipement à deux et permettre les échanges volontaires. |
| Mort et résurrection | Introduire un état à terre relevable, suivi d'une mort définitive et du mode spectateur. |
| Quatre biomes en secteurs | Conserver l'idée de régions distinctes, puis prototyper une géographie moins artificielle si nécessaire. |
| Monde entièrement visible | Étudier une découverte progressive afin que l'exploration reste une activité, pas seulement un trajet. |

## Écarter de la V1

| Élément | Motif |
|---|---|
| Comptes et authentification | Une partie locale one-shot n'en a pas besoin. |
| PostgreSQL et sauvegarde cloud | Aucune donnée persistante n'est requise en V1. |
| Niveaux, métiers et réserve entre les parties | Contradiction directe avec la décision produit. |
| Coopération à dix joueurs | Le cadrage cible deux à quatre joueurs et doit d'abord valider le solo. |
| Récompenses permanentes de quêtes | Système incomplet et incompatible avec la V1. |
| Déploiement VPS historique | Le nouveau projet possède une cible d'hébergement et une architecture différentes. |
| Valeurs d'équilibrage historiques | Ce sont des hypothèses non validées, pas des références. |
| Code JavaScript, architecture et assets du prototype | Référence fonctionnelle seulement ; absence de licence générale et qualité insuffisante pour une reprise. |

## Décisions encore ouvertes

Ces questions doivent être tranchées après l'audit, une par une, avant que leur réponse
ne devienne une exigence :

1. Quel nom et quelle fiction porte le niveau ultime du cœur du village ?
2. Quels coûts, prérequis et effets précis composent les branches du village ?
3. Quels artefacts et améliorations forment le premier catalogue jouable ?
4. Quelles valeurs initiales utiliser pour les cycles, la capacité de transport et le relèvement ?
5. Quel est le périmètre exact du premier incrément de combat après le socle technique ?
6. Quelles exigences non fonctionnelles supplémentaires faut-il ajouter au brief initial ?

## Incrément fonctionnel recommandé après validation

Le premier prototype ne doit pas reproduire tout cet inventaire. Il doit prouver une
seule chaîne de valeur :

1. quitter un village minimal pendant un jour court ;
2. atteindre une ressource gardée située à une distance significative ;
3. choisir de combattre ou de rentrer ;
4. rapporter la ressource ;
5. construire une amélioration défensive ;
6. survivre à une vague nocturne qui attaque le village ;
7. recommencer avec une pression légèrement supérieure.

L'objectif de victoire final peut d'abord être représenté par une construction
temporaire très simple. Sa fiction et son arbre complet ne doivent être implémentés
qu'après validation humaine.
