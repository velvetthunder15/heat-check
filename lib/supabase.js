// Supabase over plain fetch (no SDK needed on the server).
// SUPABASE_SERVICE_KEY bypasses RLS: it is only ever used here, server side.
import { HttpError, bearer, requireEnv } from './http.js';

function baseUrl(env) {
  return String(env.SUPABASE_URL).replace(/\/+$/, '');
}

// Works with both key styles: legacy JWT keys (eyJ...) also go in
// Authorization; new sb_secret_ / sb_publishable_ keys go in apikey only.
function keyHeaders(key) {
  const h = { apikey: key };
  if (String(key).startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

export function serviceHeaders(env) {
  requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']);
  return keyHeaders(env.SUPABASE_SERVICE_KEY);
}

// PostgREST call as the service role. Returns parsed JSON (or null for 204).
export async function rest(env, path, { method = 'GET', body, prefer, headers = {} } = {}) {
  const res = await fetch(`${baseUrl(env)}/rest/v1/${path}`, {
    method,
    headers: {
      ...serviceHeaders(env),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status === 409) throw new HttpError(409, 'conflict', 'That already exists.');
  if (!res.ok) {
    console.error('supabase rest', method, path.split('?')[0], res.status, text.slice(0, 200));
    throw new HttpError(502, 'db_error', 'The database didn’t answer. Try again in a moment.');
  }
  return text ? JSON.parse(text) : null;
}

export function rpc(env, fn, args) {
  return rest(env, `rpc/${fn}`, { method: 'POST', body: args });
}

// Validate a user's access token with Supabase Auth. Returns the user or null.
export async function getUser(env, token) {
  if (!token) return null;
  requireEnv(env, ['SUPABASE_URL']);
  const apikey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_KEY;
  if (!apikey) requireEnv(env, ['SUPABASE_SERVICE_KEY']);
  const res = await fetch(`${baseUrl(env)}/auth/v1/user`, { headers: { apikey, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const u = await res.json();
  return u && u.id ? u : null;
}

export async function requireUser(request, env) {
  const token = bearer(request);
  const user = await getUser(env, token);
  if (!user) throw new HttpError(401, 'unauthorized', 'Sign in first.');
  return { user, token };
}

export async function getProfile(env, userId) {
  const rows = await rest(env, `profiles?id=eq.${encodeURIComponent(userId)}&select=*`);
  return rows && rows[0] ? rows[0] : null;
}

// Ask Supabase Auth to email a one-time code (same endpoint signInWithOtp uses).
// The email template must contain {{ .Token }} for a code instead of a link.
export async function sendOtp(env, email, { createUser, ip }) {
  const res = await fetch(`${baseUrl(env)}/auth/v1/otp`, {
    method: 'POST',
    headers: { ...serviceHeaders(env), 'Content-Type': 'application/json', ...(ip ? { 'X-Forwarded-For': ip } : {}) },
    body: JSON.stringify({ email, create_user: !!createUser }),
  });
  if (res.ok) return;
  const text = await res.text();
  let msg = '';
  try { const j = JSON.parse(text); msg = j.msg || j.message || j.error_description || ''; } catch (e) {}
  console.error('supabase otp', res.status, msg.slice(0, 160));
  if (res.status === 429) {
    const secs = /(\d+)\s*seconds?/.exec(msg);
    throw new HttpError(429, 'rate_limited', secs ? `Hang on ${secs[1]} seconds before asking for another code.` : 'Too many codes asked for. Try again in a bit.');
  }
  if (res.status === 422 || res.status === 400) {
    if (!createUser) throw new HttpError(400, 'no_account', 'No account found for that email.');
    throw new HttpError(400, 'otp_failed', 'Couldn’t send a code to that email.');
  }
  throw new HttpError(502, 'otp_failed', 'Couldn’t send the code. Try again in a moment.');
}

// Check a code server side (used to confirm account deletion).
export async function verifyOtp(env, email, token) {
  const res = await fetch(`${baseUrl(env)}/auth/v1/verify`, {
    method: 'POST',
    headers: { ...serviceHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'email', email, token }),
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  return j && j.user ? j.user : null;
}

export async function adminDeleteUser(env, userId) {
  const res = await fetch(`${baseUrl(env)}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: serviceHeaders(env),
  });
  if (!res.ok && res.status !== 404) {
    console.error('supabase delete user', res.status);
    throw new HttpError(502, 'delete_failed', 'Couldn’t delete the account. Try again in a moment.');
  }
}

export async function adminGetUser(env, userId) {
  const res = await fetch(`${baseUrl(env)}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: serviceHeaders(env) });
  if (!res.ok) return null;
  return res.json();
}
