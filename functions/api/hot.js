// POST /api/hot  { game, origins?, exclude? }   (Lite and Premium)
// Lite gets LIMITS.lite.hot Hot cards per game per pass. One SQL call checks the
// plan, counts, picks and returns a card atomically, so parallel calls can't
// overspend. Premium reads Hot through RLS and is never counted.
import { json, handle, readJson, HttpError, requireEnv } from '../../lib/http.js';
import { requireUser, rpc } from '../../lib/supabase.js';
import { limit } from '../../lib/ratelimit.js';
import { isGame } from '../../lib/games.js';
import { LIMITS } from '../../lib/limits.js';
import { cleanOrigins, cleanExclude } from '../../lib/cards.js';

const MSG = {
  locked: 'Hot needs Lite or Premium.',
  used_up: `${LIMITS.lite.hot} Hot cards used here. Premium has unlimited.`,
  empty: 'No Hot cards match your Hollywood / Bollywood settings.',
  no_profile: 'Your account is still being set up. Try again in a moment.',
};

export const onRequestPost = handle(async ({ request, env }) => {
  requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']);
  const { user } = await requireUser(request, env);
  await limit(env, 'hot-user', user.id, 60, 600);
  const body = await readJson(request, 8192);
  const game = String(body.game || '');
  if (!isGame(game)) throw new HttpError(400, 'bad_game', 'Unknown game.');
  const r = await rpc(env, 'claim_hot', {
    p_user: user.id, p_game: game, p_limit: LIMITS.lite.hot,
    p_origins: cleanOrigins(body.origins), p_exclude: cleanExclude(body.exclude),
  });
  if (!r || !r.ok) {
    const reason = (r && r.reason) || 'locked';
    throw new HttpError(reason === 'empty' ? 404 : 403, reason, MSG[reason] || MSG.locked);
  }
  return json({ card: r.card, used: r.used, limit: LIMITS.lite.hot });
});
