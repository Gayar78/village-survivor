-- =============================================================================
-- Migration 0004 — Méta-progression persistante Tower (Phase 4)
-- Idempotente : profils (3 maximum), bénédictions, compétences, gemmes et forge.
-- Les écritures passent exclusivement par des RPC authentifiées et atomiques.
-- =============================================================================

create table if not exists public.meta_character_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  blessing_path_id text not null default 'bastion',
  blessing_budget int not null default 4,
  blessing_ranks jsonb not null default '{}'::jsonb,
  skill_slots jsonb not null default '[null,null,null]'::jsonb,
  gem_slots jsonb not null default '[null,null,null]'::jsonb,
  is_default boolean not null default false,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_character_profiles_name_valid
    check (char_length(btrim(name)) between 1 and 32),
  constraint meta_character_profiles_path_valid
    check (blessing_path_id in ('bastion', 'hunter', 'wayfarer')),
  constraint meta_character_profiles_budget_valid check (blessing_budget = 4),
  constraint meta_character_profiles_blessings_object check (jsonb_typeof(blessing_ranks) = 'object'),
  constraint meta_character_profiles_skill_slots_valid
    check (jsonb_typeof(skill_slots) = 'array' and jsonb_array_length(skill_slots) = 3),
  constraint meta_character_profiles_gem_slots_valid
    check (jsonb_typeof(gem_slots) = 'array' and jsonb_array_length(gem_slots) = 3)
);

create unique index if not exists meta_character_profiles_one_default_per_user
  on public.meta_character_profiles (user_id) where is_default;
create unique index if not exists meta_character_profiles_one_active_per_user
  on public.meta_character_profiles (user_id) where is_active;
create index if not exists meta_character_profiles_user_id_idx
  on public.meta_character_profiles (user_id);

create table if not exists public.meta_owned_skills (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id text not null,
  rank int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id),
  constraint meta_owned_skills_id_valid
    check (skill_id in ('suppressive-fire', 'combat-medic', 'field-sprint', 'heart-keeper')),
  constraint meta_owned_skills_rank_valid check (rank between 1 and 3)
);

create table if not exists public.meta_owned_gems (
  user_id uuid not null references auth.users(id) on delete cascade,
  gem_id text not null,
  quantity int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, gem_id),
  constraint meta_owned_gems_id_valid check (gem_id in ('ember', 'swift', 'vital', 'prism')),
  constraint meta_owned_gems_quantity_valid check (quantity between 0 and 9999)
);

-- Un profil jouable et quelques composants de forge sont disponibles sans achat.
create or replace function public.ensure_default_meta_progression(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.meta_character_profiles (
    user_id, name, blessing_path_id, is_default, is_active
  )
  values (p_user_id, 'Survivant', 'bastion', true, true)
  on conflict (user_id) where is_default do nothing;

  insert into public.meta_owned_gems (user_id, gem_id, quantity)
  values
    (p_user_id, 'ember', 2),
    (p_user_id, 'swift', 2),
    (p_user_id, 'vital', 2),
    (p_user_id, 'prism', 0)
  on conflict (user_id, gem_id) do nothing;
end;
$$;

revoke all on function public.ensure_default_meta_progression(uuid) from public, anon, authenticated;

select public.ensure_default_meta_progression(id) from auth.users;

create or replace function public.handle_new_meta_progression()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_default_meta_progression(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_meta_progression on auth.users;
create trigger on_auth_user_created_meta_progression
  after insert on auth.users
  for each row execute function public.handle_new_meta_progression();

revoke all on function public.handle_new_meta_progression() from public, anon, authenticated;

-- Lecture propriétaire uniquement. Aucune politique d'écriture : toutes les
-- validations métier restent dans les RPC ci-dessous.
alter table public.meta_character_profiles enable row level security;
alter table public.meta_owned_skills enable row level security;
alter table public.meta_owned_gems enable row level security;

drop policy if exists "meta_character_profiles_select_own" on public.meta_character_profiles;
create policy "meta_character_profiles_select_own" on public.meta_character_profiles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "meta_owned_skills_select_own" on public.meta_owned_skills;
create policy "meta_owned_skills_select_own" on public.meta_owned_skills
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "meta_owned_gems_select_own" on public.meta_owned_gems;
create policy "meta_owned_gems_select_own" on public.meta_owned_gems
  for select to authenticated using (auth.uid() = user_id);

revoke all on table public.meta_character_profiles, public.meta_owned_skills, public.meta_owned_gems
  from anon, authenticated;
grant select on table public.meta_character_profiles, public.meta_owned_skills, public.meta_owned_gems
  to authenticated;

-- Crée un profil sans pouvoir dépasser trois profils, même en concurrence.
create or replace function public.create_meta_character_profile(
  p_name text,
  p_blessing_path_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 32 then
    raise exception 'profile name must contain 1 to 32 characters' using errcode = '22023';
  end if;
  if p_blessing_path_id is null or p_blessing_path_id not in ('bastion', 'hunter', 'wayfarer') then
    raise exception 'unknown blessing path' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 4004));
  if (select count(*) from public.meta_character_profiles where user_id = v_user_id) >= 3 then
    raise exception 'profile limit reached' using errcode = '23514';
  end if;

  insert into public.meta_character_profiles (user_id, name, blessing_path_id)
  values (v_user_id, btrim(p_name), p_blessing_path_id)
  returning id into v_profile_id;
  return v_profile_id;
end;
$$;

-- Sauvegarde le nom et les emplacements. Les rangs de bénédictions ne sont jamais
-- fournis par le client. Les compétences/gemmes doivent appartenir au compte.
create or replace function public.save_meta_character_build(
  p_profile_id uuid,
  p_name text,
  p_blessing_path_id text,
  p_skill_slots jsonb,
  p_gem_slots jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_path text;
  v_blessing_ranks jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 32 then
    raise exception 'profile name must contain 1 to 32 characters' using errcode = '22023';
  end if;
  if p_blessing_path_id is null or p_blessing_path_id not in ('bastion', 'hunter', 'wayfarer') then
    raise exception 'unknown blessing path' using errcode = '22023';
  end if;
  if p_skill_slots is null or jsonb_typeof(p_skill_slots) <> 'array'
     or jsonb_array_length(p_skill_slots) <> 3 then
    raise exception 'exactly three skill slots are required' using errcode = '22023';
  end if;
  if p_gem_slots is null or jsonb_typeof(p_gem_slots) <> 'array'
     or jsonb_array_length(p_gem_slots) <> 3 then
    raise exception 'exactly three gem slots are required' using errcode = '22023';
  end if;

  select blessing_path_id, blessing_ranks into v_current_path, v_blessing_ranks
  from public.meta_character_profiles
  where id = p_profile_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if v_current_path <> p_blessing_path_id and v_blessing_ranks <> '{}'::jsonb then
    raise exception 'a path with purchased blessings cannot be changed' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_skill_slots) slot
    where jsonb_typeof(slot) not in ('string', 'null')
       or (jsonb_typeof(slot) = 'string' and slot #>> '{}' not in
          ('suppressive-fire', 'combat-medic', 'field-sprint', 'heart-keeper'))
  ) then
    raise exception 'unknown skill in slots' using errcode = '22023';
  end if;
  if (
    select count(*) from jsonb_array_elements(p_skill_slots) slot where jsonb_typeof(slot) = 'string'
  ) <> (
    select count(distinct slot #>> '{}') from jsonb_array_elements(p_skill_slots) slot
    where jsonb_typeof(slot) = 'string'
  ) then
    raise exception 'a skill cannot occupy multiple slots' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_skill_slots) skill_id
    where skill_id <> '' and not exists (
      select 1 from public.meta_owned_skills owned
      where owned.user_id = v_user_id and owned.skill_id = skill_id and owned.rank > 0
    )
  ) then
    raise exception 'skill is not owned' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_gem_slots) slot
    where jsonb_typeof(slot) not in ('string', 'null')
       or (jsonb_typeof(slot) = 'string' and slot #>> '{}' not in ('ember', 'swift', 'vital', 'prism'))
  ) then
    raise exception 'unknown gem in slots' using errcode = '22023';
  end if;
  if exists (
    select equipped.gem_id
    from (
      select slot #>> '{}' as gem_id, count(*)::int as quantity
      from jsonb_array_elements(p_gem_slots) slot
      where jsonb_typeof(slot) = 'string'
      group by slot #>> '{}'
    ) equipped
    left join public.meta_owned_gems owned
      on owned.user_id = v_user_id and owned.gem_id = equipped.gem_id
    where coalesce(owned.quantity, 0) < equipped.quantity
  ) then
    raise exception 'not enough owned gems for slots' using errcode = '23514';
  end if;

  update public.meta_character_profiles
  set name = btrim(p_name), blessing_path_id = p_blessing_path_id,
      skill_slots = p_skill_slots, gem_slots = p_gem_slots, updated_at = now()
  where id = p_profile_id and user_id = v_user_id;
end;
$$;

create or replace function public.activate_meta_character_profile(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.meta_character_profiles where id = p_profile_id and user_id = v_user_id
  ) then raise exception 'profile not found' using errcode = 'P0002'; end if;
  update public.meta_character_profiles set is_active = false, updated_at = now()
    where user_id = v_user_id and is_active;
  update public.meta_character_profiles set is_active = true, updated_at = now()
    where id = p_profile_id and user_id = v_user_id;
end;
$$;

create or replace function public.delete_meta_character_profile(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid := auth.uid(); v_default_id uuid; v_is_default boolean; v_is_active boolean;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 4004));
  select is_default, is_active into v_is_default, v_is_active
    from public.meta_character_profiles where id = p_profile_id and user_id = v_user_id for update;
  if not found then raise exception 'profile not found' using errcode = 'P0002'; end if;
  if v_is_default then raise exception 'default profile cannot be deleted' using errcode = '23514'; end if;
  delete from public.meta_character_profiles where id = p_profile_id and user_id = v_user_id;
  if v_is_active then
    select id into v_default_id from public.meta_character_profiles
      where user_id = v_user_id and is_default;
    update public.meta_character_profiles set is_active = true, updated_at = now() where id = v_default_id;
  end if;
end;
$$;

-- Achat atomique d'un rang de bénédiction propre au profil.
create or replace function public.purchase_meta_blessing_upgrade(
  p_profile_id uuid,
  p_blessing_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid(); v_path text; v_expected_path text; v_ranks jsonb;
  v_rank int; v_spent int; v_cost bigint; v_balance bigint;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  v_expected_path := case
    when p_blessing_id in ('iron-heart', 'guardian-pulse') then 'bastion'
    when p_blessing_id in ('keen-rounds', 'rapid-drill') then 'hunter'
    when p_blessing_id in ('wind-step', 'far-reach') then 'wayfarer'
    else null end;
  if v_expected_path is null then raise exception 'unknown blessing' using errcode = '22023'; end if;

  select balance into v_balance from public.account_gold_wallets
    where user_id = v_user_id for update;
  if not found then raise exception 'gold wallet not found' using errcode = 'P0002'; end if;
  select blessing_path_id, blessing_ranks into v_path, v_ranks
    from public.meta_character_profiles where id = p_profile_id and user_id = v_user_id for update;
  if not found then raise exception 'profile not found' using errcode = 'P0002'; end if;
  if v_path <> v_expected_path then raise exception 'blessing is outside the selected path' using errcode = '23514'; end if;

  v_rank := coalesce((v_ranks ->> p_blessing_id)::int, 0);
  if v_rank >= 2 then raise exception 'blessing is already at maximum rank' using errcode = '23514'; end if;
  select coalesce(sum((value #>> '{}')::int), 0) into v_spent from jsonb_each(v_ranks);
  if v_spent + 1 > 4 then raise exception 'blessing budget exceeded' using errcode = '23514'; end if;
  v_cost := case v_rank when 0 then 80 else 160 end;
  if v_balance < v_cost then raise exception 'insufficient account gold' using errcode = '23514'; end if;

  update public.account_gold_wallets set balance = balance - v_cost, updated_at = now()
    where user_id = v_user_id returning balance into v_balance;
  v_rank := v_rank + 1;
  update public.meta_character_profiles
    set blessing_ranks = jsonb_set(blessing_ranks, array[p_blessing_id], to_jsonb(v_rank), true),
        updated_at = now()
    where id = p_profile_id and user_id = v_user_id;
  return jsonb_build_object('profileId', p_profile_id, 'blessingId', p_blessing_id,
    'rank', v_rank, 'budgetSpent', v_spent + 1, 'goldBalance', v_balance);
end;
$$;

-- Débloque puis améliore une compétence de compte (rangs 1 à 3).
create or replace function public.purchase_meta_skill_upgrade(p_skill_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid := auth.uid(); v_rank int; v_cost bigint; v_balance bigint;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_skill_id not in ('suppressive-fire', 'combat-medic', 'field-sprint', 'heart-keeper') then
    raise exception 'unknown skill' using errcode = '22023';
  end if;
  select balance into v_balance from public.account_gold_wallets where user_id = v_user_id for update;
  if not found then raise exception 'gold wallet not found' using errcode = 'P0002'; end if;
  select rank into v_rank from public.meta_owned_skills
    where user_id = v_user_id and skill_id = p_skill_id for update;
  v_rank := coalesce(v_rank, 0);
  if v_rank >= 3 then raise exception 'skill is already at maximum rank' using errcode = '23514'; end if;
  v_cost := case v_rank when 0 then 120 when 1 then 240 else 360 end;
  if v_balance < v_cost then raise exception 'insufficient account gold' using errcode = '23514'; end if;
  update public.account_gold_wallets set balance = balance - v_cost, updated_at = now()
    where user_id = v_user_id returning balance into v_balance;
  insert into public.meta_owned_skills (user_id, skill_id, rank)
    values (v_user_id, p_skill_id, v_rank + 1)
    on conflict (user_id, skill_id) do update set rank = excluded.rank, updated_at = now();
  return jsonb_build_object('skillId', p_skill_id, 'rank', v_rank + 1, 'goldBalance', v_balance);
end;
$$;

-- Forge déterministe : débite l'or et les gemmes requises, puis crédite le résultat
-- dans la même transaction. Aucun coût ni solde n'est fourni par le client.
create or replace function public.forge_meta_recipe(p_recipe_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid(); v_cost bigint; v_input_a text; v_qty_a int;
  v_input_b text; v_qty_b int; v_balance bigint; v_output_quantity int;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  case p_recipe_id
    when 'temper-ember' then v_cost := 100; v_input_a := 'ember'; v_qty_a := 2;
    when 'cut-swift' then v_cost := 100; v_input_a := 'swift'; v_qty_a := 2;
    when 'fuse-heart' then v_cost := 120; v_input_a := 'ember'; v_qty_a := 1; v_input_b := 'vital'; v_qty_b := 1;
    else raise exception 'unknown forge recipe' using errcode = '22023';
  end case;
  select balance into v_balance from public.account_gold_wallets where user_id = v_user_id for update;
  if not found then raise exception 'gold wallet not found' using errcode = 'P0002'; end if;
  if v_balance < v_cost then raise exception 'insufficient account gold' using errcode = '23514'; end if;

  perform 1 from public.meta_owned_gems where user_id = v_user_id order by gem_id for update;
  if coalesce((select quantity from public.meta_owned_gems where user_id = v_user_id and gem_id = v_input_a), 0) < v_qty_a
     or (v_input_b is not null and coalesce((select quantity from public.meta_owned_gems
       where user_id = v_user_id and gem_id = v_input_b), 0) < v_qty_b) then
    raise exception 'missing forge ingredients' using errcode = '23514';
  end if;

  update public.account_gold_wallets set balance = balance - v_cost, updated_at = now()
    where user_id = v_user_id returning balance into v_balance;
  update public.meta_owned_gems set quantity = quantity - v_qty_a, updated_at = now()
    where user_id = v_user_id and gem_id = v_input_a;
  if v_input_b is not null then
    update public.meta_owned_gems set quantity = quantity - v_qty_b, updated_at = now()
      where user_id = v_user_id and gem_id = v_input_b;
  end if;
  insert into public.meta_owned_gems (user_id, gem_id, quantity)
    values (v_user_id, 'prism', 1)
    on conflict (user_id, gem_id) do update
      set quantity = meta_owned_gems.quantity + 1, updated_at = now()
    returning quantity into v_output_quantity;
  return jsonb_build_object('recipeId', p_recipe_id, 'outputGemId', 'prism',
    'outputQuantity', v_output_quantity, 'goldBalance', v_balance);
end;
$$;

revoke all on function public.create_meta_character_profile(text, text) from public, anon;
revoke all on function public.save_meta_character_build(uuid, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.activate_meta_character_profile(uuid) from public, anon;
revoke all on function public.delete_meta_character_profile(uuid) from public, anon;
revoke all on function public.purchase_meta_blessing_upgrade(uuid, text) from public, anon;
revoke all on function public.purchase_meta_skill_upgrade(text) from public, anon;
revoke all on function public.forge_meta_recipe(text) from public, anon;

grant execute on function public.create_meta_character_profile(text, text) to authenticated;
grant execute on function public.save_meta_character_build(uuid, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.activate_meta_character_profile(uuid) to authenticated;
grant execute on function public.delete_meta_character_profile(uuid) to authenticated;
grant execute on function public.purchase_meta_blessing_upgrade(uuid, text) to authenticated;
grant execute on function public.purchase_meta_skill_upgrade(text) to authenticated;
grant execute on function public.forge_meta_recipe(text) to authenticated;
