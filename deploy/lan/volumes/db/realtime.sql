-- Repris de la configuration officielle `supabase/docker`.
-- Schéma dans lequel Realtime stocke ses locataires et ses extensions.
\set pguser `echo "$POSTGRES_USER"`

create schema if not exists _realtime;
alter schema _realtime owner to :pguser;
