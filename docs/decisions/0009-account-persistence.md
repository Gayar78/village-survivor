# ADR-0009 — Comptes Supabase et progression persistante

- Statut : **Constaté** — implémenté et livré, arbitrage humain non effectué
- Date de constat : 31 juillet 2026
- Remplace : [ADR-0006 — Différer base de données et persistance de compte](0006-defer-persistence.md)
- Exigences concernées : `REQ-PERSISTENCE-001`, `REQ-SCOPE-001`, `REQ-SEC-001`, `REQ-NET-001`

## Nature de cet ADR

Comme [ADR-0008](0008-p2p-lockstep-coop.md), ce document **consigne une décision déjà appliquée**
plutôt qu'il n'en propose une. L'ADR-0006 interdisait toute base de données, tout compte joueur et
toute progression persistante « avant une décision produit explicite ». Cette décision produit
n'existe pas : le code l'a devancée.

## Contexte

L'ADR-0006 rejetait explicitement le stockage navigateur pour la progression (« contradiction avec
la partie one-shot ») et exigeait, pour toute persistance distante, un modèle de données, une
politique de rétention, une analyse de sécurité, un coût et un ADR préalable.

Le pilier produit n°13, validé le 20 juillet 2026, énonce qu'« une partie est one-shot en V1 :
personnages, village et progression repartent de zéro à la partie suivante ».

## Décision constatée

Le client dépend de **Supabase** pour l'authentification et pour une progression de compte
persistante. Sans les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`, le lobby affiche
un écran « Configuration requise » et ni le menu, ni la coopération, ni la méta-progression ne sont
accessibles.

### Portée fonctionnelle

- **Authentification obligatoire** pour le lobby : email/mot de passe, Google, GitHub, plus une
  double authentification TOTP.
- **Progression persistante de compte** : or de compte, profils de personnage, bénédictions,
  compétences, gemmes et forge. L'or gagné en partie est crédité au compte à la fin d'une partie.
- **Social** : code ami, demandes d'amis, présence temps réel, invitations et reprise de partie.
- **Statistiques** de parties jouées, gagnées, perdues, durée, cycle atteint, ressources.

Cinq migrations composent le schéma, dans
[`supabase/migrations/`](../../supabase/migrations) :

| Migration | Contenu |
|---|---|
| `0001_init.sql` | `profiles`, `player_stats`, `coffre_balances`, `unlocked_spells`, `account_items`, RPC `record_game_result` |
| `0002_friends.sql` | codes amis, demandes, relations |
| `0003_account_gold_wallet.sql` | `account_gold_wallets`, RPC `credit_account_gold` |
| `0004_meta_progression.sql` | profils de personnage, bénédictions, compétences, gemmes, forge |
| `0005_require_mfa.sql` | exigence de double authentification sur les tables et sur le crédit d'or |

### Ce que la partie ne persiste pas

L'état d'une partie reste intégralement en mémoire. Aucune sauvegarde, aucune reprise de partie
interrompue : seule la progression **de compte** survit.

## Qualité de l'implémentation

L'écart porte sur la décision, pas sur la façon dont elle est réalisée. Le schéma SQL est
soigné :

- `row level security` active sur les tables exposées ;
- fonctions `security definer` avec `search_path` fixé ;
- l'identité vient exclusivement du JWT via `auth.uid()`, jamais d'un paramètre client ;
- aucune politique d'écriture directe sur le portefeuille : les crédits passent par une RPC
  atomique et bornée ;
- révocations explicites pour `public` et `anon`, migrations idempotentes ;
- seule la clé publique `anon` est utilisée par le client, et aucun secret n'est commité.

## Conséquences

### Positives

- rétention des joueurs par une progression entre les parties ;
- couche sociale et reprise de partie coopérative ;
- statistiques de playtest collectées automatiquement, que l'ADR-0006 citait comme perte assumée.

### Négatives, et non traitées à ce jour

- **Le jeu ne démarre plus sans service tiers.** Un contributeur sans projet Supabase ne peut
  ouvrir que la page de jeu directe ; le lobby et la coopération lui sont fermés. La CI n'a pas
  de clés, ce qui a conduit au retrait des tests navigateur.
- **L'économie de compte est déclarée par le client.** La simulation étant hébergée par le
  navigateur, le montant d'or crédité en fin de partie provient du client. La RPC garantit
  l'atomicité et l'isolation entre comptes, pas la véracité du montant — l'en-tête de la
  migration `0003` le dit explicitement. `REQ-NET-001` n'est pas tenu.
- **Aucune politique de rétention, de suppression de compte ni de traitement des données
  personnelles** n'est définie, alors que des adresses email sont désormais stockées. L'ADR-0006
  en faisait une condition préalable.
- **Aucun coût d'hébergement n'a été autorisé.** `REQ-GOV-002` réserve cette décision aux humains.
- La contradiction avec le pilier produit n°13 (partie one-shot) n'est pas résolue : elle est
  seulement contournée en plaçant la progression sur le compte plutôt que dans la partie.

## À arbitrer

1. La progression de compte est-elle acceptée comme pilier produit, remplaçant explicitement la
   décision n°13 du 20 juillet 2026 ?
2. Le jeu doit-il rester jouable sans compte ? Un mode invité rendrait la CI de nouveau capable
   d'exécuter des tests navigateur.
3. Quelle politique de rétention et de suppression des données de compte, et qui en répond ?
4. L'or déclaré par le client est-il assumé, ou faut-il une autorité serveur pour le valider —
   ce qui rejoint la question posée par [ADR-0008](0008-p2p-lockstep-coop.md) ?
