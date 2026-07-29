-- =============================================================================
-- Migration 0003 — Portefeuille d'or persistant par compte
-- Idempotente : rejouable sans recréer de soldes ni doubler les crédits.
--
-- Le montant crédité reste déclaré par le client tant que la simulation Tower
-- est hébergée côté client. Cette RPC garantit l'atomicité et l'isolation entre
-- comptes, mais ne constitue donc pas à elle seule une protection anti-triche.
-- =============================================================================

-- Le portefeuille est volontairement distinct de player_stats.gold_gathered,
-- qui reste une statistique cumulative de l'ancien jeu.
create table if not exists public.account_gold_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint account_gold_wallets_balance_safe
    check (balance >= 0 and balance <= 9007199254740991)
);

-- Initialise les comptes créés avant cette migration sans importer l'ancienne
-- statistique gold_gathered et sans modifier un portefeuille déjà existant.
insert into public.account_gold_wallets (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- Un trigger séparé évite de recopier et d'écraser handle_new_user, enrichie par
-- d'autres migrations (profil, statistiques et code ami).
create or replace function public.handle_new_account_gold_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.account_gold_wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_account_gold_wallet on auth.users;
create trigger on_auth_user_created_account_gold_wallet
  after insert on auth.users
  for each row
  execute function public.handle_new_account_gold_wallet();

revoke all on function public.handle_new_account_gold_wallet() from public;

-- Le client authentifié peut lire uniquement son propre solde. Il n'existe
-- volontairement aucune politique INSERT/UPDATE/DELETE : les crédits passent
-- exclusivement par la RPC ci-dessous.
alter table public.account_gold_wallets enable row level security;

drop policy if exists "account_gold_wallets_select_own"
  on public.account_gold_wallets;
create policy "account_gold_wallets_select_own"
  on public.account_gold_wallets
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.account_gold_wallets from anon, authenticated;
grant select on table public.account_gold_wallets to authenticated;

-- Crédit atomique : aucun identifiant de compte ni solde cible n'est accepté en
-- paramètre. L'identité vient exclusivement du JWT via auth.uid().
create or replace function public.credit_account_gold(p_amount bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance bigint;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_amount is null or p_amount < 0 or p_amount > 9007199254740991 then
    raise exception 'gold credit must be a non-negative safe integer'
      using errcode = '22003';
  end if;

  insert into public.account_gold_wallets (user_id, balance)
  values (v_user_id, p_amount)
  on conflict (user_id) do update
    set balance = account_gold_wallets.balance + excluded.balance,
        updated_at = now()
    where account_gold_wallets.balance <= 9007199254740991 - excluded.balance
  returning balance into v_balance;

  if v_balance is null then
    raise exception 'account gold balance exceeds safe integer range'
      using errcode = '22003';
  end if;

  return v_balance;
end;
$$;

revoke all on function public.credit_account_gold(bigint) from public, anon;
grant execute on function public.credit_account_gold(bigint) to authenticated;
