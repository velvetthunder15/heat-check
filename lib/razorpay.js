// Razorpay REST API over fetch (no SDK). Basic auth with key id + secret.
import { HttpError, requireEnv } from './http.js';
import { hmacHex, timingSafeEqual } from './crypto.js';
import { rpc } from './supabase.js';
import { PRODUCTS } from './pricing.js';

const API = 'https://api.razorpay.com/v1';

function auth(env) {
  requireEnv(env, ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']);
  return 'Basic ' + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
}

async function call(env, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: auth(env), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) {}
  return { ok: res.ok, status: res.status, data };
}

export async function createOrder(env, { amount, currency, receipt, notes }) {
  const r = await call(env, 'POST', '/orders', { amount, currency, receipt, notes });
  if (!r.ok || !r.data || !r.data.id) {
    console.error('razorpay order', r.status, r.data && r.data.error ? r.data.error.code : '');
    throw new HttpError(502, 'order_failed', 'Couldn’t start the payment. Try again in a moment.');
  }
  return r.data;
}

export async function fetchPayment(env, paymentId) {
  const r = await call(env, 'GET', `/payments/${encodeURIComponent(paymentId)}`);
  if (!r.ok || !r.data) {
    console.error('razorpay fetch payment', r.status);
    throw new HttpError(502, 'payment_lookup_failed', 'Couldn’t confirm the payment yet. If you were charged, it will unlock shortly.');
  }
  return r.data;
}

// Capture an authorized payment. Already-captured is treated as success.
export async function capturePayment(env, payment) {
  if (payment.status === 'captured') return payment;
  const r = await call(env, 'POST', `/payments/${encodeURIComponent(payment.id)}/capture`, { amount: payment.amount, currency: payment.currency });
  if (r.ok && r.data && r.data.status === 'captured') return r.data;
  const again = await fetchPayment(env, payment.id); // a parallel capture may have won
  if (again.status === 'captured') return again;
  console.error('razorpay capture', r.status, r.data && r.data.error ? r.data.error.code : '');
  throw new HttpError(502, 'capture_failed', 'Payment is still processing. It will unlock as soon as it clears.');
}

// Checkout handler signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret)
export async function checkoutSignatureValid(env, orderId, paymentId, signature) {
  requireEnv(env, ['RAZORPAY_KEY_SECRET']);
  const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
  return timingSafeEqual(expected, String(signature || '').toLowerCase());
}

// Webhook signature: HMAC_SHA256(raw body, webhook secret)
export async function webhookSignatureValid(env, rawBody, signature) {
  requireEnv(env, ['RAZORPAY_WEBHOOK_SECRET']);
  const expected = await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, rawBody);
  return timingSafeEqual(expected, String(signature || '').toLowerCase());
}

// Confirm a payment with Razorpay itself, capture it if needed, then grant.
// Safe to call any number of times for the same payment: grant_purchase is idempotent.
export async function settlePayment(env, { orderId, paymentId }) {
  let payment = await fetchPayment(env, paymentId);
  if (payment.order_id !== orderId) throw new HttpError(400, 'order_mismatch', 'That payment doesn’t match this order.');
  if (payment.status === 'authorized') payment = await capturePayment(env, payment);
  if (payment.status !== 'captured') {
    throw new HttpError(402, 'not_paid', payment.status === 'failed' ? 'The payment failed. You weren’t charged.' : 'Payment is still processing.');
  }
  const result = await rpc(env, 'grant_purchase', {
    p_order_id: orderId,
    p_payment_id: payment.id,
    p_amount_paise: payment.amount,
    p_pass_hours: PRODUCTS.pass.hours,
  });
  if (result && result.reason === 'amount_mismatch') {
    console.error('amount mismatch for order', orderId);
    throw new HttpError(400, 'amount_mismatch', 'Payment amount doesn’t match. Contact support.');
  }
  return result;
}
