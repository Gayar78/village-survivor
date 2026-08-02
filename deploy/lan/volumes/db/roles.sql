-- Dérivé de la configuration officielle `supabase/docker`, rendu tolérant aux rôles absents.
--
-- La version officielle fait un `ALTER USER` inconditionnel sur cinq rôles, parce que sa stack
-- complète les crée tous. Cette stack-ci ne déploie ni Storage ni Edge Functions :
-- `supabase_storage_admin` et `supabase_functions_admin` peuvent donc ne pas exister. Un
-- `ALTER USER` sur un rôle absent lève une erreur qui **interrompt toute l'initialisation** de
-- la base, laissant Postgres à moitié construit — les services d'authentification et de temps
-- réel échouent alors en boucle, sans rapport apparent avec la vraie cause.
--
-- On ne génère donc la commande que pour les rôles réellement présents. `\gexec` exécute
-- chaque ligne produite par la requête. La substitution `:'pgpass'` doit rester **hors** d'un
-- bloc `$$…$$` : psql n'interpole pas ses variables à l'intérieur des quotes dollar.
\set pgpass `echo "$POSTGRES_PASSWORD"`

select format('alter user %I with password %L', rolname, :'pgpass')
from pg_roles
where rolname in (
  'authenticator',
  'pgbouncer',
  'supabase_auth_admin',
  'supabase_functions_admin',
  'supabase_storage_admin'
)
order by rolname
\gexec
