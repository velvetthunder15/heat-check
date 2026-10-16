# v20.6 (hc-v51 / ?v=51), Oct 17 2026: "Sign in" pill back to plain, offer moves to the game tiles

## Why
Chirag: "let the sign in pill stay sign in only. write sign in for free spicy/hot cards on game pills."

## What shipped (guest view only)
- Header sign-in tab (`.signin-tab`): text "Sign in" at every width, aria-label "Sign in" (v20.5 had "Sign in for a free Spicy card").
  The v20.5 widening is gone: the pill is back to the v15 original (148 x 30, right edge under the circles; v15.css untouched), and the
  desktop guest slot is back to desktop.css's 162px (v20.5 had set 272px). Checked 320 / 360 / 412 (148px, clears logo and circles) and 1440.
- Game tiles (guest tag on every tile, only when accounts are on): "Sign in for free Spicy/HOT cards" (was "Sign in for a free Spicy card").
  Written as `Sign in for free ${HEAT[2].name}/${HOT} cards` in intro.js (HOT through HC.HOT, HOT lint ok). The tag shows uppercase
  (tiers.css), so on screen it reads "SIGN IN FOR FREE SPICY/HOT CARDS". New class `t-signin` on that tag: it may wrap inside the tile
  (max-width 100%, line-height 1.25) instead of overflowing; below 360px it is 10.5px with .03em tracking so it stays on one line at 320.
  One line at 320 / 360 / 390 / 412 and on the 1440 desktop grid.
- Unchanged: Spicy / HOT ring locks, limit sheet, paywall, sign-in sheet, guest profile, all Base copy, limits, server, DB.

## Files
- public/js/intro.js (tab markup, guest tile tag), public/css/v205.css (removed the v20.5 tab widening + 272px slot, added the `.t-signin` rules).
- Version: sw.js VERSION hc-v51; every ?v= 50 -> 51 (index, 404, 500, admin, privacy, terms, refund, sw.js). No new CSS file.
- base.css / themes.css untouched. No em dashes.

## Tests
- t4.js 220 ok (guest tile tag + plain "Sign in" tab expectations updated, hc-v51 / ?v=51 shell checks).
- fn12.mjs 104 ok. sql/t12.mjs 86 ok. pw/admin204.mjs 18 ok.
- pw/v205.mjs 32 ok at 390 and 1440 (tab "Sign in", aria-label, 148px on phones; guest tile tags fit inside every tile; rest of v20.5 unchanged).
- pw/narrow205.mjs 6 ok: 320 / 360 / 412 tab "Sign in" 148px, no logo/circle overlap, all tile tags fit, no horizontal overflow.
- Shots: /workspace/work/heatcheck/shots206/ (guest_home_{360,390,1440}.png, guest_home_tiles_{360,390,1440}.png, guest_tiles_{320,360,412}.png,
  guest_head_{320,360,412}.png, plus the v205.mjs set). New helper pw/shot206.mjs.
- Build: `CONTACT_EMAIL=support@playheatcheck.app node tools/build.mjs` (HOT lint ok, cards ok).
- Backup of the v20.5 source: /workspace/work/heatcheck/repo_v50_backup_signinpill.

## Deploy
- CF production auto deploys off + Vercel commandForIgnoringBuildStep "exit 0", tools/sync.py, both restored, then one
  POST /pages/projects/heat-check/deployments branch=main. Result: see HISTORY.
