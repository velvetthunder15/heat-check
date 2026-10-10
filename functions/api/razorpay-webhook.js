// POST /api/razorpay-webhook  (Razorpay -> us)
// Subscribe to: payment.captured, payment.authorized, order.paid, payment.failed.
// The signature covers the raw body, so read it with request.text() BEFORE parsing.
import { json, handle, requireEnv } from '../../lib/http.js';
import { webhookSignatureValid, settlePayment } from '../../lib/razorpay.js';
import { rest } from '../../lib/supabase.js';

export const onRequestPost = handle(async ({ request, env }) => {
  requireEnv(env, ['RAZORPAY_WEBHOOK_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']);
  const raw = await request.text();
  if (raw.length > 256 * 1024) return json({ error: 'too_large' }, 413);
  const signature = request.headers.get('X-Razorpay-Signature') || '';
  if (!(await webhookSignatureValid(env, raw, signature))) {
    return json({ error: 'bad_signature' }, 400);
  }

  let event;
  try { event = JSON.parse(raw); } catch (e) { return json({ error: 'bad_json' }, 400); }
  const type = event && event.event;
  const payment = event && event.payload && event.payload.payment && event.payload.payment.entity;
  if (!payment || !payment.id || !payment.order_id) return json({ ok: true, ignored: true });

  // Only orders this app created
  const rows = await rest(env, `purchases?razorpay_order_id=eq.${encodeURIComponent(payment.order_id)}&select=status`);
  const purchase = rows && rows[0];
  if (!purchase) return json({ ok: true, ignored: true });

  if (type === 'payment.failed') {
    if (purchase.status === 'created') {
      await rest(env, `purchases?razorpay_order_id=eq.${encodeURIComponent(payment.order_id)}&status=eq.created`, {
        method: 'PATCH', prefer: 'return=minimal', body: { status: 'failed' },
      });
    }
    return json({ ok: true });
  }

  if (type === 'payment.captured' || type === 'payment.authorized' || type === 'order.paid') {
    try {
      const result = await settlePayment(env, { orderId: payment.order_id, paymentId: payment.id });
      return json({ ok: true, granted: !!(result && result.granted) });
    } catch (e) {
      // 5xx makes Razorpay retry later; a not-yet-captured payment will come back as payment.captured
      if (e && e.status === 402) return json({ ok: true, pending: true });
      // Mismatches won't fix themselves on retry: acknowledge (already logged) so Razorpay stops resending
      if (e && e.status === 400) return json({ ok: false, error: e.code });
      throw e;
    }
  }
  return json({ ok: true, ignored: true });
});
