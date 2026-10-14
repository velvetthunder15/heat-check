# Build log v19.1 (hc-v41, ?v=41) - Oct 14 2026: pill sizes

Request (Chirag): "make the premium pill as big as the default sign in pill. also shift it a BIT DOWN because it's kind of coinciding with the profile pic premium circle" + "same for lite".

## Reference: guest Sign in pill (html.is-guest .signin-tab, computed)
148 x 30 px, border-radius 99px, font 13px / 800, letter-spacing .02em, icon 15px, gap 6px. Spans the 3-circle row exactly (right: 18px, width 148px).

## Changes (end of public/css/v15.css, "v19.1" block; base.css/themes.css untouched)
- Premium header pill (#passHead .pass-banner): width 148px (was 100% of left:0/right:-4px, ~152px), height 30px (was 20), font 13px (was 11), weight 800, letter-spacing .06em (was .08em), padding 0 12px, radius 99px.
- Position: top calc(100% + 8px) (was +4px). The avatar's .av-ring outer edge is 4px past the 44px avatar, so the pill now sits 4px clear of the ring (was 0 = touching). right: 0 (was -4px) so the pill's x-span equals Sign in's.
- .home-head.has-hpill .head-actions top: -19px (was -12px) = (8 + 30) / 2, so circles + pill stay centred on the logo. Session row margin-top 12px (was 8px).
- Lite pill (#passBanner[data-pill="1"] .pass-banner): height 30px (unchanged), font 13px (was 12px), letter-spacing .06em, min-width 148px, padding 0 14px, radius 99px. Stays under the session chips: "Lite · 47 min left" at 13px is ~167px, wider than the 148px header slot.
- <324px: Premium pill stays static in row 2 left of the avatar; width auto (~92px), 30px tall, padding 0 10px, letter-spacing .04em; session row margin 4px.

## Measured (Playwright, local dist, pw/v41.mjs)
| width | Premium pill (h x w) | gap pill -> ring | gap pill -> chips | Lite pill h | Lite gap -> ring | Sign in |
|---|---|---|---|---|---|---|
| 320 | 30 x 91.6 (row 2) | 4px (horizontal) | 17px | 30 | 50px+ | 30 x 148 |
| 360 | 30 x 148 | 4px | 7px | 30 | 60px+ | 30 x 148 |
| 390 | 30 x 148 (x 224-372 = Sign in) | 4px | 9px | 30 | 66px+ | 30 x 148 |
| 412 | 30 x 148 (x 246-394 = Sign in) | 4px | 9px | 30 | 70px+ | 30 x 148 |
No overlaps with chips/circles in any state; CLS 0.0000 in all 24 runs (guest, base, premium, lite 47m / 4m warn / forever x 4 widths). Screenshots: /workspace/work/heatcheck/shots41/.

## Release
sw.js VERSION hc-v41, every ?v=40 -> ?v=41 (index, 404, 500, privacy, terms, refund, sw SHELL). Tests: t4, fn12, sql/t12, audio16 all pass. No accounts / DB changes.
