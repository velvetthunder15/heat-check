// POST /api/taste  { game, origins?, heat? }   (signed-in Base accounts)
// Spends one of this account's free cards for a game: heat 3 (default) = the free Hot card,
// heat 2 = the free Spicy card (v20.5). A single SQL call checks taste_used / spicy_taste_used,
// marks it and returns the card, so it can't be claimed twice even with parallel requests.
// A second call for the same game and heat gets 403.
import { json, handle, readJson, HttpError, requireEnv } from '../../lib/http.js';
import { requireUser, rpc } from '../../lib/supabase.js';
import { limit } from '../../lib/ratelimit.js';
import { isGame } from '../../lib/games.js';
import { cleanOrigins } from '../../lib/cards.js';
import { HOT, HEAT_NAMES } from '../../lib/heat.js';
import { LIMITS } from '../../lib/limits.js';

export const onRequestPost = handle(async ({ request, env }) => {
  requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']);
  const { user } = await requireUser(request, env);
  await limit(env, 'taste-user', user.id, 30, 600);
  const body = await readJson(request, 2048);
  const game = String(body.game || '');
  if (!isGame(game)) throw new HttpError(400, 'bad_game', 'Unknown game.');
  const heat = body.heat == null ? 3 : Number(body.heat);
  if (heat !== 2 && heat !== 3) throw new HttpError(400, 'bad_heat', 'Free cards are Spicy or HOT.');
  if (heat === 2 && !LIMITS.base.spicyTaste) throw new HttpError(403, 'taste_used', 'No free Spicy card on this plan.');
  const fn = heat === 2 ? 'claim_spicy_taste' : 'claim_taste';
  const r = await rpc(env, fn, { p_user: user.id, p_game: game, p_origins: cleanOrigins(body.origins) });
  const name = heat === 2 ? HEAT_NAMES[2] : HOT;
  if (!r || !r.card) throw new HttpError(403, 'taste_used', `This game’s free ${name} card is already used.`);
  return json({ card: r.card, used_at: r.used_at, heat });
});
