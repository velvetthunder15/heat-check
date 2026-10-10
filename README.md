# Heat Check

Flirty party games for couples, 18+. Nine pass-the-phone games, three heat levels, one phone.
An installable PWA on Cloudflare Pages, with Pages Functions for the API, Supabase for accounts
and Postgres, and Razorpay for payments.

Setup, environment variables and test steps: **[SETUP.md](SETUP.md)**.

## How it's split

| Path | What it is |
|---|---|
| `public/` | The static app. Copied to `dist/` by the build. |
| `public/js/core.js` `games.js` `app.js` `audio.js` `motion.js` | The game engine, the 9 games, the app shell, sounds and the motion layer. |
| `public/js/intro.js` | The home screen: hold to heat check, tonight's vibe, the tilted game stack. |
| `public/js/account.js` | Accounts, entitlements, free hot tastes, preferences, stats, payments, admin client. |
| `public/js/account-ui.js` | Sign-in (email OTP), paywall, pass chip, Lv3 lock moments, profile, receipts, admin panel. |
| `public/js/boot.js` | Starts the app, then loads accounts in the background. |
| `public/js/vendor/` | supabase-js 2.117.3 (UMD), loaded only when accounts are switched on. |
| `public/css/base.css` `themes.css` | The original design. **Never edited.** Additions go in `fixes.css`, `motion.css`, `polish.css`, `intro.css`, `account.css`. |
| `public/cards.json` | Lv1 and Lv2 cards, plus the 9 free "taste" Lv3 cards (one per game). |
| `public/_headers` `_routes.json` | Cloudflare Pages headers (CSP etc.) and Functions routing (`/api/*` only). |
| `functions/api/` | Pages Functions (Workers runtime, Web Crypto + fetch only, no npm packages). |
| `lib/` | Shared server code: pricing (the one price file), Supabase REST, Razorpay REST, crypto, rate limits, admin session. |
| `supabase/migrations/` | Tables, `is_pro()`, RPCs, RLS policies. |
| `supabase/seed/premium_cards.sql` | The 250 Lv3 cards (moved out of the client). |
| `tools/build.mjs` | Copies `public/` to `dist/` and stamps `SITE_URL` (and `CONTACT_EMAIL`) into canonical/og tags, manifest, robots, sitemap and legal pages. |
| `tools/hash-admin-password.mjs` | Makes the `ADMIN_PASSWORD_HASH` value. |
| `wrangler.toml` | Pages config: output dir, `SITE_URL`, KV binding. |
| `vercel.json` | Keeps the old Vercel deployment working (guest mode) until the move is done. |

## API

| Route | Auth | Does |
|---|---|---|
| `GET /api/config` | none | Public settings: Supabase URL + anon key, Turnstile site key, Razorpay key id, prices, game switches. |
| `POST /api/auth/otp` | Turnstile | Emails a 6-digit code (rate limited per email and IP). |
| `POST /api/create-order` | user | Creates a Razorpay order. The server sets the amount from `lib/pricing.js`. |
| `POST /api/verify-payment` | user | Checks the Checkout signature, confirms with Razorpay, grants. Idempotent. |
| `POST /api/razorpay-webhook` | signature | Same grant path, from Razorpay. Raw body is read before parsing. |
| `GET /api/export-data` | user | Everything we hold about the user, as JSON. |
| `POST /api/delete-account` | user + emailed code | Deletes profile and preferences, anonymizes purchases. |
| `POST /api/admin/unlock` | admin + password | PBKDF2 check, lockout after 5 fails, sets a 30-minute signed cookie. |
| `GET /api/admin/status` `POST /api/admin/logout` | admin | Cookie state. |
| `GET /api/admin/stats`, `POST /api/admin/grant`, `GET/POST /api/admin/games`, `GET/POST /api/admin/cards` | admin + cookie | Counts, grant/revoke by email, game switches, Lv3 card editor. |
| `POST /api/event` | none | Crash beacon (logs a trimmed line). |

## Rules this codebase keeps

- Lv3 cards only come from Supabase, gated by RLS (`is_pro(auth.uid())`), and live in memory only.
- The client never sends a price and never writes `plan`, `premium_until` or `role`.
- Every admin route checks the signed cookie **and** `profiles.role = 'admin'` on the server.
- Secrets live in Pages environment variables, never in the repo or the frontend.
- One `SITE_URL` drives canonical/og tags, manifest, sitemap and CORS.

## Release checklist

1. Bump `?v=N` in `public/index.html`, `VERSION` and the `SHELL` list in `public/sw.js` together.
2. `node --check` the changed JS, run the tests, push to `main`. Cloudflare Pages builds and deploys.

## Rollback

Cloudflare Pages keeps every deployment. In the dashboard, open the project, Deployments, pick the last good one and choose "Rollback to this deployment". Database changes are additive; the migration never drops data.
