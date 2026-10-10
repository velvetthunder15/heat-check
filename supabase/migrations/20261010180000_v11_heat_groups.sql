-- =====================================================================
-- Heat Check v11: server-only Hot tastes, Groups, Body Part removed,
-- heat settings simplified. Run after 20261010000000_heat_check_accounts.sql,
-- then (re)run supabase/seed/premium_cards.sql.
-- Safe to run more than once.
-- =====================================================================

-- ---------- Game config: couples | group, Body Part gone ----------
alter table public.games add column if not exists mode text not null default 'couples';
alter table public.games drop constraint if exists games_mode_check;
alter table public.games add constraint games_mode_check check (mode in ('couples', 'group'));
delete from public.games where id = 'bodypart';
insert into public.games (id, mode, sort) values
  ('redflag', 'couples', 1), ('nhie', 'couples', 2), ('charades', 'couples', 3), ('wyr', 'couples', 4),
  ('hotseat', 'couples', 5), ('swap', 'couples', 6), ('mostlikely', 'group', 7), ('twotruths', 'group', 8)
on conflict (id) do update set mode = excluded.mode, sort = excluded.sort;

-- ---------- Lv3 cards: taste flag, new game list ----------
alter table public.premium_cards add column if not exists is_taste boolean not null default false;
-- Rewritten decks (Red Flag scenarios, NHIE, Charades titles, group games) replace the old rows;
-- Body Part and the old "rate" deck are removed. The seed file inserts the new cards.
delete from public.premium_cards where game in ('bodypart', 'rate', 'redflag', 'nhie', 'charades', 'mostlikely', 'twotruths');
alter table public.premium_cards drop constraint if exists premium_cards_game_check;
alter table public.premium_cards add constraint premium_cards_game_check
  check (game in ('redflag', 'nhie', 'charades', 'wyr', 'hotseat', 'swap', 'mostlikely', 'twotruths'));
create index if not exists premium_cards_taste_idx on public.premium_cards (game) where is_taste and active;

-- Pro reads every active Lv3 card except the taste cards, which only /api/taste serves.
drop policy if exists "premium_cards: pro only" on public.premium_cards;
create policy "premium_cards: pro only" on public.premium_cards
  for select to authenticated
  using ((select auth.uid()) is not null and public.is_pro((select auth.uid())) and active and not is_taste);

-- ---------- Profiles: retired settings out, auto-ramp in ----------
update public.profiles
   set preferences = (preferences - 'start_heat' - 'max_heat' - 'vibe' - 'startHeat' - 'maxHeat')
                     || jsonb_build_object(
                          'auto_ramp', coalesce((preferences ->> 'auto_ramp')::boolean, true),
                          'cards_per_ramp', least(15, greatest(3, coalesce((preferences ->> 'cards_per_ramp')::int, 5))));
update public.profiles set taste_used = taste_used - 'bodypart' where taste_used ? 'bodypart';
update public.profiles set stats = jsonb_set(stats, '{games}', (stats -> 'games') - 'bodypart') where stats -> 'games' ? 'bodypart';

-- ---------- Tastes: only the server can spend them now ----------
-- The client RPC from v10 let a browser add keys; tastes are now claimed in one
-- atomic call by /api/taste with the service role.
drop function if exists public.add_tastes(jsonb);

create or replace function public.claim_taste(p_user uuid, p_game text)
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
  if p_user is null or p_game is null then
    return null;
  end if;
  -- Row lock: two parallel calls for the same account run one after the other
  select taste_used into v_used from public.profiles where id = p_user for update;
  if not found or v_used ? p_game then
    return null;
  end if;
  select * into v_card from public.premium_cards
   where game = p_game and is_taste and active and heat = 3
   order by random() limit 1;
  if not found then
    return null;   -- nothing to give: don't burn the taste
  end if;
  update public.profiles set taste_used = taste_used || jsonb_build_object(p_game, v_now) where id = p_user;
  return jsonb_build_object(
    'used_at', v_now,
    'card', jsonb_build_object('game', v_card.game, 'heat', 3, 'text', v_card.text, 'optional_dare', v_card.optional_dare, 'extra', v_card.extra));
end;
$$;

revoke execute on function public.claim_taste(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_taste(uuid, text) to service_role;
