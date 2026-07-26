# Déploiement

Statut : **build de production et CI configurés, hébergement non configuré**
Dernière mise à jour : 21 juillet 2026

## 1. Objectifs

- rendre chaque changement vérifiable avant publication ;
- séparer local, preview/staging et production ;
- héberger le client statique à faible coût ;
- conserver le futur serveur portable ;
- empêcher toute publication de secret ;
- permettre un retour à une version connue.

## 2. État actuel

Le client M1 produit un site statique dans `apps/client/dist`. Le workflow GitHub
Actions installe les dépendances avec le lockfile, contrôle formatage, lint, types,
tests et build, puis exécute les scénarios Playwright sur le build de production et
sur le serveur de développement. Le smoke test de production vérifie notamment que
l'API de débogage n'est pas exposée.

La configuration Cloudflare, l'URL publique et l'image Docker du futur serveur ne sont
pas encore créées. M1 est donc déployable comme site statique, mais pas encore publié.

Le dépôt GitHub public est
[HidaAkawa/village_survivor](https://github.com/HidaAkawa/village_survivor).

## 3. Environnements cibles

| Environnement | Usage | Client | Serveur | Données persistantes |
|---|---|---|---|---|
| Local | Développement et tests | Vite local | Processus Node futur | Aucune |
| Preview / staging | Validation d'une branche ou version candidate | Cloudflare, URL isolée | Déploiement Docker futur | Aucune en V1 |
| Production | Version humaine validée | Cloudflare Workers Static Assets | Colyseus Cloud ou hôte Docker futur | Aucune en V1 |

Une preview ne doit pas partager par défaut des secrets ou ressources de production.

## 4. Pipeline de contrôle

Le pipeline M1 suit cet ordre :

1. checkout du commit ;
2. installation de la version de pnpm verrouillée ;
3. `pnpm install` avec lockfile non modifiable ;
4. vérification du formatage ;
5. `pnpm lint` ;
6. `pnpm typecheck` ;
7. `pnpm test` ;
8. `pnpm build` ;
9. smoke tests Playwright sur le build ;
10. scénarios navigateur sur le serveur de développement.

La publication sera ajoutée uniquement pour les branches et environnements autorisés.

Les étapes de déploiement dépendent des contrôles précédents. Un échec interdit la
publication du commit concerné.

## 5. Client

### Cible

Vite produit un bundle statique du client Phaser. Ce bundle est destiné à Cloudflare
Workers Static Assets.

### Contraintes

- aucune variable secrète ne doit être intégrée au bundle ;
- les variables publiques sont explicitement préfixées et documentées ;
- le build de production n'expose pas l'API de débogage ;
- les assets utilisent des noms versionnés ou des règles de cache compatibles avec un
  retour arrière ;
- le chargement d'une route publique doit fonctionner sans état serveur en V1.

### Promotion envisagée

- les branches ou pull requests peuvent produire une preview ;
- `main` produit un artefact candidat ;
- la promotion en production intervient après contrôles et validation humaine du
  gameplay ;
- l'URL et la stratégie exacte de promotion seront fixées lors de la configuration du
  compte Cloudflare.

## 6. Serveur multijoueur futur

Le serveur sera empaqueté dans une image Docker :

- processus non privilégié lorsque la plateforme le permet ;
- configuration par variables d'environnement ;
- endpoint de santé ;
- arrêt propre des rooms ;
- logs sur la sortie standard sans donnée sensible ;
- aucune dépendance indispensable au disque local ;
- image testée avant publication ;
- version liée au commit Git et compatible avec la version du protocole.

Le choix entre Colyseus Cloud et un hébergeur Docker simple sera effectué au moment où
une room minimale existe, selon coût, observabilité et simplicité d'exploitation.

## 7. Secrets et autorisations

Les secrets de déploiement sont stockés dans les environnements GitHub ou dans le
gestionnaire de secrets de l'hébergeur. Ils ne sont jamais :

- committés dans un fichier `.env` ;
- écrits dans la documentation ;
- injectés dans le JavaScript du client ;
- affichés dans les logs ;
- partagés entre preview et production sans nécessité explicite.

L'ajout d'un nouveau secret doit documenter son propriétaire, sa portée, sa rotation
et l'environnement qui l'utilise, sans révéler sa valeur.

## 8. Retour arrière

Pour le client statique, le retour arrière doit pouvoir republier un artefact validé
d'un commit antérieur. Pour le serveur futur, les images sont identifiées par un tag
immuable lié au commit. Aucune migration de base de données n'est concernée en V1.

Un rollback ne remplace pas l'analyse de l'incident : la cause et la correction sont
documentées avant une nouvelle promotion.

## 9. Prérequis non encore fournis

- compte et projet Cloudflare ;
- URL ou domaine de production ;
- politique de preview ;
- secrets GitHub nécessaires ;
- choix de l'hébergement serveur lorsque le multijoueur commencera ;
- budgets de coût autorisés.

Ces prérequis ne bloquent ni l'initialisation locale, ni le premier incrément jouable.
