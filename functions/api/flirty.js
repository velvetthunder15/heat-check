// POST /api/flirty  { game }            count one Flirty card for a signed-in Base account
// POST /api/flirty  { sync: {game: n} } on sign-in: carry guest counters up (never down)
// Base gets LIMITS.base.flirty Flirty cards per game per day (IST). Counters live in
// profiles.stats.limits, which only the service role writes. Lite/Premium: unlimited.
import { json, handle, readJson, HttpError, requireEnv } from '../../lib/http.js';
import { requireUser, rpc } from '../../lib/supabase.js';
import { limit } from '../../lib/ratelimit.js';
import { isGame, GAME_IDS } from '../../lib/games.js';
import { LIMITS, limitWindow } from '../../lib/limits.js';

export const onRequestPost = handle(async ({ request, env }) => {
  requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']);
  const { user } = await requireUser(request, env);
  await limit(env, 'flirty-user', user.id, 240, 600);
  const body = await readJson(request, 2048);
  const window = limitWindow();
  if (body.sync && typeof body.sync === 'object' && !Array.isArray(body.sync)) {
    const counts = {};
    for (const g of GAME_IDS) if (Number.isFinite(+body.sync[g])) counts[g] = Math.max(0, Math.min(LIMITS.base.flirty, Math.floor(+body.sync[g])));
    const lim = await rpc(env, 'sync_flirty', { p_user: user.id, p_window: window, p_counts: counts, p_games: GAME_IDS, p_limit: LIMITS.base.flirty });
    return json({ window, flirty: (lim && lim.flirty) || {}, limit: LIMITS.base.flirty });
  }
  const game = String(body.game || '');
  if (!isGame(game)) throw new HttpError(400, 'bad_game', 'Unknown game.');
  const r = await rpc(env, 'bump_flirty', { p_user: user.id, p_game: game, p_window: window, p_limit: LIMITS.base.flirty });
  if (!r || (!r.ok && r.reason !== 'limit')) throw new HttpError(409, (r && r.reason) || 'failed', 'Couldn’t count that card. Try again.');
  if (!r.ok) throw new HttpError(403, 'flirty_limit', `${LIMITS.base.flirty} Flirty cards a day per game on the free plan.`);
  return json({ ok: true, used: r.used ?? null, unlimited: !!r.unlimited, window, limit: LIMITS.base.flirty });
});
