# v20.7 (hc-v52, Oct 17 2026): hard paywall, Google sign-in, new headline

## Tiers (lib/limits.js + public/js/config.js)
- guest: 10 Flirty per game per day (unchanged).
- base (signed in, free): unlimited Flirty. No free Spicy or HOT card any more (taste/spicyTaste 0).
- lite (Rs69, 60 min): unlimited Flirty + Spicy, NO HOT (hot 0). Core.levelCap/tierMax = 2 for Lite.
- premium: everything.
- The Lite-HOT allowance and Base taste code paths stay in place, switched off by the limits (set lite.hot > 0 to bring them back).

## Server
- /api/flirty: Base unlimited -> returns { unlimited: true } without touching the DB.
- /api/taste: 403 for both heats (no free cards).
- /api/hot: Lite gets 403 locked "HOT is in Premium." (claim_hot p_limit 0). RLS already kept HOT rows Premium-only. No migration.

## Client copy
- Guest offer everywhere: "Sign in for unlimited Flirty" (tiles, paywall, profile, limit sheet). Guest perks: Unlimited Flirty cards, Sync, Buy.
- Locks: Spicy "Spicy needs Lite or Premium."; HOT "HOT is in Premium." (guest, Base, Lite). Base tile "🔒 Spicy + HOT locked", Lite tile "🔒 HOT in Premium".
- Base/Lite have no limit line. Profile "Free cards" section hidden. Lite plan card: Unlimited Flirty + Spicy, Velvet sound pack, dimmed Unlimited HOT.

## Sign in (account-ui.js signIn, account.js Auth.google/oauthReturn)
- Sheet title "Sign in". White "Continue with Google" button (four-colour G), divider "or use your email", then the email code flow.
- Google button shows only when Supabase /auth/v1/settings reports external.google = true.
- supabase-js flowType pkce; redirect to /?auth=google, code exchanged in Auth.init, URL cleaned; paywall intent rides sessionStorage hc_after_auth.
- Google OAuth client created in Google Cloud (project Heat Check); client secret in Hark vault. Provider must be switched on in Supabase dashboard (Auth > Providers > Google).

## Home
- Headline is "hold to heat check", lowercase, the old soft-word face and colour, no highlighted word (Intro.heading).

## Tests
- fn12.mjs ALL PASSED (v20.7 expectations). t4.js updated (base/guest/lite rewritten, legacy Lite-HOT block runs with lite.hot=5). pw/v207.mjs screenshots -> shots207/.
