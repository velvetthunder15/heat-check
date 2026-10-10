// GET  /api/admin/cards[?game=wyr][&heat=2|3][&active=1]  -> paid cards, Spicy + Hot (admin view, includes inactive unless active=1)
// POST /api/admin/cards { id?, game, heat, text, optional_dare, extra, active, is_taste }  -> create or update
import { json, handle, readJson, HttpError } from '../../../lib/http.js';
import { requireAdmin } from '../../../lib/admin.js';
import { rest } from '../../../lib/supabase.js';

import { GAMES as GAME_LIST } from '../../../lib/games.js';

const GAMES = GAME_LIST.map((g) => g.id);
const MODE = Object.fromEntries(GAME_LIST.map((g) => [g.id, g.mode]));
const CATEGORIES = ['Movie', 'TV Show', 'Song'];
const ORIGINS = ['Hollywood', 'Bollywood', 'Global'];
const EXTERNAL_BANNED = [/your partner/i, /\bus\b/i, /each other/i, /you two/i];
const GROUP_BANNED = [/\bpartner/i, /\bboyfriend/i, /\bgirlfriend/i, /\bhusband/i, /\bwife\b/i, /\bbabe\b/i, /each other/i, /your other half/i, /you two/i];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const str = (v, max, field, required) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw new HttpError(400, 'bad_card', `${field} is required.`);
  if (s.length > max) throw new HttpError(400, 'bad_card', `${field} is too long (max ${max}).`);
  return s;
};

function cleanExtra(game, extra) {
  const e = extra && typeof extra === 'object' && !Array.isArray(extra) ? extra : {};
  if (game === 'wyr') return { a: str(e.a, 200, 'Option A', true), b: str(e.b, 200, 'Option B', true) };
  if (game === 'charades') {
    if (!CATEGORIES.includes(e.category)) throw new HttpError(400, 'bad_card', 'Pick Movie, TV Show or Song.');
    if (!ORIGINS.includes(e.origin)) throw new HttpError(400, 'bad_card', 'Pick Hollywood, Bollywood or Global.');
    return { category: e.category, origin: e.origin };
  }
  const out = {};
  if (e.origin != null && e.origin !== '') {
    if (!ORIGINS.includes(e.origin)) throw new HttpError(400, 'bad_card', 'Origin must be Hollywood, Bollywood or Global.');
    out.origin = e.origin;
  }
  if (game === 'redflag' && e.kind === 'trait') out.kind = 'trait';
  return out;
}

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const u = new URL(request.url);
  const game = u.searchParams.get('game');
  let q = 'premium_cards?select=id,game,heat,text,optional_dare,extra,active,is_taste,updated_at&order=game.asc,created_at.asc';
  if (game) {
    if (!GAMES.includes(game)) throw new HttpError(400, 'bad_game', 'Unknown game.');
    q += `&game=eq.${game}`;
  }
  const heat = u.searchParams.get('heat');
  if (heat) {
    if (heat !== '2' && heat !== '3') throw new HttpError(400, 'bad_heat', 'Heat must be 2 or 3.');
    q += `&heat=eq.${heat}`;
  }
  if (u.searchParams.get('active') === '1') q += '&active=is.true&is_taste=is.false';
  return json(await rest(env, q));
});

export const onRequestPost = handle(async ({ request, env }) => {
  const { user } = await requireAdmin(request, env);
  const b = await readJson(request, 8192);
  if (!GAMES.includes(b.game)) throw new HttpError(400, 'bad_game', 'Unknown game.');
  const row = {
    game: b.game,
    heat: b.heat === 2 ? 2 : 3,
    text: str(b.text, 400, 'Card text', true),
    // Group games and charades never carry dares
    optional_dare: MODE[b.game] === 'couples' && b.game !== 'charades' ? (str(b.optional_dare, 400, 'Dare', false) || null) : null,
    extra: cleanExtra(b.game, b.extra),
    active: b.active !== false,
    is_taste: b.is_taste === true && b.heat !== 2,
  };
  if ((b.game === 'nhie' || (b.game === 'redflag' && row.extra.kind === 'trait')) && EXTERNAL_BANNED.some((re) => re.test(row.text))) throw new HttpError(400, 'bad_card', 'This card can’t mention your partner, us, each other or you two.');
  if (MODE[b.game] === 'group') for (const re of GROUP_BANNED) if (re.test(row.text)) throw new HttpError(400, 'bad_card', 'Group cards can’t mention partners or couples.');
  let saved;
  if (b.id) {
    if (!UUID_RE.test(String(b.id))) throw new HttpError(400, 'bad_id', 'Invalid card.');
    saved = await rest(env, `premium_cards?id=eq.${b.id}`, { method: 'PATCH', prefer: 'return=representation', body: row });
    if (!saved || !saved[0]) throw new HttpError(404, 'not_found', 'Card not found.');
  } else {
    saved = await rest(env, 'premium_cards', { method: 'POST', prefer: 'return=representation', body: row });
  }
  await rest(env, 'admin_actions', { method: 'POST', prefer: 'return=minimal', body: { actor_id: user.id, action: b.id ? 'card_edit' : 'card_add', target: saved[0].id, detail: { game: row.game } } });
  return json(saved[0]);
});
