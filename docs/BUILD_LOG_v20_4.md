# v20.4 (hc-v49 / ?v=49), Oct 16 2026: usage stats + private stats page

## Why
Chirag said yes to "add Web Analytics and per-game tracking to a private admin stats page".

## What shipped
### First-party tracking (no third-party script, no cookies)
- `public/js/track.js` (in index.html and the SW shell): a small queue, one `sendBeacon` to `POST /api/track` when the page is
  hidden (visibilitychange / pagehide), when 20 events pile up, or 8 s after load. No timers loop, nothing awaits it, so the UI never waits.
- Events: `visit` (once per tab session, carries the tier), `game_start` (App.play), `card_dealt` (games.js deal(), game + heat; a
  restored card on re-entry is not counted), `heat_change` (Core.setHeat, only when the level actually changes), `paywall_view`
  (UI.paywall), `checkout_start` (after /api/create-order), `purchase_paid` (verify-payment ok, or the webhook-poll path),
  `signup` / `sign_in` (verifyCode; signup = profile created in the last 15 min). Every event carries the tier (guest/base/lite/premium).
- `functions/api/track.js` + `lib/analytics.js`: always 204, insert after the response (waitUntil). Adds country + city from
  `request.cf`, phone/tablet/desktop from the UA, referrer host (own hosts = none, l.instagram.com -> instagram.com, t.co -> x.com),
  cleaned utm_source/medium/campaign (visit rows only), visitor = sha256(ip | UA | IST date | ANALYTICS_SALT or COOKIE_SECRET or
  service key), 32 hex chars, changes daily. Never stores IP, email or user id. `is_bot`: Cloudflare `botManagement` / `verifiedBotCategory`
  when the plan has them, else a UA list (crawlers, headless, curl, Lighthouse, AI crawlers) or a very short UA; `navigator.webdriver`
  is sent as `b` but not trusted. Link-preview fetchers (WhatsApp, facebookexternalhit, Telegram, Twitter, Slack, Discord, LinkedIn...)
  are dropped. Rate limit: the first 5 batches per IP per 10 min are counted in the isolate's memory (no KV write, so a normal
  visit costs nothing in KV), then RATE_KV enforces 60 per 10 min; over the limit = quietly not counted, KV down = still counted.
  Batches capped at 40 events, 8 KB.
- Internal: chiragrasane15@gmail.com, cutn1269@gmail.com and any device with `localStorage.hc_notrack = 1` send `i: 1`
  (stored `internal = true`). Signing in with either email sets hc_notrack on that device; opening /admin as an admin sets it too.
  Sign-out wipe keeps hc_notrack.

### Database (migration `supabase/migrations/20261016000000_v20_4_analytics.sql`, applied live before the deploy)
- `analytics_events` (identity id, at, IST `day`, type, game, heat, tier, product, country, city, device, ref_host, utm_*,
  visitor, is_bot, internal) with CHECK constraints on every field, indexes on day and (type, day). RLS on, no policies;
  anon/authenticated have no grants (verified live: has_table_privilege false).
- `purchases.mode` (`test` / `live`); the 5 existing rows set to `test` (all were made with rzp_test_ keys).
  `/api/create-order` now writes the mode from the key prefix.
- `admin_analytics(days)` (security definer, service role only): totals, by_day (visitors, visits, cards, bots, signups),
  countries, cities, referrers, utm, devices, tiers, games (starts, cards, players, heat split), heat mix, funnel
  (visitors -> paywall -> checkout -> paid, unique visitor-days), accounts (total, new, by plan, list with email, plan, role,
  Lite end, joined, last sign-in from auth.users), purchases (by mode/status/product, live and test revenue, last 50).
  Real = not is_bot and not internal everywhere. `prune_analytics()` drops events older than 400 days (called 1 in 20 page loads).

### Stats page: https://playheatcheck.app/admin
- `public/admin.html` + `js/admin.js` + `css/admin.css` (new files, reuse base.css / polish.css / tiers.css; base.css and
  themes.css untouched). Not in index.html or the SW shell on purpose: admin code never loads for players.
- Uses the app's own Supabase session on that device (`hc_auth`), then `GET /api/admin/analytics?days=7|30|90`
  (`functions/api/admin/analytics.js`): signed-in + `profiles.role = 'admin'` is enough to view (no password: ADMIN_PASSWORD_HASH
  is unset). Grants, card edits, game switches and the old /api/admin/stats still need the password unlock cookie.
  Not signed in -> "Sign in first"; not admin -> "Not an admin account"; neither marks the device.
- Sections: 6 headline tiles (visitors today, visitor-days, cards dealt + starts, new accounts, live revenue, test revenue with
  a TEST tag), daily chart (IST), paywall funnel, heat mix, games table with heat split bars, countries, referrers,
  phone vs desktop, visitors by plan, cities, utm, accounts list, purchases with TEST / LIVE tags and the last 50 orders.
  Phone: one column, account/order rows stack; tablet 2 columns; desktop 3 columns (max 1240px).
- Profile sheet: admins get a "Stats (admin)" button linking to /admin.
- `_headers`: /admin no-store + X-Robots-Tag noindex; robots.txt Disallow /admin.

### Cloudflare Web Analytics
- API attempt: `GET /accounts/{id}/rum/site_info/list` -> 10000 Authentication error; `POST /accounts/{id}/rum/site_info`
  {host: playheatcheck.app, auto_install: true} -> 10022 `web_analytics.configuration.api.autoInstallInvalid` (the token can't see
  the playheatcheck.app zone: `GET /zones?name=playheatcheck.app` returns 0). Stopped there, as briefed.
- Prepared: CSP (`_headers` and vercel.json) now allows `https://static.cloudflareinsights.com` (script) and
  `https://cloudflareinsights.com` (connect), so the dashboard toggle works without another deploy.
- Chirag's one-click step: Cloudflare dashboard, Workers & Pages, heat-check, Metrics tab, Web Analytics, Enable.
  (Or Analytics & Logs, Web Analytics, Add a site, playheatcheck.app, Enable automatic setup.)

### Privacy
- privacy.html: new short-version bullet ("We count visits and which games get played with our own anonymous usage stats. No
  cookies, no IP addresses stored, nothing tied to you."), section 4a "Anonymous usage stats", the third-party line now says
  Cloudflare may count page views with cookieless Web Analytics, "updated 16 October 2026".

### Release
- sw.js VERSION hc-v49; every ?v= 48 -> 49 (index, 404, 500, privacy, terms, refund, sw.js); track.js in index.html + SHELL.

## Account changes
- Supabase: `profiles.role = 'admin'` for chiragrasane15@gmail.com (was `user`; plan premium unchanged).
- `purchases.mode = 'test'` on the 5 existing rows.

## Tests
- t4.js 201 ok (13 new: one batched beacon, event order and fields, no names/card text, visit once, hc_notrack internal,
  heat_change only on change, tier, Chirag's email internal + marks device, wipe keeps hc_notrack, events wired, admin-only
  Stats link, hc-v49 + shell).
- fn12.mjs 95 ok (30 new: track 204/no cookie, unknown types dropped, country/city/device/referrer/utm, hash not IP, same/different
  visitor, IST rotation, desktop, Googlebot / CF bot score / headless flagged, previews dropped, internal, own-site referrer,
  bad JSON, batch cap, other origins 403, normal visit = 0 KV writes, 60/10 min limit, KV down still works, analytics 401/403/200 without password, tablet
  and Android classes, old admin routes still need the cookie, create-order mode test).
- sql/t12.mjs 67 ok (20 new: migration idempotent, purchases labelled, CHECKs, real vs bot vs internal counts, by_day, countries,
  referrers, devices, games, heat mix, funnel, accounts with last sign-in, purchases test, users/anon can't read/write/call, prune).
- pw/admin204.mjs 18 ok (real live data + filled demo at 390 / 820 / 1440, guest and non-admin states; no overflow, no errors,
  hc_notrack only for admins). Shots: /workspace/work/heatcheck/shots204/. pw/kb20.mjs 39 ok, pw/v201.mjs ok (no regressions).
- Build: `CONTACT_EMAIL=support@playheatcheck.app node tools/build.mjs` (HOT lint ok). Backup of v20.3 source:
  /workspace/work/heatcheck/repo_v48_backup_analytics.

## Notes
- KV budget: RATE_KV also backs sign-in and admin limits, and the Workers free plan allows 1,000 KV writes a day, so /api/track
  only touches KV after 5 batches from one IP in 10 minutes (in-memory first). Normal players cost 0 KV writes.
- "Visitors" over a range = sum of daily uniques (the hash rotates daily by design, so a 30-day unique count isn't possible).

## Deploy
- SQL first: migration applied live through the Supabase query API (returned [] = ok), then role admin set (returned
  chiragrasane15@gmail.com / admin / premium). Live check: anon select and authenticated insert on analytics_events = false,
  authenticated execute admin_analytics = false, RLS on; admin_analytics(30) returns the full payload.
- CF production auto deploys off + Vercel commandForIgnoringBuildStep "exit 0", then tools/sync.py "v20.4 hc-v49: usage stats +
  private stats page" (28 files, one commit each, 0 fails; a second run reported 0 changed), both restored (true / null),
  then one POST /pages/projects/heat-check/deployments branch=main.
- CF Pages production deployment aee7c809-b4d0-4404-8ad2-281bdf5de735 (commit 9dc0e265, branch main): success.
- Live (browser UA): /sw.js = hc-v49 with track.js?v=49 in the shell; / loads track.js?v=49 and motion2.css?v=49; /api/config 200;
  /admin 200 with X-Robots-Tag noindex + no-store and admin.js?v=49; /api/admin/analytics without a session 401; /privacy has the
  stats line, section 4a and "updated 16 October 2026"; CSP carries static.cloudflareinsights.com + cloudflareinsights.com.
  POST /api/track (marked internal) 204 and the rows landed with country, device, referrer host, 32-char visitor hash; those 2
  test rows were deleted afterwards (table count 0).
- Headless Chromium against the live apex gets Cloudflare's bot challenge (as before), so the live /admin look was checked
  locally (pw/admin204.mjs with the live admin_analytics JSON), not on the live host.
- This deploy paragraph was pushed in a docs-only sync with auto deploys off (no extra build).
