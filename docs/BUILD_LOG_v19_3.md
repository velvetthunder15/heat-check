# v19.3 (hc-v43 / ?v=43), Oct 14 2026

## Requests (Chirag)
1. "match the font size of POISON to HOT in the main page", then corrected: do the opposite, scale HOT DOWN to POISON's current size; POISON unchanged.
2. "strip charades settings should not show up in the opening of games that are not strip charades".

## 1. HOT = POISON
- css/v15.css (appended): `#app .hero-title .ht-svg { height: clamp(35.77px, 11.208vw, 52.46px) }` (was clamp(54px, 17vw, 84px)). HOT text is font-size 104 in a 124-unit viewBox, so svg height = POISON font-size (.pk-big clamp(30px, 9.4vw, 44px)) x 124/104 gives the same cap height.
- `#app .hero-title .ht-hot { top: .55vw }`: the smaller centre-aligned svg sat ~2px above the How/is tonight baseline; now within ±1px.
- "How" / "is tonight?" sizes unchanged; heading still one line and centred (centre x = vw/2 at all widths). Gradients, wave, glow, per-look overrides untouched.
- Measured with pw/v193.mjs (ink diff with/without the glyph, wave/underline hidden, DSF 3), tallest ink column (cap height incl. O overshoot), px:

| width | HOT | POISON | diff |
|---|---|---|---|
| 320 | 22.7 | 22.7 | 0 |
| 360 | 25.7 | 25.7 | 0 |
| 390 | 27.3 | 27.7 | -0.4 |
| 412 | 29.0 | 29.3 | -0.3 |

  Before: HOT 34 / 39 / 42 / 45 px. POISON's overall bbox is ~4px taller than its glyphs because .pk-big is rotated -2deg (unchanged).

## 2. Strip Charades settings
- Leak: App._setup (js/app.js) rendered the "Strip Charades / Layers each" section for every couples setup screen, including the opening shown when a couples game (redflag, nhie, wyr, hotseat, swap) is picked without players (pendingGame set).
- Fix: `showStrip = !group && (!this.pendingGame || this.pendingGame === 'charades')`; section has id="setStrip". Kept on the general settings screen (gear / players chip, no game pending) since it is the only other place to change layers.
- Checked in Playwright (pw/v193g.mjs), guest + premium: redflag, nhie, wyr, hotseat, swap, mostlikely, twotruths openings show none; charades opening and gear show it; charades still plays with chosen layers (3 layers -> 6 layer pips for 2 players); redflag HUD has no layer pips.
- test/t4.js: new check "setup: Strip Charades settings only for charades ..." (fails on the old code with leaks redflag,nhie,wyr,hotseat,swap).

## Tests
t4 156 ok (ALL v12 QA PASSED), fn12 ALL PASSED, sql/t12 ALL SQL PASSED, audio16 ALL AUDIO PASSED.

Screenshots: /workspace/work/heatcheck/shots193/final_home_390.png, redflag_opening_390.png (+ _full), charades_opening_390_full.png.
