-- Repris de la configuration officielle `supabase/docker`.
-- Base annexe attendue par plusieurs services Supabase.
\set pguser `echo "$POSTGRES_USER"`

CREATE DATABASE _supabase WITH OWNER :pguser;
