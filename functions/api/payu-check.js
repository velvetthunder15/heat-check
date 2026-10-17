// POST /api/payu-check { txnid }  (signed-in) — the app asks again when the return said "pending".
import { json, handle, readJson, HttpError, requireEnv } from '../../lib/http.js';
import { requireUser, rest, getProfile } from '../../lib/supabase.js';
import { settleTxn, TXN_RE } from '../../lib/payu.js';
import { limit } from '../../lib/ratelimit.js';

export const onRequestPost = handle(async ({ request, env }) => {
  requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'PAYU_KEY', 'PAYU_SALT']);
  const { user } = await requireUser(request, env);
  await limit(env, 'verify-user', user.id, 20, 600);
  const b = await readJson(request);
  const txnid = String(b.txnid || '');
  if (!TXN_RE.test(txnid)) throw new HttpError(400, 'bad_request', 'Invalid payment details.');
  const rows = await rest(env, `purchases?razorpay_order_id=eq.${encodeURIComponent(txnid)}&select=user_id,status`);
  const purchase = rows && rows[0];
  if (!purchase || purchase.user_id !== user.id) throw new HttpError(404, 'unknown_order', 'Order not found.');
  const s = await settleTxn(env, txnid);
  const profile = await getProfile(env, user.id);
  return json({ ok: true, state: s.state, plan: profile ? profile.plan : null, premium_until: profile ? profile.premium_until : null });
});
