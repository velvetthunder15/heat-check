// POST /api/track: first-party usage stats from the app (sendBeacon, batched).
// Always answers 204 fast; the insert runs after the response (waitUntil). Never sets a cookie.
// Stored: event type, game, heat, tier, country/city from Cloudflare, phone/tablet/desktop, referrer host,
// utm tags and a daily-rotating anonymous visitor hash. Never the IP, the email or the user id.
import { readJson, clientIp } from '../../lib/http.js';
import { limit } from '../../lib/ratelimit.js';
import { rest } from '../../lib/supabase.js';
import { isPreviewFetcher, isBot, deviceClass, refHost, istDay, visitorHash, toRows } from '../../lib/analytics.js';

const FREE_BATCHES = 5;
const seen = new Map();   // ip -> { win, n }, per isolate
function hot(ip) {
  const win = Math.floor(Date.now() / 600000);
  let e = seen.get(ip);
  if (!e || e.win !== win) { e = { win, n: 0 }; seen.set(ip, e); }
  if (seen.size > 5000) for (const [k, v] of seen) if (v.win !== win) seen.delete(k);
  return ++e.n;
}

const done = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

function ownHosts(env, request) {
  const set = [new URL(request.url).hostname.toLowerCase().replace(/^www\./, '')];
  try { if (env.SITE_URL) set.push(new URL(env.SITE_URL).hostname.toLowerCase().replace(/^www\./, '')); } catch (e) {}
  for (const h of String(env.ALT_HOSTS || '').split(',')) if (h.trim()) set.push(h.trim().toLowerCase().replace(/^www\./, ''));
  return set;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return done();
    const ua = request.headers.get('User-Agent') || '';
    if (isPreviewFetcher(ua)) return done();
    const ip = clientIp(request);
    // Abuse brake. The first few batches per IP per 10 minutes are counted in this isolate's memory only,
    // so a normal visit (1-3 beacons) costs no KV write; beyond that RATE_KV enforces 60 per 10 minutes.
    // A busy IP just stops being counted; a KV hiccup never breaks the app.
    if (env.RATE_KV && hot(ip) > FREE_BATCHES) {
      try { await limit(env, 'track', ip, 60 - FREE_BATCHES, 600); } catch (e) { if (e && e.status === 429) return done(); }
    }
    const body = await readJson(request, 8192).catch(() => null);
    if (!body) return done();
    const cf = request.cf || {};
    const secret = env.ANALYTICS_SALT || env.COOKIE_SECRET || env.SUPABASE_SERVICE_KEY;
    const ctx = {
      country: cf.country ? String(cf.country).slice(0, 3) : null,
      city: cf.city ? String(cf.city).slice(0, 60) : null,
      device: deviceClass(ua),
      refHost: refHost(body.ref, ownHosts(env, request)),
      visitor: await visitorHash(ip, ua, istDay(), secret),
      isBot: isBot(ua, cf),
    };
    const rows = toRows(body, ctx);
    if (!rows.length) return done();
    const write = rest(env, 'analytics_events', { method: 'POST', prefer: 'return=minimal', body: rows })
      .catch((e) => console.error('track insert', e && e.message));
    if (context.waitUntil) context.waitUntil(write); else await write;
  } catch (e) {
    console.error('track', e && e.message);
  }
  return done();
}
