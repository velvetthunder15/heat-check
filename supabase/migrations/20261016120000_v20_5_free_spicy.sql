-- Heat Check v20.5 (hc-v50): one free Spicy card per game for signed-in Base accounts.
-- Works like the free Hot card (v11/v12 claim_taste): the card lives on the server, POST /api/taste with
-- heat 2 calls claim_spicy_taste(), which locks the profile row, checks spicy_taste_used, marks it and returns
-- one Spicy taste card, in one call. Safe to re-run.

-- ---------- who used which game's free Spicy card ----------
alter table public.profiles add column if not exists spicy_taste_used jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_spicy_taste_used_check;
alter table public.profiles add constraint profiles_spicy_taste_used_check check (jsonb_typeof(spicy_taste_used) = 'object');
-- clients read their own row (table-level select grant); only the service role writes this column
revoke update (spicy_taste_used) on public.profiles from authenticated;

-- ---------- one Spicy taste card per game (existing Spicy cards, no new content) ----------
update public.premium_cards c set is_taste = true
  from (values
    ('charades', 'Amélie'),
    ('hotseat', 'Where on my neck do I most like being kissed: front, side, or nape?'),
    ('mostlikely', 'Who''s most likely to slide into a celebrity''s DMs?'),
    ('nhie', 'Never have I ever kissed someone at a wedding.'),
    ('redflag', 'Someone you''ve been seeing for a month asks for your phone password.'),
    ('swap', 'As your partner: describe where you love being kissed by me.'),
    ('twotruths', 'Two truths and a lie about your worst date'),
    ('wyr', 'Would you rather have your neck kissed for thirty seconds or have your ear whispered into for a minute?')
  ) as t(game, text)
 where c.game = t.game and c.text = t.text and c.heat = 2 and not c.is_taste;

-- ---------- RLS: Lite and Premium keep reading every Spicy card (the Spicy taste cards too), so their
-- decks don't change. Hot taste cards stay server-only, as before. Base still reads nothing. ----------
drop policy if exists "premium_cards: by tier" on public.premium_cards;
create policy "premium_cards: by tier" on public.premium_cards
  for select to authenticated
  using (
    (select auth.uid()) is not null and active and (
      (heat = 2 and public.has_lite((select auth.uid())))
      or (heat = 3 and not is_taste and public.has_premium((select auth.uid())))
    )
  );

-- ---------- claim: Base's free Spicy card for one game ----------
create or replace function public.claim_spicy_taste(p_user uuid, p_game text, p_origins text[])
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
  select spicy_taste_used into v_used from public.profiles where id = p_user for update;
  if not found or v_used ? p_game then return null; end if;
  select * into v_card from public.premium_cards c
   where c.game = p_game and c.is_taste and c.active and c.heat = 2
   order by ((coalesce(c.extra ->> 'origin', '') not in ('Hollywood', 'Bollywood')) or (c.extra ->> 'origin') = any (coalesce(p_origins, array[]::text[]))) desc, random()
   limit 1;
  if not found then return null; end if;   -- nothing to give: don't burn it
  update public.profiles set spicy_taste_used = spicy_taste_used || jsonb_build_object(p_game, v_now) where id = p_user;
  return jsonb_build_object('used_at', v_now,
    'card', jsonb_build_object('game', v_card.game, 'heat', 2, 'text', v_card.text, 'optional_dare', v_card.optional_dare, 'extra', v_card.extra));
end;
$$;

-- ---------- plan sheet: how many cards each plan opens (served by /api/config) ----------
create or replace function public.card_counts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'spicy', count(*) filter (where heat = 2),
    'hot',   count(*) filter (where heat = 3 and not is_taste))
  from public.premium_cards where active;
$$;

revoke execute on function public.claim_spicy_taste(uuid, text, text[]) from public, anon, authenticated;
revoke execute on function public.card_counts()                          from public, anon, authenticated;
grant execute on function public.claim_spicy_taste(uuid, text, text[])   to service_role;
grant execute on function public.card_counts()                           to service_role;
