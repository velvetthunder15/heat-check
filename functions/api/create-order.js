// POST /api/create-order  { product: 'lite' | 'premium' }   (signed-in users only)
// The server picks the amount from lib/pricing.js. The client sends only the product name.
// Premium never expires, so a Premium account can't buy Lite (or Premium again).
// v21: PayU (default) returns a hosted-checkout form to POST; Razorpay returns an order for Checkout.js.
import { json, handle, readJson, HttpError, clientIp, requireEnv } from '../../lib/http.js';
import { requireUser, getProfile, rest } from '../../lib/supabase.js';
import { createOrder } from '../../lib/razorpay.js';
import { checkoutForm, newTxnId } from '../../lib/payu.js';
import { provider, paymentsConfigured, paymentMode } from '../../lib/payments.js';
import { priceFor, isProduct } from '../../lib/pricing.js';
import { limit } from '../../lib/ratelimit.js';

export const onRequestPost = handle(async ({ request, env }) => {
  requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']);
  if (!paymentsConfigured(env)) throw new HttpError(503, 'not_configured', 'This feature is not switched on yet.');
  const { user } = await requireUser(request, env);
  await limit(env, 'order-user', user.id, 10, 600);
  await limit(env, 'order-ip', clientIp(request), 30, 600);

  const body = await readJson(request);
  const productId = String(body.product || '');
  if (!isProduct(productId)) throw new HttpError(400, 'bad_product', 'Unknown product.');

  const profile = await getProfile(env, user.id);
  if (!profile) throw new HttpError(409, 'no_profile', 'Your account is still being set up. Try again in a moment.');
  if (profile.plan === 'premium') throw new HttpError(409, 'already_premium', 'You already have Premium.');

  const price = priceFor(productId, request.cf && request.cf.country);
  if (price.currency !== 'INR') throw new HttpError(400, 'currency_unavailable', 'Payments are INR only for now.');
  const email = user.email || profile.email;
  const gw = provider(env);

  let orderId, out;
  if (gw === 'payu') {
    orderId = newTxnId(productId);
    const returnUrl = `${new URL(request.url).origin}/api/payu-return`;
    const form = await checkoutForm(env, {
      txnid: orderId, amountPaise: price.amount, productinfo: `Heat Check ${price.product.name}`,
      email, productId, userId: user.id, returnUrl,
    });
    out = { provider: 'payu', orderId, action: form.action, fields: form.fields };
  } else {
    const receipt = `hc_${productId}_${Date.now().toString(36)}_${user.id.slice(0, 8)}`.slice(0, 40);
    const order = await createOrder(env, { amount: price.amount, currency: price.currency, receipt, notes: { user_id: user.id, product: productId } });
    orderId = order.id;
    out = { provider: 'razorpay', orderId, keyId: env.RAZORPAY_KEY_ID };
  }

  await rest(env, 'purchases', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      user_id: user.id,
      product: productId,
      razorpay_order_id: orderId,
      amount_inr: price.amount / 100,
      currency: price.currency,
      status: 'created',
      mode: paymentMode(env),
      provider: gw,
    },
  });

  return json({
    ...out,
    amount: price.amount,
    currency: price.currency,
    product: productId,
    name: price.product.name,
    description: price.product.description,
    email,
  });
});
