// Which gateway is live. v21: PayU. Razorpay stays in the codebase (lib/razorpay.js,
// /api/verify-payment, /api/razorpay-webhook) and comes back with PAYMENT_PROVIDER = "razorpay".
// To remove Razorpay entirely later: delete those three files and the razorpay branch below.
import { payuConfigured, payuEnv } from './payu.js';

export function provider(env) {
  const want = String(env.PAYMENT_PROVIDER || '').toLowerCase();
  if (want === 'razorpay') return 'razorpay';
  if (want === 'payu') return 'payu';
  return payuConfigured(env) ? 'payu' : 'razorpay';
}

export function paymentsConfigured(env) {
  return provider(env) === 'payu' ? payuConfigured(env) : !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

export function paymentMode(env) {
  if (provider(env) === 'payu') return payuEnv(env);
  return String(env.RAZORPAY_KEY_ID || '').startsWith('rzp_live_') ? 'live' : 'test';
}
