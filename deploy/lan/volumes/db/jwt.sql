-- Repris de la configuration officielle `supabase/docker`.
-- Publie le secret JWT dans la base : les fonctions SQL qui vérifient un jeton s'en servent.
\set jwt_secret `echo "$JWT_SECRET"`
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_secret" TO :'jwt_secret';
ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
