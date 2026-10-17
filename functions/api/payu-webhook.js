// POST /api/payu-webhook  (PayU -> us, server to server). Configure in PayU Dashboard > Webhooks
// for Payment success and Payment failed, URL https://www.playheatcheck.app/api/payu-webhook.
// Same checks as the return: reverse hash, then verify_payment decides. Safe to receive repeatedly.
import { json } from '../../lib/http.js';
import { readForm, responseHashValid, settleTxn, TXN_RE } from '../../lib/payu.js';
import { rest } from '../../lib/supabase.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env.PAYU_KEY || !env.PAYU_SALT) return json({ error: 'not_configured' }, 503);
  let p;
  try { p = await readForm(request); } catch (e) { return json({ error: 'too_large' }, 413); }
  const txnid = String(p.txnid || '');
  if (!TXN_RE.test(txnid)) return json({ ok: true, ignored: true });
  if (!(await responseHashValid(env, p))) return json({ error: 'bad_signature' }, 400);
  const rows = await rest(env, `purchases?razorpay_order_id=eq.${encodeURIComponent(txnid)}&select=status`);
  if (!rows || !rows[0]) return json({ ok: true, ignored: true });
  const s = await settleTxn(env, txnid);   // throws on PayU lookup failure -> 500 -> PayU retries
  if (s.state === 'failed') {
    await rest(env, `purchases?razorpay_order_id=eq.${encodeURIComponent(txnid)}&status=eq.created`, {
      method: 'PATCH', prefer: 'return=minimal', body: { status: 'failed' },
    });
  }
  return json({ ok: true, state: s.state });
};
