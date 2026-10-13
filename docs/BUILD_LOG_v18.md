# Heat Check v18 build log: link preview with the original logo (Oct 13 2026, hc-v39 / ?v=39)

Chirag: "why is the embed showing this bad logo? use our original logo for this site embed and make the embed better".

## Share image
- New public/og-v2.png (1200x630, 154 KB, palette PNG via libimagequant + optipng). The old og.png (plain serif text + colour bars, made by Hark) stays on the server for old caches but nothing links to it.
- Built around Chirag's original public/logo-wordmark.webp (flame-H ring + "heat check"), used as is (not redrawn), 600 px wide, rendered at 2x and downscaled so it is crisp.
- Background #140b10 with the home glow: Flirty pink #ff2e63 bottom left, ember #ff7a3c bottom right, a dark pocket behind the logo (the logo's black outline would look jagged on a bright glow), seeded ember sparks kept away from the text, soft vignette.
- Under the logo: "Party games for couples & groups", then chips Flirty (outline #ff2e63), Spicy (#ff2e63 -> #ff7a3c), HOT (uppercase, #ff7a3c -> #fff4e0, italic 900). "18+" mark top right. No em dashes, no colour bar.
- Everything important sits inside the centre 630x630 square, so a square crop (WhatsApp small thumbnail) still shows the full logo, line and chips. No separate square image.
- Source: tools/og/og.html + tools/og/render.mjs (rerender -> save as a NEW name, og-v3.png etc).

## Meta (public/index.html)
- og:title / twitter:title: "Heat Check: party games for couples & groups (18+)".
- description / og:description / twitter:description: "Flirty, Spicy and HOT party games for couples and groups: Never Have I Ever, Would You Rather, Red Flag / Green Flag, Hot Seat Quiz and more. Free to play in your browser. 18+"
- og:image, og:image:secure_url, twitter:image -> %%SITE_URL%%/og-v2.png; type image/png, 1200x630; alt "Heat Check logo: party games for couples and groups, Flirty, Spicy and HOT levels, 18+"; og:locale en_IN added.
- theme-color #120a12 everywhere (404/500 were #140c12); manifest description updated.
- Legal/404/500 pages have no og tags (unchanged). og-v2.png not added to sw.js SHELL (the app never loads it; 154 KB per install for nothing).
- _headers: /og-v2.png cached 30 days.

## Release
- hc-v39 / ?v=39. Tests: t4, fn12, sql/t12, audio16 all pass.
