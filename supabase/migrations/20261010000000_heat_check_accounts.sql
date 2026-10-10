-- =====================================================================
-- Heat Check: accounts, entitlements, purchases, Lv3 cards, admin.
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- RLS is ON for every table. Clients never write plan, premium_until
-- or role: only the service role (Pages Functions) can.
-- =====================================================================

-- ---------- Profiles ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  plan          text not null default 'free' check (plan in ('free', 'pass', 'lifetime')),
  premium_until timestamptz null,
  role          text not null default 'user' check (role in ('user', 'admin')),
  created_at    timestamptz not null default now(),
  taste_used    jsonb not null default '{}'::jsonb check (jsonb_typeof(taste_used) = 'object'),
  preferences   jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object' and pg_column_size(preferences) < 16384),
  stats         jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object' and pg_column_size(stats) < 8192)
);
create index if not exists profiles_email_idx on public.profiles (lower(email));

-- ---------- Purchases ----------
-- user_id is set to null (anonymized) when an account is deleted, so the
-- accounting record survives.
create table if not exists public.purchases (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid null references auth.users (id) on delete set null,
  product             text not null check (product in ('pass', 'lifetime')),
  razorpay_order_id   text not null unique,
  razorpay_payment_id text null unique,
  amount_inr          numeric(10, 2) not null check (amount_inr > 0),
  currency            text not null default 'INR',
  status              text not null default 'created' check (status in ('created', 'paid', 'failed')),
  created_at          timestamptz not null default now(),
  paid_at             timestamptz null,
  anonymized_at       timestamptz null
);
create index if not exists purchases_user_idx on public.purchases (user_id, created_at desc);

-- ---------- Lv3 cards ----------
-- extra holds per-game fields the game screens need:
--   wyr: {"a": "...", "b": "..."}, bodypart: {"zone": "neck"}, charades: {"category": "Movie"}
create table if not exists public.premium_cards (
  id            uuid primary key default gen_random_uuid(),
  game          text not null check (game in ('redflag', 'rate', 'nhie', 'bodypart', 'charades', 'wyr', 'mostlikely', 'hotseat', 'twotruths', 'swap')),
  heat          smallint not null default 3 check (heat = 3),
  text          text not null check (char_length(text) between 1 and 400),
  optional_dare text null check (optional_dare is null or char_length(optional_dare) <= 400),
  extra         jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (game, text)
);

-- ---------- Game switches (admin can turn games off) ----------
create table if not exists public.games (
  id         text primary key,
  enabled    boolean not null default true,
  sort       smallint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.games (id, sort) values
  ('redflag', 1), ('nhie', 2), ('bodypart', 3), ('charades', 4), ('wyr', 5),
  ('mostlikely', 6), ('hotseat', 7), ('twotruths', 8), ('swap', 9)
on conflict (id) do nothing;

-- ---------- Admin audit log ----------
create table if not exists public.admin_actions (
  id         bigint generated always as identity primary key,
  actor_id   uuid null,
  action     text not null,
  target     text null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Functions
-- =====================================================================

-- New auth user -> profile row
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in step if the auth email changes
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- is_pro: lifetime, or a pass that hasn't expired
create or replace function public.is_pro(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.plan = 'lifetime' or (p.premium_until is not null and p.premium_until > now())
       from public.profiles p where p.id = uid),
    false);
$$;

-- Hot tastes: add keys, never remove. Accepts {"game": "<iso timestamp>"}.
create or replace function public.add_tastes(p_tastes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_allowed text[] := array['redflag', 'nhie', 'bodypart', 'charades', 'wyr', 'mostlikely', 'hotseat', 'twotruths', 'swap'];
  v_current jsonb;
  v_add     jsonb := '{}'::jsonb;
  v_key     text;
  v_val     jsonb;
  v_ts      timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_tastes is null or jsonb_typeof(p_tastes) <> 'object' then
    raise exception 'tastes must be an object' using errcode = '22023';
  end if;

  select taste_used into v_current from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'profile missing' using errcode = 'P0002';
  end if;

  for v_key, v_val in select key, value from jsonb_each(p_tastes) loop
    continue when not (v_key = any (v_allowed));
    continue when v_current ? v_key;
    begin
      v_ts := (v_val #>> '{}')::timestamptz;
    exception when others then
      v_ts := now();
    end;
    if v_ts is null or v_ts > now() then
      v_ts := now();
    end if;
    v_add := v_add || jsonb_build_object(v_key, to_jsonb(v_ts));
  end loop;

  update public.profiles
     set taste_used = v_add || taste_used   -- right side wins: existing keys are never touched
   where id = v_uid
  returning taste_used into v_current;
  return v_current;
end;
$$;

-- Grant a paid purchase. Idempotent: the same order is only ever granted once.
-- Called by the service role from /api/verify-payment and /api/razorpay-webhook.
create or replace function public.grant_purchase(
  p_order_id     text,
  p_payment_id   text,
  p_amount_paise integer,
  p_pass_hours   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchases%rowtype;
  v_profile  public.profiles%rowtype;
begin
  select * into v_purchase from public.purchases where razorpay_order_id = p_order_id for update;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'unknown_order');
  end if;

  if v_purchase.status = 'paid' then
    return jsonb_build_object('granted', false, 'reason', 'already_granted', 'user_id', v_purchase.user_id);
  end if;

  if round(v_purchase.amount_inr * 100)::integer <> p_amount_paise then
    return jsonb_build_object('granted', false, 'reason', 'amount_mismatch');
  end if;

  if p_pass_hours is null or p_pass_hours < 1 or p_pass_hours > 48 then
    raise exception 'bad pass hours' using errcode = '22023';
  end if;

  update public.purchases
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now()
   where id = v_purchase.id;

  if v_purchase.user_id is null then
    -- Account was deleted between order and payment: keep the record, grant nothing.
    return jsonb_build_object('granted', false, 'reason', 'no_user');
  end if;

  select * into v_profile from public.profiles where id = v_purchase.user_id for update;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'no_profile');
  end if;

  if v_purchase.product = 'lifetime' then
    update public.profiles set plan = 'lifetime' where id = v_profile.id;
  elsif v_profile.plan <> 'lifetime' then
    update public.profiles
       set plan = 'pass',
           premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(hours => p_pass_hours)
     where id = v_profile.id;
  end if;

  return jsonb_build_object('granted', true, 'user_id', v_profile.id, 'product', v_purchase.product);
end;
$$;

-- Admin: grant or revoke by email
create or replace function public.admin_set_entitlement(
  p_actor      uuid,
  p_email      text,
  p_action     text,
  p_pass_hours integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where lower(email) = lower(trim(p_email)) for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_such_user');
  end if;

  if p_action = 'grant_pass' then
    if v_profile.plan = 'lifetime' then
      return jsonb_build_object('ok', false, 'reason', 'already_lifetime');
    end if;
    update public.profiles
       set plan = 'pass',
           premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(hours => p_pass_hours)
     where id = v_profile.id;
  elsif p_action = 'grant_lifetime' then
    update public.profiles set plan = 'lifetime' where id = v_profile.id;
  elsif p_action = 'revoke' then
    update public.profiles set plan = 'free', premium_until = null where id = v_profile.id;
  else
    return jsonb_build_object('ok', false, 'reason', 'bad_action');
  end if;

  insert into public.admin_actions (actor_id, action, target, detail)
  values (p_actor, p_action, v_profile.email, jsonb_build_object('user_id', v_profile.id));

  select * into v_profile from public.profiles where id = v_profile.id;
  return jsonb_build_object('ok', true, 'email', v_profile.email, 'plan', v_profile.plan, 'premium_until', v_profile.premium_until);
end;
$$;

-- Admin: dashboard counts
create or replace function public.admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'signups',          (select count(*) from public.profiles),
    'signups_7d',       (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'pass_sales',       (select count(*) from public.purchases where status = 'paid' and product = 'pass'),
    'lifetime_sales',   (select count(*) from public.purchases where status = 'paid' and product = 'lifetime'),
    'revenue_inr',      (select coalesce(sum(amount_inr), 0) from public.purchases where status = 'paid'),
    'active_passes',    (select count(*) from public.profiles where plan = 'pass' and premium_until > now()),
    'lifetime_members', (select count(*) from public.profiles where plan = 'lifetime')
  );
$$;

-- Account deletion: anonymize purchases (kept for accounting). The auth user
-- is then deleted through the Auth admin API, which cascades to profiles.
create or replace function public.anonymize_user_purchases(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.purchases
     set user_id = null, anonymized_at = now()
   where user_id = p_user;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists premium_cards_touch on public.premium_cards;
create trigger premium_cards_touch before update on public.premium_cards
  for each row execute function public.touch_updated_at();
drop trigger if exists games_touch on public.games;
create trigger games_touch before update on public.games
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- Privileges: start from nothing, then grant only what clients need
-- =====================================================================
revoke all on public.profiles      from anon, authenticated;
revoke all on public.purchases     from anon, authenticated;
revoke all on public.premium_cards from anon, authenticated;
revoke all on public.games         from anon, authenticated;
revoke all on public.admin_actions from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (preferences, stats) on public.profiles to authenticated;   -- nothing else is client-writable
grant select on public.purchases to authenticated;
grant select on public.premium_cards to authenticated;
grant select on public.games to anon, authenticated;

grant all on public.profiles, public.purchases, public.premium_cards, public.games, public.admin_actions to service_role;

revoke execute on function public.handle_new_user()                         from public, anon, authenticated;
revoke execute on function public.handle_user_email_change()                from public, anon, authenticated;
revoke execute on function public.grant_purchase(text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.admin_set_entitlement(uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.admin_stats()                             from public, anon, authenticated;
revoke execute on function public.anonymize_user_purchases(uuid)            from public, anon, authenticated;
revoke execute on function public.touch_updated_at()                        from public, anon, authenticated;
revoke execute on function public.is_pro(uuid)                              from public, anon;
revoke execute on function public.add_tastes(jsonb)                         from public, anon;

grant execute on function public.is_pro(uuid)      to authenticated;   -- used inside the premium_cards policy
grant execute on function public.add_tastes(jsonb) to authenticated;
grant execute on function public.grant_purchase(text, text, integer, integer)    to service_role;
grant execute on function public.admin_set_entitlement(uuid, text, text, integer) to service_role;
grant execute on function public.admin_stats()                                   to service_role;
grant execute on function public.anonymize_user_purchases(uuid)                  to service_role;
grant execute on function public.is_pro(uuid)                                    to service_role;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles      enable row level security;
alter table public.purchases     enable row level security;
alter table public.premium_cards enable row level security;
alter table public.games         enable row level security;
alter table public.admin_actions enable row level security;

drop policy if exists "profiles: read own"   on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
-- Column grants above limit this to preferences and stats
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "purchases: read own" on public.purchases;
create policy "purchases: read own" on public.purchases
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "premium_cards: pro only" on public.premium_cards;
create policy "premium_cards: pro only" on public.premium_cards
  for select to authenticated using ((select auth.uid()) is not null and public.is_pro((select auth.uid())) and active);

drop policy if exists "games: public read" on public.games;
create policy "games: public read" on public.games
  for select to anon, authenticated using (true);

-- admin_actions: no client policies at all (service role bypasses RLS)

-- =====================================================================
-- After your first sign-in, make yourself admin (replace the email):
--   update public.profiles set role = 'admin' where lower(email) = 'you@example.com';
-- =====================================================================
