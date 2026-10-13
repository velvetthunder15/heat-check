// Host canonicalisation (v17, domain move). Runs only for the page paths listed in
// public/_routes.json (plus /api/*, which it never touches), so static assets stay free.
//  - A host listed in REDIRECT_HOSTS gets a 301 to SITE_URL with the same path + query.
//  - www.<SITE_URL host> is redirected for every GET/HEAD; any other listed host
//    (heat-check-a9b.pages.dev) only for real page navigations, so a service worker's
//    precache fetches and same-origin XHR keep working there.
//  - /api/* is never redirected: the Razorpay webhook still posts to pages.dev.
// Leave REDIRECT_HOSTS empty to turn every redirect off.

export function canonicalRedirect(request, env) {
  if (!env || !env.SITE_URL) return null;
  let site;
  try { site = new URL(env.SITE_URL); } catch (e) { return null; }
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (host === site.hostname.toLowerCase()) return null;
  if (url.pathname.startsWith('/api/')) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const hosts = String(env.REDIRECT_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!hosts.includes(host)) return null;
  const isWww = host === 'www.' + site.hostname.toLowerCase();
  const mode = request.headers.get('Sec-Fetch-Mode');
  const nav = mode ? mode === 'navigate' : /text\/html/i.test(request.headers.get('Accept') || '');
  if (!isWww && !nav) return null;
  return new Response(null, {
    status: 301,
    headers: { Location: site.origin + url.pathname + url.search, 'Cache-Control': 'public, max-age=3600', Vary: 'Sec-Fetch-Mode, Accept' },
  });
}

export async function onRequest(context) {
  return canonicalRedirect(context.request, context.env) || context.next();
}
