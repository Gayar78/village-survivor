# ADR-0008 — Coopération en lockstep pair-à-pair sans serveur

- Statut : **Constaté** — implémenté et livré, arbitrage humain non effectué
- Date de constat : 31 juillet 2026
- Remplace : [ADR-0004 — Serveur Colyseus autoritaire](ADR-0004-authoritative-multiplayer-server.md)
- Exigences concernées : `REQ-STACK-002`, `REQ-NET-001`, `REQ-NET-002`, `REQ-SEC-001`

## Nature de cet ADR

Cet ADR ne propose pas une décision : il en **consigne une déjà appliquée**. La coopération a été
implémentée selon un modèle que l'ADR-0004 rejetait explicitement, sans ADR de remplacement. Le
présent document rend l'écart visible et documente ses conséquences, conformément à la règle
« une exigence ne disparaît pas silencieusement » du cadrage technique. Il ne vaut pas validation :
`REQ-GOV-002` réserve aux humains toute rupture importante avec l'architecture convenue.

## Contexte

L'ADR-0004 décidait un serveur Node.js/TypeScript sous Colyseus, détenteur de l'instance
autoritaire de la simulation. Il examinait puis **rejetait** le pair-à-pair (« synchronisation,
sécurité, NAT et résolution des divergences seraient trop complexes ») et le client hôte
autoritaire (« avantage indu pour l'hôte, fragilité à sa déconnexion »).

Le code livré n'a pas de serveur. `apps/server` n'existe pas et aucune dépendance Colyseus ne
figure dans le dépôt.

## Décision constatée

La coopération repose sur un **lockstep pair-à-pair déterministe**, implémenté dans
[`apps/client/src/net/towerSession.ts`](../../apps/client/src/net/towerSession.ts).

- Chaque navigateur exécute sa propre instance de `TowerSimulation` et applique les mêmes
  entrées au même numéro de tick. Aucun état de simulation ne transite sur le réseau.
- Le transport est un canal de diffusion **Supabase Realtime** (`tower:<code>`), utilisé comme
  simple bus de messages. Il ne valide rien et n'arbitre rien.
- Les entrées sont émises avec deux ticks de retard et par lots de douze ticks.
- L'appartenance au roster (arrivée, départ, réintégration) est ordonnée par des événements
  planifiés à une frontière de tick explicite, identique chez tous les pairs.
- Une **empreinte d'état** est échangée tous les vingt ticks pour détecter une divergence.
- Un pair qui rejoint rejoue la graine puis l'historique d'entrées reçu par morceaux avant de
  demander sa réintégration.
- Le champ `hostId` subsiste dans la configuration transmise par le lobby, mais **aucun pair
  n'est autoritaire** pendant la partie.

Le déterminisme requis par ce modèle est partiellement tenu : `packages/game-core/src` ne
contient aucun appel à `Math.random`, `Date.now`, `performance.now`, ni aucun accès au DOM. Tout
l'aléatoire passe par `SeededRandom`. Des tests couvrent la reproductibilité, les frontières de
roster et les empreintes d'état.

> **Correction du 1er août 2026.** Cette rédaction affirmait un déterminisme « réel et vérifié ».
> C'était trop fort. Les tests ne comparent que deux exécutions **du même moteur JavaScript, à
> partir du même code** : ils prouvent la reproductibilité, pas l'accord entre deux postes.
>
> Une divergence a été constatée en conditions réelles au tick 2160, puis sa cause **établie par
> mesure** le même jour sur trois navigateurs : `Math.cos`, `Math.sin` et `Math.atan2` ne
> renvoient pas les mêmes valeurs, **y compris entre deux versions du même moteur**, et
> `Math.hypot` diffère entre moteurs. La simulation les emploie à vingt-huit endroits du chemin
> critique.
>
> Le lockstep exige donc aujourd'hui que tous les joueurs exécutent **exactement le même build de
> navigateur** — condition qu'aucune consigne ne peut tenir, les navigateurs se mettant à jour
> seuls.
>
> **Le modèle repose donc sur une hypothèse fausse en l'état** : le lockstep exige un accord au
> bit près, que JavaScript ne garantit pas entre moteurs. La coopération n'est aujourd'hui
> fiable qu'entre navigateurs partageant le même moteur.
>
> Cela ne condamne pas la décision — un cœur n'appelant que des opérations exactement spécifiées
> rétablirait la propriété requise — mais cela ajoute une condition que l'ADR n'avait pas
> identifiée : **le déterminisme entre moteurs ne s'obtient pas en évitant l'horloge et
> l'aléatoire, il exige aussi de n'employer que des fonctions exactement spécifiées.**
> Mesures et correctifs : [`../feedback.md`](../feedback.md) et
> [`../../ROADMAP.md`](../../ROADMAP.md).

## Conséquences

### Positives

- aucun coût d'hébergement, aucune image Docker, aucune exploitation de serveur ;
- la simulation partagée reste unique et testable sans navigateur ;
- la réintégration d'un joueur en cours de partie fonctionne sans état serveur à répliquer ;
- le déterminisme, imposé par le lockstep, protège aussi la reproductibilité des tests.

### Négatives, et non traitées à ce jour

- **Aucune protection contre la triche.** Un client modifié peut altérer sa simulation ; la
  détection se limite à l'empreinte, qui signale une divergence sans pouvoir désigner le fautif
  ni arbitrer. `REQ-NET-001` (« le client ne décide jamais des dégâts, de l'expérience, des
  récompenses ») n'est plus tenu.
- **Le rythme est celui du pair le plus lent.** Le lockstep interdit toute prédiction et toute
  correction ; un pair en retard ralentit la partie pour tous.
- **La partie dépend d'un onglet au premier plan.** L'interface le dit explicitement au joueur
  (« gardez cet onglet actif »), les navigateurs bridant les minuteries des onglets en arrière-plan.
- **Le transport dépend de Supabase.** La coopération n'est pas jouable sans projet Supabase
  configuré, alors qu'elle n'a besoin d'aucune donnée persistante.
- `REQ-SEC-001` (validation serveur des messages, limites de taille et de fréquence) n'a plus de
  lieu d'application : les bornes existent côté client — taille de paquet, ticks futurs, longueur
  d'identifiant — mais elles protègent chaque pair de lui-même, pas la partie d'un pair hostile.

### Garde-fous effectivement en place

- toute entrée réseau est validée contre une grammaire fermée avant d'être appliquée ;
- les paquets, les identifiants d'action et l'avance en ticks sont bornés ;
- aucun message ne transporte d'état de simulation, seulement des entrées et des empreintes ;
- le contrat de session `TowerSession` a la même forme que `GameSession`, donc le remplacement
  par une session serveur resterait un changement d'adaptateur.

## À arbitrer

1. Ce modèle est-il accepté pour la suite, ou reste-t-il une étape avant le serveur autoritaire ?
2. Si accepté : que devient `REQ-NET-001` ? Doit-il être explicitement remplacé, et la triche
   assumée pour un jeu coopératif sans classement ?
3. Si l'or de compte continue d'être crédité depuis le navigateur, il faut trancher séparément
   la question posée dans [ADR-0009](ADR-0009-account-persistence.md).
