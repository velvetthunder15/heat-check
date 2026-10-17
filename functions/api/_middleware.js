// Runs before every /api/* function: origin check (CORS), preflight, error safety net.
// Allowed browser origins: SITE_URL, its www twin, every host in ALT_HOSTS (www + pages.dev),
// plus the origin actually serving the request (so *.pages.dev previews keep working).
import { json } from '../../lib/http.js';

const SIGNED_CALLBACKS = new Set(['/api/payu-return', '/api/payu-webhook']);

function allowedOrigins(request, env) {
  const set = new Set([new URL(request.url).origin]);
  if (env.SITE_URL) {
    try {
      const u = new URL(env.SITE_URL);
      set.add(u.origin);
      if (!u.hostname.startsWith('www.')) set.add(`${u.protocol}//www.${u.host}`);
    } catch (e) { console.error('SITE_URL is not a valid URL'); }
  }
  for (const h of String(env.ALT_HOSTS || '').split(',')) {
    const host = h.trim().toLowerCase();
    if (host) set.add(`https://${host}`);
  }
  return set;
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins(request, env);

  // Server-to-server calls (Razorpay webhooks) send no Origin and are signature-checked.
  // PayU's return is a cross-site form POST from the PayU page (Origin secure.payu.in or "null"):
  // those two paths are hash-checked and confirmed with PayU, so any Origin may post to them.
  const path = new URL(request.url).pathname;
  const signedCallback = SIGNED_CALLBACKS.has(path);
  if (origin && !allowed.has(origin) && !signedCallback) {
    return json({ error: 'forbidden_origin', message: 'Not allowed.' }, 403);
  }

  const cors = origin && !signedCallback ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  } : {};

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  let res;
  try {
    res = await context.next();
  } catch (err) {
    console.error('unhandled', err && err.message ? err.message : String(err));
    res = json({ error: 'server_error', message: 'Something went wrong. Try again in a moment.' }, 500);
  }
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('Cache-Control', out.headers.get('Cache-Control') || 'no-store');
  return out;
}
