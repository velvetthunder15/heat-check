# Build log v16 (Oct 12 2026, hc-v34 / ?v=34): sound system rework

No visual, layout, copy, paywall or limit changes. Sounds only: reliability, loudness, Classic touch
feedback, Velvet rebuilt as a premium pack. `public/css/base.css` and `themes.css` untouched.

## Root causes (audit confirmed)
1. `ac()` called `ctx.resume()` without waiting and scheduled at `ctx.currentTime`: sounds fired while
   suspended were lost or came late. Resume was also tried from timers (not a tap), which iOS ignores.
2. No global unlock: `unlock()` ran only on the 18+ button and the hold ring, and returned early when muted,
   so after an unmute or a reload the first sounds dropped.
3. Muted by default (`hc_muted !== '0'`). Kept as the product rule; only the read is now safe.
4. `localStorage` read at the top of the module with no try/catch: blocked storage (Safari private mode)
   meant `SFX` was never defined and every `SFX.play` threw.
5. No handling for iOS `interrupted`, `visibilitychange` or `pageshow`: after a tab switch or phone lock the
   context stayed suspended.
6. Every sound fired on `click` (finger up). A separate `pointerdown` soft tick in motion.js doubled most presses.
7. Noise buffers were allocated on every play (applause built 14 buffers): GC and latency.
8. Everything went straight to the speakers at peak gains 0.035 to 0.18 (about -29 to -15 dBFS); Velvet
   multiplied that by 0.8.
9. iOS ring/silent switch muted Web Audio (no `navigator.audioSession`, no fallback).
10. (found in testing) A DynamicsCompressor starts fully clamped and takes ~100 ms of running to open, so the
    first tap after the context starts came out ~12 dB quiet. The first sounds now bypass it and the
    compressed path fades in 160 ms after the context first runs.

## What changed
- `public/js/audio.js` (rewritten, same API: `play/toggle/setMuted/setPack/unlock/muted`, plus `ring`, `preview`,
  `pack`, `state`).
  - One AudioContext, created at the first `pointerdown/pointerup/touchend/click/keydown` anywhere (capture
    listeners, removed once running, re-armed whenever the state leaves `running`), even when muted. Not at load.
    Each unlock resumes and plays a 1-sample silent buffer.
  - `play()`: if the context isn't running it resumes first and schedules from the new `currentTime`
    (gives up after 350 ms so a stale sound never bursts out late). Resume on `visibilitychange`, `pageshow`,
    `focus` and on `statechange` to `interrupted/suspended`.
  - iOS: `navigator.audioSession.type = 'playback'` while sound is on (`'auto'` while muted, so muted users'
    music is never interrupted). Older iOS without audioSession: looping silent WAV `<audio>` (generated data URI)
    after the first tap, paused when muted or hidden.
  - Every sound is synthesized once in pure JS into PCM (band-limited oscillators, biquads, FM, deterministic
    noise, baked stereo plate for Velvet), normalized to -3 dBFS peak, stored as an AudioBuffer. Playback is an
    AudioBufferSourceNode only. Pre-render runs at idle after the unlock, as a generator in <=8 ms slices,
    paused during screen changes (`html.hc-nav`) and hidden tabs; nothing renders while muted.
  - Chain: voice -> per-sound gain -> master gain (mute = 0, Classic 0.92, Velvet 1.0) -> DynamicsCompressor
    (-18 dB, 4:1, knee 20, 3 ms, 150 ms) -> speakers (first sounds via a dry path, see 10).
  - Polyphony cap 8 (oldest faded out), same sound ignored within 30 ms, ±8 cents random detune; Velvet taps use
    five pentatonic round-robin variants instead.
  - Press feedback: one delegated capture `pointerdown` handler for buttons, tabs, chips, tiles, back and settings
    (`touch`, `touchTile`, `touchBack`, `touchToggle`). The handler's own `SFX.play('tap')` on the following click
    is suppressed (no double fire). Keyboard Enter/Space gets the sound through click; a script's `.click()` does
    not add one. Hold areas (`#holdBtn`, `.hold`) and disabled buttons excluded.
  - HTMLAudio fallback (WAV blob URLs) when Web Audio is missing or can't be created.
  - `?sounddebug=1`: fixed debug strip (pointer-events none) with ctx state, mode, mute, pack, last sound,
    voices, buffers.
  - Classic: every old sound note for note (same notes, waveforms, slides, timings), now rendered, normalized and
    louder. New: crisp touch taps in the same palette (triangle 660 Hz family + 3-4 kHz click + bright partials).
  - Velvet: warm sine/triangle bodies with low-pass, felt thumps, glassy FM bell partials, stereo spread and a
    baked plate. UI sounds snap to C major pentatonic; taps move through the scale. Bespoke: deal, ring tick,
    Flirty/Spicy/top-level locks (top level: saturated sub swell, ignition whoosh, crackle, shimmer), release,
    reverse-swoosh reset, End Night chord resolve (IV add9 -> I maj9), unlock flourish, 2 s preview.
- `public/js/intro.js`: hold ring calls `SFX.ring('start' | 'turn' | 'level' | 'release' | 'cancel' | 'reset')`.
  Velvet: live sine+triangle tone whose pitch follows the ring (G4 -> G6 over three turns), soft tick per eighth of a
  turn, lock sound per level. Classic keeps exactly what it had (soft tick per level, tap on reset).
- `public/js/games.js`: `stageHTML` plays `deal` for a new card (Velvet only; skipped during a screen change).
- `public/js/app.js`: End Night plays `endnight` (Velvet chord resolve; Classic = the old win fanfare).
- `public/js/account-ui.js`: Base user taps locked Velvet -> ~2 s Velvet preview, then the same paywall as
  before (muted: paywall at once). Paid user switching to Velvet -> unlock flourish.
- `public/js/motion.js`: removed the old `pointerdown` soft tick (audio.js owns press feedback).
- `sw.js` + every HTML page: hc-v34 / ?v=34.

## Tests
- Build: `HOT lint ok (49 files)`, cards ok, dist built.
- `node test/t4.js`: 153 ok, ALL v12 QA PASSED. `node test/fn12.mjs`: 51 ok, ALL PASSED. `node test/sql/t12.mjs`: 47 ok, ALL SQL PASSED.
- New `node test/audio16.mjs` (jsdom + mock AudioContext): 49 ok. Storage that throws, default mute read, lazy
  context, first-tap unlock (also when muted), first tap plays its own sound, press + click = one sound, tile/back/
  toggle taps, hold button excluded, keyboard path, programmatic click, 30 ms dedupe, 8-voice cap, resume-then-play,
  stale sound dropped, `interrupted`/visibilitychange/pageshow resume, debug flag, Classic ring mapping, Velvet ring
  set, preview timing and mute gating, HTMLAudio fallback.
- New `node test/audio_render.mjs` (Node): renders all 79 buffers (28 Classic, 51 Velvet incl. variants), all at
  -3.00 dBFS peak, no NaN; writes the WAVs.
- New `pw/audio16.mjs` (real Chromium, autoplay needs a gesture): no page errors; no context before the first tap;
  running after the first tap anywhere; compressor values; signal measured at the compressor output (-4.3 dBFS for
  reveal) and silent with master 0; suspend -> re-armed -> visibilitychange resume; pageshow resume; play while
  suspended resumes then schedules; all 66 sounds at -3 dBFS; Couples/Groups toggle tap; Velvet hold ring:
  21 segment ticks, lock1/2/3, release, reset; Base preview -> paywall after it; Lite picks Velvet -> flourish;
  muted: nothing rendered, unmute warms the buffers. 6x CPU: whole Velvet set pre-rendered in 2.7 s, 0 long tasks.
- Loudness at the output (after the chain, 10 ms RMS): old tap -31.3 dB, Classic tap -12.1 dB (+19 dB), Velvet tap
  -9.1 dB; Classic reveal -11.0, Velvet reveal -10.6, Velvet top-level lock -7.3, Velvet End Night -11.3.
- Visual check: home and game screenshots v33 vs v34 identical (home differs by at most 3/255 in a 86x11 px
  corner, render noise).

## Perf (pw/perf14.mjs, 360x640, 6x CPU, redflag/nhie/wyr; `SOUND=1 pw/perf16.mjs` = same with sound on)
| run | open fps | open frames >50ms | back fps | back frames >50ms | scroll fps | ring fps |
|---|---|---|---|---|---|---|
| v15 (recorded) | 53.2 | 7 | 50.0 | 9 | 52 | 53.6 |
| v15 re-run today (hc-v33) | 53.0 | 4 | 48.6 | 9 | 53.4 | 51.6 |
| v16 muted (default) | 52.7 | 5 | 48.8 | 9 | 53.8 | 51.8 |
| v16 sound on | 52.2 | 6 | 49.2 | 10 | 53.9 | 51.6 |
CLS 0 everywhere. audio.js is 13.8 KB gz (was 1.8 KB). Memory: Classic buffers ~1.5 MB, Velvet ~10.7 MB (only the
active pack is rendered).

## Not verifiable from the sandbox
Real-device Android and iOS playback, the iOS ring/silent switch, lock screen / call interruptions, Bluetooth
routing, and how the sounds actually feel on phone speakers. These need a phone.

# v16.1 (Oct 12 2026, hc-v35 / ?v=35): tap-only press sounds, new hold-ring sounds

No visual, layout, copy, paywall or limit changes. `base.css` / `themes.css` untouched.

## 1. "Don't make a sound when I just glide over buttons"
**Cause.** v16 played the press sound in a delegated capture `pointerdown` handler. On a phone, a finger that lands
on a button or tile and then scrolls fires `pointerdown` first; the browser only decides it is a scroll afterwards
(`pointercancel`, no click). So every scroll/swipe that started on a control made a press sound. Confirmed in real
Chromium with CDP touch drags on the v34 build: a 30 px drag, an 80 px page scroll from a tile and a 60 px drag from
the Couples/Groups toggle each made 1 sound. Hover was never a source (no hover/pointerover/pointerenter listener plays
sound; motion.js lost its pointerdown tick in v16; `:hover` styles are CSS only).

**Fix (audio.js).** `pointerdown` now only remembers the press (control, pointer id, position, scroll position) and
unlocks the AudioContext silently. The press sound plays on `pointerup` only when it was a tap: same pointer, moved
< 10 px (tracked on `pointermove` too), no `pointercancel`, no `scroll` event (capture, so inner scrollers count) and no
scroll-position change in between, and the finger lifts on the same, still-connected control. A rejected press keeps
the click handler's own `SFX.play('tap')` quiet. One exception, so an action never happens silently: a press rejected
only for moving (a mouse drag inside a button) still gets its one sound if the browser fires the click on that same
control within 120 ms. Keyboard Enter/Space still sounds through click; a script's `.click()` still only gets the
handler's tap; 30 ms dedupe unchanged. Hold ring (`#holdBtn`, `.hold`) stays excluded and keeps starting on press, but
its voice only starts after the ring has turned 0.08 of a turn (~100 ms); `intro.js` cancels the hold silently when the
finger moves > 10 px before that.

## 2. Hold-ring sounds (both packs)
Classic keeps its palette (triangle/square/saw, bright, game-show); Velvet stays warm (sine/triangle, FM bells, plate).
- Live voice (real-time oscillators, every change through `setTargetAtTime`, so no zipper noise): Classic triangle + saw
  + sub square from C4 to C6, Velvet sine + triangle octave + light chorus from G4 to G6, low-pass opening with the ring,
  vibrato growing with the heat, level slightly falling as it climbs so the locks stand above it; a short duck under each
  lock. From turn 1.3 a pre-rendered 2 s seamless fire-bed loop (flickering filtered noise + crackle) fades in, its
  low-pass opening 400 -> 3800 Hz toward the top level.
- Ticks: 7 per turn rising (Classic B5 major run, Velvet C pentatonic C6-D7), a whole tone up per level (playbackRate).
- Flirty lock: light, airy sparkle (Classic triangle arpeggio E6-A7 + air; Velvet bell triad E6 G6 C7 + air).
- Spicy lock: warmer with body and a little sizzle (thump, C5+G5 chord, sub, short fire + sparse crackle).
- HOT lock: ignition whoosh as it locks + punch + saturated sub swell (58 -> 45 Hz, harmonics for phone speakers),
  fire roar (filtered noise with slow random amplitude, low-pass sweeping 450 -> 3300 Hz, 1-4 kHz sizzle band), sparse
  2-6 kHz crackle with a few woody snaps, plus the pack's chord (Classic saw C-major stab, Velvet shimmer + bell), soft
  saturation (drive 2) so it is the loudest moment. Then a ~1.1 s ember tail (roar cooling, crackle thinning) starts
  0.85 s later. Release at HOT = flame burst (whoosh + fire with the low-pass falling + crackle + thump; Classic saw stab,
  Velvet bells). Release below HOT keeps a short confirm (new for Classic).
- Everything except the oscillators is pre-rendered at idle, -3 dBFS peak, through the master + compressor.
- Rendered loudness in the 4 s hold simulation (RMS per segment, dBFS) Classic / Velvet: tone -20 / -18, Flirty lock
  -16 / -15, Spicy lock -17.5 / -15.6, fire bed end of turn 3 -21 / -19, HOT lock -10.1 / -12.6, flame burst -12.5 /
  -13.2, embers -18.6 / -23. 1-4 kHz share: HOT lock 19 % / 31 %, fire bed 40 % / 38 % (phone speakers hear it).

## Perf
New ops `opFire` / `opPops`; hot loops moved out of generator bodies into plain block functions (V8 optimizes them far
better), and each idle callback now has a hard 8 ms budget. Pre-render at 6x CPU: 0 long tasks (two runs), Velvet set
(55 buffers) in 4.2 s. Memory: Classic 2.4 MB, Velvet 12.0 MB.
| run (360x640, 6x CPU, redflag/nhie/wyr) | open fps | back fps | scroll fps | ring fps |
|---|---|---|---|---|
| v16 recorded (muted / sound) | 52.7 / 52.2 | 48.8 / 49.2 | 53.8 / 53.9 | 51.8 / 51.6 |
| v16 re-run today (muted / sound) | 51.4 / 52.1 | 48.8 / 48.0 | 50.2 / 50.0 | 51.4 / 51.6 |
| v16.1 sound on (3 runs) | 51.7 / 52.6 / 52.1 | 48.0 / 48.6 / 48.4 | 54.4 / 54.3 / 53.9 | 51.6 / 51.6 / 50.9 |
| v16.1 muted (2 runs) | 51.0 / 51.9 | 48.4 / 49.4 | 53.9 / 54.1 | 51.6 / 49.6 |
Within run-to-run noise; CLS 0; no page errors.

## Tests
`node tools/build.mjs` (HOT lint ok, 49 files). `t4.js` 153 ok, `fn12.mjs` 51 ok, `sql/t12.mjs` 47 ok,
`audio16.mjs` 69 ok (new: pointerdown alone silent, tap on pointerup, scroll gesture pointerdown + 30 px move +
pointercancel silent, 40 px swipe silent, scroll between down/up silent, hover/pointerover/pointerenter/mousemove
silent, < 10 px wobble = one sound, drag-then-click = one sound, lift on another control silent; ring: nothing before
0.08 turn, early cancel silent, voice + fire bed, rising ticks, per-level locks, HOT tail scheduled +0.85 s, flame burst,
muted ring inert), `audio_render.mjs` 98 buffers all -3.00 dBFS (`wav161` writes the ring set), `pw/audio16.mjs` 39 ok
(real Chromium touch scrolls from a tile and a toggle silent, hover over 12 controls silent, tap = one sound, Classic and
Velvet full rings, early-move cancel on the ring), `pw/audio16.mjs ... cpu` 0 long tasks, `pw/holdsim161.mjs` (offline
render of the full hold through the same voice + chain). WAVs in `/workspace/work/heatcheck/sounds161/`.

## Not verifiable from the sandbox
How it sounds on a real phone speaker and how it feels in the hand: touch slop differs per device. The 10 px threshold
is ours; when the browser itself starts a scroll it fires pointercancel, which also keeps the sound off.
