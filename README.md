# Heat Check 🔥

A mobile-first, offline-capable 18+ party game PWA for couples and groups of couples.
Pure HTML / CSS / JS. No backend, no build step, no dependencies.

## Folder structure

```
heat-check/
├── index.html            # App shell + neutral "Pause" page
├── cards.json            # ALL game content (750 cards) — edit freely
├── manifest.webmanifest  # PWA install metadata
├── sw.js                 # Service worker: offline cache
├── vercel.json           # Static hosting headers for Vercel
├── icons/                # 192, 512 and maskable PWA icons
├── css/
│   ├── base.css          # Layout, HUD, heat meter, penalty sheet, controls, gates
│   └── themes.css        # One visual world per game + home tiles
└── js/
    ├── audio.js          # Synthesized SFX per game (Web Audio, no files)
    ├── core.js           # State, players/couples, heat ramp, decks, penalties, timers, pause, wake lock
    ├── games.js          # The 9 games (+ Rate-your-partner and WYR couples variants)
    └── app.js            # Age gate, consent, home, setup, routing
```

## Games

| Game | World | Card `game` id |
|---|---|---|
| Red Flag / Green Flag (+ Rate your partner) | Talk-show / couples reaction video | `redflag`, `rate` |
| Never Have I Ever | Neon house party, red cups | `nhie` |
| Guess the Body Part | Noir, blindfold, spotlight, body map | `bodypart` |
| Strip Charades | Velvet-curtain cabaret | `charades` |
| Would You Rather (group vote / guess your partner) | Fighting-game VS | `wyr` |
| Who's Most Likely To | Pop-art comic | `mostlikely` |
| Hot Seat Quiz | Game-show stage | `hotseat` |
| Two Truths & a Spicy Lie | Casino felt | `twotruths` |
| Swap Rounds | Chrome mirror | `swap` |

## Editing cards

`cards.json` is an array. Every card has:

```json
{ "game": "nhie", "heat": 2, "text": "Never have I ever …", "optionalDare": "Whisper …" }
```

Extra fields some games use:
- `bodypart` → `"zone"`: one of `forehead eyelids ear cheek jaw lips neck nape collarbone shoulder upperarm elbow wrist palm fingers upperback lowerback waist hip thigh knee calf ankle foot`
- `charades` → `"category"`: Movie, Scenario, Dance Move, Bedroom Charade, Celebrity, Song
- `wyr` → `"a"` and `"b"`: the two options (the app also splits `text` on " or " if these are missing)

Heat: `1` Flirty (1 pt), `2` Spicy (2 pts), `3` Hot (3 pts). Add as many cards as you like; decks shuffle without repeats until exhausted.

## How the systems work

- **Age gate** once per device, then a **consent screen** every launch.
- **Pause (⏸)** instantly swaps to a boring grocery-list page. Press-and-hold "Hold to resume" (or double-tap the "Notes" bar, or press Esc) to come back. Timers freeze while paused.
- **Pass** is always on screen: free on dares, Spicy/Hot cards, Body Part and Charades; costs 1 pt on a Flirty prompt. Every penalty sheet also has a free Pass.
- **Heat Meter** climbs every N rounds (4/6/8/12) from your start level up to your max. Turn auto-ramp off to lock one level.
- **Penalty modes**: 🍸 Drinks (points = sips), 💧 Water, 🎲 Dares only (Lv1 truth/compliment, Lv2 kiss/massage/whisper, Lv3 hot dare). Every penalty offers the card's dare as a swap.
- **Strip Charades layers**: set 3–6 layers each; when someone runs out (or you switch strip off) only the kiss/massage/sip options remain.
- **Scoreboard** (points taken) and Charades layers sit in the top bar. "New night" on Home resets heat and scores.
- **Screen Wake Lock** keeps the phone awake during play (Chrome/Edge/Safari 16.4+).

## Run locally

Service workers need http(s), so don't open `index.html` as a file. From this folder:

```bash
npx serve .            # or: python3 -m http.server 5173
```

Open the printed URL on your phone (same Wi-Fi) or in desktop Chrome with device mode.

## Deploy to Vercel

**Option A, CLI**

```bash
npm i -g vercel
cd heat-check
vercel          # framework: "Other", build command: none, output dir: ./
vercel --prod
```

**Option B, GitHub**

1. Push this folder to a new GitHub repo (files at the repo root).
2. vercel.com → Add New → Project → import the repo.
3. Framework Preset: **Other**. Leave Build Command and Output Directory empty. Deploy.

Then open the URL on your phone → browser menu → **Add to Home screen / Install app**. After the first load (fonts included) it runs fully offline.

**Updating:** after you edit JS/CSS, bump `VERSION` in `sw.js` (e.g. `hc-v2`) so phones pick up the new files. `cards.json` is network-first, so card edits show up on the next online launch.

## Play nice

Adults only. Everyone opts in, anyone can stop, nobody is pressured. Drink responsibly, and nobody drives.

## Rollback plan (launch day)

1. Every deploy is immutable and stays live at its own URL. Nothing is ever overwritten.
2. If a release breaks: Vercel dashboard → heat-check → Deployments → pick the last good one → "Instant Rollback" (or `vercel rollback <deployment-url>`). Takes seconds, no rebuild.
3. Phones that cached the bad version: the service worker is network-first for cards.json and re-checks sw.js on every launch (sw.js is served no-cache), so bumping `VERSION` in sw.js on the fixed deploy forces clients to drop the old cache.
4. Known-good deployments are noted in the project log before each release.
5. After rolling back, open the site, run one round of each game, and check the scoreboard, pause and pass buttons before announcing the fix.
