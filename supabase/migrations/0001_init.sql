-- =============================================================================
-- Migration 0001 — Schéma initial des comptes joueurs (Village Survivors v2)
-- Idempotente : rejouable sans erreur.
--   - Profils & statistiques joueur
--   - Tables (vides) prêtes pour la future méta-progression
--   - RLS « propriétaire uniquement » sur les 5 tables
--   - Trigger de création automatique du profil / des stats
--   - RPC atomique record_game_result
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table profiles
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. Table player_stats (statistiques cumulées par joueur)
-- -----------------------------------------------------------------------------
create table if not exists public.player_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  games_played int not null default 0,
  games_won int not null default 0,
  games_lost int not null default 0,
  total_play_ms bigint not null default 0,
  best_cycle int not null default 0,
  max_player_level int not null default 0,
  wood_gathered bigint not null default 0,
  stone_gathered bigint not null default 0,
  iron_gathered bigint not null default 0,
  gold_gathered bigint not null default 0,
  diamond_gathered bigint not null default 0,
  -- Colonne fourre-tout pour de futures statistiques sans migration.
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Tables VIDES prêtes pour la future méta-progression
--    (aucun gameplay branché dessus pour l'instant, juste la structure)
-- -----------------------------------------------------------------------------

-- Soldes du coffre partagé (banque de ressources hors partie).
create table if not exists public.coffre_balances (
  user_id uuid references auth.users(id) on delete cascade,
  resource_type text not null,
  quantity bigint not null default 0,
  primary key (user_id, resource_type)
);

-- Sorts débloqués de façon permanente au niveau du compte.
create table if not exists public.unlocked_spells (
  user_id uuid references auth.users(id) on delete cascade,
  spell_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, spell_id)
);

-- Objets possédés au niveau du compte (cosmétiques, consommables, etc.).
create table if not exists public.account_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  quantity int not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4. Row Level Security — accès réservé au propriétaire sur chaque table
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.player_stats enable row level security;
alter table public.coffre_balances enable row level security;
alter table public.unlocked_spells enable row level security;
alter table public.account_items enable row level security;

-- profiles (clé = id)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- player_stats (clé = user_id)
drop policy if exists "player_stats_select_own" on public.player_stats;
create policy "player_stats_select_own" on public.player_stats
  for select using (auth.uid() = user_id);

drop policy if exists "player_stats_insert_own" on public.player_stats;
create policy "player_stats_insert_own" on public.player_stats
  for insert with check (auth.uid() = user_id);

drop policy if exists "player_stats_update_own" on public.player_stats;
create policy "player_stats_update_own" on public.player_stats
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "player_stats_delete_own" on public.player_stats;
create policy "player_stats_delete_own" on public.player_stats
  for delete using (auth.uid() = user_id);

-- coffre_balances (clé = user_id)
drop policy if exists "coffre_balances_select_own" on public.coffre_balances;
create policy "coffre_balances_select_own" on public.coffre_balances
  for select using (auth.uid() = user_id);

drop policy if exists "coffre_balances_insert_own" on public.coffre_balances;
create policy "coffre_balances_insert_own" on public.coffre_balances
  for insert with check (auth.uid() = user_id);

drop policy if exists "coffre_balances_update_own" on public.coffre_balances;
create policy "coffre_balances_update_own" on public.coffre_balances
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "coffre_balances_delete_own" on public.coffre_balances;
create policy "coffre_balances_delete_own" on public.coffre_balances
  for delete using (auth.uid() = user_id);

-- unlocked_spells (clé = user_id)
drop policy if exists "unlocked_spells_select_own" on public.unlocked_spells;
create policy "unlocked_spells_select_own" on public.unlocked_spells
  for select using (auth.uid() = user_id);

drop policy if exists "unlocked_spells_insert_own" on public.unlocked_spells;
create policy "unlocked_spells_insert_own" on public.unlocked_spells
  for insert with check (auth.uid() = user_id);

drop policy if exists "unlocked_spells_update_own" on public.unlocked_spells;
create policy "unlocked_spells_update_own" on public.unlocked_spells
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "unlocked_spells_delete_own" on public.unlocked_spells;
create policy "unlocked_spells_delete_own" on public.unlocked_spells
  for delete using (auth.uid() = user_id);

-- account_items (clé = user_id)
drop policy if exists "account_items_select_own" on public.account_items;
create policy "account_items_select_own" on public.account_items
  for select using (auth.uid() = user_id);

drop policy if exists "account_items_insert_own" on public.account_items;
create policy "account_items_insert_own" on public.account_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "account_items_update_own" on public.account_items;
create policy "account_items_update_own" on public.account_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "account_items_delete_own" on public.account_items;
create policy "account_items_delete_own" on public.account_items
  for delete using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 5. Création automatique du profil et des stats à l'inscription
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      ''
    )
  )
  on conflict (id) do nothing;

  insert into public.player_stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 6. RPC atomique : enregistre le résultat d'une partie
-- -----------------------------------------------------------------------------
create or replace function public.record_game_result(
  p_won boolean,
  p_duration_ms bigint,
  p_cycle int,
  p_level int,
  p_wood bigint,
  p_stone bigint,
  p_iron bigint,
  p_gold bigint,
  p_diamond bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.player_stats
  set
    games_played = games_played + 1,
    games_won = games_won + (case when p_won then 1 else 0 end),
    games_lost = games_lost + (case when p_won then 0 else 1 end),
    total_play_ms = total_play_ms + coalesce(p_duration_ms, 0),
    best_cycle = greatest(best_cycle, coalesce(p_cycle, 0)),
    max_player_level = greatest(max_player_level, coalesce(p_level, 0)),
    wood_gathered = wood_gathered + coalesce(p_wood, 0),
    stone_gathered = stone_gathered + coalesce(p_stone, 0),
    iron_gathered = iron_gathered + coalesce(p_iron, 0),
    gold_gathered = gold_gathered + coalesce(p_gold, 0),
    diamond_gathered = diamond_gathered + coalesce(p_diamond, 0),
    updated_at = now()
  where user_id = auth.uid();
end;
$$;

grant execute on function public.record_game_result(
  boolean, bigint, int, int, bigint, bigint, bigint, bigint, bigint
) to authenticated;
