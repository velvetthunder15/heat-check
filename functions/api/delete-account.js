// POST /api/delete-account
//   { step: 'start' }                 -> emails a 6-digit code to the account's address
//   { step: 'confirm', code: '123456' } -> checks the code, anonymizes purchases, deletes the account
// Profile + preferences are deleted (cascade). Purchase rows stay, with user_id removed, for accounting.
import { json, handle, readJson, HttpError, requireEnv } from '../../lib/http.js';
import { requireUser, sendOtp, verifyOtp, rpc, adminDeleteUser } from '../../lib/supabase.js';
import { limit } from '../../lib/ratelimit.js';

export const onRequestPost = handle(async ({ request, env }) => {
  requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']);
  const { user } = await requireUser(request, env);
  if (!user.email) throw new HttpError(400, 'no_email', 'This account has no email.');
  const body = await readJson(request);

  if (body.step === 'start') {
    await limit(env, 'delete-start', user.id, 3, 900);
    await sendOtp(env, user.email, { createUser: false });
    return json({ ok: true });
  }

  if (body.step === 'confirm') {
    await limit(env, 'delete-confirm', user.id, 6, 900);
    const code = String(body.code || '');
    if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'bad_code', 'Enter the 6-digit code.');
    const verified = await verifyOtp(env, user.email, code);
    if (!verified || verified.id !== user.id) throw new HttpError(400, 'bad_code', 'That code didn’t work. Check it or get a new one.');
    await rpc(env, 'anonymize_user_purchases', { p_user: user.id });
    await adminDeleteUser(env, user.id);
    return json({ ok: true, deleted: true });
  }

  throw new HttpError(400, 'bad_step', 'Invalid request.');
});
