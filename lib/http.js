// Small HTTP helpers shared by every Pages Function.

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function errorResponse(err) {
  if (err instanceof HttpError) {
    return json({ error: err.code, message: err.message }, err.status);
  }
  // Never leak internals: log the message only (no request bodies, no secrets)
  console.error('unhandled', err && err.message ? err.message : String(err));
  return json({ error: 'server_error', message: 'Something went wrong. Try again in a moment.' }, 500);
}

// Wrap a handler so thrown HttpErrors become clean JSON responses
export function handle(fn) {
  return async (context) => {
    try {
      return await fn(context);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson(request, maxBytes = 16 * 1024) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError(413, 'too_large', 'Request too large.');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large', 'Request too large.');
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
    return v;
  } catch (e) {
    throw new HttpError(400, 'bad_json', 'Invalid request.');
  }
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || '0.0.0.0';
}

export function bearer(request) {
  const h = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+([A-Za-z0-9\-_.]+)$/.exec(h);
  return m ? m[1] : null;
}

export function requireEnv(env, names) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) {
    console.error('missing env', missing.join(','));
    throw new HttpError(503, 'not_configured', 'This feature is not switched on yet.');
  }
}

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,63}$/;
export function normEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) throw new HttpError(400, 'bad_email', 'That email doesn’t look right.');
  return e;
}
