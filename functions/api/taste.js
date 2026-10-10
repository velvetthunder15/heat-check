// POST /api/taste  { game }   (signed-in users only)
// Spends this account's one free Hot card for a game. A single SQL call checks
// taste_used, marks it and returns the card, so it can't be claimed twice even
// with parallel requests. A second call for the same game gets 403.
import { json, handle, readJson, HttpError, requireEnv } from '../../lib/http.js';
import { requireUser, rpc } from '../../lib/supabase.js';
import { limit } from '../../lib/ratelimit.js';
import { isGame } from '../../lib/games.js';

export const onRequestPost = handle(async ({ request, env }) => {
  requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']);
  const { user } = await requireUser(request, env);
  await limit(env, 'taste-user', user.id, 30, 600);
  const body = await readJson(request, 1024);
  const game = String(body.game || '');
  if (!isGame(game)) throw new HttpError(400, 'bad_game', 'Unknown game.');
  const r = await rpc(env, 'claim_taste', { p_user: user.id, p_game: game });
  if (!r || !r.card) throw new HttpError(403, 'taste_used', 'This game’s free Hot card is already used.');
  return json({ card: r.card, used_at: r.used_at });
});
