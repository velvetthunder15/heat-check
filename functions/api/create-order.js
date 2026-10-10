// POST /api/create-order  { product: 'pass' | 'lifetime' }   (signed-in users only)
// The server picks the amount from lib/pricing.js. The client never sends a price.
import { json, handle, readJson, HttpError, clientIp, requireEnv } from '../../lib/http.js';
import { requireUser, getProfile, rest } from '../../lib/supabase.js';
import { createOrder } from '../../lib/razorpay.js';
import { priceFor } from '../../lib/pricing.js';
import { limit } from '../../lib/ratelimit.js';

export const onRequestPost = handle(async ({ request, env }) => {
  requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']);
  const { user } = await requireUser(request, env);
  await limit(env, 'order-user', user.id, 10, 600);
  await limit(env, 'order-ip', clientIp(request), 30, 600);

  const body = await readJson(request);
  const productId = String(body.product || '');
  if (productId !== 'pass' && productId !== 'lifetime') throw new HttpError(400, 'bad_product', 'Unknown product.');

  const profile = await getProfile(env, user.id);
  if (!profile) throw new HttpError(409, 'no_profile', 'Your account is still being set up. Try again in a moment.');
  if (profile.plan === 'lifetime') throw new HttpError(409, 'already_lifetime', 'You already have Pro Lifetime.');

  const price = priceFor(productId, request.cf && request.cf.country);
  if (price.currency !== 'INR') throw new HttpError(400, 'currency_unavailable', 'Payments are INR only for now.');

  const receipt = `hc_${productId}_${Date.now().toString(36)}_${user.id.slice(0, 8)}`.slice(0, 40);
  const order = await createOrder(env, {
    amount: price.amount,
    currency: price.currency,
    receipt,
    notes: { user_id: user.id, product: productId },
  });

  await rest(env, 'purchases', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      user_id: user.id,
      product: productId,
      razorpay_order_id: order.id,
      amount_inr: price.amount / 100,
      currency: price.currency,
      status: 'created',
    },
  });

  return json({
    orderId: order.id,
    amount: price.amount,
    currency: price.currency,
    keyId: env.RAZORPAY_KEY_ID,
    product: productId,
    name: price.product.name,
    description: price.product.description,
    email: user.email || profile.email,
  });
});
