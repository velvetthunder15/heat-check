# v19.4 (hc-v44 / ?v=44), Oct 15 2026: desktop polish

## Request (Chirag)
Light desktop polish pass, not a two-column redesign. On a laptop/monitor the app was the phone layout as a
560px centred column with dim bars either side. Phones (<=560px, touch) must look and behave exactly as before.

## What changed
### New css/desktop.css (loaded last; in index.html and the sw.js SHELL)
Every rule sits behind a mouse-pointer media query, so phones and touch devices match none of it
(checked in Playwright: 2 media blocks, 0 match at 390px touch).

`@media (min-width: 900px) and (hover: hover) and (pointer: fine)`:
- Side scene: `#app::before`, one static fixed layer (z -2, under the #amb blobs, so the ambience still
  drifts over it). The current theme's own `--bg` plus soft `--accent` / `--accent2` glows in the corners, a
  far-edge vignette and a soft shadow the column casts on each side. A hard-stop mask leaves the 560px column
  untouched, so the column's own background is exactly as before. Midnight and Neon home already paint their sky
  on the full-viewport #amb, so there the whole monitor is their sky. No backdrop blur, no animation.
- Hairline edge: `#app { outline: 1px solid color-mix(fg 9%) }` (no layout, no paint cost). Off when printing.
- vw caps at the column: `.ht-hot top: min(.55vw, 3.08px)` (HOT sat ~8px low at 1440 before),
  `.countdown span font-size: min(40vw, 224px)` (was 576px at 1440), game intros (`.intro`) play inside the
  column instead of across the monitor, `.b-edge.l/.r` width capped at 100px.
- Red Flag camera frames: `height: 220px` (3:4 of a 257px cell was 343px, pushing the flag buttons under the
  control bar on a 900px-tall screen).
- Column width kept at 560px: every heading clamp already tops out by ~490-560px, so a wider column only adds
  empty space; not worth the risk.

`@media (hover: hover) and (pointer: fine)`:
- cursor: pointer on tiles, chips, pills, seg buttons, heat steps, avatar, icon buttons, nav-back, switches,
  `[data-act]`, `[data-nav]`, `[data-back]`, `[data-close]`, `[role=button|tab]`, links; default on disabled.
- Hover (CSS only, so never a sound): `.btn` brightness 1.08 + 1px lift; icon buttons / avatar / nav-back /
  heat chip brightness 1.18; button chips, session chips, heat steps, flag buttons, rate pad brightness + 1px lift;
  seg buttons brighten; game tiles lift 4px with `translate` (composes with the fan's rotate transform) and
  brighten 1.07.
- Visible `:focus-visible` rings: 2px near-white outline, offset 3px (tiles 3px / offset 4px). Inputs keep their
  own focus style; the hold ring keeps its own (intro.css).

### js/nav.js: desktop keyboard (Nav.key, bound in Nav.init)
| Key | Where | Does |
|---|---|---|
| Space / Enter / ArrowRight | in a game | clicks the HOT gate's "Deal it" if it is up, else the control bar's main button (Next / Next scenario / Debate over...), so limits and paywalls run exactly as for a tap. Nothing when the main button is hidden (e.g. before both players lock in). |
| Escape | account sheet open (profile, paywall, sign-in...) | its ✕ (`[data-close]`) or a backdrop tap: closes it |
| Escape | game dialog open (penalty, "who lost", hand-off) | nothing: those need an answer |
| Escape | game / setup / night / other sub-view | the screen's own back control (`[data-nav=home]` or `[data-back]`), same transition and sound as a tap |

Never fires: while typing (input / textarea / select / contenteditable), over any `.modal-wrap` (for the next
keys), during a countdown, on home, with modifier keys, or on auto-repeat (a held Space = one card).
A control the keyboard Tabbed to keeps its own Space / Enter; one a mouse click left focused does not
(tracked with a pointerdown/Tab flag, because `:focus-visible` flips to true on any key press).
Sounds: Space / Enter get the press sound through audio.js's existing keyboard-activation path (one `touch`);
ArrowRight gets the button's own `SFX.play('tap')` (alias of touch). Mute respected. Hover never plays.
Home hold ring: mouse press-and-hold already works through pointer events (verified: heat 1 -> 2);
Space/Enter on the focused ring already worked (intro.js), untouched.

## Tests
- t4: 164 ok, ALL v12 QA PASSED (8 new "keys:" checks: Space/Enter/ArrowRight next, repeat ignored, input,
  penalty dialog, account sheet Escape, Escape home).
- fn12 ALL PASSED (65 ok), sql/t12 ALL SQL PASSED (47), audio16 ALL AUDIO PASSED (69).
- pw/kb194.mjs (1440x900 mouse): ALL KEYBOARD CHECKS PASSED (39 ok), incl. mouse hold ring, Red Flag verdict
  then Space, Lite HOT "Deal it" via Space, typing in setup, Escape closes profile/paywall, mouse-focused mute
  button doesn't steal Space, one press sound per key, none on hover, none when muted.
- pw/desk194.mjs: 1280x800, 1440x900, 1920x1080 x Ember/Midnight/Neon x home / Red Flag / profile / paywall:
  column, controls, sheets all at the column's x-span (e.g. 1440: 440-1000), no horizontal overflow, no errors.
- pw/mob194.mjs: 390x844 touch DSF 3, seeded random, v43 dist vs v44 dist, 15 screens: home, Red Flag,
  profile, paywall identical (0 px) except Midnight's Premium pill sheen and the tile art, which differ by the
  same amount between two runs of the old build (animation timing noise, before-vs-before 2.6k-9k px).

Screenshots: /workspace/work/heatcheck/shots194/ (final_1440_*, final_1280_*, final_1920_*, kb_1440_*,
mob_before_* / mob_after_*).

## Deploy
CF Pages production deployment 906ac63d-ad61-49d5-ab99-7ca158943c10 (commit 1faa2cda, branch main): success. Live /sw.js = hc-v44, index loads desktop.css?v=44, /api/config 200 (apex and pages.dev). Auto production deploys were off during the file-by-file sync (the pushes leave "queued idle" placeholders, as in v19.3) and Vercel ignored builds (commandForIgnoringBuildStep "exit 0", restored to null after). Note: curl with its default user agent gets a Cloudflare "Just a moment" 403 on the apex; a browser UA gets 200.
