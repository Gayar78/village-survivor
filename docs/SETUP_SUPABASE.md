# Village Survivor — Configuration de Supabase

> Statut : approuvé
> Version du projet : v1
> Propriétaire : l'équipe Village Survivor
> Dernière revue : 31 juillet 2026

Ce guide explique, pas à pas, comment brancher un projet [Supabase](https://supabase.com) sur le jeu (front Vite/TypeScript, 100 % navigateur). Il s'adresse à quelqu'un qui n'a jamais utilisé Supabase.

À la fin de ce guide, vous aurez :

- un projet Supabase avec le schéma de base de données du jeu appliqué,
- la connexion Google, GitHub et email/mot de passe fonctionnelles,
- la double authentification (TOTP) disponible pour les joueurs,
- le jeu qui tourne en local sur `http://localhost:5173` et qui parle à Supabase.

> Le code du jeu lit uniquement deux variables d'environnement Vite : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. Tout ce guide sert à obtenir ces deux valeurs et à configurer le projet Supabase qui va avec.

---

## 1. Créer un compte et un projet Supabase

1. Allez sur [https://supabase.com](https://supabase.com) et cliquez sur **Start your project** (ou **Sign in** si vous avez déjà un compte).
2. Créez un compte (email/mot de passe, ou connexion via GitHub/Google selon ce que propose la page).
3. Une fois connecté, cliquez sur **New project**.
4. Renseignez :
   - **Organization** : créez-en une si c'est votre premier projet (ex. `village-survivor`).
   - **Name** : un nom pour le projet, par exemple `village-survivor`.
   - **Database Password** : générez ou choisissez un mot de passe fort. **Notez-le et gardez-le dans un gestionnaire de mots de passe** — il sert à l'accès direct à la base Postgres (via la CLI ou un client SQL externe), pas au jeu lui-même.
   - **Region** : choisissez la région la plus proche de vos joueurs (par exemple une région Europe si vos joueurs sont en France).
5. Cliquez sur **Create new project**.
6. Patientez pendant le provisionnement (généralement une à deux minutes). Le tableau de bord du projet s'affiche automatiquement une fois prêt.

---

## 2. Récupérer les clés d'API

1. Dans le tableau de bord du projet, ouvrez **Project Settings** (icône d'engrenage dans le menu latéral) puis **API** (selon la version de l'interface, ce menu peut aussi s'appeler **Project Settings > API Keys**).
2. Notez deux valeurs :
   - **Project URL** — une adresse de la forme `https://<ref-projet>.supabase.co`.
   - **anon public** (dans la section « Project API keys ») — une longue chaîne commençant généralement par `eyJ...`.
3. À la racine du dépôt, copiez le fichier d'exemple :

   ```bash
   cp .env.example .env
   ```

   (sous PowerShell : `Copy-Item .env.example .env`)

4. Ouvrez `.env` et collez vos valeurs :

   ```env
   VITE_SUPABASE_URL=https://<ref-projet>.supabase.co
   VITE_SUPABASE_ANON_KEY=<votre-clé-anon-public>
   ```

   Remplacez `<ref-projet>` et `<votre-clé-anon-public>` par les valeurs récupérées à l'étape précédente.

### ⚠️ Sécurité : anon vs service_role

- La clé **`anon public`** est conçue pour être exposée côté navigateur. Elle est **publique** et sans danger dans le front : la sécurité réelle des données est assurée par les **politiques RLS (Row Level Security)** définies dans la migration SQL (chaque utilisateur ne peut lire/écrire que ses propres lignes).
- La clé **`service_role`**, visible dans le même écran, **contourne toutes les politiques RLS**. Elle ne doit **jamais** être utilisée dans le code front, ni committée dans le dépôt, ni mise dans un fichier `.env` chargé par Vite. Elle est réservée à un usage serveur (scripts d'administration, fonctions edge, etc.), qui n'existe pas dans ce projet 100 % navigateur — donc vous ne devriez jamais avoir besoin de la copier.
- Le fichier `.env` est local à votre machine : vérifiez qu'il est bien listé dans `.gitignore` avant tout `git add`.

---

## 3. Appliquer les migrations SQL

Le schéma est réparti en **cinq migrations**, dans `supabase/migrations/`. Elles doivent être
appliquées **dans l'ordre** et **toutes** : le jeu utilise les cinq. Chacune est idempotente,
donc rejouable sans dommage.

| Fichier | Contenu |
|---|---|
| `0001_init.sql` | tables `profiles`, `player_stats`, `coffre_balances`, `unlocked_spells`, `account_items` ; trigger de création de profil à l'inscription ; RPC `record_game_result` |
| `0002_friends.sql` | codes amis, tables `friend_requests` et `friendships`, RPC `get_my_friend_code`, `send_friend_request`, `respond_friend_request`, `remove_friend`, `list_friends`, `list_incoming_requests` |
| `0003_account_gold_wallet.sql` | table `account_gold_wallets`, RPC `credit_account_gold` |
| `0004_meta_progression.sql` | tables `meta_character_profiles`, `meta_owned_skills`, `meta_owned_gems` et les RPC de profils, bénédictions, compétences et forge |
| `0005_require_mfa.sql` | fonction `mfa_satisfied()`, politiques restrictives exigeant la double authentification, garde sur `credit_account_gold` |

Chaque migration installe aussi ses propres politiques RLS. Sauter l'une d'elles produit des
erreurs du type `relation "..." does not exist` au premier usage de la fonctionnalité concernée
— souvent bien après la connexion, ce qui rend le diagnostic pénible.

### Méthode A — SQL Editor (recommandée pour débuter)

1. Dans le tableau de bord Supabase, ouvrez **SQL Editor** dans le menu latéral.
2. Cliquez sur **New query**.
3. Ouvrez `supabase/migrations/0001_init.sql` dans un éditeur de texte et copiez tout son contenu.
4. Collez-le dans le SQL Editor de Supabase.
5. Cliquez sur **Run** (ou `Ctrl+Enter`) et vérifiez qu'aucune erreur n'apparaît.
6. **Répétez les étapes 2 à 5 pour `0002_friends.sql`, `0003_account_gold_wallet.sql`,
   `0004_meta_progression.sql` puis `0005_require_mfa.sql`, dans cet ordre.**
7. Allez dans **Table Editor** et confirmez la présence de `profiles`, `player_stats`,
   `coffre_balances`, `unlocked_spells`, `account_items`, `friend_requests`, `friendships`,
   `account_gold_wallets`, `meta_character_profiles`, `meta_owned_skills` et `meta_owned_gems`.

### Méthode B — CLI Supabase (utilisateurs avancés)

Si vous préférez gérer les migrations en ligne de commande :

```bash
# Installer la CLI (une seule fois, voir la doc officielle Supabase pour votre OS)
supabase login

# Lier le dossier du dépôt au projet Supabase créé à l'étape 1
supabase link --project-ref <ref-projet>

# Appliquer toutes les migrations du dossier supabase/migrations
supabase db push
```

Remplacez `<ref-projet>` par la référence de votre projet (visible dans l'URL du tableau de bord ou dans **Project Settings > General**).

---

## 4. Configurer l'URL de redirection

Ce réglage indique à Supabase où renvoyer l'utilisateur après une connexion (email ou OAuth).

1. Dans le tableau de bord, allez dans **Authentication > URL Configuration** (selon la version, ce sous-menu peut se trouver directement sous **Authentication > Settings**).
2. **Site URL** : renseignez

   ```
   http://localhost:5173
   ```

3. **Redirect URLs** : ajoutez les URLs vers lesquelles Supabase est autorisé à rediriger après authentification. Pour le développement local, ajoutez :

   ```
   http://localhost:5173
   http://localhost:5173/**
   ```

4. Cliquez sur **Save**.

**Pour la production** : quand le jeu sera déployé (ex. `https://mon-jeu.exemple.com`), revenez sur cet écran et :
- ajoutez l'URL de production dans **Redirect URLs** (ex. `https://mon-jeu.exemple.com/**`),
- mettez à jour **Site URL** si le domaine de production devient l'URL principale du jeu.

---

## 5. Activer la connexion Google

### 5.1 Créer les identifiants OAuth dans Google Cloud Console

1. Allez sur [https://console.cloud.google.com](https://console.cloud.google.com).
2. Créez un nouveau projet (ou sélectionnez-en un existant) via le sélecteur de projet en haut de page.
3. Dans le menu, allez dans **APIs & Services > OAuth consent screen**.
   - Choisissez le type d'utilisateur (**External** convient pour une application grand public).
   - Renseignez le nom de l'application, un email de support, et les autres champs obligatoires.
   - Enregistrez (les scopes par défaut suffisent pour une connexion basique).
4. Allez dans **APIs & Services > Credentials**.
5. Cliquez sur **Create Credentials > OAuth client ID**.
6. Choisissez le type d'application **Web application**.
7. Dans **Authorized redirect URIs**, ajoutez l'URI de callback fournie par Supabase, de la forme :

   ```
   https://<ref-projet>.supabase.co/auth/v1/callback
   ```

   Remplacez `<ref-projet>` par la référence de votre projet Supabase (visible dans l'URL du projet, `https://<ref-projet>.supabase.co`).

8. Cliquez sur **Create**. Notez le **Client ID** et le **Client Secret** affichés.

### 5.2 Renseigner les identifiants dans Supabase

1. Dans le tableau de bord Supabase, allez dans **Authentication > Providers** (selon la version : **Authentication > Sign In / Providers**).
2. Trouvez **Google** dans la liste et cliquez pour l'ouvrir.
3. Activez le provider (bascule **Enable**).
4. Collez le **Client ID** et le **Client Secret** obtenus à l'étape 5.1.
5. Cliquez sur **Save**.

---

## 6. Activer la connexion GitHub

### 6.1 Créer une OAuth App dans GitHub

1. Connectez-vous à GitHub, puis allez dans **Settings > Developer settings > OAuth Apps**.
2. Cliquez sur **New OAuth App**.
3. Renseignez :
   - **Application name** : par exemple `Village Survivor`.
   - **Homepage URL** : `http://localhost:5173` (ou l'URL de production plus tard).
   - **Authorization callback URL** : la même URL de callback Supabase que pour Google :

     ```
     https://<ref-projet>.supabase.co/auth/v1/callback
     ```

4. Cliquez sur **Register application**.
5. Sur la page de l'application créée, notez le **Client ID**.
6. Cliquez sur **Generate a new client secret** et notez immédiatement le secret affiché (il ne sera plus visible ensuite).

### 6.2 Renseigner les identifiants dans Supabase

1. Dans le tableau de bord Supabase, allez dans **Authentication > Providers**.
2. Trouvez **GitHub** dans la liste et cliquez pour l'ouvrir.
3. Activez le provider (bascule **Enable**).
4. Collez le **Client ID** et le **Client Secret** obtenus à l'étape 6.1.
5. Cliquez sur **Save**.

---

## 7. Activer la double authentification (TOTP / MFA)

Le jeu propose la double authentification par application TOTP (Google Authenticator, Authy, etc.) pour les comptes email/mot de passe.

1. Dans le tableau de bord Supabase, allez dans **Authentication**, puis cherchez la section liée à la sécurité/MFA — selon la version de l'interface, cela se trouve sous **Authentication > Policies**, **Authentication > Settings > Multi-Factor Authentication**, ou un onglet dédié **Auth MFA**.
2. Vérifiez/activez l'option correspondant à **TOTP** (authentification par code à usage unique généré par une application). C'est en général activé par défaut au niveau du projet, mais vérifiez qu'aucune restriction ne le désactive.
3. Il n'y a rien d'autre à préconfigurer côté Supabase pour un flux TOTP standard : le code du jeu se charge d'appeler les fonctions d'inscription au facteur MFA (`enroll`) et de vérification (`challenge` / `verify`) via le SDK `@supabase/supabase-js`.
4. Côté joueur, le flux attendu est :
   - à l'inscription (ou depuis les réglages du compte), le jeu affiche un QR code,
   - le joueur le scanne avec une application comme **Google Authenticator** ou **Authy**,
   - le joueur saisit le code à 6 chiffres généré pour confirmer l'activation.

> Aucune valeur à copier ici : ce réglage ne nécessite pas de clé API supplémentaire, contrairement aux providers OAuth.

---

## 8. Activer/configurer l'email (inscription email/mot de passe)

1. Dans le tableau de bord Supabase, allez dans **Authentication > Providers** (ou **Authentication > Sign In / Providers**).
2. Le provider **Email** est activé par défaut sur un nouveau projet ; vérifiez simplement que la bascule **Enable Email provider** (ou équivalent) est bien allumée.
3. Repérez l'option **Confirm email** (parfois nommée **Enable email confirmations**), généralement dans le même écran ou dans **Authentication > Settings**.
   - **En développement**, vous pouvez la **désactiver** pour tester rapidement les inscriptions sans avoir à cliquer sur un lien reçu par email.
   - **En production**, gardez-la **activée** : c'est une protection standard qui évite les inscriptions avec des adresses email invalides ou usurpées, et qui garantit que l'utilisateur possède bien l'adresse fournie.
4. Si vous laissez la confirmation activée, Supabase utilise par défaut son propre service d'envoi d'email pour les tests (quotas limités) ; pour un usage en production, prévoyez de configurer un fournisseur SMTP personnalisé plus tard (**Project Settings > Auth > SMTP Settings**) — cela sort du cadre de ce guide de démarrage.

---

## 9. Lancer le jeu

1. Assurez-vous d'avoir bien créé le fichier `.env` à la racine du dépôt (voir étape 2) avec les deux clés remplies :

   ```env
   VITE_SUPABASE_URL=https://<ref-projet>.supabase.co
   VITE_SUPABASE_ANON_KEY=<votre-clé-anon-public>
   ```

2. Installez les dépendances du monorepo :

   ```bash
   pnpm install
   ```

3. Lancez le serveur de développement du client :

   ```bash
   pnpm dev
   ```

4. Ouvrez [http://127.0.0.1:5173](http://127.0.0.1:5173) dans votre navigateur. Le serveur
   n'écoute que sur cette adresse ; si vous préférez `http://localhost:5173`, ajoutez les deux
   formes aux **Redirect URLs** de l'étape 4.

   > Ce guide ne concerne que le **lobby** : connexion, hub multijoueur et méta-progression. La
   > page de jeu `http://127.0.0.1:5173/play.html` fonctionne en solo sans aucune configuration
   > Supabase.
5. Testez le flux complet :
   - créez un compte par email/mot de passe,
   - activez la double authentification (scannez le QR code avec votre application TOTP),
   - déconnectez-vous, puis reconnectez-vous en saisissant le code TOTP,
   - testez également la connexion via **Google** et via **GitHub**.

---

## 10. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Après connexion Google/GitHub, erreur ou redirection vers une page d'erreur Supabase (« redirect_uri_mismatch » ou similaire) | L'URL de callback n'est pas exactement celle attendue | Vérifiez que l'URI `https://<ref-projet>.supabase.co/auth/v1/callback` est bien renseignée à l'identique (sans faute de frappe, sans slash final en trop) côté Google Cloud Console **et** côté GitHub OAuth App |
| Le jeu se recharge sur une URL inattendue ou reste bloqué après connexion | Site URL / Redirect URLs mal configurées dans Supabase | Revérifiez l'étape 4 : **Site URL** = `http://localhost:5173` et `http://localhost:5173/**` dans **Redirect URLs** |
| Le client Supabase lève une erreur au démarrage du type « supabaseUrl is required » ou « Invalid API key » | `VITE_SUPABASE_URL` ou `VITE_SUPABASE_ANON_KEY` absent(e) ou mal copié(e) dans `.env` | Relisez l'étape 2 : vérifiez que le fichier s'appelle bien `.env` (pas `.env.example`), qu'il est à la racine du dépôt, et que les valeurs ne contiennent pas d'espace ou de guillemets superflus. Redémarrez `pnpm --filter @village-survivor/client dev` après toute modification de `.env` (Vite ne recharge pas toujours les variables d'environnement à chaud) |
| Le bouton « Se connecter avec Google » (ou GitHub) ne fait rien ou renvoie une erreur « provider is not enabled » | Le provider n'a pas été activé côté Supabase | Retournez dans **Authentication > Providers** et vérifiez que la bascule **Enable** est bien activée pour le provider concerné, puis **Save** |
| L'inscription par email reste bloquée sur « vérifiez votre boîte mail », rien ne se passe ensuite en dev | L'option **Confirm email** est activée alors que vous testez en local sans vérifier vos emails | Soit consultez la boîte mail utilisée (y compris les spams) et cliquez sur le lien reçu, soit désactivez temporairement **Confirm email** pour le développement (étape 8), en la réactivant avant la mise en production |
| Erreur liée aux tables manquantes (`relation "profiles" does not exist`, `relation "meta_character_profiles" does not exist`, etc.) | Une ou plusieurs migrations n'ont pas été appliquées | Reprenez l'étape 3 et exécutez **tous** les fichiers de `supabase/migrations/` dans l'ordre, ou lancez `supabase db push` |
| La page reste blanche ou le navigateur ne joint pas le serveur sur `http://localhost:5173` | Vite n'écoute que sur `127.0.0.1` ; `localhost` peut être résolu en IPv6 (`::1`) | Utilisez `http://127.0.0.1:5173`, et ajoutez cette forme aux **Redirect URLs** de Supabase si vous vous connectez depuis elle |
