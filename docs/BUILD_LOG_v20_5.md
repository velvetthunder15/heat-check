# v20.5 (hc-v50 / ?v=50), Oct 16 2026: free Spicy card + card counts on the plan sheet

## Why
Chirag: "show 'sign in for free spicy card' now for guest accounts. 10 flirty remain free to use for guests. 10 flirty, 1 spicy,
1 hot for signed in users. everything else remains the same for lite and premium. also show total number of cards we have in
bracket in the plan buy section (next to unlimited)".

## What shipped
### Limits (lib/limits.js and public/js/config.js, kept identical; the build fails if they differ)
- guest `{ flirty: 10, spicy: 0, hot: 0, taste: 0, spicyTaste: 0 }` (unchanged limits)
- base `{ flirty: 10, spicy: 0, hot: 0, taste: 1, spicyTaste: 1 }`: 10 Flirty per game per day, 1 free Spicy card per game (new), 1 free HOT card per game
- lite / premium: unchanged (`spicyTaste: 0`)

### Base: one free Spicy card per game, built like the free HOT card
- Server: `POST /api/taste { game, heat: 2 }` calls the new `claim_spicy_taste()` (service role only): locks the profile row, checks
  `profiles.spicy_taste_used`, marks it and returns the game's Spicy taste card in one call. Second call for the same game: 403
  `taste_used` "This game’s free Spicy card is already used.". No heat / heat 3 = the free HOT card as before. heat other than 2/3 = 400.
- Spicy never ships in the bundle: the free Spicy card comes only from the API, held in memory for one draw (Taste._card).
- Claimed on deal, not on tile tap: ring lock "Use your free Spicy card?" + "Use it" arms it (`Taste.armed = 2`), picking a game shows the
  same "Deal it" gate as the free HOT card ("First card is Spicy", "Your free Spicy card is only used once it’s dealt.", "Save it, start at
  Flirty"); only "Deal it" calls /api/taste. In-game heat sheet, limit sheet ("Play my free Spicy card") and paywall ("Or use your free
  Spicy card") claim it directly, like the HOT taste.
- v20.1 re-entry: the free Spicy card comes back on re-entry without a second claim (heldOk allows a taste Spicy card for Base).
- HUD line: "Flirty 3/10 · Spicy 0/1 · HOT 0/1". Tiles: "1 free Spicy + 1 free HOT", then "1 free Spicy card" / "1 free HOT card" as each is used,
  then "🔒 HOT locked". Spicy lock once used: "Spicy needs Lite or Premium.".
- Limit sheet after 10 Flirty: "Use a free card?" + "That’s 10 Flirty cards in X today. This game’s free Spicy and HOT cards are still waiting."
  with "Play my free Spicy card" and "Play my free HOT card"; after both: "Unlock more".
- Profile: the Base section "Free HOT cards" is now "Free cards": one tile per game with "Spicy · Free/Used" and "HOT · Free/Used",
  note "N of 8 free Spicy cards and N of 8 free HOT cards left."
- Small fix found on the way: the Deal-it gate's skip button for a Base free card said "Save it, start at Spicy" (Base can't play Spicy);
  it now names the level the account can play ("start at Flirty").

### Guests: "Sign in for a free Spicy card"
- Header sign-in tab: "Sign in for a free Spicy card" (same pill, height and right edge under the circles, grows left; below 360px it
  shows "Sign in" only, aria-label keeps the full offer). Desktop header slot widened for it.
- Spicy lock (ring + heat chips): "Sign in for a free Spicy card" + Sign in. HOT lock: "Sign in for a free Spicy card and a free HOT card".
- Tiles: "Sign in for a free Spicy card" (was "🔒 HOT locked"; only when accounts are on).
- Limit sheet: "That’s 10 Flirty cards in X today. Sign in for a free Spicy card, or unlock everything." + button "Sign in for a free Spicy card".
- Paywall: new ghost button "Sign in for a free Spicy card". Guest profile: button "Sign in for a free Spicy card", perks
  "Free Spicy card per game", "Free HOT card per game", "Sync your progress", "Buy Lite or Premium".
- Sign-in sheet reason from those prompts: "Sign in and every game gives you a free Spicy card and a free HOT card. No passwords, just a code."
- Guest limits unchanged (10 Flirty per game per day, local counters).

### Plan sheet card counts
- Lite: "Unlimited Flirty + Spicy (470 cards)" (was "Flirty and Spicy, unlimited"), dimmed "Unlimited HOT (227 cards)".
  Premium: "Unlimited HOT, every game (227 cards)". The bracket stays on one line (`.pc-n`, nowrap), en-IN grouping (1,250).
- Numbers: Flirty = the bundle (235), stamped into dist/js/config.js `HC.CARD_COUNTS` by tools/build.mjs (tools/cards.mjs --counts);
  Spicy / HOT = live `card_counts()` from premium_cards through `/api/config` `cards: { spicy, hot }` (cached 10 min per isolate,
  null if the DB is down, then the build-time numbers from content/ are used). Spicy = every active Spicy card (235, Lite reads all),
  HOT = active HOT minus the 8 HOT taste cards (227, what Premium reads). A count of 0 hides the bracket.

### Database (migration `supabase/migrations/20261016120000_v20_5_free_spicy.sql`, applied live before the deploy)
- `profiles.spicy_taste_used jsonb not null default '{}'` (object check); clients read it, only the service role writes it.
- 8 existing Spicy cards flagged `is_taste` (one per game; charades uses a Global-origin title). Same flags in content/*.json
  (tools/cards.mjs now requires exactly one Spicy and one HOT taste card per game); seed regenerated.
- RLS "premium_cards: by tier": Lite and Premium still read every Spicy card (Spicy taste cards included), so their decks are unchanged
  (235 Spicy); HOT taste cards stay hidden from everyone, as before; Base reads nothing.
- `claim_spicy_taste(user, game, origins)` and `card_counts()`: security definer, service role only.
- Admin: the card editor shows the taste switch for Spicy too; `/api/admin/cards?active=1` (admin plays as Premium) includes Spicy taste cards.
- export-data includes `spicy_taste_used`. terms.html: "Signed-in accounts also get one free level 2 (Spicy) card and one free level 3 (HOT) card per game."

### Analytics (v20.4)
- Unchanged and working: a Base free Spicy deal sends `card_dealt` with `h: 2, tier: base` (heat 2 is valid in analytics_events).

### Release
- sw.js VERSION hc-v50; every ?v= 49 -> 50 (index, 404, 500, admin, privacy, terms, refund, sw.js). New `css/v205.css` (loaded last) in index.html
  and the SW SHELL. base.css / themes.css untouched; sheets still inside #app.

## Account / data changes (Supabase cpxfmecrqxlfzcldolcj)
- New column profiles.spicy_taste_used (all 3 existing profiles `{}`); 8 premium_cards rows set is_taste = true (heat 2); policy replaced;
  2 new functions. No plan, role or purchase changes.

## Tests
- t4.js 220 ok (19 new: guest tab/tiles/ring/limit/paywall/profile copy, base tiles, ring Spicy lock, counter, limit sheet with both free
  cards, free Spicy via /api/taste heat 2, armed Spicy + Deal it gate, re-entry no second claim, heat sheet after use, per-game tags,
  plan sheet counts 1,469 / 227 and hidden bracket when unknown, dist CARD_COUNTS stamp, content taste rule, hc-v50 + v205.css in shell).
- fn12.mjs 104 ok (9 new: /api/config cards, isolate cache, counts down -> null + 200, taste heat 2 401/400/200/403, admin Spicy taste
  flag, admin active=1 query).
- sql/t12.mjs 86 ok (19 new: migration idempotent, 8 Spicy taste flagged, HOT taste unchanged, new profile default, object check,
  card_counts 235/227, Base 0 rows, users can't write spicy_taste_used / call claim_spicy_taste / card_counts, Lite 235 Spicy incl.
  8 taste + 0 HOT, Premium 235 + 227 with HOT taste hidden, first/second/parallel claims, tracked apart from the HOT taste, no card ->
  nothing burned).
- pw/admin204.mjs 18 ok, pw/kb20.mjs 39 ok, pw/v201.mjs flow ok (no regressions).
- pw/v205.mjs 28 ok at 390 and 1440 (guest tab fits, Spicy lock, limit sheet, base tiles fit, Spicy lock, gate, Deal it -> heat 2,
  profile, plan rows with counts fit, no overflow, no errors); pw/narrow205.mjs 320 / 360 / 412 tab clears logo and circles.
- Shots: /workspace/work/heatcheck/shots205/ (before: shots205_before/).
- Build: `CONTACT_EMAIL=support@playheatcheck.app node tools/build.mjs` (HOT lint ok, cards ok, plan counts {flirty 235, spicy 235, hot 227}).
  Backup of the v20.4 source: /workspace/work/heatcheck/repo_v49_backup_freespicy.

## Deploy
- See HISTORY.md v20.5 entry for the deployment id and live checks.
