-- =====================================================================
-- Heat Check v20.4: first-party usage stats + private admin stats page.
-- Run after 20261011000000_v12_tiers.sql. Safe to run more than once.
--
-- analytics_events: one row per app event (visit, game_start, card_dealt, heat_change,
-- paywall_view, checkout_start, purchase_paid, signup, sign_in). Written only by the
-- service role from /api/track. No raw IP, no email, no user id: `visitor` is a
-- sha256 that rotates every day (ip + user agent + date + server secret).
-- `internal` marks Chirag's own devices/accounts and admin devices (hc_notrack),
-- `is_bot` marks crawlers. Both are left out of every count in admin_analytics().
-- =====================================================================

create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  day         date not null default ((now() at time zone 'Asia/Kolkata')::date),
  type        text not null check (type in ('visit','game_start','card_dealt','heat_change','paywall_view','checkout_start','purchase_paid','signup','sign_in')),
  game        text check (game is null or game ~ '^[a-z0-9_]{1,24}$'),
  heat        smallint check (heat is null or heat between 1 and 3),
  tier        text check (tier is null or tier in ('guest','base','lite','premium')),
  product     text check (product is null or product in ('lite','premium')),
  country     text check (country is null or char_length(country) <= 3),
  city        text check (city is null or char_length(city) <= 60),
  device      text check (device is null or device in ('phone','tablet','desktop')),
  ref_host    text check (ref_host is null or char_length(ref_host) <= 100),
  utm_source  text check (utm_source is null or char_length(utm_source) <= 60),
  utm_medium  text check (utm_medium is null or char_length(utm_medium) <= 60),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 60),
  visitor     text not null check (char_length(visitor) between 8 and 64),
  is_bot      boolean not null default false,
  internal    boolean not null default false
);
create index if not exists analytics_events_day_idx  on public.analytics_events (day);
create index if not exists analytics_events_type_day_idx on public.analytics_events (type, day);

alter table public.analytics_events enable row level security;
-- No policies: anon and authenticated can't read or write. The service role bypasses RLS.
revoke all on table public.analytics_events from public, anon, authenticated;
grant select, insert, delete on table public.analytics_events to service_role;

-- Purchases: which Razorpay mode created the order (test keys vs live keys).
-- Every order so far was made with rzp_test_ keys, so existing rows are test.
alter table public.purchases add column if not exists mode text;
alter table public.purchases drop constraint if exists purchases_mode_check;
alter table public.purchases add constraint purchases_mode_check check (mode is null or mode in ('test','live'));
update public.purchases set mode = 'test' where mode is null;

-- ---------------------------------------------------------------------
-- admin_analytics(days): everything the /admin stats page shows, in one call.
-- Real = not a bot and not internal. Days are IST calendar days.
-- ---------------------------------------------------------------------
create or replace function public.admin_analytics(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select greatest(1, least(coalesce(p_days, 30), 365)) as n,
           (now() at time zone 'Asia/Kolkata')::date as today
  ),
  win as (
    select e.* from public.analytics_events e, params p
     where e.day > p.today - p.n
  ),
  real as (select * from win where not is_bot and not internal),
  days as (
    select (p.today - g)::date as day from params p, generate_series(0, p.n - 1) g
  )
  select jsonb_build_object(
    'days', (select n from params),
    'today', (select today from params),
    'generated_at', now(),
    'totals', jsonb_build_object(
      'visitor_days', (select count(distinct (day, visitor)) from real where type = 'visit'),
      'visits',       (select count(*) from real where type = 'visit'),
      'today_visitors', (select count(distinct visitor) from real, params p where type = 'visit' and day = p.today),
      'bot_events',   (select count(*) from win where is_bot),
      'bot_visitors', (select count(distinct (day, visitor)) from win where is_bot),
      'internal_events', (select count(*) from win where internal and not is_bot),
      'game_starts',  (select count(*) from real where type = 'game_start'),
      'cards_dealt',  (select count(*) from real where type = 'card_dealt')
    ),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'visitors', (select count(distinct visitor) from real r where r.type = 'visit' and r.day = d.day),
        'visits', (select count(*) from real r where r.type = 'visit' and r.day = d.day),
        'cards', (select count(*) from real r where r.type = 'card_dealt' and r.day = d.day),
        'bots', (select count(distinct visitor) from win w where w.is_bot and w.day = d.day),
        'signups', (select count(*) from public.profiles pr where (pr.created_at at time zone 'Asia/Kolkata')::date = d.day)
      ) order by d.day), '[]'::jsonb) from days d),
    'countries', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc, k), '[]'::jsonb) from (
        select coalesce(country, '??') k, count(distinct (day, visitor)) n from real where type = 'visit' group by 1 order by 2 desc limit 25) x),
    'cities', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc, k), '[]'::jsonb) from (
        select city || coalesce(', ' || country, '') k, count(distinct (day, visitor)) n from real where type = 'visit' and city is not null group by 1 order by 2 desc limit 15) x),
    'referrers', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc, k), '[]'::jsonb) from (
        select coalesce(ref_host, 'direct') k, count(distinct (day, visitor)) n from real where type = 'visit' group by 1 order by 2 desc limit 20) x),
    'utm', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc, k), '[]'::jsonb) from (
        select concat_ws(' / ', utm_source, utm_medium, utm_campaign) k, count(distinct (day, visitor)) n
          from real where type = 'visit' and coalesce(utm_source, utm_medium, utm_campaign) is not null group by 1 order by 2 desc limit 15) x),
    'devices', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
        select coalesce(device, 'unknown') k, count(distinct (day, visitor)) n from real where type = 'visit' group by 1) x),
    'tiers', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
        select coalesce(tier, 'guest') k, count(distinct (day, visitor)) n from real where type = 'visit' group by 1) x),
    'games', (select coalesce(jsonb_agg(jsonb_build_object('game', game, 'starts', starts, 'cards', cards, 'h1', h1, 'h2', h2, 'h3', h3, 'players', players) order by cards desc, starts desc, game), '[]'::jsonb) from (
        select game,
               count(*) filter (where type = 'game_start') starts,
               count(*) filter (where type = 'card_dealt') cards,
               count(*) filter (where type = 'card_dealt' and heat = 1) h1,
               count(*) filter (where type = 'card_dealt' and heat = 2) h2,
               count(*) filter (where type = 'card_dealt' and heat = 3) h3,
               count(distinct (day, visitor)) players
          from real where game is not null and type in ('game_start', 'card_dealt') group by game) x),
    'heat_mix', jsonb_build_object(
        'flirty', (select count(*) from real where type = 'card_dealt' and heat = 1),
        'spicy',  (select count(*) from real where type = 'card_dealt' and heat = 2),
        'hot',    (select count(*) from real where type = 'card_dealt' and heat = 3),
        'changes', (select count(*) from real where type = 'heat_change')),
    'funnel', jsonb_build_object(
        'visitors',       (select count(distinct (day, visitor)) from real where type = 'visit'),
        'paywall_view',   (select count(distinct (day, visitor)) from real where type = 'paywall_view'),
        'checkout_start', (select count(distinct (day, visitor)) from real where type = 'checkout_start'),
        'purchase_paid',  (select count(distinct (day, visitor)) from real where type = 'purchase_paid'),
        'paywall_views',  (select count(*) from real where type = 'paywall_view'),
        'checkouts',      (select count(*) from real where type = 'checkout_start'),
        'signups',        (select count(*) from real where type = 'signup'),
        'sign_ins',       (select count(*) from real where type = 'sign_in')),
    'accounts', jsonb_build_object(
        'total', (select count(*) from public.profiles),
        'new_in_window', (select count(*) from public.profiles pr, params p where (pr.created_at at time zone 'Asia/Kolkata')::date > p.today - p.n),
        'by_plan', (select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb) from (select plan, count(*) n from public.profiles group by plan) x),
        'list', (select coalesce(jsonb_agg(jsonb_build_object(
            'email', pr.email, 'plan', pr.plan, 'role', pr.role,
            'lite_until', pr.premium_until,
            'joined', pr.created_at, 'last_sign_in', u.last_sign_in_at
          ) order by pr.created_at desc), '[]'::jsonb)
          from public.profiles pr left join auth.users u on u.id = pr.id)),
    'purchases', jsonb_build_object(
        'by_status', (select coalesce(jsonb_agg(jsonb_build_object('mode', coalesce(mode, 'test'), 'status', status, 'product', product, 'n', n, 'inr', inr) order by mode, status, product), '[]'::jsonb) from (
            select mode, status, product, count(*) n, coalesce(sum(amount_inr), 0) inr from public.purchases group by 1, 2, 3) x),
        'revenue_live_inr', (select coalesce(sum(amount_inr), 0) from public.purchases where status = 'paid' and mode = 'live'),
        'revenue_test_inr', (select coalesce(sum(amount_inr), 0) from public.purchases where status = 'paid' and coalesce(mode, 'test') = 'test'),
        'recent', (select coalesce(jsonb_agg(jsonb_build_object(
            'at', pu.created_at, 'paid_at', pu.paid_at, 'product', pu.product, 'status', pu.status,
            'inr', pu.amount_inr, 'mode', coalesce(pu.mode, 'test'), 'email', pr.email
          ) order by pu.created_at desc), '[]'::jsonb)
          from (select * from public.purchases order by created_at desc limit 50) pu
          left join public.profiles pr on pr.id = pu.user_id))
  );
$$;

revoke execute on function public.admin_analytics(integer) from public, anon, authenticated;
grant execute on function public.admin_analytics(integer) to service_role;

-- Keep the table small: events older than 400 days can go (called from /api/admin/analytics now and then).
create or replace function public.prune_analytics()
returns integer
language sql
security definer
set search_path = ''
as $$
  with d as (delete from public.analytics_events where at < now() - interval '400 days' returning 1)
  select count(*)::integer from d;
$$;
revoke execute on function public.prune_analytics() from public, anon, authenticated;
grant execute on function public.prune_analytics() to service_role;
