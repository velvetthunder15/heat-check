# v20.2 (hc-v47 / ?v=47), Oct 15 2026: 60 fps motion pass + HOT ignition

## What changed (motion only; game logic, tiers, API and DB untouched)
New stylesheet `css/motion2.css` (loaded last, in the SW shell), plus `Motion2` hooks in `js/motion.js` and `js/intro.js`, and
one `intro.css` property move. Transform + opacity only; small layers promoted only while they move (WAAPI), removed after.
HOT palette only (#ff7a3c -> #fff4e0 with the #ff2e63 ember edge). Reduced motion: fades only. `html.low-end`: lighter variants.

### HOT ignition (the hold ring locking at HOT)
- On the hold lock (`Motion2.ignite(hero, 'lock')`, rides lock3): white-hot flash over the ring, double shockwave (two thin hot
  rings expanding and fading), the HOT word punch (heading switches to the HOT gradient at once under the punch), three ember
  clusters (one layer each) flying up off the ring and spreading, one warmth pulse in `#amb` (a single bounded layer centred on
  the ring, opacity only; replaces the four screen-edge layers), then the ring settles into `.ring-hot`. Burn 1.1 s (was 1.5 s).
- HOT release burst (`Motion2.ignite(hero, 'release')`, rides the hotrelease flame burst); the scroll to the games now waits
  620 ms at HOT (160 ms otherwise) and is skipped if the player is holding again or the target left the DOM.
- HOT pill sequence, and the HOT card deal: spring + a light band across the card + embers.

### Everywhere else
Spring navigation (290 ms), sheets, toasts, pills, score bumps, NHIE cups, Red Flag stamp, Charades pips, End-night count-up.

### Perf fixes
- `--heat-t` set on `#amb` (not the root) so heat changes don't restyle the whole tree.
- `--hc-ring` set on `.hold-btn` instead of `.hc-hero` (an inherited custom property on the hero restyled ~230 elements on
  every level change).
- Pill colour changes instantly (no colour transition repaint).
- No forced reflow at the lock (`void offsetWidth` replaced by a rAF class add).
- No SVG text scaling (the HOT word punch scales a layer, not SVG text).

## Perf (pw/motion202.mjs, fps before (v20.1 hc-v46) -> after (v20.2 hc-v47), CPU throttle 4x / 6x)
Source: test/perf/motion202-{before,after}-*.json (after1-390-4 = first pass, superseded).

| Scenario | 390 4x | 390 6x | 390 low-end 4x | 1440 4x | 1440 6x |
|---|---|---|---|---|---|
| hot-hold | 48.1 -> 48.5 | 41.7 -> 41.7 | 51.1 -> 55.7 | 31.5 -> 23.8 | 26 -> 26 |
| hot-pill | 52 -> 52 | 49.2 -> 46.3 | 57.8 -> 58.6 | 26.4 -> 29.6 | 26.7 -> 26.3 |
| nav-nhie | 54.5 -> 55.3 | 53 -> 53 | 56.1 -> 56.2 | 52.2 -> 53.1 | 50.7 -> 51.4 |
| deal-nhie | 60 -> 60 | 59.1 -> 59.1 | 60 -> 60 | 60 -> 59.1 | 57.3 -> 58.2 |
| sheet-open | 60 -> 60 | 60 -> 60 | 60 -> 60 | 60 -> 60 | 57.5 -> 58.8 |
| sheet-close | 60 -> 60 | 60 -> 61.8 | 60 -> 60 | 60 -> 60 | 60 -> 60 |
| nav-back | 48.8 -> 52.9 | 47.8 -> 48.8 | 48.8 -> 53.9 | 42.7 -> 41.7 | 35.6 -> 37.6 |
| nav-wyr | 57.7 -> 56.1 | 54.6 -> 54.5 | 56.9 -> 57.7 | 54.5 -> 53.8 | 49.9 -> 51.4 |
| deal-wyr | 60 -> 60 | 60 -> 60 | 60 -> 60 | 60 -> 60 | 60 -> 60 |
| nav-mostlikely | 57.7 -> 58.4 | 56.1 -> 55.3 | 56.9 -> 58.4 | 54.6 -> 55.3 | 46 -> 50.7 |
| deal-mostlikely | 60 -> 60 | 60 -> 60 | 60 -> 60 | 60 -> 60 | 60 -> 60 |

Read with care: "after" carries far more motion (flash, two shockwaves, embers, warmth pulse) at roughly the same frame rate as
the old, plainer ignition. The sandbox has no GPU: software raster is ~60% of frame time (prof202), so absolute numbers
understate a phone with GPU raster. Honest gap: the HOT moments (hot-hold, hot-pill) are still below 58 fps at 4x throttle in
this harness, worst at 1440 (big raster area). Deals, sheets and most navigation hold 58-60.

## New files
- `public/css/motion2.css`
- Harness (outside repo, /workspace/work/heatcheck/pw/): `motion202.mjs` (frame pacing per motion moment), `prof202.mjs`
  (main-thread profile), `cls202.mjs` (home CLS, cold load), `probe202.mjs`, `hotcap202.mjs` (HOT ignition capture).
- Captures: /workspace/work/heatcheck/shots202/ (hot_ignition_{390,1440}_hold.mp4/.webm, hot_ignition_strip_{390,1440}.png/.jpg).

## Tests
t4.js 188 ok, fn12 65 ok (sql 47 / audio16 69 not re-run in the release step; no SQL or audio changes). Build: `CONTACT_EMAIL=support@playheatcheck.app node
tools/build.mjs` (HOT lint ok, cards ok, 7 files stamped). Backup of v20.1 source: /workspace/work/heatcheck/repo_v46_backup_motion.

## Deploy
Same flow as v20.1: CF auto production deploys off + Vercel commandForIgnoringBuildStep "exit 0" during the file-by-file sync,
both restored, then one POST /pages/projects/heat-check/deployments branch=main. No account or DB changes.
