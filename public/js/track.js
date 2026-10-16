/* Heat Check v20.4: first-party usage stats. No cookies, no third parties, nothing personal.
   Events wait in a small queue and go out in one sendBeacon when the page is hidden, when 20 have
   piled up, or 8 seconds after the page opens (so the visit carries the right tier). Never blocks the UI.
   Chirag's accounts and any device that opened /admin (localStorage hc_notrack) are sent as internal,
   so the stats page leaves them out. */
(function () {
  const INTERNAL = ['chiragrasane15@gmail.com', 'cutn1269@gmail.com'];
  const Q = [];
  let visitSent = false, timer = 0;
  const ls = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const tier = () => { try { return window.Ent ? Ent.tier() : 'guest'; } catch (e) { return 'guest'; } };
  const email = () => { try { return (window.Auth && Auth.email() || '').toLowerCase(); } catch (e) { return ''; } };
  const internal = () => {
    if (ls('hc_notrack') === '1') return true;
    const e = email();
    if (e && INTERNAL.includes(e)) { try { localStorage.setItem('hc_notrack', '1'); } catch (x) {} return true; }
    return false;
  };
  const utm = () => {
    try {
      const p = new URLSearchParams(location.search);
      const u = { s: p.get('utm_source'), m: p.get('utm_medium'), c: p.get('utm_campaign') };
      return u.s || u.m || u.c ? u : null;
    } catch (e) { return null; }
  };

  function flush() {
    clearTimeout(timer); timer = 0;
    if (!visitSent) {
      let first = true;
      try { first = sessionStorage.getItem('hc_tv') !== '1'; sessionStorage.setItem('hc_tv', '1'); } catch (e) {}
      visitSent = true;
      if (first) Q.unshift({ t: 'visit', tier: tier() });
    }
    if (!Q.length) return;
    const body = { v: 1, e: Q.splice(0, 40), i: internal() ? 1 : 0, ref: document.referrer || '', utm: utm() };
    if (navigator.webdriver) body.b = 1;
    const data = JSON.stringify(body);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([data], { type: 'application/json' }))) return;
      fetch('/api/track', { method: 'POST', body: data, headers: { 'Content-Type': 'application/json' }, keepalive: true, credentials: 'omit' }).catch(() => {});
    } catch (e) {}
  }
  const soon = (ms) => { if (!timer) timer = setTimeout(flush, ms); };

  const Track = {
    // t: event type, o: { g: game, h: heat, p: product }
    ev(t, o) {
      try {
        const e = { t, tier: tier() };
        if (o) { if (o.g) e.g = o.g; if (o.h) e.h = o.h; if (o.p) e.p = o.p; }
        Q.push(e);
        if (Q.length >= 20) flush(); else soon(15000);
      } catch (x) {}
    },
    flush,
    internal,
  };
  window.Track = Track;

  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush);
  soon(8000);
})();
