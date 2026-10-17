// PayU India (Hosted Checkout) over fetch, no SDK. v21: replaces Razorpay as the live gateway.
// Flow: /api/create-order makes a txnid + request hash and returns a form the browser POSTs to PayU.
// PayU sends the customer back with a form POST to /api/payu-return (surl = furl). We check the
// reverse hash, then ask PayU itself (verify_payment) before granting, so a forged or replayed
// return can never unlock anything. /api/payu-webhook does the same for server-to-server pushes.
//
// Env: PAYU_KEY, PAYU_SALT (Salt v1), PAYU_ENV = 'test' | 'live' (default test).
// IDs reuse the purchases columns: razorpay_order_id = PayU txnid, razorpay_payment_id = mihpayid,
// with purchases.provider = 'payu'. grant_purchase() is shared, so the grant rules are identical.
import { HttpError, requireEnv } from './http.js';
import { timingSafeEqual, toHex } from './crypto.js';
import { rpc } from './supabase.js';
import { PRODUCTS } from './pricing.js';

const HOSTS = {
  test: { pay: 'https://test.payu.in/_payment', api: 'https://test.payu.in/merchant/postservice.php?form=2' },
  live: { pay: 'https://secure.payu.in/_payment', api: 'https://info.payu.in/merchant/postservice.php?form=2' },
};

export const TXN_RE = /^hc[a-z0-9]{10,23}$/;

export function payuEnv(env) { return env.PAYU_ENV === 'live' ? 'live' : 'test'; }
export function payuConfigured(env) { return !!(env.PAYU_KEY && env.PAYU_SALT); }

async function sha512(s) {
  return toHex(await crypto.subtle.digest('SHA-512', new TextEncoder().encode(s)));
}

// Amount as PayU wants it: rupees with 2 decimals ("69.00")
export const rupees = (paise) => (Number(paise) / 100).toFixed(2);

export function newTxnId(productId) {
  const r = crypto.getRandomValues(new Uint8Array(6));
  const rand = [...r].map((b) => (b % 36).toString(36)).join('');
  return `hc${productId === 'premium' ? 'p' : 'l'}${Date.now().toString(36)}${rand}`.slice(0, 25);
}

// Pipe-safe text for hashed fields
const clean = (v, n) => String(v || '').replace(/[|\r\n]/g, ' ').trim().slice(0, n);

export function firstNameFrom(email) {
  const local = String(email || '').split('@')[0].replace(/[^A-Za-z]/g, ' ').trim().split(/\s+/)[0] || '';
  return local ? local[0].toUpperCase() + local.slice(1, 30) : 'Player';
}

// Request hash: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
export async function requestHash(env, f) {
  const s = [env.PAYU_KEY, f.txnid, f.amount, f.productinfo, f.firstname, f.email,
    f.udf1 || '', f.udf2 || '', f.udf3 || '', f.udf4 || '', f.udf5 || ''].join('|') + '||||||' + env.PAYU_SALT;
  return sha512(s);
}

// Response (reverse) hash:
// sha512([additional_charges|]SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
export async function responseHashValid(env, p) {
  const tail = [env.PAYU_SALT, p.status || '', '', '', '', '', '', p.udf5 || '', p.udf4 || '', p.udf3 || '', p.udf2 || '', p.udf1 || '',
    p.email || '', p.firstname || '', p.productinfo || '', p.amount || '', p.txnid || '', p.key || ''].join('|');
  const s = p.additional_charges ? `${p.additional_charges}|${tail}` : tail;
  const expected = await sha512(s);
  return timingSafeEqual(expected, String(p.hash || '').toLowerCase());
}

// Everything the browser needs to POST to PayU. Salt never leaves the server.
export async function checkoutForm(env, { txnid, amountPaise, productinfo, email, productId, userId, returnUrl }) {
  requireEnv(env, ['PAYU_KEY', 'PAYU_SALT']);
  const fields = {
    key: env.PAYU_KEY,
    txnid,
    amount: rupees(amountPaise),
    productinfo: clean(productinfo, 100),
    firstname: firstNameFrom(email),
    email: clean(email, 100),
    udf1: productId,
    udf2: clean(userId, 40),
    surl: returnUrl,
    furl: returnUrl,
  };
  fields.hash = await requestHash(env, fields);
  return { action: HOSTS[payuEnv(env)].pay, fields };
}

// verify_payment: PayU's own record of a txnid. Returns the transaction detail or null.
export async function verifyTxn(env, txnid) {
  requireEnv(env, ['PAYU_KEY', 'PAYU_SALT']);
  const command = 'verify_payment';
  const hash = await sha512(`${env.PAYU_KEY}|${command}|${txnid}|${env.PAYU_SALT}`);
  const body = new URLSearchParams({ key: env.PAYU_KEY, command, var1: txnid, hash });
  const res = await fetch(HOSTS[payuEnv(env)].api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) {}
  if (!res.ok || !data) {
    console.error('payu verify', res.status);
    throw new HttpError(502, 'payment_lookup_failed', 'Couldn’t confirm the payment yet. If you were charged, it will unlock shortly.');
  }
  const t = data.transaction_details && data.transaction_details[txnid];
  return t && t.status && t.status !== 'Not Found' ? t : null;
}

// Confirm with PayU, then grant. Idempotent (grant_purchase never grants twice).
// Returns { state: 'paid' | 'failed' | 'pending', result }.
export async function settleTxn(env, txnid) {
  const t = await verifyTxn(env, txnid);
  if (!t) return { state: 'pending', result: null };
  const status = String(t.status || '').toLowerCase();
  if (status === 'failure' || status === 'failed' || status === 'dropped' || status === 'bounced' || status === 'usercancelled') {
    return { state: 'failed', result: null, reason: t.error_Message || t.field9 || status };
  }
  if (status !== 'success') return { state: 'pending', result: null };
  const paise = Math.round(Number(t.amt || t.transaction_amount) * 100);
  const result = await rpc(env, 'grant_purchase', {
    p_order_id: txnid,
    p_payment_id: `payu_${t.mihpayid}`,
    p_amount_paise: paise,
    p_lite_minutes: PRODUCTS.lite.durationMin,
  });
  if (result && result.reason === 'amount_mismatch') console.error('payu amount mismatch', txnid);
  if (result && result.reason === 'already_premium') console.error('lite paid on a premium account, refund txn', txnid);
  return { state: 'paid', result };
}

// Form bodies PayU posts (return + webhook)
export async function readForm(request, maxBytes = 64 * 1024) {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large', 'Request too large.');
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { return JSON.parse(text) || {}; } catch (e) { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(text));
}
