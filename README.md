# Heat Check

Flirty party games for couples (and friend groups), 18+. Pass-the-phone games, three heat levels, one phone.
The game list lives in `public/js/config.js` (and `lib/games.js` for the server); every count in the app comes from it.
An installable PWA on Cloudflare Pages, with Pages Functions for the API, Supabase for accounts
and Postgres, and Razorpay for payments.

Setup, environment variables and test steps: **[SETUP.md](SETUP.md)**.

## How it's split

| Path | What it is |
|---|---|
| `public/` | The static app. Copied to `dist/` by the build. |
| `public/js/core.js` `games.js` `app.js` `audio.js` `motion.js` | The game engine, the games, the app shell, sounds and the motion layer. |
| `public/js/config.js` | Games (couples / group), ring speed, ramp limits, timer options, tier limits (mirrors `lib/limits.js`), penalty points, End Night taunts. |
| `public/js/intro.js` | The home screen: pass banner, Couples / Groups switch, hold-to-heat ring + Hot burn + lock messages, reset, End night, the game stack. |
| `public/js/account.js` | Accounts, tiers (guest / base / lite / premium), limit counters, paid cards in memory, Lite Hot cards, free Hot tastes, preferences, stats, payments, admin client. |
| `public/js/account-ui.js` | Sign-in (email OTP), Lite / Premium plan cards and paywall, pass banner, limit sheet, in-game heat selector, profile, receipts, admin panel. |
| `public/js/boot.js` | Starts the app, then loads accounts in the background. |
| `public/js/vendor/` | supabase-js 2.117.3 (UMD), loaded only when accounts are switched on. |
| `public/css/base.css` `themes.css` | The original design. **Never edited.** Additions go in `fixes.css`, `motion.css`, `polish.css`, `intro.css`, `account.css`, `tiers.css`. |
| `content/*.json` | Every card, all levels, one file per game. The source of truth. |
| `tools/cards.mjs` | Lints the cards (banned couple words in group cards; no "your partner", "us", "each other", "you two" in Red Flag trait cards and NHIE; counts; charade fields; origins; dares on Spicy/Hot) and checks `config.js` mirrors `lib/games.js` + `lib/limits.js`. Writes `dist/cards.json` with Flirty only. `--seed` writes the Spicy + Hot SQL. The build fails on a lint error. |
| `public/_headers` `_routes.json` | Cloudflare Pages headers (CSP etc.) and Functions routing (`/api/*` only). |
| `functions/api/` | Pages Functions (Workers runtime, Web Crypto + fetch only, no npm packages). |
| `lib/` | Shared server code: pricing (the one product/price/duration file), limits, Supabase REST, Razorpay REST, crypto, rate limits, admin session. |
| `supabase/migrations/` | Tables, `has_lite()` / `has_premium()`, RPCs (grant, limits, Hot, taste), RLS policies. |
| `supabase/seed/premium_cards.sql` | All Spicy (Lv2) and Hot (Lv3) cards incl. one server-only taste card per game (generated, don't edit). |
| `tools/build.mjs` | Copies `public/` to `dist/` and stamps `SITE_URL` (and `CONTACT_EMAIL`) into canonical/og tags, manifest, robots, sitemap and legal pages. |
| `tools/hash-admin-password.mjs` | Makes the `ADMIN_PASSWORD_HASH` value. |
| `wrangler.toml` | Pages config: output dir, `SITE_URL`, KV binding. |
| `vercel.json` | Keeps the old Vercel deployment working (guest mode) until the move is done. |

## API

| Route | Auth | Does |
|---|---|---|
| `GET /api/config` | none | Public settings: Supabase URL + anon key, Turnstile site key, Razorpay key id, prices, game switches. |
| `POST /api/auth/otp` | Turnstile | Emails a 6-digit code (rate limited per email and IP). |
| `POST /api/taste` | user (Base) | Spends this account's one free Hot card for a game (atomic SQL; second call 403). |
| `POST /api/hot` | user (Lite) | One Hot card, counted: 3 per game per Lite pass (atomic SQL; 4th call 403 `used_up`). |
| `POST /api/flirty` | user (Base) | Counts one Flirty card: 5 per game per day, IST (403 past the limit). `{sync}` carries guest counters up on sign-in. |
| `POST /api/create-order` | user | `{product: 'lite' \| 'premium'}`. The server sets the amount from `lib/pricing.js`. Refuses anything on a Premium account. |
| `POST /api/verify-payment` | user | Checks the Checkout signature, confirms with Razorpay, grants. Idempotent. |
| `POST /api/razorpay-webhook` | signature | Same grant path, from Razorpay. Raw body is read before parsing. |
| `GET /api/export-data` | user | Everything we hold about the user, as JSON. |
| `POST /api/delete-account` | user + emailed code | Deletes profile and preferences, anonymizes purchases. |
| `POST /api/admin/unlock` | admin + password | PBKDF2 check, lockout after 5 fails, sets a 30-minute signed cookie. |
| `GET /api/admin/status` `POST /api/admin/logout` | admin | Cookie state. |
| `GET /api/admin/stats`, `POST /api/admin/grant`, `GET/POST /api/admin/games`, `GET/POST /api/admin/cards` | admin + cookie | Counts, grant Lite / Premium or revoke by email, game switches, Spicy + Hot card editor. |
| `POST /api/event` | none | Crash beacon (logs a trimmed line). |

## Rules this codebase keeps

- Tiers: guest (5 Flirty per game), Base (5 Flirty + 1 free Hot card per game), Lite (Flirty + Spicy unlimited, 3 Hot per game, 1 hour), Premium (everything, lifetime). Limits live in `lib/limits.js` and are enforced by the server for anything paid.
- Spicy and Hot text only come from the server: Spicy via RLS (`has_lite`), Hot via RLS for Premium (`has_premium`), `/api/hot` for Lite and `/api/taste` for Base. It lives in memory only. The bundle has Flirty only.
- Heat can never sit above what the account may play (`Core.levelCap()`).
- Premium never expires: `plan = 'premium'`, `premium_until` null, no expiry check anywhere.
- The client never sends a price and never writes `plan`, `premium_until` or `role`.
- Every admin route checks the signed cookie **and** `profiles.role = 'admin'` on the server.
- Secrets live in Pages environment variables, never in the repo or the frontend.
- One `SITE_URL` drives canonical/og tags, manifest, sitemap and CORS.

## Release checklist

1. Bump `?v=N` in `public/index.html`, `VERSION` and the `SHELL` list in `public/sw.js` together (now v11).
2. Edit cards in `content/`, then `node tools/cards.mjs --seed` to refresh the Lv3 SQL.
3. `node --check` the changed JS, run the tests, push to `main`. Cloudflare Pages builds and deploys.

## Rollback

Cloudflare Pages keeps every deployment. In the dashboard, open the project, Deployments, pick the last good one and choose "Rollback to this deployment". Database changes are additive; the migration never drops data.
