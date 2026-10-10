# Heat Check: setup and test guide (v11)

Accounts, paywall, admin mode and the new intro. Until the keys below are added, the app runs in
guest mode: everything free works, and sign-in and Pro show "switching on soon".

---

## 1. Database (Supabase)

Run in this order: `supabase/migrations/20261010000000_heat_check_accounts.sql`, `supabase/migrations/20261010180000_v11_heat_groups.sql`, then `supabase/seed/premium_cards.sql`. All three are safe to re-run.

| Object | Notes |
|---|---|
| `profiles` | `id` (= `auth.users.id`), `email`, `plan` (`free`/`pass`/`lifetime`), `premium_until`, `role` (`user`/`admin`), `created_at`, `taste_used`, `preferences`, `stats`. Created by a trigger on signup. |
| `purchases` | `id`, `user_id` (set to null when an account is deleted), `product`, `razorpay_order_id` (unique), `razorpay_payment_id` (unique), `amount_inr`, `currency`, `status` (`created`/`paid`/`failed`), `created_at`, `paid_at`, `anonymized_at`. |
| `premium_cards` | `game`, `heat` (3 only), `text`, `optional_dare`, `extra` (jsonb: Would You Rather options, charades category + origin), `is_taste`, `active`, timestamps. Pro reads non-taste rows; taste rows are only served by `/api/taste`. |
| `games` | One row per game, `mode` (`couples` / `group`), `enabled` (admin switch). Public read. |
| `admin_actions` | Audit log of admin grants, card edits and game switches. No client access. |
| `is_pro(uid)` | `plan = 'lifetime' OR premium_until > now()`. |
| `claim_taste(user, game)` | Service role only. Locks the profile row, checks `taste_used`, marks it, returns one taste card. Returns nothing if already used. |
| `grant_purchase(...)` | Service role only. Locks the purchase row, grants once per order, checks the amount, extends an active pass by 4 hours, never downgrades Lifetime. |
| `admin_set_entitlement`, `admin_stats`, `anonymize_user_purchases` | Service role only. |

RLS is on for every table. Users read only their own profile and purchases, can update only
`preferences` and `stats` (column grants), and can read `premium_cards` only while `is_pro()` is true.
`plan`, `premium_until`, `role` and `taste_used` can't be written by clients.

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
| `SITE_URL` | `https://heat-check.pages.dev` now, the .app/.dev domain later | `wrangler.toml` `[vars]` |
| `RATE_KV` ⚑ | KV namespace **binding** (not a variable) | `wrangler.toml` `[[kv_namespaces]]` |
| `CONTACT_EMAIL` ⚑ | optional plain variable, shown on legal pages, profile and receipts | Pages build variable |

⚑ = not in the original list, needed by the design (see "Changes outside the brief").

## 3. Accounts, payments, admin: how it behaves

- **Guests** play every game at Lv1 and Lv2, up to 4 players. No Hot cards of any kind.
- **Signed-in free**: one free Hot card per game from `/api/taste`. It plays as exactly one card, then heat drops back to Spicy everywhere.
- **Sign-in**: email, Turnstile, then `/api/auth/otp` (rate limited) asks Supabase to email a code. The 6 boxes verify with `supabase.auth.verifyOtp`. On first login, guest tastes (union), preferences and stats merge into the profile.
- **Paywall**: Date Night Pass (4 hours, stacks) and Pro Lifetime. Prices come from `lib/pricing.js` through `/api/config`. Guests are sent to sign-in first, then back to the paywall.
- **Payment**: `/api/create-order`, Razorpay Checkout (UPI block first), `/api/verify-payment` (signature, then confirm and capture with Razorpay, then `grant_purchase`). The webhook does the same thing, so a closed tab still unlocks. Lv3 cards load into memory, no reload.
- **Pass**: countdown chip, 15-minute heads-up, expiry screen. At expiry the current card finishes, then Lv3 locks and the in-memory cards are cleared.
- **Admin**: long-press the logo for 3 seconds (does nothing for non-admins). Password, then a 30-minute HttpOnly, Secure, SameSite=Strict cookie. Panel: counts, grant or revoke by email, game switches, Lv3 card editor.

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
1. Turnstile: add a widget (Managed), hostnames `heat-check.pages.dev` (and the custom domain later). Copy both keys.
2. KV: `npx wrangler kv namespace create RATE_KV`, paste the id into `wrangler.toml` and remove the `#` on those three lines. (Without it, sign-in and admin return "not switched on yet": rate limits fail closed.)
3. Pages: Create, Connect to Git, pick `velvetthunder15/heat-check`, branch `main`. Framework preset: None. Build command: `node tools/build.mjs`. Output directory: `dist`.
4. Add the secrets from section 2 to Production and Preview, then redeploy.
5. If the project name isn't free and you get a different `*.pages.dev` address, change `SITE_URL` in `wrangler.toml`.
6. When the custom domain is on Cloudflare: add it under Pages, Custom domains; change `SITE_URL`; add a WAF rate-limiting rule for paths starting `/api/auth/` and `/api/admin/` (for example 20 requests a minute per IP, block); add a Bulk Redirect from the pages.dev address to the domain; update the Supabase Site URL, the Razorpay webhook URL and the Turnstile hostnames.

### Local
`cp .dev.vars.example .dev.vars`, fill it in, then `npm run dev` (Wrangler Pages dev on port 8788).

## 5. How to test each flow

Use Razorpay test mode, Turnstile test keys if you like (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`), and a private window.

1. **Guest**: pass the 18+ gate. Hold the ring: one turn Flirty, two Spicy, the third shakes and says "Sign in to try Hot". Release: Spicy is locked in. Tap ↺: back to Flirty. Play a game: every 5 cards heat rises once, stops at Spicy, and a "Hot is locked" chip shows once. Adding a 3rd couple (or 5th group player) opens the paywall.
2. **Free Hot card**: signed in, hold to the third turn, tap "Use your free Hot card?", pick a game. The first card is Hot; the next one is Spicy with "Still at Spicy. Hot is locked." Reload, re-hold, or call `/api/taste` again: still Spicy, the API answers 403.
3. **Groups**: switch to Groups, add 3+ players, play Most Likely (point or secret vote) and Two Truths (60s clock, secret or fingers vote).
4. **Email OTP**: profile chip, Sign in, email, wait for the check, "Email me a code". Try a wrong code (clear error), paste the right one (fills all 6). Resend unlocks after 30 seconds. The profile shows the free Hot card tracker.
5. **Pass purchase**: tap a Lv3 lock, choose Date Night Pass, pay with test UPI `success@razorpay` or card `4111 1111 1111 1111`. Success animation, Lv3 opens without a reload, countdown chip appears. In Supabase, `purchases.status = 'paid'` and `premium_until` is about 4 hours away.
6. **Pass expiry**: in SQL, `update profiles set premium_until = now() + interval '16 minutes' where email = '...'`, reopen the app: the 15-minute heads-up shows. Then set it to `now() + interval '30 seconds'` while in a game: the current card finishes, the next draw shows "Pass's up" and Lv3 locks.
7. **Lifetime**: buy Pro Lifetime. The pass option disappears, the profile shows Lifetime with the purchase date.
8. **Idempotency**: in Razorpay, Webhooks, resend the `payment.captured` event. `premium_until` doesn't move and no second grant happens.
9. **Restore**: sign out, clear site data, sign in with the same email: plan and Lv3 come back.
10. **Admin unlock**: make yourself admin (step 9 above). Long-press the logo 3 seconds, enter the password. Panel opens with counts. Grant a pass to a test email, switch a game off (it disappears for everyone on next load), add a Lv3 card. Wrong password 5 times locks unlock for an hour.
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
