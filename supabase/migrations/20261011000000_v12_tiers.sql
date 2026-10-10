-- =====================================================================
-- Heat Check v12: four tiers (guest / base / lite / premium), server limits.
-- Run after 20261010180000_v11_heat_groups.sql, then re-run
-- supabase/seed/premium_cards.sql (it now carries Lv2 and Lv3).
-- Safe to run more than once.
--
--   base    signed in, free: 5 Flirty per game (daily), 1 free Hot card per game
--   lite    Rs 69, 60 min: Flirty + Spicy unlimited, 3 Hot cards per game
--   premium Rs 99, lifetime: everything. plan = 'premium', premium_until stays null
--
-- Only the service role changes plan, premium_until, taste_used or stats.limits.
-- =====================================================================

-- ---------- Plans: free/pass/lifetime -> base/lite/premium ----------
alter table public.profiles drop constraint if exists profiles_plan_check;
update public.profiles set plan = 'base' where plan = 'free';
update public.profiles set plan = 'lite' where plan = 'pass';
update public.profiles set plan = 'premium', premium_until = null where plan = 'lifetime';
update public.profiles set premium_until = null where plan = 'premium';
alter table public.profiles alter column plan set default 'base';
alter table public.profiles add constraint profiles_plan_check check (plan in ('base', 'lite', 'premium'));
-- premium_until is only ever used by Lite
alter table public.profiles drop constraint if exists profiles_premium_until_lite_only;
alter table public.profiles add constraint profiles_premium_until_lite_only check (plan <> 'premium' or premium_until is null);

-- stats now also holds night summaries and the server-owned limits block
alter table public.profiles drop constraint if exists profiles_stats_check;
alter table public.profiles add constraint profiles_stats_check
  check (jsonb_typeof(stats) = 'object' and pg_column_size(stats) < 32768);

-- ---------- Purchases: products are lite | premium ----------
alter table public.purchases drop constraint if exists purchases_product_check;
update public.purchases set product = 'lite' where product = 'pass';
update public.purchases set product = 'premium' where product = 'lifetime';
alter table public.purchases add constraint purchases_product_check check (product in ('lite', 'premium'));

-- ---------- Paid cards: Spicy (Lv2) and Hot (Lv3) live here, never in the bundle ----------
alter table public.premium_cards drop constraint if exists premium_cards_heat_check;
alter table public.premium_cards add constraint premium_cards_heat_check check (heat in (2, 3));
alter table public.premium_cards alter column heat drop default;
create index if not exists premium_cards_game_heat_idx on public.premium_cards (game, heat) where active;

-- =====================================================================
-- Entitlement helpers (replace is_pro)
-- =====================================================================
drop policy if exists "premium_cards: pro only" on public.premium_cards;
drop policy if exists "premium_cards: by tier" on public.premium_cards;
drop function if exists public.is_pro(uuid);

create or replace function public.has_premium(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.plan = 'premium' from public.profiles p where p.id = uid), false);
$$;

-- Lite, or Premium (which includes everything Lite has). Premium has no expiry check.
create or replace function public.has_lite(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.plan = 'premium' or (p.plan = 'lite' and p.premium_until is not null and p.premium_until > now())
       from public.profiles p where p.id = uid),
    false);
$$;

-- Spicy: Lite or Premium. Hot: Premium only (Lite gets its 3 per game from /api/hot).
-- Taste cards are never readable: only /api/taste serves them.
create policy "premium_cards: by tier" on public.premium_cards
  for select to authenticated
  using (
    (select auth.uid()) is not null and active and not is_taste and (
      (heat = 2 and public.has_lite((select auth.uid())))
      or (heat = 3 and public.has_premium((select auth.uid())))
    )
  );

-- =====================================================================
-- Purchases: grant once per order AND once per payment id
-- =====================================================================
drop function if exists public.grant_purchase(text, text, integer, integer);
create or replace function public.grant_purchase(
  p_order_id     text,
  p_payment_id   text,
  p_amount_paise integer,
  p_lite_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchases%rowtype;
  v_profile  public.profiles%rowtype;
  v_active   boolean;
begin
  if p_lite_minutes is null or p_lite_minutes < 1 or p_lite_minutes > 1440 then
    raise exception 'bad lite minutes' using errcode = '22023';
  end if;

  select * into v_purchase from public.purchases where razorpay_order_id = p_order_id for update;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'unknown_order');
  end if;
  if v_purchase.status = 'paid' then
    return jsonb_build_object('granted', false, 'reason', 'already_granted', 'user_id', v_purchase.user_id);
  end if;
  -- A payment id unlocks once, whatever order it is presented with
  if exists (select 1 from public.purchases where razorpay_payment_id = p_payment_id and status = 'paid') then
    return jsonb_build_object('granted', false, 'reason', 'already_granted');
  end if;
  if round(v_purchase.amount_inr * 100)::integer <> p_amount_paise then
    return jsonb_build_object('granted', false, 'reason', 'amount_mismatch');
  end if;

  update public.purchases
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now()
   where id = v_purchase.id;

  if v_purchase.user_id is null then
    return jsonb_build_object('granted', false, 'reason', 'no_user');   -- account deleted mid-payment
  end if;
  select * into v_profile from public.profiles where id = v_purchase.user_id for update;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'no_profile');
  end if;

  if v_purchase.product = 'premium' then
    update public.profiles set plan = 'premium', premium_until = null where id = v_profile.id;
    return jsonb_build_object('granted', true, 'user_id', v_profile.id, 'product', 'premium');
  end if;

  -- Lite never downgrades Premium. create-order refuses this; a race lands here.
  if v_profile.plan = 'premium' then
    return jsonb_build_object('granted', false, 'reason', 'already_premium', 'user_id', v_profile.id);
  end if;
  v_active := v_profile.plan = 'lite' and v_profile.premium_until is not null and v_profile.premium_until > now();
  update public.profiles
     set plan = 'lite',
         premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(mins => p_lite_minutes),
         -- a new Lite pass starts with 3 fresh Hot cards per game
         stats = case when v_active then stats
                      else jsonb_set(stats, '{limits}', coalesce(stats -> 'limits', '{}'::jsonb) || jsonb_build_object('hot', '{}'::jsonb)) end
   where id = v_profile.id;
  return jsonb_build_object('granted', true, 'user_id', v_profile.id, 'product', 'lite');
end;
$$;

-- =====================================================================
-- Limits (service role only, called from Pages Functions with lib/limits.js)
-- stats.limits = { "window": "YYYY-MM-DD", "flirty": {game: n}, "hot": {game: n} }
-- =====================================================================

-- Base: count one Flirty card. Resets when the window (IST date) changes.
create or replace function public.bump_flirty(p_user uuid, p_game text, p_window text, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stats  jsonb;
  v_lim    jsonb;
  v_flirty jsonb;
  v_n      integer;
begin
  select stats into v_stats from public.profiles where id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_profile'); end if;
  if public.has_lite(p_user) then return jsonb_build_object('ok', true, 'unlimited', true); end if;
  v_lim := coalesce(v_stats -> 'limits', '{}'::jsonb);
  v_flirty := case when v_lim ->> 'window' = p_window then coalesce(v_lim -> 'flirty', '{}'::jsonb) else '{}'::jsonb end;
  v_n := coalesce((v_flirty ->> p_game)::integer, 0);
  if v_n >= p_limit then
    return jsonb_build_object('ok', false, 'reason', 'limit', 'used', v_n, 'window', p_window);
  end if;
  v_n := v_n + 1;
  v_lim := v_lim || jsonb_build_object('window', p_window, 'flirty', v_flirty || jsonb_build_object(p_game, v_n));
  update public.profiles set stats = jsonb_set(stats, '{limits}', v_lim) where id = p_user;
  return jsonb_build_object('ok', true, 'used', v_n, 'window', p_window);
end;
$$;

-- Guest -> account on sign-in: counters only ever go up, capped at the limit.
create or replace function public.sync_flirty(p_user uuid, p_window text, p_counts jsonb, p_games text[], p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stats  jsonb;
  v_lim    jsonb;
  v_flirty jsonb;
  v_g      text;
  v_local  integer;
begin
  select stats into v_stats from public.profiles where id = p_user for update;
  if not found then return null; end if;
  v_lim := coalesce(v_stats -> 'limits', '{}'::jsonb);
  v_flirty := case when v_lim ->> 'window' = p_window then coalesce(v_lim -> 'flirty', '{}'::jsonb) else '{}'::jsonb end;
  foreach v_g in array p_games loop
    begin
      v_local := least(p_limit, greatest(0, coalesce((p_counts ->> v_g)::integer, 0)));
    exception when others then
      v_local := 0;
    end;
    if v_local > coalesce((v_flirty ->> v_g)::integer, 0) then
      v_flirty := v_flirty || jsonb_build_object(v_g, v_local);
    end if;
  end loop;
  v_lim := v_lim || jsonb_build_object('window', p_window, 'flirty', v_flirty);
  update public.profiles set stats = jsonb_set(stats, '{limits}', v_lim) where id = p_user;
  return v_lim;
end;
$$;

-- Lite: serve one Hot card and count it, atomically. Premium is served uncounted.
-- p_origins: the Hollywood/Bollywood toggles that are on. Untagged cards always qualify.
create or replace function public.claim_hot(p_user uuid, p_game text, p_limit integer, p_origins text[], p_exclude text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_lim     jsonb;
  v_hot     jsonb;
  v_n       integer;
  v_card    public.premium_cards%rowtype;
  v_premium boolean;
begin
  select * into v_profile from public.profiles where id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_profile'); end if;
  v_premium := v_profile.plan = 'premium';
  if not v_premium and not public.has_lite(p_user) then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  v_lim := coalesce(v_profile.stats -> 'limits', '{}'::jsonb);
  v_hot := coalesce(v_lim -> 'hot', '{}'::jsonb);
  v_n := coalesce((v_hot ->> p_game)::integer, 0);
  if not v_premium and v_n >= p_limit then
    return jsonb_build_object('ok', false, 'reason', 'used_up', 'used', v_n);
  end if;
  select * into v_card from public.premium_cards c
   where c.game = p_game and c.heat = 3 and c.active and not c.is_taste
     and (coalesce(c.extra ->> 'origin', '') not in ('Hollywood', 'Bollywood') or (c.extra ->> 'origin') = any (coalesce(p_origins, array[]::text[])))
     and not (c.text = any (coalesce(p_exclude, array[]::text[])))
   order by random() limit 1;
  if not found then
    select * into v_card from public.premium_cards c
     where c.game = p_game and c.heat = 3 and c.active and not c.is_taste
       and (coalesce(c.extra ->> 'origin', '') not in ('Hollywood', 'Bollywood') or (c.extra ->> 'origin') = any (coalesce(p_origins, array[]::text[])))
     order by random() limit 1;
  end if;
  if not found then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  if not v_premium then
    v_n := v_n + 1;
    v_lim := v_lim || jsonb_build_object('hot', v_hot || jsonb_build_object(p_game, v_n));
    update public.profiles set stats = jsonb_set(stats, '{limits}', v_lim) where id = p_user;
  end if;
  return jsonb_build_object('ok', true, 'used', v_n,
    'card', jsonb_build_object('game', v_card.game, 'heat', 3, 'text', v_card.text, 'optional_dare', v_card.optional_dare, 'extra', v_card.extra));
end;
$$;

-- Base: the one free Hot card per game. Now honours the origin toggles when it can.
drop function if exists public.claim_taste(uuid, text);
create or replace function public.claim_taste(p_user uuid, p_game text, p_origins text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used jsonb;
  v_card public.premium_cards%rowtype;
  v_now  timestamptz := now();
begin
  if p_user is null or p_game is null then return null; end if;
  select taste_used into v_used from public.profiles where id = p_user for update;
  if not found or v_used ? p_game then return null; end if;
  select * into v_card from public.premium_cards c
   where c.game = p_game and c.is_taste and c.active and c.heat = 3
   order by ((coalesce(c.extra ->> 'origin', '') not in ('Hollywood', 'Bollywood')) or (c.extra ->> 'origin') = any (coalesce(p_origins, array[]::text[]))) desc, random()
   limit 1;
  if not found then return null; end if;   -- nothing to give: don't burn the taste
  update public.profiles set taste_used = taste_used || jsonb_build_object(p_game, v_now) where id = p_user;
  return jsonb_build_object('used_at', v_now,
    'card', jsonb_build_object('game', v_card.game, 'heat', 3, 'text', v_card.text, 'optional_dare', v_card.optional_dare, 'extra', v_card.extra));
end;
$$;

-- Clients save their own stats (sessions, nights...) but never the limits block.
create or replace function public.save_stats(p_stats jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_stats is null or jsonb_typeof(p_stats) <> 'object' then raise exception 'stats must be an object' using errcode = '22023'; end if;
  update public.profiles
     set stats = (p_stats - 'limits') || jsonb_build_object('limits', coalesce(stats -> 'limits', '{}'::jsonb))
   where id = v_uid;
end;
$$;

-- =====================================================================
-- Admin
-- =====================================================================
drop function if exists public.admin_set_entitlement(uuid, text, text, integer);
create or replace function public.admin_set_entitlement(p_actor uuid, p_email text, p_action text, p_lite_minutes integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where lower(email) = lower(trim(p_email)) for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_such_user'); end if;
  if p_action = 'grant_lite' then
    if v_profile.plan = 'premium' then return jsonb_build_object('ok', false, 'reason', 'already_premium'); end if;
    update public.profiles
       set plan = 'lite',
           premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(mins => p_lite_minutes)
     where id = v_profile.id;
  elsif p_action = 'grant_premium' then
    update public.profiles set plan = 'premium', premium_until = null where id = v_profile.id;
  elsif p_action = 'revoke' then
    update public.profiles set plan = 'base', premium_until = null where id = v_profile.id;
  else
    return jsonb_build_object('ok', false, 'reason', 'bad_action');
  end if;
  insert into public.admin_actions (actor_id, action, target, detail)
  values (p_actor, p_action, v_profile.email, jsonb_build_object('user_id', v_profile.id));
  select * into v_profile from public.profiles where id = v_profile.id;
  return jsonb_build_object('ok', true, 'email', v_profile.email, 'plan', v_profile.plan, 'premium_until', v_profile.premium_until);
end;
$$;

create or replace function public.admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'signups',         (select count(*) from public.profiles),
    'signups_7d',      (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'lite_sales',      (select count(*) from public.purchases where status = 'paid' and product = 'lite'),
    'premium_sales',   (select count(*) from public.purchases where status = 'paid' and product = 'premium'),
    'revenue_inr',     (select coalesce(sum(amount_inr), 0) from public.purchases where status = 'paid'),
    'active_lite',     (select count(*) from public.profiles where plan = 'lite' and premium_until > now()),
    'premium_members', (select count(*) from public.profiles where plan = 'premium')
  );
$$;

-- =====================================================================
-- Privileges
-- =====================================================================
-- stats is no longer client-writable directly (it holds the limit counters): use save_stats()
revoke update (stats) on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (preferences) on public.profiles to authenticated;

-- Retired preferences out, new ones in with defaults
update public.profiles
   set preferences = (preferences - 'start_heat' - 'max_heat' - 'vibe' - 'startHeat' - 'maxHeat')
                     || jsonb_build_object(
                          'timer', coalesce(nullif(preferences ->> 'timer', '')::int, 60),
                          'hollywood', coalesce((preferences ->> 'hollywood')::boolean, true),
                          'bollywood', coalesce((preferences ->> 'bollywood')::boolean, true));

revoke execute on function public.has_lite(uuid)    from public, anon;
revoke execute on function public.has_premium(uuid) from public, anon;
grant execute on function public.has_lite(uuid)    to authenticated, service_role;   -- used inside the premium_cards policy
grant execute on function public.has_premium(uuid) to authenticated, service_role;

revoke execute on function public.grant_purchase(text, text, integer, integer)       from public, anon, authenticated;
revoke execute on function public.bump_flirty(uuid, text, text, integer)              from public, anon, authenticated;
revoke execute on function public.sync_flirty(uuid, text, jsonb, text[], integer)     from public, anon, authenticated;
revoke execute on function public.claim_hot(uuid, text, integer, text[], text[])      from public, anon, authenticated;
revoke execute on function public.claim_taste(uuid, text, text[])                     from public, anon, authenticated;
revoke execute on function public.admin_set_entitlement(uuid, text, text, integer)    from public, anon, authenticated;
revoke execute on function public.admin_stats()                                       from public, anon, authenticated;
revoke execute on function public.save_stats(jsonb)                                   from public, anon;

grant execute on function public.grant_purchase(text, text, integer, integer)    to service_role;
grant execute on function public.bump_flirty(uuid, text, text, integer)           to service_role;
grant execute on function public.sync_flirty(uuid, text, jsonb, text[], integer)  to service_role;
grant execute on function public.claim_hot(uuid, text, integer, text[], text[])   to service_role;
grant execute on function public.claim_taste(uuid, text, text[])                  to service_role;
grant execute on function public.admin_set_entitlement(uuid, text, text, integer) to service_role;
grant execute on function public.admin_stats()                                    to service_role;
grant execute on function public.save_stats(jsonb)                                to authenticated;
