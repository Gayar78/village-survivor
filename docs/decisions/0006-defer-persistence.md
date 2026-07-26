# ADR-0006 — Différer base de données et persistance de compte

- Statut : **Accepté**
- Date : 20 juillet 2026
- Exigences : `REQ-PERSISTENCE-001`, `REQ-SCOPE-001`

## Contexte

La V1 repose sur des parties one-shot : personnages, compétences, village, ressources
et artefacts repartent de zéro. Les comptes, classements et sauvegardes cloud sont des
possibilités futures, pas des besoins du MVP.

Ajouter immédiatement une base de données imposerait schémas, migrations,
authentification, sauvegardes, sécurité et exploitation avant qu'une donnée persistante
ait une valeur produit validée.

## Décision

Ne pas introduire de base de données, compte joueur ou persistance cloud avant une
décision produit explicite.

Les données d'une partie vivent dans la session locale ou la room serveur. Les
préférences purement locales pourront utiliser un stockage navigateur minimal si un
besoin UX est validé ; elles ne constituent pas une progression de partie.

Lorsque la persistance distante sera justifiée, la cible initiale sera PostgreSQL,
éventuellement via Supabase, avec migrations versionnées et validation côté serveur.
Le choix final fera l'objet d'un nouvel ADR basé sur les données réellement requises.

## Options étudiées

### PostgreSQL dès l'initialisation

Rejeté : aucun cas d'usage V1 ne compense son coût de développement et d'exploitation.

### Base embarquée ou fichiers serveur

Rejetés comme solution anticipée : ils créeraient une persistance implicite et une
future migration sans besoin actuel.

### Stockage navigateur pour la progression

Rejeté en V1 : contradiction avec la partie one-shot et source d'autorité non fiable
pour un futur jeu multijoueur.

## Conséquences

### Positives

- moins de code, de secrets et d'exploitation ;
- aucune migration prématurée ;
- architecture guidée par les besoins de données réels ;
- conformité plus simple en l'absence de compte et télémétrie.

### Négatives

- aucune reprise de partie ou progression entre appareils ;
- introduction ultérieure nécessitant une conception dédiée ;
- certaines statistiques de playtest ne seront pas collectées automatiquement.

### Garde-fous

- ne pas faire passer une sauvegarde cachée pour une préférence locale ;
- aucune collecte de données personnelles ou télémétrie sans validation humaine ;
- toute persistance distante exige modèle de données, politique de rétention,
  sécurité, coût et ADR.
