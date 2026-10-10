# Heat Check: setup and test guide (v12)

Accounts, paywall, admin mode and the new intro. Until the keys below are added, the app runs in
guest mode: Flirty works, and sign-in, Lite and Premium show "switching on soon".

---

## 1. Database (Supabase)

Run in this order: `supabase/migrations/20261010000000_heat_check_accounts.sql`, `supabase/migrations/20261010180000_v11_heat_groups.sql`, `supabase/migrations/20261011000000_v12_tiers.sql`, then `supabase/seed/premium_cards.sql`. All are safe to re-run.

| Object | Notes |
|---|---|
| `profiles` | `id` (= `auth.users.id`), `email`, `plan` (`base`/`lite`/`premium`), `premium_until` (Lite only, always null for Premium), `role` (`user`/`admin`), `created_at`, `taste_used`, `preferences`, `stats` (incl. the server-owned `limits` block: today's Flirty counts, Lite Hot counts). Created by a trigger on signup. |
| `purchases` | `id`, `user_id` (set to null when an account is deleted), `product`, `razorpay_order_id` (unique), `razorpay_payment_id` (unique), `amount_inr`, `currency`, `status` (`created`/`paid`/`failed`), `created_at`, `paid_at`, `anonymized_at`. |
| `premium_cards` | `game`, `heat` (2 Spicy or 3 Hot), `text`, `optional_dare`, `extra` (jsonb: Would You Rather options, charades category + origin), `is_taste`, `active`, timestamps. Pro reads non-taste rows; taste rows are only served by `/api/taste`. |
| `games` | One row per game, `mode` (`couples` / `group`), `enabled` (admin switch). Public read. |
| `admin_actions` | Audit log of admin grants, card edits and game switches. No client access. |
| `has_lite(uid)` / `has_premium(uid)` | `plan = 'lite' AND premium_until > now()` OR `plan = 'premium'` / `plan = 'premium'`. Premium has no expiry check. |
| `bump_flirty`, `sync_flirty`, `claim_hot` | Service role only. Base Flirty counter (5 per game per day), guest counters on sign-in, Lite Hot cards (3 per game per pass). Row-locked, atomic. |
| `save_stats(stats)` | Signed-in users save their own stats; the `limits` block is always kept. |
| `claim_taste(user, game, origins)` | Service role only. Locks the profile row, checks `taste_used`, marks it, returns one taste card. Returns nothing if already used. |
| `grant_purchase(...)` | Service role only. Locks the purchase row, grants once per order and once per payment id, checks the amount. Premium: `plan = 'premium'`, `premium_until` null. Lite: +60 minutes (a new pass resets its Hot counters), never on a Premium account. |
| `admin_set_entitlement`, `admin_stats`, `anonymize_user_purchases` | Service role only. |

RLS is on for every table. Users read only their own profile and purchases, can update only
`preferences` (column grant) and their stats through `save_stats()`. They read Spicy rows only with `has_lite()` and Hot rows only with `has_premium()`.
`plan`, `premium_until`, `role`, `taste_used` and the limit counters can't be written by clients.

## 2. Pages Functions and environment

All under `functions/api/`, shared code in `lib/`. Workers runtime only: `fetch` and `crypto.subtle`, no npm packages.

### Environment variables

Set these in Cloudflare Pages, Settings, Variables and Secrets (Production and Preview), as **secrets** except where noted.

| Name | What | Where it comes from |
|---|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` | Supabase, Project Settings, API |
| `SUPABASE_SERVICE_KEY` | service_role / secret key (server only) | Supabase, Project Settings, API |
| `SUPABASE_ANON_KEY` ⚑ | anon / publishable key (public, sent to the app) | Supabase, Project Settings, API |
| `RAZORPAY_KEY_ID` | `rzp_test_...` then `rzp_live_...` | Razorpay, Settings, API Keys |
| `RAZORPAY_KEY_SECRET` | key secret | Razorpay, Settings, API Keys |
| `RAZORPAY_WEBHOOK_SECRET` | the secret you type when creating the webhook | Razorpay, Settings, Webhooks |
| `ADMIN_PASSWORD_HASH` | `pbkdf2_sha256$100000$...` | `node tools/hash-admin-password.mjs` |
| `COOKIE_SECRET` | 32+ random characters | `openssl rand -base64 48` |
| `TURNSTILE_SECRET` | Turnstile secret key | Cloudflare, Turnstile |
| `TURNSTILE_SITE_KEY` ⚑ | Turnstile site key (public) | Cloudflare, Turnstile |
| `SITE_URL` | `https://heat-check-a9b.pages.dev` now, the .app/.dev domain later | `wrangler.toml` `[vars]` |
| `RATE_KV` ⚑ | KV namespace **binding** (not a variable) | `wrangler.toml` `[[kv_namespaces]]` |
| `CONTACT_EMAIL` ⚑ | optional plain variable, shown on legal pages, profile and receipts | Pages build variable |

⚑ = not in the original list, needed by the design (see "Changes outside the brief").

## 3. Tiers, payments, admin: how it behaves

- **Guest** (not signed in): 5 Flirty cards per game per day, no Spicy, no Hot, up to 4 players. Counters in localStorage.
- **Base** (signed in, free): 5 Flirty per game per day, then one free Hot card per game from `/api/taste`, then the game locks with a soft "Unlock more" sheet. Counters live on the server (`/api/flirty`).
- **Lite** (₹69, 1 hour): Flirty and Spicy unlimited, 3 Hot cards per game from `/api/hot`, the Velvet sounds and the Midnight look. Up to 4 players. At expiry the current card finishes, then Lite locks.
- **Premium** (₹99, one-time): everything, never expires. Unlimited players, saved names, every look.
- **Counters**: a quiet line above the card ("Flirty 3/5 · Hot 0/1" or "Hot 2/3"), hidden for Premium. Limits only show when the next card is asked for, never mid-card.
- **Sign-in**: email, Turnstile, then `/api/auth/otp` (rate limited) asks Supabase to email a code. On first login, preferences, stats and today's guest Flirty counts carry over.
- **Paywall**: Lite and Premium side by side. Prices and durations come from `lib/pricing.js` through `/api/config`; the app sends only the product name. Guests sign in first, then come back to the paywall.
- **Payment**: `/api/create-order`, Razorpay Checkout, `/api/verify-payment` (signature, confirm and capture, then `grant_purchase`). The webhook does the same thing. A payment id only ever grants once. Premium accounts can't buy Lite ("You already have Premium.").
- **Admin**: long-press the logo for 3 seconds. Password, then a 30-minute cookie. Panel: counts, grant Lite / Premium or revoke, game switches, Spicy and Hot card editor. Admin mode plays as Premium.

## 4. Setup checklist

### Supabase
1. Create a project (Mumbai, `ap-south-1`, is closest to your players).
2. SQL Editor: run the migration file, then `supabase/seed/premium_cards.sql`.
3. Authentication, Providers, Email: enable Email. Set **Email OTP length = 6** and expiry to 600 seconds.
4. Authentication, Email Templates: in **both** "Confirm signup" and "Magic Link", show the code: `Your Heat Check code is {{ .Token }}`. Without `{{ .Token }}`, people get a link instead of a code.
5. Authentication, SMTP: add a custom SMTP provider (Resend, Brevo, ZeptoMail, Amazon SES) on a domain you own. Supabase's built-in email only reaches your own team's addresses. Set "Minimum interval per user" to **30 seconds** so it matches the app's resend timer.
6. Authentication, Rate Limits: all codes are requested from Cloudflare's servers, so raise "Sign-ups and sign-ins" per IP (for example to 300 per 5 minutes). The app's own per-email and per-IP limits do that job instead.
7. Authentication, URL Configuration: Site URL = your `SITE_URL`.
8. Copy the URL, anon key and service_role key into Cloudflare.
9. After your first sign-in, make yourself admin:
   `update public.profiles set role = 'admin' where lower(email) = 'you@example.com';`

### Razorpay (test mode first)
1. Settings, API Keys: generate test keys, put them in `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
2. Settings, Webhooks: add `https://<SITE_URL host>/api/razorpay-webhook`, set a secret (put it in `RAZORPAY_WEBHOOK_SECRET`), and tick `payment.captured`, `payment.authorized`, `payment.failed`, `order.paid`.
3. Settings, Payment Capture: Automatic (the server also captures if needed).
4. For live mode: finish KYC, add the website with the Privacy, Terms, Refund and Contact details, then swap to live keys and a live webhook.

### Cloudflare
1. Turnstile: add a widget (Managed), hostnames `heat-check-a9b.pages.dev` (and the custom domain later). Copy both keys.
2. KV: `npx wrangler kv namespace create RATE_KV`, paste the id into `wrangler.toml` and remove the `#` on those three lines. (Without it, sign-in and admin return "not switched on yet": rate limits fail closed.)
3. Pages: Create, Connect to Git, pick `velvetthunder15/heat-check`, branch `main`. Framework preset: None. Build command: `node tools/build.mjs`. Output directory: `dist`.
4. Add the secrets from section 2 to Production and Preview, then redeploy.
5. If the project name isn't free and you get a different `*.pages.dev` address, change `SITE_URL` in `wrangler.toml`.
6. When the custom domain is on Cloudflare: add it under Pages, Custom domains; change `SITE_URL`; add a WAF rate-limiting rule for paths starting `/api/auth/` and `/api/admin/` (for example 20 requests a minute per IP, block); add a Bulk Redirect from the pages.dev address to the domain; update the Supabase Site URL, the Razorpay webhook URL and the Turnstile hostnames.

### Local
`cp .dev.vars.example .dev.vars`, fill it in, then `npm run dev` (Wrangler Pages dev on port 8788).

## 5. How to test each flow

Use Razorpay test mode, Turnstile test keys if you like (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`), and a private window.

1. **Guest**: pass the 18+ gate. Hold the ring: one turn Flirty; the second turn shakes ("Spicy needs Lite or Premium."), keep holding and the third says "Sign in for a free Hot card". Play a game: the 6th card opens the "Unlock more" sheet.
2. **Base + free Hot card**: signed in, play 5 Flirty cards in one game: the next request offers "Use your free Hot card?". After it, "Unlock more". The counter reads "Flirty 5/5 · Hot 1/1". `/api/taste` again answers 403.
3. **Timer and Hollywood / Bollywood**: settings, pick 15s: Strip Charades, Would You Rather, Most Likely, Two Truths and the Red Flag debate all count from 15. Turn Hollywood off: no Hollywood charades or famous couples on the next card. The last toggle can't be turned off.
4. **Email OTP**: profile, Sign in, email, wait for the check, "Email me a code". Wrong code: clear error. Resend unlocks after 30 seconds.
5. **Lite purchase**: tap a lock, choose Lite, pay with test netbanking (Success) or the Indian test card `4100 2800 0000 1007`. The banner shows "Lite · 60 min left", Spicy opens, Hot shows "Hot 1/3" and stops after 3 per game. `purchases.status = 'paid'`, `premium_until` about an hour ahead.
6. **Lite expiry**: `update profiles set premium_until = now() + interval '6 minutes' where email = '...'`: the 5-minute chip shows. Set it to `now() + interval '30 seconds'` in a game: the current card finishes, the next is Flirty and "Lite’s up" opens.
7. **Premium**: buy Premium. The banner reads "Premium · Lifetime", `plan = 'premium'`, `premium_until` null. Lite can no longer be bought.
8. **Idempotency**: in Razorpay, Webhooks, resend the `payment.captured` event. Nothing changes and no second grant happens.
9. **Restore**: sign out, clear site data, sign in with the same email: the plan and its cards come back.
10. **Admin unlock**: make yourself admin (step 9 above). Long-press the logo 3 seconds, enter the password. Panel opens with counts. Grant Lite to a test email, switch a game off (it disappears for everyone on next load), add a Spicy or Hot card. Wrong password 5 times locks unlock for an hour.
11. **Export and delete**: profile, Export my data downloads JSON. Delete account sends a code; after confirming, the profile row is gone and the purchase rows remain with `user_id` null.

## 6. Changes outside the brief

- **Security headers**: CSP now allows Supabase, Razorpay and Turnstile; `Cross-Origin-Opener-Policy` is `same-origin-allow-popups` (Razorpay's UPI and bank pages open popups); `Permissions-Policy` allows `payment` for Razorpay only.
- **Extra env**: `SUPABASE_ANON_KEY`, `TURNSTILE_SITE_KEY`, the `RATE_KV` binding and optional `CONTACT_EMAIL`.
- **Schema**: `premium_cards` has `extra` (the games need options, zones and categories), `active` and timestamps; `games` and `admin_actions` tables added; purchases has `currency`, `paid_at`, `anonymized_at`.
- **OTP sending** goes through `/api/auth/otp` so Turnstile and the limits can't be skipped. It calls the same Supabase endpoint `signInWithOtp` uses. Verifying uses `supabase.auth.verifyOtp` in the browser.
- **Flow**: the intro (hold-to-heat ring, game stack) is the new home. The consent screen now shows once per session before the first game instead of on every launch.
- **"Themes and sounds" for Pro**: the Velvet sound pack and Midnight and Neon home looks, built from existing palettes. All current game themes and sounds stay free.
- **Saved names (Pro)**: a synced name list with tap-to-add in setup. Names still stay on the device for everyone, as before.
- **Bug fix**: motion sounds (soft tick, whoosh) never played because the sound module wasn't reachable from the motion layer. They now play when sound is on.
- **Free taste in Red Flag**: the free card is a Flags scenario, so Rate mode doesn't offer a taste.
- **PBKDF2**: 100,000 iterations, the Cloudflare Workers maximum.
- **Repo layout**: `public/`, `functions/`, `lib/`, `supabase/`, `tools/`, with a small build step for `SITE_URL`. `vercel.json` keeps the current Vercel site running in guest mode until Cloudflare takes over.

## 7. v11 changes outside the brief

- **Red Flag "Rate" mode** now rates the same scenario 1 to 10 (how big a red flag) instead of drawing a separate "rate your partner" card, so the toggle can keep one question. The separate rate deck is gone.
- **Strip Charades setting**: the "strip on/off" toggle is gone (a flop is always one item of clothing). "Layers each" stays.
- **Groups penalty mode** is its own setting (sips or no alcohol); dares-only isn't offered to groups.
- **Two Truths** is renamed "Two Truths & a Lie" (it was "& a Spicy Lie").
- **Pro taste cards**: Pro accounts don't see the 8 taste cards in their deck (RLS hides them); they still get every other Lv3 card.
- **Performance**: the hold ring updates one CSS variable on the hero instead of on the whole app, which took ring frames from ~33 ms to ~17 ms under 6x CPU throttling.
- **themes.css** still contains Body Part selectors because that file is never edited; nothing uses them.

## 8. v12 changes outside the brief

- **Flirty limits reset daily** (midnight IST). The brief says "per game" without a period; a lifetime cap would lock free players out of a game forever. One constant (`HC.LIMIT_RESET` / `lib/limits.js`).
- **Flirty text stays in the bundle** so guests can play offline. The Base counter is server-side, but the cards themselves are free content. Spicy and Hot never ship in the bundle.
- **Lite Hot counters reset with each new Lite pass** (buying again while active just adds an hour).
- **Lite gets the Velvet sounds and the Midnight look**; Premium gets every look (Neon too) and saved names.
- **Timers added to Would You Rather and Most Likely**: a talk clock that starts the vote when it runs out (tap to vote early). Before, those two had no clock.
- **Strip Charades flops add the card's penalty points** to the scoreboard (so End Night totals include them), as well as one item of clothing.
- **In-game heat selector**: tap the heat chip in a game to change heat; locked levels show the same lock messages as the ring.
- **"New night" reset button** on home is replaced by End Night (which resets after the summary).
- **Swipe-to-skip** on a card now uses Chicken Out.
- **Purchase history**: the old test purchases were relabelled (`pass` -> `lite`, `lifetime` -> `premium`) by the migration.
- **Old tests**: `test/t2.js`, `t3.js`, `fn.mjs`, `sql/t11.mjs` are retired; `test/t4.js`, `fn12.mjs`, `sql/t12.mjs` replace them.
- **base.css and themes.css** still contain dead Pause and Body Part selectors because those files are never edited; nothing uses them.
