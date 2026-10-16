// Small validators shared by the card-serving endpoints.
import { rpc } from './supabase.js';
const ORIGINS = ['Hollywood', 'Bollywood'];

// The Hollywood / Bollywood toggles that are on. At least one must stay on; anything else means both.
export function cleanOrigins(v) {
  const list = Array.isArray(v) ? [...new Set(v.filter((o) => ORIGINS.includes(o)))] : [];
  return list.length ? list : ORIGINS.slice();
}

// Recently shown card texts, so a refill doesn't repeat. Bounded.
export function cleanExclude(v) {
  return Array.isArray(v) ? v.filter((t) => typeof t === 'string' && t.length <= 400).slice(0, 60) : [];
}

// v20.5: plan sheet card counts (Spicy / Hot) from premium_cards, cached in the isolate for 10 minutes.
// Flirty comes from the bundle (stamped into config.js at build time). null = the app keeps its built-in numbers.
let countsCache = null, countsAt = 0;
export async function cardCounts(env, now = Date.now()) {
  if (countsCache && now - countsAt < 600000) return countsCache;
  try {
    const r = await rpc(env, 'card_counts', {});
    if (r && Number.isFinite(+r.spicy) && Number.isFinite(+r.hot)) { countsCache = { spicy: +r.spicy, hot: +r.hot }; countsAt = now; }
  } catch (e) { /* keep the last good counts, or none */ }
  return countsCache;
}
export function _resetCounts() { countsCache = null; countsAt = 0; }
