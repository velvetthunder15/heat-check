// Small validators shared by the card-serving endpoints.
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
