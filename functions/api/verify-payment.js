// POST /api/verify-payment  { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Checks the Checkout signature, confirms the payment with Razorpay, then grants
// with the service role. Idempotent: the same payment never grants twice.
import { json, handle, readJson, HttpError, requireEnv } from '../../lib/http.js';
import { requireUser, rest, getProfile } from '../../lib/supabase.js';
import { checkoutSignatureValid, settlePayment } from '../../lib/razorpay.js';
import { limit } from '../../lib/ratelimit.js';

const ORDER_RE = /^order_[A-Za-z0-9]{6,40}$/;
const PAY_RE = /^pay_[A-Za-z0-9]{6,40}$/;
const SIG_RE = /^[a-f0-9]{64}$/i;

export const onRequestPost = handle(async ({ request, env }) => {
  requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']);
  const { user } = await requireUser(request, env);
  await limit(env, 'verify-user', user.id, 20, 600);

  const b = await readJson(request);
  const orderId = String(b.razorpay_order_id || '');
  const paymentId = String(b.razorpay_payment_id || '');
  const signature = String(b.razorpay_signature || '');
  if (!ORDER_RE.test(orderId) || !PAY_RE.test(paymentId) || !SIG_RE.test(signature)) {
    throw new HttpError(400, 'bad_request', 'Invalid payment details.');
  }
  if (!(await checkoutSignatureValid(env, orderId, paymentId, signature))) {
    throw new HttpError(400, 'bad_signature', 'Payment couldn’t be verified.');
  }

  const rows = await rest(env, `purchases?razorpay_order_id=eq.${encodeURIComponent(orderId)}&select=user_id,status`);
  const purchase = rows && rows[0];
  if (!purchase || purchase.user_id !== user.id) throw new HttpError(404, 'unknown_order', 'Order not found.');

  const result = await settlePayment(env, { orderId, paymentId });
  const profile = await getProfile(env, user.id);
  return json({
    ok: true,
    granted: !!(result && result.granted),
    alreadyGranted: !!(result && result.reason === 'already_granted'),
    plan: profile ? profile.plan : null,
    premium_until: profile ? profile.premium_until : null,
  });
});
