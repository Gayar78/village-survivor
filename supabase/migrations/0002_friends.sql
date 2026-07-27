-- =============================================================================
-- Migration 0002 — Système d'amis (Village Survivors v2)
-- Idempotente : rejouable sans erreur.
--   - Code ami personnel (8 caractères, alphabet non ambigu) sur profiles
--   - Génération à l'inscription (trigger) + backfill des lignes existantes
--   - Demandes d'ami (friend_requests) & amitiés (friendships) avec RLS
--   - RPC security definer : code ami, demandes, réponses, liste, suppression
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Générateur de code ami (8 caractères MAJUSCULES, sans I O 0 1)
-- -----------------------------------------------------------------------------
create or replace function public.generate_friend_code()
returns text
language plpgsql
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_len constant int := length(v_alphabet); -- 32 caractères non ambigus
  v_code text := '';
  i int;
begin
  for i in 1..8 loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * v_len)::int, 1);
  end loop;
  return v_code;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Colonne friend_code sur profiles (+ contrainte d'unicité)
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists friend_code text;

create unique index if not exists profiles_friend_code_key
  on public.profiles (friend_code);

-- -----------------------------------------------------------------------------
-- 3. Backfill : attribue un code ami unique aux profils qui n'en ont pas
--    (boucle sûre pour l'unicité, ligne par ligne)
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  v_code text;
begin
  for r in select id from public.profiles where friend_code is null loop
    loop
      v_code := public.generate_friend_code();
      exit when not exists (
        select 1 from public.profiles where friend_code = v_code
      );
    end loop;
    update public.profiles set friend_code = v_code where id = r.id;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Trigger d'inscription : profil + stats (existant) + friend_code (ajout)
--    Réécriture complète : conserve le comportement d'origine et ajoute la
--    génération du code ami avec boucle de ré-essai en cas de collision.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  -- Génère un code ami unique (boucle de ré-essai en cas de collision).
  loop
    v_code := public.generate_friend_code();
    exit when not exists (
      select 1 from public.profiles where friend_code = v_code
    );
  end loop;

  insert into public.profiles (id, display_name, friend_code)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      ''
    ),
    v_code
  )
  on conflict (id) do nothing;

  insert into public.player_stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Le trigger de 0001 pointe déjà sur handle_new_user ; on le (re)crée pour
-- rester idempotent même si la migration est jouée seule.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 5. Table friend_requests (demandes d'ami en attente)
-- -----------------------------------------------------------------------------
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint friend_requests_unique_pair unique (from_user, to_user),
  constraint friend_requests_no_self check (from_user <> to_user)
);

-- -----------------------------------------------------------------------------
-- 6. Table friendships (amitiés — paire triée user_low < user_high)
-- -----------------------------------------------------------------------------
create table if not exists public.friendships (
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  constraint friendships_ordered check (user_low < user_high)
);

-- -----------------------------------------------------------------------------
-- 7. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

-- friend_requests : visible par l'émetteur ou le destinataire.
drop policy if exists "friend_requests_select_involved" on public.friend_requests;
create policy "friend_requests_select_involved" on public.friend_requests
  for select using (auth.uid() in (from_user, to_user));

drop policy if exists "friend_requests_insert_from_self" on public.friend_requests;
create policy "friend_requests_insert_from_self" on public.friend_requests
  for insert with check (auth.uid() = from_user);

drop policy if exists "friend_requests_delete_involved" on public.friend_requests;
create policy "friend_requests_delete_involved" on public.friend_requests
  for delete using (auth.uid() in (from_user, to_user));

-- friendships : visible/supprimable par les deux membres (insert via RPC).
drop policy if exists "friendships_select_involved" on public.friendships;
create policy "friendships_select_involved" on public.friendships
  for select using (auth.uid() in (user_low, user_high));

drop policy if exists "friendships_delete_involved" on public.friendships;
create policy "friendships_delete_involved" on public.friendships
  for delete using (auth.uid() in (user_low, user_high));

-- -----------------------------------------------------------------------------
-- 8. RPC : récupère le code ami du joueur connecté
-- -----------------------------------------------------------------------------
create or replace function public.get_my_friend_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté.';
  end if;

  select friend_code into v_code
  from public.profiles
  where id = auth.uid();

  if v_code is null then
    -- Sécurité : attribue un code à la volée si absent (profil pré-migration).
    loop
      v_code := public.generate_friend_code();
      exit when not exists (
        select 1 from public.profiles where friend_code = v_code
      );
    end loop;
    update public.profiles set friend_code = v_code where id = auth.uid();
  end if;

  return v_code;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. RPC : envoie une demande d'ami à partir d'un code ami
-- -----------------------------------------------------------------------------
create or replace function public.send_friend_request(p_friend_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_low uuid;
  v_high uuid;
begin
  if v_me is null then
    raise exception 'Vous devez être connecté.';
  end if;

  select id into v_target
  from public.profiles
  where friend_code = upper(trim(p_friend_code));

  if v_target is null then
    raise exception 'Code ami inconnu.';
  end if;

  if v_target = v_me then
    raise exception 'Vous ne pouvez pas vous ajouter vous-même.';
  end if;

  v_low := least(v_me, v_target);
  v_high := greatest(v_me, v_target);

  if exists (
    select 1 from public.friendships
    where user_low = v_low and user_high = v_high
  ) then
    raise exception 'Vous êtes déjà amis.';
  end if;

  -- Demande inverse déjà existante → on scelle directement l'amitié.
  if exists (
    select 1 from public.friend_requests
    where from_user = v_target and to_user = v_me
  ) then
    insert into public.friendships (user_low, user_high)
    values (v_low, v_high)
    on conflict do nothing;

    delete from public.friend_requests
    where (from_user = v_target and to_user = v_me)
       or (from_user = v_me and to_user = v_target);
    return;
  end if;

  if exists (
    select 1 from public.friend_requests
    where from_user = v_me and to_user = v_target
  ) then
    raise exception 'Demande déjà envoyée.';
  end if;

  insert into public.friend_requests (from_user, to_user)
  values (v_me, v_target);
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. RPC : répond à une demande d'ami reçue (accepte ou refuse)
-- -----------------------------------------------------------------------------
create or replace function public.respond_friend_request(
  p_request_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_from uuid;
  v_to uuid;
begin
  if v_me is null then
    raise exception 'Vous devez être connecté.';
  end if;

  select from_user, to_user into v_from, v_to
  from public.friend_requests
  where id = p_request_id;

  if v_from is null then
    raise exception 'Demande introuvable.';
  end if;

  if v_to <> v_me then
    raise exception 'Cette demande ne vous est pas destinée.';
  end if;

  if p_accept then
    insert into public.friendships (user_low, user_high)
    values (least(v_from, v_to), greatest(v_from, v_to))
    on conflict do nothing;
  end if;

  delete from public.friend_requests where id = p_request_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. RPC : supprime une amitié
-- -----------------------------------------------------------------------------
create or replace function public.remove_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Vous devez être connecté.';
  end if;

  delete from public.friendships
  where user_low = least(v_me, p_friend_id)
    and user_high = greatest(v_me, p_friend_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 12. RPC : liste les amis du joueur connecté (avec display_name + friend_code)
-- -----------------------------------------------------------------------------
create or replace function public.list_friends()
returns table(user_id uuid, display_name text, friend_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  return query
  select p.id, p.display_name, p.friend_code
  from public.friendships f
  join public.profiles p
    on p.id = case when f.user_low = v_me then f.user_high else f.user_low end
  where v_me in (f.user_low, f.user_high)
  order by p.display_name;
end;
$$;

-- -----------------------------------------------------------------------------
-- 13. RPC : liste les demandes d'ami reçues par le joueur connecté
-- -----------------------------------------------------------------------------
create or replace function public.list_incoming_requests()
returns table(
  request_id uuid,
  from_user uuid,
  from_display_name text,
  from_friend_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  return query
  select fr.id, fr.from_user, p.display_name, p.friend_code
  from public.friend_requests fr
  join public.profiles p on p.id = fr.from_user
  where fr.to_user = v_me
  order by fr.created_at desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- 14. Droits d'exécution des RPC pour les utilisateurs authentifiés
-- -----------------------------------------------------------------------------
grant execute on function public.get_my_friend_code() to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.list_incoming_requests() to authenticated;
