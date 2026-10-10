// GET  /api/admin/cards[?game=wyr][&active=1]  -> Lv3 cards (admin view, includes inactive unless active=1)
// POST /api/admin/cards { id?, game, text, optional_dare, extra, active }  -> create or update
import { json, handle, readJson, HttpError } from '../../../lib/http.js';
import { requireAdmin } from '../../../lib/admin.js';
import { rest } from '../../../lib/supabase.js';

const GAMES = ['redflag', 'rate', 'nhie', 'bodypart', 'charades', 'wyr', 'mostlikely', 'hotseat', 'twotruths', 'swap'];
const ZONES = ['forehead', 'eyelids', 'ear', 'cheek', 'lips', 'jaw', 'neck', 'nape', 'collarbone', 'shoulder', 'upperarm', 'elbow', 'wrist', 'palm', 'fingers', 'upperback', 'lowerback', 'waist', 'hip', 'thigh', 'knee', 'calf', 'ankle', 'foot'];
const CATEGORIES = ['Bedroom Charade', 'Celebrity', 'Dance Move', 'Movie', 'Scenario', 'Song'];
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
  if (game === 'bodypart') {
    if (!ZONES.includes(e.zone)) throw new HttpError(400, 'bad_card', 'Pick a body zone.');
    return { zone: e.zone };
  }
  if (game === 'charades') {
    if (!CATEGORIES.includes(e.category)) throw new HttpError(400, 'bad_card', 'Pick a category.');
    return { category: e.category };
  }
  return {};
}

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  const u = new URL(request.url);
  const game = u.searchParams.get('game');
  let q = 'premium_cards?select=id,game,heat,text,optional_dare,extra,active,updated_at&order=game.asc,created_at.asc';
  if (game) {
    if (!GAMES.includes(game)) throw new HttpError(400, 'bad_game', 'Unknown game.');
    q += `&game=eq.${game}`;
  }
  if (u.searchParams.get('active') === '1') q += '&active=is.true';
  return json(await rest(env, q));
});

export const onRequestPost = handle(async ({ request, env }) => {
  const { user } = await requireAdmin(request, env);
  const b = await readJson(request, 8192);
  if (!GAMES.includes(b.game)) throw new HttpError(400, 'bad_game', 'Unknown game.');
  const row = {
    game: b.game,
    heat: 3,
    text: str(b.text, 400, 'Card text', true),
    optional_dare: str(b.optional_dare, 400, 'Dare', false) || null,
    extra: cleanExtra(b.game, b.extra),
    active: b.active !== false,
  };
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
