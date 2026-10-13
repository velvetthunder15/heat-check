# Heat Check v17 build log: domain move (Oct 13 2026, hc-v38 / ?v=38)

## Domain status
- playheatcheck.app registered at name.com; DNS stays at name.com: ANAME @ -> heat-check-a9b.pages.dev, CNAME www -> heat-check-a9b.pages.dev (TTL 300).
- Pages custom domains on project heat-check: www.playheatcheck.app = active (verification + HTTP validation active, Google CA). playheatcheck.app = pending, Cloudflare says "CNAME record not set" (PATCH retries and a delete + re-add did not change it). Cloudflare docs: an apex custom domain must be a zone on the Cloudflare account (https://developers.cloudflare.com/pages/configuration/custom-domains/#add-a-custom-apex-domain). The API token cannot create zones.
- Decision: www.playheatcheck.app is the primary URL until the apex is fixed.

## Code
- wrangler.toml: SITE_URL https://www.playheatcheck.app, ALT_HOSTS (CORS), REDIRECT_HOSTS (empty).
- functions/_middleware.js (new): 301 to SITE_URL for hosts in REDIRECT_HOSTS; www twin redirects every GET/HEAD, other hosts only page navigations (Sec-Fetch-Mode navigate, or Accept text/html without Sec-Fetch); never /api/*; previews never.
- public/_routes.json: functions now also run for /, /index.html, /privacy, /terms, /refund (+ .html) so the middleware can redirect pages; assets stay static.
- functions/api/_middleware.js: allowlist = request origin + SITE_URL + its www twin + ALT_HOSTS.
- tools/build.mjs: on CF Pages read SITE_URL from wrangler.toml before env (dashboard copy is toml-managed and still pages.dev).
- Version bump hc-v38 / ?v=38 (sw.js, index, 404, 500, privacy, terms, refund).

## Services
- Supabase auth: site_url https://www.playheatcheck.app; uri_allow_list apex, www, pages.dev, *.pages.dev previews, Vercel mirror. OTP templates unchanged (logo from pages.dev, still 200).
- Turnstile widget 0x4AAAAAAFTH086q2Amv_Y0F hostnames: playheatcheck.app, www.playheatcheck.app, heat-check-a9b.pages.dev, heat-check-sage.vercel.app.
- Razorpay webhook unchanged (https://heat-check-a9b.pages.dev/api/razorpay-webhook); /api is never redirected.

## To finish the apex
1. Add playheatcheck.app as a zone in the Cloudflare dashboard and switch name.com nameservers to Cloudflare's (recreate the www record), or give the API token Zone:Edit + zone create rights; or keep name.com DNS and set name.com URL forwarding for the apex to https://www.playheatcheck.app (removing the ANAME).
2. Once Pages shows the apex active: SITE_URL apex, REDIRECT_HOSTS "www.playheatcheck.app,heat-check-a9b.pages.dev", Supabase site_url apex, bump, deploy.

## Tests
t4.js ALL v12 QA PASSED; fn12.mjs ALL PASSED (13 new redirect/CORS checks); sql/t12.mjs ALL SQL PASSED; audio16.mjs ALL AUDIO PASSED.
