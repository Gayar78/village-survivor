-- =============================================================================
-- Migration 0005 — Exiger la double authentification côté base
-- Idempotente : rejouable sans effet cumulatif.
--
-- Constat corrigé : le jeu impose la double authentification à l'écran, mais aucune politique
-- ni aucune fonction ne vérifiait le niveau d'assurance du jeton. Une session ouverte par mot
-- de passe et restée au niveau `aal1` — second facteur jamais saisi — disposait donc d'un jeton
-- parfaitement valide pour appeler l'API directement. Le coût de la double authentification
-- était payé par les joueurs sans qu'aucune donnée n'en tire de bénéfice.
--
-- Méthode : une politique RESTRICTIVE par table. Contrairement aux politiques permissives, qui
-- se combinent en OU, les restrictives se combinent en ET avec toutes les autres. On ajoute
-- donc l'exigence sans réécrire ni risquer d'altérer les 29 politiques existantes.
-- =============================================================================

-- Vrai si la session courante a satisfait la double authentification, ou si elle n'y est pas
-- soumise. La règle reproduit exactement celle du client (`authService.getMfaSituation`) :
-- seuls les comptes email/mot de passe doivent un second facteur ; un compte fédéré en est
-- exempté, sans quoi activer un fournisseur externe verrouillerait ses utilisateurs hors de
-- leurs propres données.
create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', 'email') <> 'email';
$$;

revoke all on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;

-- Les politiques ne visent que le rôle `authenticated`. Le rôle de service contourne de toute
-- façon la sécurité au niveau ligne, et les déclencheurs de création de compte s'exécutent en
-- `security definer` : la création d'un profil à l'inscription reste donc possible avant même
-- que le second facteur existe.
do $$
declare
  target text;
begin
  foreach target in array array[
    'profiles',
    'player_stats',
    'coffre_balances',
    'unlocked_spells',
    'account_items',
    'friend_requests',
    'friendships',
    'account_gold_wallets',
    'meta_character_profiles',
    'meta_owned_skills',
    'meta_owned_gems'
  ]
  loop
    if exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = target
    ) then
      execute format('drop policy if exists %I on public.%I', target || '_require_mfa', target);
      execute format(
        'create policy %I on public.%I as restrictive for all to authenticated '
          || 'using (public.mfa_satisfied()) with check (public.mfa_satisfied())',
        target || '_require_mfa',
        target
      );
    else
      raise notice 'table % absente de cette installation : ignorée', target;
    end if;
  end loop;
end
$$;

-- Les fonctions `security definer` s'exécutent avec les droits de leur propriétaire et ne sont
-- donc pas soumises aux politiques ci-dessus : la garde doit être écrite dans leur corps.
--
-- Seule `credit_account_gold` est traitée ici, parce qu'elle est la seule à **créer** de la
-- valeur. Les autres fonctions exposées ne font que dépenser ou réorganiser ce qu'un compte
-- possède déjà, et restent bornées à son propre périmètre ; leur durcissement est consigné
-- comme dette dans docs/requirements/traceability-matrix.md plutôt que traité à la hâte.
--
-- Corps repris à l'identique de la migration 0003, à la garde près.
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

  if not public.mfa_satisfied() then
    raise exception 'multi-factor authentication required' using errcode = '42501';
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
