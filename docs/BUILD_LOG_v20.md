# v20 (hc-v45 / ?v=45), Oct 15 2026: two-column desktop layout

## Request (Chirag)
"now do the actual desktop polish (2 column). it should cover the entire screen brother". On a laptop or monitor the
app must use the whole viewport, no more centred 560px phone column with decorated sides. Phones unchanged.

## Scope and approach
CSS only: every change is in `public/css/desktop.css` (already loaded last and in the sw.js SHELL). No DOM wrappers,
no JS changes, so Intro.html and its CLS are untouched and phones render exactly the v44 DOM. base.css / themes.css
untouched. The layouts use CSS grid placement, `position: sticky`, `:has()` (to tell home / game / reading screens apart,
all of which share `#app`) and `zoom` for the large-screen scale steps.

Media tiers (all need `(hover: hover) and (pointer: fine)`, so phones and touch tablets match none of it):
| Width | Layout |
|---|---|
| < 900 | phone layout (v44) |
| 900-1023.98 | v19.4 560px column in the side scene (fallback, unchanged) |
| >= 1024 | v20 full-screen layout (section 4) |
| >= 1280 and height >= 720 | heat picker zoom 1.12 (0.92 below 1280) |
| >= 1600 | 3 tile columns (2 below), tile aspect 1.7; game stage up to 920px wide (780 below) |
| >= 1600 and height >= 860 | heat picker zoom 1.3 |
| >= 2200 and height >= 1200 | heat picker zoom 1.6, header 104px; setup / night / game stage zoom 1.25, side panel zoom 1.25, dialogs zoom 1.3 |

## Layout per screen (>= 1024px)
- **Home**: `#app` becomes a grid: header row (88px) across the full width, then LEFT column `clamp(400px, 38vw, 820px)`
  and RIGHT column (rest). Header: logo left; on the right, right to left: sound / settings / avatar circles, the pass slot
  (Premium pill moved from under the circles to their left; guest "Sign in" pill; Lite pill), Couples / Groups switch
  (232px), session chips (ellipsis if long, End night kept). The slot width follows the state via `:has()`
  (none 0, Premium / guest 162px, Lite 196px, Lite "Ends soon" 262px). Hairline under the header.
  LEFT: micro line, "How HOT is tonight?", hold ring, level pills, hint, vertically centred and `position: sticky`
  (height 100vh minus header) so it stays in view while tiles scroll. A static accent glow behind it and a 1px hairline
  between the columns (one fixed pseudo layer, no animation).
  RIGHT: No pass / admin banner strip (base and guest), "Pick your POISON" (chevron hidden), tiles in a grid
  (2 columns, 3 from 1600px, max 1560px wide), legal links at the bottom. Spacer rows centre the right column vertically
  when it is shorter than the screen (1920x1080: no scroll). Tiles keep art, badges and loops; instead of the phone's
  deck fan they deal in once (translateY 18px + scale .97 -> none, same transition and stagger). Offscreen pausing as before.
- **Games**: side panel on the right (`clamp(320px, 24vw, 420px)`, fixed, full height): back + sound (and the Lite/admin
  chip) on top, game title large, heat label + bar, limit line, "Scoreboard" list (one row per player, Charades
  layer pips kept, panel scrolls for big groups), and the old bottom bar as the panel's foot (same buttons, same order).
  The stage (and Red Flag's flag banner) is centred as one group in the remaining width, max 780px (920 from 1600),
  vertically centred (`safe center`, so tall content still scrolls). Red Flag frames `clamp(200px, 30vh, 300px)`,
  NHIE cups max 620px, prompts / neon sign `clamp(28px, 2.3vw, 38px)`. Midnight / Neon hairline becomes the panel's
  inner edge. Game intros play over the stage (right edge stops at the panel); toasts, Lite warning and HOT chip centre
  over the stage.
- **Setup**: centred, max 920px; settings sections in two columns (lock notice full width), Let's play button 420px.
- **Consent**: centred card, body max 460px.
- **Night summary**: max 1040px; header, taunt and the 4-up stat row full width, the cards two per row, buttons side by side.
- **Sheets / dialogs**: `.modal` and `.sheet-full` are centred dialogs with the existing dark backdrop (no blur),
  600 / 640px wide, rounded, max-height viewport minus 64px, scroll inside. Profile is 980px with two columns: hero
  full width, plan | purchases, Preferences full width split into two CSS columns, stats | data, support.
- **Typography caps**: everything vw-based was already clamped; the large-screen tiers above scale whole blocks instead.

## Phones: proof of no change
pw/mob20.mjs: 390x844 touch DSF 3, seeded random, animations off, v44 dist vs v45 dist, 15 screens (home, tiles, Red Flag,
profile, paywall x Ember / Midnight / Neon). Red Flag, profile: 0 px in every look; the rest differ only by the Premium pill
sheen / tile art timing, the same as two runs of v44 against itself (v44 vs v44 noise: max 9,669 px; v44 vs v45: max 9,669 px).
Results: shots20/mob20_result.txt, shots20/mob20_noise.txt.

## Tests
- pw/desk20.mjs at 1024x768, 1280x800, 1440x900, 1920x1080, 2560x1440 x Ember / Midnight / Neon x home, Red Flag, NHIE,
  Charades, setup, night summary, profile, paywall (premium), plus guest / base / Lite home, paywall, consent, setup and
  NHIE penalty dialog: no horizontal overflow, nothing off the right edge, no page errors (problems: 0 on every run).
  960x800 fallback checked (v19.4 column).
- pw/kb20.mjs (kb194 with the phone check accepting the new media blocks): ALL KEYBOARD CHECKS PASSED (39 ok).
- pw/fps20.mjs (4x CPU throttle, idle): 1440 Ember home, 1920 Midnight / Neon home, 1440 Neon Red Flag: 60 fps, 0 long frames.
- t4 164 ok (ALL v12 QA PASSED), fn12 ALL PASSED (65), sql/t12 ALL SQL PASSED (47), audio16 ALL AUDIO PASSED (69), hot-lint ok.

Screenshots: /workspace/work/heatcheck/shots20/ (final_<w>_<look>_<plan>_<screen>.png, mob_after_*.png, mob_before_*.png).
Backup of the v44 source: /workspace/work/heatcheck/repo_v44_backup_desktop2col (dist: dist_v44_before).

## Deploy
See HISTORY.md (deployment id recorded there).
