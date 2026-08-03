-- =============================================================================
-- Migration 0006 — Finalisation idempotente des parties autoritaires
-- Rejouable : les tables, contraintes, droits et la fonction sont convergents.
-- =============================================================================

create table if not exists public.game_runs (
  id uuid primary key,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint game_runs_status_known check (status in ('running', 'finished'))
);

create table if not exists public.game_run_rewards (
  run_id uuid not null references public.game_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null,
  credited_at timestamptz not null default now(),
  primary key (run_id, user_id),
  constraint game_run_rewards_amount_safe
    check (amount >= 0 and amount <= 9007199254740991)
);

alter table public.game_runs enable row level security;
alter table public.game_run_rewards enable row level security;
revoke all on table public.game_runs, public.game_run_rewards from public, anon, authenticated;

create or replace function public.finalize_game_run(p_run_id uuid, p_rewards jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward jsonb;
  v_user_id uuid;
  v_amount bigint;
  v_status text;
  v_inserted boolean;
  v_credited integer := 0;
  v_seen_user_ids uuid[] := '{}';
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_run_id is null or jsonb_typeof(p_rewards) is distinct from 'array'
     or jsonb_array_length(p_rewards) > 10 then
    raise exception 'invalid game run rewards' using errcode = '22023';
  end if;

  -- Valide l'intégralité du lot avant la première écriture : une entrée invalide
  -- annule la transaction sans crédit partiel.
  for v_reward in select value from jsonb_array_elements(p_rewards)
  loop
    if jsonb_typeof(v_reward) is distinct from 'object'
       or not (v_reward ? 'user_id')
       or not (v_reward ? 'amount')
       or (select count(*) from jsonb_object_keys(v_reward)) <> 2
       or jsonb_typeof(v_reward -> 'user_id') is distinct from 'string'
       or jsonb_typeof(v_reward -> 'amount') is distinct from 'number'
       or (v_reward ->> 'amount') !~ '^[0-9]+$' then
      raise exception 'invalid game run reward' using errcode = '22023';
    end if;
    begin
      v_user_id := (v_reward ->> 'user_id')::uuid;
      v_amount := (v_reward ->> 'amount')::bigint;
    exception when others then
      raise exception 'invalid game run reward' using errcode = '22023';
    end;
    if v_amount < 0 or v_amount > 9007199254740991 then
      raise exception 'invalid game run reward amount' using errcode = '22003';
    end if;
    if v_user_id = any(v_seen_user_ids) then
      raise exception 'duplicate game run reward user' using errcode = '22023';
    end if;
    v_seen_user_ids := array_append(v_seen_user_ids, v_user_id);
  end loop;

  insert into public.game_runs (id)
  values (p_run_id)
  on conflict (id) do nothing;

  select status into v_status
  from public.game_runs
  where id = p_run_id
  for update;

  if v_status = 'finished' then
    return jsonb_build_object('status', 'already-finalized', 'credited', 0);
  end if;

  for v_reward in select value from jsonb_array_elements(p_rewards)
  loop
    v_user_id := (v_reward ->> 'user_id')::uuid;
    v_amount := (v_reward ->> 'amount')::bigint;

    with inserted as (
      insert into public.game_run_rewards (run_id, user_id, amount)
      values (p_run_id, v_user_id, v_amount)
      on conflict (run_id, user_id) do nothing
      returning 1
    )
    select exists(select 1 from inserted) into v_inserted;

    if v_inserted then
      insert into public.account_gold_wallets (user_id, balance)
      values (v_user_id, v_amount)
      on conflict (user_id) do update
        set balance = account_gold_wallets.balance + excluded.balance,
            updated_at = now()
        where account_gold_wallets.balance <= 9007199254740991 - excluded.balance;
      if not found then
        raise exception 'account gold balance exceeds safe integer range'
          using errcode = '22003';
      end if;
      v_credited := v_credited + 1;
    end if;
  end loop;

  update public.game_runs
  set status = 'finished', finished_at = now()
  where id = p_run_id;

  return jsonb_build_object('status', 'finished', 'credited', v_credited);
end;
$$;

revoke all on function public.finalize_game_run(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_game_run(uuid, jsonb) to service_role;

-- La bascule autoritaire est complète : le navigateur ne peut plus créer de valeur.
revoke execute on function public.credit_account_gold(bigint) from authenticated;
