// Fixed-window rate limits on Workers KV (binding: RATE_KV).
// KV is eventually consistent, so treat these as abuse brakes, and pair them
// with a Cloudflare WAF rate-limiting rule on /api/auth/* and /api/admin/*.
import { HttpError } from './http.js';

function kv(env) {
  if (!env.RATE_KV) {
    console.error('missing KV binding RATE_KV');
    throw new HttpError(503, 'not_configured', 'This feature is not switched on yet.');
  }
  return env.RATE_KV;
}

async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Hash identifiers so raw emails/IPs never sit in KV keys
async function keyFor(name, id, windowSec) {
  const win = Math.floor(Date.now() / 1000 / windowSec);
  return { key: `rl:${name}:${await sha(String(id))}:${win}`, ttl: Math.max(60, windowSec + 30), retry: (win + 1) * windowSec - Math.floor(Date.now() / 1000) };
}

// Throws 429 when `id` has used `limit` hits in the current window; otherwise counts this hit.
export async function limit(env, name, id, max, windowSec) {
  const store = kv(env);
  const { key, ttl, retry } = await keyFor(name, id, windowSec);
  const n = Number((await store.get(key)) || 0);
  if (n >= max) {
    throw new HttpError(429, 'rate_limited', `Too many tries. Give it ${retry > 90 ? Math.ceil(retry / 60) + ' minutes' : retry + ' seconds'}.`);
  }
  await store.put(key, String(n + 1), { expirationTtl: ttl });
}

// Failure counters with lockout (admin password)
export async function failures(env, name, id) {
  const store = kv(env);
  const key = `fail:${name}:${await sha(String(id))}`;
  return {
    async count() { return Number((await store.get(key)) || 0); },
    async add(lockSec) { const n = Number((await store.get(key)) || 0) + 1; await store.put(key, String(n), { expirationTtl: Math.max(60, lockSec) }); return n; },
    async clear() { await store.delete(key); },
  };
}
