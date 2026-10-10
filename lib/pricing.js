// Heat Check: the only place products, prices and durations live.
// The server reads this to set order amounts (never trust a client price),
// and /api/config sends the display prices to the app.
// durationMin: null means lifetime. To add a country later: add a currency under
// `prices`, then map the country to it in COUNTRY_CURRENCY. Only INR ships today.

export const DEFAULT_CURRENCY = 'INR';

// ISO country -> currency. Anything not listed uses DEFAULT_CURRENCY.
export const COUNTRY_CURRENCY = {
  IN: 'INR',
};

export const PRODUCTS = {
  lite: {
    id: 'lite',
    name: 'Lite',
    description: 'Heat Check Lite: 1 hour of Flirty and Spicy unlimited, 3 Hot cards per game. Party games for couples, 18+.',
    durationMin: 60, // added to premium_until from payment; buying again while active adds another 60
    prices: {
      INR: { amount: 6900, display: '₹69' }, // amount in the smallest unit (paise)
    },
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    description: 'Heat Check Premium: one-time, forever. Every card, every theme. Party games for couples, 18+.',
    durationMin: null, // lifetime: never expires
    prices: {
      INR: { amount: 9900, display: '₹99' },
    },
  },
};

export const isProduct = (id) => Object.prototype.hasOwnProperty.call(PRODUCTS, id);

export function currencyFor(country) {
  const c = COUNTRY_CURRENCY[String(country || '').toUpperCase()];
  return c || DEFAULT_CURRENCY;
}

// Returns { product, currency, amount, display } or null for an unknown product.
// Falls back to DEFAULT_CURRENCY when a product has no price in the country's currency.
export function priceFor(productId, country) {
  if (!isProduct(productId)) return null;
  const product = PRODUCTS[productId];
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
    out[id] = { id, name: p.product.name, durationMin: p.product.durationMin, currency: p.currency, amount: p.amount, display: p.display };
  }
  return out;
}
