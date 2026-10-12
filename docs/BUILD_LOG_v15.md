# Build log v15 (Oct 12 2026, hc-v31 / ?v=31)

Looks (Midnight + Neon Premium only, redesigned), guest header + locked settings, new limits
(guest/Base 10 Flirty per game per day, Lite 5 HOT per game).

## Build (`node tools/build.mjs`)
```
HOT lint ok (49 files)
cards ok: 235 client (Flirty), 470 Spicy/Hot server-only [redflag 90, nhie 96, charades 102, wyr 75, hotseat 75, swap 75, mostlikely 96, twotruths 96]
built dist/ for https://heat-check-a9b.pages.dev (7 files stamped, no CONTACT_EMAIL yet)
```

## Tests
- `node test/t4.js` (jsdom, 4 tiers): 153 checks
```
ok   summary: cards per game, points per player, couple total, highest heat
ok   taunt from the 11-20 range for 13 points
ok   3 taunts per range, from config
ok   after End Night: scores and heat reset
ok   signed in: summary saved to the profile (save_stats)
ok   share button present

ALL v12 QA PASSED
```
- `node test/fn12.mjs` (Pages Functions, mocked backends)
```
missing env RAZORPAY_KEY_SECRET
ok   missing secret -> 503 not_configured

ALL PASSED
```
- `node test/sql/t12.mjs` (PGlite, all migrations + seed)
```
ok   admin stats: lite/premium keys
ok   is_pro and add_tastes are gone

ALL SQL PASSED
```

## Perf (pw/perf14.mjs, 6x CPU, 360x640, games redflag/nhie/wyr; looks via pw/perf15look.mjs LOOK=...)
final2 = v14 baseline (hc-v29), v15 = guest Ember, m6 = Premium Midnight, n6 = Premium Neon.
```
final2         open 51.0fps gt50=10 worst=217 cls=0 | back 48.7fps gt50=9 worst=167 cls=0 | scroll 52.3 | ring 50.9
v15            open 53.2fps gt50=7 worst=183 cls=0 | back 50.0fps gt50=9 worst=167 cls=0 | scroll 52 | ring 53.6
m6             open 52.3fps gt50=7 worst=200 cls=0 | back 47.0fps gt50=9 worst=217 cls=0 | scroll 55.5 | ring 56.3
n6             open 52.8fps gt50=6 worst=217 cls=0 | back 47.0fps gt50=9 worst=200 cls=0 | scroll 55.9 | ring 56.5
```
Found and fixed during the pass: the old v12 couples-only look backgrounds in intro.css out-ranked the
new rule, painting a page-tall gradient that cost ~10fps on back-to-home (looks now use [data-side] and
paint their sky on the fixed #amb layer); the Midnight star field moved from 20 CSS radial gradients to
one tiled SVG on a promoted layer.

## Screenshots (390x844, local dist): /workspace/work/heatcheck/shots15/
guest_home, guest_header_crop, guest_settings_locked(_card), base_header_crop, base_settings_open,
midnight_/neon_ home, home_hot, home_groups, tiles, game_redflag, game_wyr, lite_profile_looks.
Guest vs signed-in layout: side switch top 200px and hero top 262px in both (no shift).

## DB
No migration: bump_flirty / sync_flirty / claim_hot take the limit as p_limit from lib/limits.js.
