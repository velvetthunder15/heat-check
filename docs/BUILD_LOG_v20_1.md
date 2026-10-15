# v20.1 (hc-v46 / ?v=46), Oct 15 2026: keep the card on re-entry, Red Flag buttons, NHIE rules

## Requests (Chirag, verbatim)
1. "when u enter any game and exit it accidentally the card shouldn't reset. pls make sure it's the same card."
2. "red flag green flag: white normal font looks weird on the red flag and green flag buttons. fix it to match the vibe."
3. "never have I ever: if both have done it then no penalty. also no drink penalty here, only dare as never have I ever requires u to drink anyway."

## 1. Same card on re-entry (core.js, games.js, app.js)
- `Core.S.held[game] = { card, lvl, gen, st }` in hc_state (debounced save, flushed on hide). `lvl` = heat level the card was
  dealt at (S.heat capped by tier: Lite/Premium 3, else 1), `gen` = `S.heatGen`, bumped by every heat change (setHeat from the
  ring / chips / heat sheet / "Start at Spicy", resetHeat, auto-ramp). `st` = the game's in-progress state.
- `App.play` sets `Core.restoreFor = id`; the game's first `deal()` calls `Core.restoreHeld(game)`. Valid card: same game, its heat
  still allowed (Spicy needs Lite/Premium, HOT needs Lite/Premium or is the Base account's free taste card), origin still on,
  level <= tier max, and (same level OR no heat change since). Then: no `Core.next`, no Flirty count, no /api/flirty, no
  /api/hot, no taste claim, no hotGate, no `show()` (tonight's card count / heat mix not counted twice). Card text is added to the
  in-memory used set and `recent`, `cardHeat` set, taste card re-marks `Taste.showing`. A new session resets S.heat to Flirty
  without bumping `gen`, so the card's level is put back.
- Any other `deal()` (Next, answers, Chicken Out, WYR mode switch) drops the held card first, then deals and holds the new one.
  Limit reached: nothing held, re-entry shows the lock sheet again (nothing spent). HOT card arriving after the player left:
  held (already counted).
- Cleared by End night (`held: {}`), sign-out (`wipeDevice` removes hc_state). Invalid held card (e.g. Spicy after Lite expired)
  is dropped and a card is dealt normally.
- In-progress state kept: Red Flag `mode`, Flags `picks` (by player, with the pair's names; roster change starts clean) -> first
  player locked + second player's turn, or the revealed result (same page / debate) without a new countdown; Rate `score` /
  `guess`. NHIE tilted cups + tallies (with the roster's names). WYR / Most Likely / Two Truths vote mode. Charades, Hot Seat,
  Swap: the card (turn already persists in S.turn).

## 2. Red Flag / Green Flag buttons (games.js markup, v15.css)
Before: `font: 26px "Anton"` (no @font-face anywhere, so a regular-weight fallback) in flat #fff, emoji icon above (blank where
there is no emoji font). After: `.fb-txt` 900 italic, -.03em, clamp(23px, 6.6vw, 30px), "Red Flag" / "Green Flag", light
gradient fill (white to pale pink / mint) with `drop-shadow(0 2px 0 deep)` + soft glow; `.fb-ico` = 40x30 SVG pennant (the
banner's CLOTH path) in cream with a gold pole; button gloss (top highlight) and inset edge. Size (92px tall), grid and
desktop hover unchanged. Static, no animation. Shots: shots201/rfbtn_{390,1440}_{ember,midnight,neon}.png.

## 3. Never Have I Ever (games.js, core.js, app.js)
Before: tap a cup = tilted (+points float). Next: any tilted -> `Core.penalty` for them in the night's mode: Drinks "Take N
sips" + optional dare swap + drink note; Water sips of water; Dares the dare. None tilted -> "Saints" toast.
After: tap a cup = you've done it and you sip (float says "sip"). Next: everyone tilted -> no penalty, no points, toast "You all
have. Nobody takes a dare."; some tilted -> `Core.penalty({ ..., mode: 'dare' })`: the card's dare only, whatever the Drinks /
Water / Dares setting, no sips line, no drink note; points land on Done as before (night stats / awards read the same points).
None tilted -> Saints. Copy: "Done it? Tap your cup and sip. Unless you all have, the guilty take a dare." Setup note (couples,
general settings or opening NHIE): "Never Have I Ever always plays dares: the sipping is already the game." Other games keep
their Drinks / Water / Dares behaviour.

## Tests
- t4.js 188 ok (24 new v20.1 checks: guest / base / base taste / lite / premium re-entry, reload, heat change, mode switch, End
  night, Lite expired, NHIE all-have, NHIE dare-only in Drinks and Water, other games keep sips). fn12 65, sql/t12 47, audio16 69.
- pw/v201.mjs (390 touch + 1440 mouse): flag buttons 900 italic and fit in Ember / Midnight / Neon; back chevron, browser back
  and reload keep the card, lock-in and Flirty count (guest, premium); NHIE both-have no dialog, one-has dare-only. 22 ok, no
  page errors.

## Files
public/js/core.js, games.js, app.js; public/css/v15.css (appended); sw.js + 6 html (?v=46, hc-v46); test/t4.js; pw/v201.mjs.
