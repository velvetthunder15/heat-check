// GET /api/config: public settings the app needs at start. No secrets here.
import { json, handle } from '../../lib/http.js';
import { publicCatalog } from '../../lib/pricing.js';
import { rest } from '../../lib/supabase.js';

import { GAME_IDS } from '../../lib/games.js';

export const onRequestGet = handle(async ({ request, env }) => {
  const accounts = !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_KEY);
  const payments = accounts && !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  const games = Object.fromEntries(GAME_IDS.map((g) => [g, true]));
  if (accounts) {
    try {
      const rows = await rest(env, 'games?select=id,enabled');
      for (const r of rows || []) if (r.id in games) games[r.id] = !!r.enabled;
    } catch (e) { /* keep every game on if the DB is unreachable */ }
  }
  const country = request.cf && request.cf.country;
  return json({
    accounts,
    payments,
    supabaseUrl: accounts ? env.SUPABASE_URL : null,
    supabaseAnonKey: accounts ? env.SUPABASE_ANON_KEY : null,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
    razorpayKeyId: payments ? env.RAZORPAY_KEY_ID : null,
    products: publicCatalog(country),
    games,
    now: Date.now(),
  }, 200, { 'Cache-Control': 'no-store' });
});
