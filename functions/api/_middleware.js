// Runs before every /api/* function: origin check (CORS), preflight, error safety net.
// Allowed browser origins: SITE_URL, plus the origin actually serving the request
// (so *.pages.dev previews work before the custom domain is set up).
import { json } from '../../lib/http.js';

function allowedOrigins(request, env) {
  const set = new Set([new URL(request.url).origin]);
  if (env.SITE_URL) {
    try { set.add(new URL(env.SITE_URL).origin); } catch (e) { console.error('SITE_URL is not a valid URL'); }
  }
  return set;
}

export async function onRequest(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins(request, env);

  // Server-to-server calls (Razorpay webhooks) send no Origin and are signature-checked.
  if (origin && !allowed.has(origin)) {
    return json({ error: 'forbidden_origin', message: 'Not allowed.' }, 403);
  }

  const cors = origin ? {
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
