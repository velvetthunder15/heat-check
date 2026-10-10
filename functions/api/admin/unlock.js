// POST /api/admin/unlock  { password }
// Needs a signed-in admin AND the admin password (PBKDF2 hash in ADMIN_PASSWORD_HASH).
// 5 wrong tries locks it for an hour. Success sets a 30-minute signed cookie.
import { json, handle, readJson, HttpError, clientIp, requireEnv } from '../../../lib/http.js';
import { pbkdf2Verify } from '../../../lib/crypto.js';
import { requireAdminUser, makeAdminCookie } from '../../../lib/admin.js';
import { limit, failures } from '../../../lib/ratelimit.js';

const MAX_FAILS = 5;
const LOCK_SEC = 3600;

export const onRequestPost = handle(async ({ request, env }) => {
  requireEnv(env, ['ADMIN_PASSWORD_HASH', 'COOKIE_SECRET']);
  const ip = clientIp(request);
  await limit(env, 'admin-unlock-ip', ip, 10, 900);
  const { user } = await requireAdminUser(request, env);

  const byUser = await failures(env, 'admin-user', user.id);
  const byIp = await failures(env, 'admin-ip', ip);
  if ((await byUser.count()) >= MAX_FAILS || (await byIp.count()) >= MAX_FAILS) {
    throw new HttpError(423, 'locked', 'Locked after too many tries. Try again in an hour.');
  }

  const body = await readJson(request, 2048);
  const password = typeof body.password === 'string' ? body.password : '';
  let ok = false;
  if (password.length >= 1 && password.length <= 256) {
    try {
      ok = await pbkdf2Verify(password, env.ADMIN_PASSWORD_HASH);
    } catch (e) {
      console.error('admin hash config:', e.message);
      throw new HttpError(503, 'not_configured', 'Admin isn’t configured.');
    }
  }
  if (!ok) {
    const n = Math.max(await byUser.add(LOCK_SEC), await byIp.add(LOCK_SEC));
    const left = MAX_FAILS - n;
    throw new HttpError(left > 0 ? 401 : 423, left > 0 ? 'wrong_password' : 'locked',
      left > 0 ? `Wrong password. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Locked after too many tries. Try again in an hour.');
  }

  await byUser.clear();
  await byIp.clear();
  const cookie = await makeAdminCookie(env, user.id);
  return json({ ok: true, expiresAt: cookie.exp * 1000 }, 200, { 'Set-Cookie': cookie.header });
});
