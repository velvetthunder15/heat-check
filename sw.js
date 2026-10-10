/* Heat Check service worker: offline app shell, network-first pages, cache-first assets */
const VERSION = 'hc-v9';
const SHELL = [
  '/', '/privacy', '/terms', '/cards.json', '/manifest.webmanifest',
  '/css/base.css?v=9', '/css/themes.css?v=9', '/css/fixes.css?v=9', '/css/motion.css?v=9', '/css/polish.css?v=9',
  '/js/audio.js?v=9', '/js/core.js?v=9', '/js/games.js?v=9', '/js/app.js?v=9', '/js/motion.js?v=9',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png',
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
  if (url.host.includes('fonts.googleapis.com') || url.host.includes('fonts.gstatic.com')) {
    e.respondWith(caches.open(VERSION + '-fonts').then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); c.put(req, res.clone()); return res; } catch (err) { return Response.error(); }
    }));
    return;
  }
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
