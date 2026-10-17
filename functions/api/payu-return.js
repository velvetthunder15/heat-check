// POST /api/payu-return  (PayU surl/furl: the customer's browser posts the result here)
// Never trusted on its own: the reverse hash must match, then PayU's verify_payment API decides.
// Always answers with a 303 back to the app, which shows the outcome and refreshes the plan.
import { readForm, responseHashValid, settleTxn, TXN_RE } from '../../lib/payu.js';
import { rest } from '../../lib/supabase.js';

const back = (request, q) => new Response(null, {
  status: 303,
  headers: { Location: `${new URL(request.url).origin}/?${new URLSearchParams(q)}`, 'Cache-Control': 'no-store' },
});

export const onRequestPost = async ({ request, env }) => {
  let p = {};
  try { p = await readForm(request); } catch (e) { return back(request, { pay: 'error' }); }
  const txnid = String(p.txnid || '');
  const product = p.udf1 === 'premium' ? 'premium' : 'lite';
  if (!TXN_RE.test(txnid) || p.key !== env.PAYU_KEY) return back(request, { pay: 'error' });
  if (!(await responseHashValid(env, p))) { console.error('payu return bad hash', txnid); return back(request, { pay: 'error' }); }

  try {
    const rows = await rest(env, `purchases?razorpay_order_id=eq.${encodeURIComponent(txnid)}&select=status`);
    if (!rows || !rows[0]) return back(request, { pay: 'error' });
    const s = await settleTxn(env, txnid);
    if (s.state === 'paid') return back(request, { pay: 'ok', p: product });
    if (s.state === 'failed') {
      await rest(env, `purchases?razorpay_order_id=eq.${encodeURIComponent(txnid)}&status=eq.created`, {
        method: 'PATCH', prefer: 'return=minimal', body: { status: 'failed' },
      });
      return back(request, { pay: 'failed', p: product });
    }
    return back(request, { pay: 'pending', p: product, t: txnid });
  } catch (e) {
    console.error('payu return', e && e.message);
    return back(request, { pay: 'pending', p: product, t: txnid });
  }
};

// A GET here (refresh, back button) just goes home
export const onRequestGet = ({ request }) => back(request, {});
