# v20.3 (hc-v48 / ?v=48), Oct 16 2026: centred Would You Rather

## Why
Chirag, reviewing the intro video: "would you rather game is very asymmetric, make it to the centre of the screen with V/S to the centre too."
Inspection of the real app (390x844 @3x and 1440x900) confirmed it was an app bug, not a capture artifact:
- The heat tag (`.pts-tag`, inserted as the arena's first child by `stageHTML`) was a grid item of `.arena { grid-template-rows: 1fr 1fr }`,
  so it took half the arena (a ~170px empty band above the cards) and pushed the blue card into an implicit third row.
- The red card was left-aligned, the blue card right-aligned (`text-align: right`, `margin-top: -12%`, diagonal clip-paths), and the blue clip
  covered the bottom of the red option text on desktop.
- `.vs` sat at `top: 47%` of the arena, i.e. over the red option text, not between the cards.

## What changed (CSS only, appended to `public/css/motion2.css`; base.css / themes.css untouched)
- `#app .arena`: grid, one centred column (max 560px), rows `auto 1fr 1fr`, 26px gap; `min-height: clamp(360px, 54svh, 520px)`; inset 18px
  from the screen edges on phones (was full-bleed -18px).
- Heat tag in its own auto row, centred above the cards.
- Both option cards: same column, equal rows (equal width and height), centred text, rounded 22px, no diagonal clip.
- VS spans both card rows and is centred with grid self-alignment, so it lands exactly on the midpoint of the gap. New keyframes `clashC`
  (same clash, without the old translate(-50%,-50%)).

## Measurements (pw/wyrmeasure.mjs; pw/wyr/before.json -> pw/wyr/after.json, screenshots pw/wyr/{before,after}_*.png)
| | 390 phone | 1440 desktop (stage column 157.2-937.2) |
|---|---|---|
| card left / right margin | 18 / 18 px | 110 / 110 px inside the stage (cards 560px, centre 547.2 = stage centre) |
| card heights a / b | 194.3 / 194.3 | 209.4 / 209.4 |
| VS centre x / card centre x | 195 / 195 | 547.2 / 547.2 |
| VS centre y / gap midpoint | 498.5 / 498.5 | 425.6 / 425.6 |
Before: tag band ~170px, cards overlapping (a 415.6-585.2, b 538.3-718.6), VS cy 468.1 (over the red text).

## Tests
t4.js 188 ok, fn12 65 ok, pw/v201.mjs 22 ok, pw/kb20.mjs 39 ok (ALL KEYBOARD CHECKS PASSED). Build: `CONTACT_EMAIL=support@playheatcheck.app node
tools/build.mjs` (HOT lint ok, cards ok, 7 files stamped). Backup of v20.2 source: /workspace/work/heatcheck/repo_v47_backup_wyr.

## Deploy
