// Admin session: logged-in admin (profiles.role = 'admin') AND a 30-minute
// HMAC-signed cookie set by /api/admin/unlock. Every admin route checks both.
import { HttpError, requireEnv, clientIp } from './http.js';
import { hmacB64url, timingSafeEqual } from './crypto.js';
import { requireUser, getProfile } from './supabase.js';
import { limit } from './ratelimit.js';

export const ADMIN_COOKIE = 'hc_admin';
export const ADMIN_TTL_SEC = 30 * 60;

function cookieSecret(env) {
  requireEnv(env, ['COOKIE_SECRET']);
  if (String(env.COOKIE_SECRET).length < 32) {
    console.error('COOKIE_SECRET shorter than 32 chars');
    throw new HttpError(503, 'not_configured', 'This feature is not switched on yet.');
  }
  return env.COOKIE_SECRET;
}

export async function makeAdminCookie(env, userId) {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_TTL_SEC;
  const sig = await hmacB64url(cookieSecret(env), `admin.${userId}.${exp}`);
  const value = `${userId}.${exp}.${sig}`;
  return { exp, header: `${ADMIN_COOKIE}=${value}; Path=/api; Max-Age=${ADMIN_TTL_SEC}; HttpOnly; Secure; SameSite=Strict` };
}

export function clearAdminCookie() {
  return `${ADMIN_COOKIE}=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// Returns { exp } if the cookie is valid for this user, else null
export async function readAdminCookie(request, env, userId) {
  const v = readCookie(request, ADMIN_COOKIE);
  if (!v) return null;
  const parts = v.split('.');
  if (parts.length !== 3) return null;
  const [uid, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
  const expected = await hmacB64url(cookieSecret(env), `admin.${uid}.${exp}`);
  if (!timingSafeEqual(expected, sig)) return null;
  if (!timingSafeEqual(uid, userId)) return null;
  return { exp };
}

// Logged-in user with role admin (no cookie check). Used by unlock.
export async function requireAdminUser(request, env) {
  const { user } = await requireUser(request, env);
  const profile = await getProfile(env, user.id);
  if (!profile || profile.role !== 'admin') throw new HttpError(403, 'forbidden', 'Not allowed.');
  return { user, profile };
}

// Full check for every admin route: role + valid cookie + per-IP rate limit
export async function requireAdmin(request, env) {
  await limit(env, 'admin-ip', clientIp(request), 120, 300);
  const { user, profile } = await requireAdminUser(request, env);
  const session = await readAdminCookie(request, env, user.id);
  if (!session) throw new HttpError(401, 'admin_locked', 'Admin session expired. Unlock again.');
  return { user, profile, session };
}
