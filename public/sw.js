/* Heat Check service worker: offline app shell, cache-first assets.
   Never touches /api or other origins (Supabase, Razorpay, Turnstile), so Spicy/Hot cards
   and account data are never cached here. */
const VERSION = 'hc-v21';
const SHELL = [
  '/', '/privacy', '/terms', '/refund', '/cards.json', '/site.webmanifest',
  '/css/base.css?v=21', '/css/themes.css?v=21', '/css/fixes.css?v=21', '/css/motion.css?v=21', '/css/polish.css?v=21', '/css/intro.css?v=21', '/css/account.css?v=21', '/css/buttons.css?v=21', '/css/tiers.css?v=21', '/css/perf.css?v=21',
  '/js/config.js?v=21', '/js/audio.js?v=21', '/js/core.js?v=21', '/js/games.js?v=21', '/js/account.js?v=21', '/js/app.js?v=21', '/js/intro.js?v=21', '/js/account-ui.js?v=21', '/js/motion.js?v=21', '/js/boot.js?v=21',
  '/fonts/inter-var-4.woff2', '/fonts/inter-var-italic-4.woff2',
  '/logo-wordmark.webp', '/favicon.ico', '/favicon.svg', '/favicon-96x96.png', '/apple-touch-icon.png', '/web-app-manifest-192x192.png', '/web-app-manifest-512x512.png',
];
// A redirected response can't be served for a navigation, so store a clean copy
const clean = async (res) => (res.redirected ? new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers }) : res);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => fetch(u, { cache: 'reload' }).then(clean).then((r) => r.ok && c.put(u, r)).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/_vercel/') || url.pathname.startsWith('/api/')) return;
  const path = url.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  // Pages: open instantly from cache, refresh the copy in the background (next launch gets updates)
  if (req.mode === 'navigate') {
    const net = fetch(req).then(async (res) => { const r = await clean(res); if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(path, copy)); } return r; });
    e.respondWith(caches.match(path).then((hit) => hit || net.catch(() => caches.match('/'))));
    e.waitUntil(net.catch(() => {}));
    return;
  }
  // cards.json: network first so edits show up, cache when offline
  if (url.pathname.endsWith('cards.json')) {
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch(() => caches.match(req)));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  })));
});
