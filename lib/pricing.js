// Heat Check: the only place prices live.
// The server reads this to set order amounts (never trust a client price),
// and /api/config sends the display prices to the app.
// To add a country later: add a currency under `prices`, then map the
// country to it in COUNTRY_CURRENCY. Only INR ships today.

export const DEFAULT_CURRENCY = 'INR';

// ISO country -> currency. Anything not listed uses DEFAULT_CURRENCY.
export const COUNTRY_CURRENCY = {
  IN: 'INR',
};

export const PRODUCTS = {
  pass: {
    id: 'pass',
    name: 'Date Night Pass',
    description: 'Heat Check Date Night Pass: 4 hours of Pro. Flirty party games for couples, 18+.',
    hours: 4, // valid for 4 hours from payment confirmation; buying again while active adds 4 more
    prices: {
      INR: { amount: 9900, display: '₹99' }, // amount in the smallest unit (paise)
    },
  },
  lifetime: {
    id: 'lifetime',
    name: 'Pro Lifetime',
    description: 'Heat Check Pro Lifetime: one-time purchase. Flirty party games for couples, 18+.',
    hours: null,
    prices: {
      INR: { amount: 19900, display: '₹199' },
    },
  },
};

export function currencyFor(country) {
  const c = COUNTRY_CURRENCY[String(country || '').toUpperCase()];
  return c || DEFAULT_CURRENCY;
}

// Returns { product, currency, amount, display } or null for an unknown product.
// Falls back to DEFAULT_CURRENCY when a product has no price in the country's currency.
export function priceFor(productId, country) {
  const product = PRODUCTS[productId];
  if (!product) return null;
  let currency = currencyFor(country);
  if (!product.prices[currency]) currency = DEFAULT_CURRENCY;
  const p = product.prices[currency];
  return { product, currency, amount: p.amount, display: p.display };
}

// What the app shows on the paywall
export function publicCatalog(country) {
  const out = {};
  for (const id of Object.keys(PRODUCTS)) {
    const p = priceFor(id, country);
    out[id] = { id, name: p.product.name, hours: p.product.hours, currency: p.currency, amount: p.amount, display: p.display };
  }
  return out;
}
