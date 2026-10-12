/* Heat Check: sound engine (v16). No audio files: every sound is synthesized once into a buffer
   (pure JS, at idle after the first tap), then played as an AudioBufferSourceNode:
   voice -> per-sound gain -> master gain -> compressor -> speakers.
   Packs: Classic (everyone) and Velvet (Lite/Premium, set by Prefs.apply). ?sounddebug=1 shows a debug strip. */
const SFX = window.SFX = (() => {
  const W = window, D = document, NAV = navigator;
  const now = () => (W.performance && performance.now ? performance.now() : Date.now());
  // Storage can throw (Safari private mode, blocked cookies): the engine must still load
  const store = {
    get(k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { W.localStorage.setItem(k, v); } catch (e) {} },
  };
  let muted = store.get('hc_muted') !== '0';   // muted by default; an unmute is remembered (unchanged rule)
  let pack = 'classic';

  /* ================= synthesis (pure JS, deterministic) ================= */
  const SR = 32000, TAU = Math.PI * 2, PEAK = Math.pow(10, -3 / 20);   // buffers peak at -3 dBFS
  let seed = 1;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const nz = () => rnd() * 2 - 1;
  const midi = (f) => 69 + 12 * Math.log2(f / 440), hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const PENT = [0, 2, 4, 7, 9];                     // C major pentatonic
  const snap = (f) => { const m = Math.round(midi(f)); for (let d = 0; d < 3; d++) for (const s of [m - d, m + d]) if (PENT.includes(((s % 12) + 12) % 12)) return hz(s); return f; };
  const bq = (type, f, Q) => {
    const w = TAU * Math.min(f, SR * 0.45) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * Q);
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; } else { b0 = a; b1 = 0; b2 = -a; }
    const a0 = 1 + a; return [b0 / a0, b1 / a0, b2 / a0, (-2 * c) / a0, (1 - a) / a0];
  };
  const QDB = (db) => Math.pow(10, db / 20);       // Web Audio lowpass/highpass Q is in dB
  const blep = (t, dt) => { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; };
  const gainLR = (pan) => { const a = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4; return [Math.cos(a) * Math.SQRT2, Math.sin(a) * Math.SQRT2]; };
  const WAVES = { sine: 0, triangle: 1, sawtooth: 2, square: 3 };
  // Hot loops read only locals and typed arrays (ops have mixed shapes; property reads per sample are slow).
  // Envelopes: 'wa' = the old Web Audio exponential ramps (Classic keeps its exact shape), 'lin', 'sin', else attack/decay.
  function opTone(b, o) {
    const i0 = Math.round((o.when || 0) * SR), n = Math.max(1, Math.round(o.dur * SR)), dur = o.dur, vol = o.vol;
    const f0 = o.f, to = o.to || 0, slN = Math.max(1, Math.round((o.sl || dur) * SR)), env = o.env || 'ad', atk = o.atk || 0.002, atkN = Math.max(1, Math.round(atk * SR)), curve = o.curve || 1;
    const type = o.fm ? -1 : WAVES[o.type || 'sine'], fm = o.fm || 0, fmi = o.fmi || 0, fmk = Math.exp(-1 / ((o.fmd || 0.12) * SR));
    const sat = o.sat || 0, satN = sat ? Math.tanh(sat) : 1, trem = o.trem || 0, lp = o.lp || 0;
    const sides = b.R && o.det ? [0, 1] : [-1], [gl, gr] = gainLR(o.pan || 0), L = b.L, R = b.R, end = Math.min(n, b.n - i0);
    const kf = to ? Math.pow(to / f0, 1 / slN) : 1;
    const w1 = Math.max(1, Math.round(0.01 * SR)), k1 = Math.pow(vol / 0.0001, 1 / w1), k2 = Math.pow(0.0001 / vol, 1 / Math.max(1, n - w1));
    const kd = Math.exp(-1 / ((o.dec || 0.05) * SR)), fadeN = Math.round(0.004 * SR);
    for (const side of sides) {
      const cents = side === 0 ? -o.det : side === 1 ? o.det : 0;
      let dt = f0 * Math.pow(2, cents / 1200) / SR, ph = 0, mph = 0, idx = fmi, g = env === 'wa' ? 0.0001 : 0, gd = vol;
      let c0 = 0, c1 = 0, c2 = 0, c3 = 0, c4 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      if (lp) [c0, c1, c2, c3, c4] = bq('lp', lp, o.lpq || 0.707);
      const gs = side === 0 ? gl : side === 1 ? gr : 1;
      for (let i = 0; i < end; i++) {
        let v;
        if (type === -1) { v = Math.sin(TAU * ph + idx * Math.sin(TAU * mph)); mph += dt * fm; if (mph >= 1) mph -= Math.floor(mph); idx *= fmk; }
        else if (type === 0) v = Math.sin(TAU * ph);
        else if (type === 1) v = ph < 0.25 ? 4 * ph : ph < 0.75 ? 2 - 4 * ph : 4 * ph - 4;
        else if (type === 2) { const q = ph + 0.5 >= 1 ? ph - 0.5 : ph + 0.5; v = 2 * q - 1 - blep(q, dt); }
        else { v = (ph < 0.5 ? 1 : -1) + blep(ph, dt) - blep(ph + 0.5 >= 1 ? ph - 0.5 : ph + 0.5, dt); }
        ph += dt; if (ph >= 1) ph -= Math.floor(ph);
        if (to && i < slN) dt *= kf;
        if (sat) v = Math.tanh(sat * v) / satN;
        let a;
        if (env === 'wa') { a = g; g *= i < w1 ? k1 : k2; }
        else { if (i < atkN) a = vol * (curve === 1 ? i / atkN : Math.pow(i / atkN, curve)); else { a = gd; gd *= kd; } if (n - i < fadeN) a *= (n - i) / fadeN; }
        if (trem) a *= 1 - trem * 0.5 * (1 + Math.sin(TAU * 7 * i / SR));
        v *= a;
        if (lp) { const y = c0 * v + c1 * x1 + c2 * x2 - c3 * y1 - c4 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; v = y; }
        const j = i0 + i;
        if (!R) L[j] += v;
        else if (side === -1) { L[j] += v * gl; R[j] += v * gr; }
        else if (side === 0) L[j] += v * gs; else R[j] += v * gs;
      }
    }
  }
  function opNoise(b, o) {
    const i0 = Math.round((o.when || 0) * SR), n = Math.max(1, Math.round(o.dur * SR)), vol = o.vol, env = o.env || 'ad';
    const atkN = Math.max(1, Math.round((o.atk || 0.002) * SR)), curve = o.curve || 1, kd = Math.exp(-1 / ((o.dec || 0.05) * SR)), fadeN = Math.round(0.004 * SR);
    const hp = o.hp ? bq('hp', o.hp, o.hpq || QDB(1)) : null, lp = o.lp ? bq('lp', o.lp, QDB(1)) : null, bp = o.bp || null, crk = o.crackle || 0, rev = !!o.rev;
    const [gl, gr] = gainLR(o.pan || 0), L = b.L, R = b.R, end = Math.min(n, b.n - i0);
    let h1 = 0, h2 = 0, hy1 = 0, hy2 = 0, l1 = 0, l2 = 0, ly1 = 0, ly2 = 0, b1 = 0, b2 = 0, by1 = 0, by2 = 0, bk = null, gd = vol, cp = crk * 40 / SR;
    const ck = Math.exp(-1 / ((o.dec || 0.4) * SR));
    for (let i = 0; i < end; i++) {
      let x, a;
      if (crk) { x = rnd() < cp ? nz() * 4 : 0; cp *= ck; a = vol; }
      else {
        x = nz();
        if (rev) { const r = i / n; a = vol * r * r * r; }
        else if (env === 'lin') a = vol * (1 - i / n);
        else if (env === 'sin') a = vol * Math.sin(Math.PI * i / n);
        else { if (i < atkN) a = vol * (curve === 1 ? i / atkN : Math.pow(i / atkN, curve)); else { a = gd; gd *= kd; } if (n - i < fadeN) a *= (n - i) / fadeN; }
      }
      if (bp) { if (!(i & 31)) bk = bq('bp', bp[0] * Math.pow(bp[1] / bp[0], i / n), bp[2]); const y = bk[0] * x + bk[1] * b1 + bk[2] * b2 - bk[3] * by1 - bk[4] * by2; b2 = b1; b1 = x; by2 = by1; by1 = y; x = y; }
      if (hp) { const y = hp[0] * x + hp[1] * h1 + hp[2] * h2 - hp[3] * hy1 - hp[4] * hy2; h2 = h1; h1 = x; hy2 = hy1; hy1 = y; x = y; }
      if (lp) { const y = lp[0] * x + lp[1] * l1 + lp[2] * l2 - lp[3] * ly1 - lp[4] * ly2; l2 = l1; l1 = x; ly2 = ly1; ly1 = y; x = y; }
      const v = x * a, j = i0 + i;
      if (!R) L[j] += v; else { L[j] += v * gl; R[j] += v * gr; }
    }
    if (rev) { const f = Math.round(0.012 * SR), e = Math.min(b.n, i0 + n); for (let k = 0; k < f; k++) { const j = e - f + k; if (j < 0) continue; const m = 1 - k / f; L[j] *= m; if (R) R[j] *= m; } }
  }
  // Small stereo plate (Freeverb-style: 4 damped combs + 2 allpasses per side), baked into Velvet buffers
  function* plate(b, wet, fb = 0.8) {
    const n = b.n, dry = new Float32Array(n), pre = Math.round(0.012 * SR), sc = SR / 44100;
    for (let i = 0; i < n; i++) dry[i] = (b.L[i] + b.R[i]) * 0.06;
    for (const [out, sp] of [[b.L, 0], [b.R, 23]]) {
      const cb = [1116, 1188, 1277, 1356].map((d) => new Float32Array(Math.round((d + sp) * sc))), ab = [556, 441].map((d) => new Float32Array(Math.round((d + sp) * sc)));
      const [q0, q1, q2, q3] = cb, [a0, a1] = ab, n0 = q0.length, n1 = q1.length, n2 = q2.length, n3 = q3.length, m0 = a0.length, m1 = a1.length;
      let i0 = 0, i1 = 0, i2 = 0, i3 = 0, j0 = 0, j1 = 0, z0 = 0, z1 = 0, z2 = 0, z3 = 0;
      for (let i = 0; i < n; i++) {
        const x = i >= pre ? dry[i - pre] : 0;
        let o, y;
        o = q0[i0]; z0 = o * 0.7 + z0 * 0.3; q0[i0] = x + z0 * fb; if (++i0 >= n0) i0 = 0; y = o;
        o = q1[i1]; z1 = o * 0.7 + z1 * 0.3; q1[i1] = x + z1 * fb; if (++i1 >= n1) i1 = 0; y += o;
        o = q2[i2]; z2 = o * 0.7 + z2 * 0.3; q2[i2] = x + z2 * fb; if (++i2 >= n2) i2 = 0; y += o;
        o = q3[i3]; z3 = o * 0.7 + z3 * 0.3; q3[i3] = x + z3 * fb; if (++i3 >= n3) i3 = 0; y += o;
        o = a0[j0]; a0[j0] = y + o * 0.5; y = o - y; if (++j0 >= m0) j0 = 0;
        o = a1[j1]; a1[j1] = y + o * 0.5; y = o - y; if (++j1 >= m1) j1 = 0;
        out[i] += y * wet;
        if (!(i & 4095)) yield;
      }
    }
  }

  /* ---------- recipes: a recipe pushes ops; the renderer sizes the buffer from them ---------- */
  const api = (ops) => {
    const x = {
      t: (f, dur = 0.15, type = 'sine', vol = 0.18, when = 0, to = null) => ops.push({ k: 't', f, dur, type, vol, when, to, env: 'wa' }),
      n: (dur = 0.2, vol = 0.15, when = 0, hp = 800) => ops.push({ k: 'n', dur, vol, when, hp, env: 'lin' }),
      c: (fs, dur, type, vol, step = 0) => fs.forEach((f, i) => x.t(f, dur, type, vol, i * step)),
      sweep: (dur, vol) => ops.push({ k: 'n', dur, vol, when: 0, env: 'sin', bp: [400, 2400, 0.8] }),
      t2: (o) => ops.push({ k: 't', ...o }),
      n2: (o) => ops.push({ k: 'n', ...o }),
      click: (f, vol, when = 0, pan = 0) => ops.push({ k: 'n', dur: 0.008, vol, when, pan, atk: 0.0004, dec: 0.0016, bp: [f, f, 1.2] }),
      bell: (f, dur, when, vol, fmi = 1.6, pan = 0, ratio = 3.5) => ops.push({ k: 't', f, dur, when, vol, fm: ratio, fmi, fmd: dur * 0.3, atk: 0.002, dec: dur * 0.32, pan }),
      thump: (vol, f0 = 170, f1 = 70, when = 0, pan = 0) => { ops.push({ k: 't', f: f0, to: f1, sl: 0.05, dur: 0.14, type: 'sine', vol, when, atk: 0.002, dec: 0.05, sat: 1.6, pan }); ops.push({ k: 'n', dur: 0.04, vol: vol * 0.35, when, lp: 900, atk: 0.001, dec: 0.012, pan }); },
    };
    return x;
  };
  // Classic: the original sounds, note for note (only the touch feedback is new in v16)
  const CLASSIC = {
    touch: [1, (x) => { x.click(3600, 1.1); x.t2({ f: 760, to: 660, sl: 0.012, dur: 0.07, type: 'triangle', vol: 0.8, atk: 0.0015, dec: 0.022 }); x.t2({ f: 1320, dur: 0.035, type: 'sine', vol: 0.45, atk: 0.001, dec: 0.01 }); x.t2({ f: 2640, dur: 0.02, type: 'sine', vol: 0.25, atk: 0.0008, dec: 0.005 }); }],
    touchTile: [1, (x) => { x.click(2800, 1.1); x.t2({ f: 600, to: 523, sl: 0.015, dur: 0.09, type: 'triangle', vol: 0.8, atk: 0.002, dec: 0.03 }); x.t2({ f: 1046, dur: 0.045, type: 'sine', vol: 0.45, atk: 0.001, dec: 0.012 }); x.t2({ f: 2092, dur: 0.025, type: 'sine', vol: 0.22, atk: 0.0008, dec: 0.006 }); }],
    touchBack: [0.95, (x) => { x.click(3000, 1); x.t2({ f: 700, to: 495, sl: 0.05, dur: 0.08, type: 'triangle', vol: 0.8, atk: 0.002, dec: 0.028 }); x.t2({ f: 1400, to: 990, sl: 0.05, dur: 0.05, type: 'sine', vol: 0.4, atk: 0.001, dec: 0.012 }); }],
    touchToggle: [0.9, (x) => { x.click(3600, 0.9); x.t2({ f: 660, dur: 0.035, type: 'triangle', vol: 0.7, atk: 0.0015, dec: 0.012 }); x.t2({ f: 1320, dur: 0.025, type: 'sine', vol: 0.35, atk: 0.001, dec: 0.007 }); x.click(4200, 0.7, 0.03); x.t2({ f: 880, dur: 0.04, type: 'triangle', vol: 0.65, atk: 0.0015, dec: 0.014, when: 0.03 }); x.t2({ f: 1760, dur: 0.025, type: 'sine', vol: 0.3, atk: 0.001, dec: 0.007, when: 0.03 }); }],
    softtick: [0.4, (x) => x.t(1500, 0.018, 'sine', 0.035), 1],
    whoosh: [0.45, (x) => x.sweep(0.32, 0.07)],
    reveal: [0.8, (x) => x.c([523, 659, 784], 0.35, 'triangle', 0.12, 0.06), 1],
    tick: [0.55, (x) => x.t(1200, 0.03, 'square', 0.05), 1],
    count: [0.7, (x) => x.t(440, 0.12, 'square', 0.1), 1],
    go: [0.75, (x) => x.c([523, 784, 1046], 0.4, 'sawtooth', 0.08, 0.04), 1],
    penalty: [0.85, (x) => { x.t(300, 0.25, 'sawtooth', 0.12, 0, 120); x.t(200, 0.3, 'sawtooth', 0.08, 0.12, 90); }],
    win: [0.85, (x) => x.c([659, 784, 988, 1318], 0.25, 'triangle', 0.12, 0.08), 1],
    applause: [0.7, (x) => { for (let i = 0; i < 14; i++) x.n(0.06, 0.1, i * 0.05 + rnd() * 0.03, 1500); }],
    buzzer: [0.7, (x) => x.t(140, 0.6, 'square', 0.14)],
    ding: [0.75, (x) => x.c([1318, 1760], 0.5, 'sine', 0.12, 0.08), 1],
    sip: [0.75, (x) => { x.t(300, 0.08, 'sine', 0.12, 0, 600); x.t(380, 0.08, 'sine', 0.1, 0.1, 700); }],
    bass: [1, (x) => x.t(70, 0.3, 'sine', 0.3, 0, 40)],
    sax: [0.65, (x) => { x.t(233, 0.5, 'sawtooth', 0.05); x.t(277, 0.6, 'sawtooth', 0.05, 0.35); x.t(208, 0.9, 'sawtooth', 0.05, 0.8); }],
    heartbeat: [1, (x) => { x.t(60, 0.12, 'sine', 0.4); x.t(55, 0.14, 'sine', 0.3, 0.18); }],
    drumroll: [0.7, (x) => { for (let i = 0; i < 18; i++) x.n(0.04, 0.08, i * 0.045, 300); }],
    cymbal: [0.55, (x) => x.n(0.9, 0.12, 0, 5000)],
    clash: [0.9, (x) => { x.n(0.25, 0.25, 0, 200); x.t(110, 0.3, 'square', 0.12, 0, 55); }],
    ko: [0.75, (x) => x.t(880, 0.5, 'square', 0.1, 0, 110)],
    boing: [0.8, (x) => x.t(200, 0.35, 'sine', 0.2, 0, 800)],
    correct: [0.8, (x) => x.c([784, 988, 1175], 0.3, 'triangle', 0.12, 0.07), 1],
    wrong: [0.75, (x) => { x.t(220, 0.3, 'square', 0.1); x.t(196, 0.45, 'square', 0.1, 0.25); }],
    chip: [0.7, (x) => { x.t(2400, 0.04, 'triangle', 0.08); x.t(2000, 0.05, 'triangle', 0.06, 0.05); }, 1],
    shimmer: [0.6, (x) => x.c([1046, 1318, 1568, 2093], 0.6, 'sine', 0.05, 0.05), 1],
  };
  const C5 = 523.25, D5 = 587.33, E5 = 659.26, G5 = 783.99, A5 = 880, C6 = 1046.5, D6 = 1174.66, E6 = 1318.51, G6 = 1567.98, A6 = 1760;
  const P5 = [C5, D5, E5, G5, A5], P6 = [C6, D6, E6, G6, A6], P4 = [392, 440, C5, D5, E5];
  // Velvet: warm sine/triangle bodies, felt thumps, FM bell partials, stereo, baked plate.
  // [gain, recipe(x, variant), variants, reverb wet, comb feedback]
  const VELVET = {
    touch: [1, (x, k) => { const f = P5[k], p = (k - 2) * 0.08; x.click(2600, 0.35, 0, p); x.thump(0.22, 240, 120, 0, p); x.t2({ f, dur: 0.18, type: 'sine', vol: 0.8, atk: 0.002, dec: 0.05, pan: p, det: 3 }); x.t2({ f: f * 2, dur: 0.08, type: 'triangle', vol: 0.16, atk: 0.002, dec: 0.025, lp: 3500, pan: p }); x.bell(f * 2, 0.24, 0, 0.42, 1.3, -p); }, 5, 0.12],
    touchTile: [1, (x, k) => { const f = P4[k], p = (k - 2) * 0.08; x.click(2200, 0.4, 0, p); x.thump(0.4, 200, 90, 0, p); x.t2({ f, dur: 0.24, type: 'sine', vol: 0.8, atk: 0.003, dec: 0.07, pan: p, det: 4 }); x.t2({ f: f * 2, dur: 0.12, type: 'triangle', vol: 0.2, atk: 0.003, dec: 0.035, lp: 3000, pan: p }); x.bell(f * 2, 0.3, 0.004, 0.5, 1.5, -p); x.bell(f * 4, 0.12, 0.002, 0.18, 0.8, p); }, 5, 0.14],
    touchBack: [0.95, (x) => { x.click(2400, 0.2, 0, 0.1); x.thump(0.3, 200, 90); [E5, C5].forEach((f, i) => { x.t2({ f, dur: 0.14, when: i * 0.05, type: 'sine', vol: 0.7, atk: 0.002, dec: 0.045, pan: 0.15 - i * 0.3, det: 3 }); x.bell(f * 2, 0.2, i * 0.05, 0.2, 1, 0.15 - i * 0.3); }); }, 1, 0.12],
    touchToggle: [0.95, (x, k) => { const ns = k ? [E5, C5] : [C5, E5]; x.click(3000, 0.2); ns.forEach((f, i) => { x.t2({ f, dur: 0.12, when: i * 0.035, type: 'sine', vol: 0.7, atk: 0.002, dec: 0.04, pan: i ? 0.2 : -0.2, det: 3 }); x.bell(f * 2, 0.18, i * 0.035, 0.22, 1, i ? -0.2 : 0.2); }); }, 2, 0.12],
    deal: [0.6, (x) => { x.n2({ dur: 0.07, vol: 0.7, atk: 0.002, dec: 0.022, bp: [3600, 1800, 0.9], pan: -0.25 }); x.thump(0.14, 210, 100, 0.012, 0.1); x.n2({ dur: 0.12, vol: 0.12, when: 0.01, atk: 0.01, dec: 0.04, hp: 5000, pan: 0.3 }); }, 1, 0.1],
    ringtick: [0.35, (x, k) => { const f = P6[k]; x.t2({ f, dur: 0.06, type: 'sine', vol: 0.8, atk: 0.0015, dec: 0.016, pan: (k - 2) * 0.15 }); x.bell(f, 0.1, 0, 0.25, 0.6); }, 5, 0.1],
    lock1: [0.8, (x) => { x.bell(E6, 0.7, 0, 0.6, 1.5, -0.25); x.bell(G6, 0.75, 0.045, 0.5, 1.4, 0.25); x.t2({ f: E5, dur: 0.5, type: 'sine', vol: 0.35, atk: 0.004, dec: 0.16, det: 4 }); x.n2({ dur: 0.3, vol: 0.12, atk: 0.03, dec: 0.08, hp: 5000, pan: 0.2 }); }, 1, 0.3],
    lock2: [0.9, (x) => { x.thump(0.75, 180, 75); [C5, G5].forEach((f, i) => x.t2({ f, dur: 0.6, when: i * 0.02, type: 'triangle', vol: 0.55, atk: 0.006, dec: 0.18, lp: 2400, pan: i ? 0.3 : -0.3, det: 5 })); x.t2({ f: C5 / 2, dur: 0.5, type: 'sine', vol: 0.4, atk: 0.006, dec: 0.15, sat: 1.4 }); x.bell(C6, 0.8, 0.02, 0.45, 2, 0); }, 1, 0.26],
    lock3: [1, (x) => {
      x.t2({ f: 55, to: 46, sl: 1.6, dur: 1.7, type: 'sine', vol: 0.55, atk: 0.42, curve: 2, dec: 0.45, sat: 2.6 });          // sub swell (saturated so phones hear it)
      x.t2({ f: 110, to: 98, sl: 1.4, dur: 1.4, type: 'triangle', vol: 0.3, atk: 0.4, curve: 2, dec: 0.3, lp: 700 });
      x.n2({ dur: 0.75, vol: 0.55, atk: 0.48, curve: 2, dec: 0.12, bp: [300, 3200, 1.4] });                                    // ignition whoosh
      x.thump(0.9, 130, 45, 0.48);
      x.n2({ dur: 1.0, when: 0.48, vol: 0.35, crackle: 1, dec: 0.35, hp: 2500, pan: 0.15 });                                   // light crackle
      [C6, E6, G6, A6, C6 * 2].forEach((f, i) => x.t2({ f, dur: 1.1, when: 0.5 + i * 0.03, type: 'sine', vol: 0.11, atk: 0.02, dec: 0.4, trem: 0.3, pan: (i - 2) * 0.22, det: 6 }));
      x.bell(C6, 1.2, 0.5, 0.4, 2.2, 0);
    }, 1, 0.3, 0.84],
    release: [0.7, (x) => { [G5, C6].forEach((f, i) => { x.bell(f, 0.45, i * 0.07, 0.55, 1.3, i ? 0.2 : -0.2); x.t2({ f: f / 2, dur: 0.3, when: i * 0.07, type: 'sine', vol: 0.3, atk: 0.003, dec: 0.09 }); }); }, 1, 0.22],
    reset: [0.6, (x) => { x.n2({ dur: 0.34, vol: 0.8, rev: 1, bp: [500, 3200, 1.1], pan: 0.1 }); x.thump(0.14, 200, 90, 0.33); x.bell(C6, 0.25, 0.33, 0.2, 1); }, 1, 0.16],
    endnight: [1, (x) => {
      [349.23, 440, C5, G5].forEach((f, i) => { x.t2({ f, dur: 0.75, when: i * 0.03, type: 'triangle', vol: 0.32, atk: 0.02, dec: 0.3, lp: 2200, pan: (i - 1.5) * 0.25, det: 5 }); x.bell(f * 2, 0.6, i * 0.03, 0.12, 1.2, (1.5 - i) * 0.25); });
      x.thump(0.6, 140, 55, 0.6);
      [261.63, 392, E5, 987.77, D6].forEach((f, i) => { x.t2({ f, dur: 2.2, when: 0.6 + i * 0.045, type: 'sine', vol: 0.34, atk: 0.015, dec: 0.75, pan: (i - 2) * 0.25, det: 5 }); x.bell(f * 2, 1.4, 0.6 + i * 0.045, 0.14, 1.6, (2 - i) * 0.25); });
      x.t2({ f: 65.41, dur: 1.6, when: 0.6, type: 'sine', vol: 0.28, atk: 0.05, dec: 0.5, sat: 2 });
      x.n2({ dur: 1.2, when: 0.62, vol: 0.06, atk: 0.2, dec: 0.4, hp: 6000 });
    }, 1, 0.34, 0.84],
    unlock: [0.85, (x) => { [C5, D5, E5, G5, A5, C6, E6].forEach((f, i) => { x.bell(f * 2, 0.5, i * 0.045, 0.3, 1.5, (i - 3) * 0.13); x.t2({ f, dur: 0.3, when: i * 0.045, type: 'sine', vol: 0.4, atk: 0.003, dec: 0.08, pan: (i - 3) * 0.13 }); }); x.n2({ dur: 0.7, when: 0.25, vol: 0.06, atk: 0.1, dec: 0.25, hp: 6000 }); }, 1, 0.3],
    preview: [0.9, (x) => {
      x.thump(0.3, 230, 110); x.t2({ f: D5, dur: 0.18, type: 'sine', vol: 0.7, atk: 0.002, dec: 0.05, det: 3 }); x.bell(D6, 0.24, 0, 0.3, 1.1);
      x.thump(0.3, 230, 110, 0.18); x.t2({ f: G5, dur: 0.18, when: 0.18, type: 'sine', vol: 0.7, atk: 0.002, dec: 0.05, det: 3 }); x.bell(G6, 0.24, 0.18, 0.3, 1.1);
      [C5, E5, G5].forEach((f, i) => { x.t2({ f, dur: 1.2, when: 0.42 + i * 0.05, type: 'sine', vol: 0.4, atk: 0.01, dec: 0.4, pan: (i - 1) * 0.3, det: 5 }); x.bell(f * 2, 0.9, 0.42 + i * 0.05, 0.25, 1.6, (1 - i) * 0.3); });
      x.bell(E6, 0.6, 1.0, 0.3, 1.4, -0.3); x.bell(G6, 0.6, 1.06, 0.25, 1.4, 0.3);
    }, 1, 0.3],
  };
  // Velvet versions of every other Classic sound: same gesture, warmer voice. Pitched UI sounds snap to C pentatonic.
  const velvetize = (ops, ui) => {
    const out = []; let k = 0;
    for (const o of ops) {
      if (o.k === 't' && o.env === 'wa') {
        const f = ui ? snap(o.f) : o.f, r = f / o.f, pan = ((k++ % 3) - 1) * 0.3;
        out.push({ ...o, f, to: o.to ? o.to * r : null, type: o.type === 'sine' ? 'sine' : ui ? 'triangle' : 'sawtooth', lp: o.type === 'sine' ? 0 : ui ? 3000 : 1700, sat: o.type !== 'sine' && ui ? 1.6 : 0, dur: o.dur * 1.15, pan, det: 4 });
        if (ui && f >= 400) out.push({ k: 't', f: f * 2, dur: o.dur * 1.5 + 0.2, when: o.when, vol: o.vol * 0.4, fm: 3.5, fmi: 1.4, fmd: 0.08, atk: 0.002, dec: o.dur * 0.6 + 0.06, pan: -pan });
      } else if (o.k === 'n') out.push({ ...o, lp: 6000, pan: (rnd() - 0.5) * 0.5 });
      else out.push(o);
    }
    return out;
  };
  const ALIAS = { tap: 'touch' };
  const lib = (p) => (p === 'velvet' ? VELVET : CLASSIC);
  const has = (p, name) => !!(lib(p)[name] || (p === 'velvet' && CLASSIC[name]));
  const defOf = (p, name) => {
    if (name === 'endnight' && p !== 'velvet') name = 'win';     // Classic End Night keeps its old fanfare
    name = ALIAS[name] || name;
    const v = p === 'velvet' && VELVET[name];
    if (v) return { p, name, g: v[0], r: v[1], vars: v[2] || 1, wet: v[3] || 0, fb: v[4] || 0.8 };
    const c = CLASSIC[name]; if (!c) return null;
    if (p !== 'velvet') return { p, name, g: c[0], r: c[1], vars: 1, wet: 0 };
    return { p, name, g: Math.min(1, c[0] * 1.1), r: c[1], vars: 1, wet: c[2] ? 0.2 : 0.14, fb: 0.8, ui: !!c[2], vz: 1 };
  };
  // Render one sound to PCM (Float32 channels at SR), normalized to -3 dBFS peak. A generator, so the idle
  // pre-render can stop between ops / reverb blocks and never hold the main thread for long.
  function* renderGen(def, k = 0) {
    seed = 1 + k * 7919 + def.name.length * 31;
    let ops = []; def.r(api(ops), k);
    if (def.vz) ops = velvetize(ops, def.ui);
    const st = def.p === 'velvet';
    const end = ops.reduce((m, o) => Math.max(m, (o.when || 0) + o.dur), 0) + 0.01, tail = def.wet ? 0.3 + def.wet * 2 : 0.01;
    const n = Math.ceil((end + tail) * SR), b = { n, L: new Float32Array(n), R: st ? new Float32Array(n) : null };
    for (const o of ops) { (o.k === 't' ? opTone : opNoise)(b, o); yield; }
    if (b.R && def.wet) yield* plate(b, def.wet, def.fb);
    const chs = b.R ? [b.L, b.R] : [b.L];
    let pk = 0; for (const c of chs) for (let i = 0; i < n; i++) { const a = Math.abs(c[i]); if (a > pk) pk = a; }
    const s = pk > 0 ? PEAK / pk : 1;
    let last = 0; for (const c of chs) for (let i = 0; i < n; i++) { c[i] *= s; if (Math.abs(c[i]) > 0.0015) last = Math.max(last, i); }
    const len = Math.min(n, last + Math.round(0.012 * SR)), fade = Math.round(0.01 * SR);
    const out = chs.map((c) => { const o = c.slice(0, Math.max(1, len)); for (let i = 0; i < fade && i < o.length; i++) o[o.length - 1 - i] *= i / fade; return o; });
    return { sr: SR, ch: out };
  }
  const render = (def, k) => { const g = renderGen(def, k); let r; do r = g.next(); while (!r.done); return r.value; };
  // 16-bit PCM WAV (HTMLAudio fallback, debug export)
  function wav(pcm) {
    const ch = pcm.ch.length, n = pcm.ch[0].length, bytes = n * ch * 2, buf = new ArrayBuffer(44 + bytes), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, pcm.sr, true); v.setUint32(28, pcm.sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, bytes, true);
    let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, pcm.ch[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return new Uint8Array(buf);
  }

  /* ================= playback ================= */
  const AC = W.AudioContext || W.webkitAudioContext;
  let mode = AC ? 'web' : 'html';                     // 'html' = WAV blob URLs on <audio> (Web Audio missing or broken)
  let ctx = null, master = null, comp = null, wet = null, dry = null, warm = false, armed = false, live = null, last = '', lastAt = 0, sil = null;
  const bufs = new Map(), urls = new Map(), lastPlay = {}, lastVar = {}, voices = [], hist = [];
  const MAX_VOICES = 8, DEDUPE_MS = 30;
  const level = () => (pack === 'velvet' ? 1 : 0.92);  // Velvet sits a little louder/fuller
  const IOS = /iP(hone|ad|od)/.test(NAV.userAgent || '') || (NAV.platform === 'MacIntel' && NAV.maxTouchPoints > 1);
  const DEBUG = /[?&]sounddebug=1\b/.test((W.location && W.location.search) || '');
  const keyOf = (def, k) => `${def.p}:${def.name}:${k}`;

  function ensureCtx() {
    if (ctx || mode !== 'web') return ctx;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4; comp.knee.value = 20; comp.attack.value = 0.003; comp.release.value = 0.15;
      master = ctx.createGain(); master.gain.value = muted ? 0 : level();
      // A compressor starts fully clamped and needs ~100 ms of running to open (that would swallow the first tap),
      // so the very first sounds go round it and the compressed path fades in once the context has run a moment.
      wet = ctx.createGain(); wet.gain.value = 0; dry = ctx.createGain(); dry.gain.value = 1;
      master.connect(comp); comp.connect(wet); wet.connect(ctx.destination); master.connect(dry); dry.connect(ctx.destination);
      ctx.addEventListener ? ctx.addEventListener('statechange', onState) : (ctx.onstatechange = onState);
    } catch (e) { ctx = null; mode = 'html'; }
    return ctx;
  }
  const session = () => { try { if (NAV.audioSession) NAV.audioSession.type = muted ? 'auto' : 'playback'; } catch (e) {} };
  // iOS before audioSession (16.4): a looping silent <audio> moves the page to the playback channel, so the ring/silent switch doesn't mute it
  const silentURL = () => { const n = 800, h = new Uint8Array(44 + n), v = new DataView(h.buffer); const w = (o, s) => { for (let i = 0; i < 4; i++) h[o + i] = s.charCodeAt(i); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true); h.fill(128, 44);
    let s = ''; h.forEach((c) => { s += String.fromCharCode(c); }); return 'data:audio/wav;base64,' + btoa(s); };
  function silentStart() {
    if (!IOS || NAV.audioSession || muted || D.hidden) return;
    try { if (!sil) { sil = new Audio(silentURL()); sil.loop = true; sil.preload = 'auto'; sil.disableRemotePlayback = true; sil.setAttribute('x-webkit-airplay', 'deny'); } const p = sil.play(); p && p.catch(() => {}); } catch (e) {}
  }
  const silentStop = () => { try { sil && sil.pause(); } catch (e) {} };

  // First pointerdown / touchend / click anywhere (and again whenever the context isn't running).
  // pointerdown is not a user activation on touch screens, so touchend/click also try.
  const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
  function arm() { if (armed) return; armed = true; GESTURES.forEach((t) => D.addEventListener(t, gesture, { capture: true, passive: true })); }
  function disarm() { if (!armed) return; armed = false; GESTURES.forEach((t) => D.removeEventListener(t, gesture, { capture: true })); }
  function gesture() {
    try {
      session();
      if (!ensureCtx()) { if (!muted) { silentStart(); schedule(); } disarm(); return; }
      if (ctx.state !== 'running') { const p = ctx.resume(); p && p.then(() => { if (ctx.state === 'running') disarm(); dbg(); }, () => {}); }
      const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0);  // iOS unlock kick
      if (!muted) { silentStart(); schedule(); }
      if (ctx.state === 'running') { disarm(); warmUp(); }
      dbg();
    } catch (e) {}
  }
  function onState() {
    dbg();
    if (!ctx) return;
    if (ctx.state === 'running') { disarm(); warmUp(); return; }
    arm();                                               // the next tap brings it back
    if (ctx.state === 'interrupted' || (ctx.state === 'suspended' && !D.hidden)) setTimeout(wake, 300);
  }
  function warmUp() {
    if (warm || !ctx) return; warm = true;
    setTimeout(() => { try { const t = ctx.currentTime; wet.gain.setTargetAtTime(1, t, 0.02); dry.gain.setTargetAtTime(0, t, 0.02); setTimeout(() => { try { dry.disconnect(); } catch (e) {} }, 300); } catch (e) {} dbg(); }, 160);
  }
  function wake() { if (!ctx || ctx.state === 'running' || ctx.state === 'closed' || D.hidden) return; try { const p = ctx.resume(); p && p.catch(() => {}); } catch (e) {} arm(); }
  const waitRunning = (ms) => new Promise((res) => {
    if (!ctx) return res(false);
    if (ctx.state === 'running') return res(true);
    const t0 = now(), tick = () => { if (ctx.state === 'running') return res(true); if (now() - t0 > ms) return res(false); setTimeout(tick, 16); };
    try { const p = ctx.resume(); p && p.then(() => res(ctx.state === 'running'), () => {}); } catch (e) {}
    tick();
  });
  const toBuf = (pcm) => { const b = ctx.createBuffer(pcm.ch.length, pcm.ch[0].length, pcm.sr); pcm.ch.forEach((c, i) => (b.copyToChannel ? b.copyToChannel(c, i) : b.getChannelData(i).set(c))); return b; };
  function buffer(def, k) {
    const key = keyOf(def, k);
    let b = bufs.get(key);
    if (!b) { b = toBuf(render(def, k)); bufs.set(key, b); }
    return b;
  }
  function start(def, k, buf) {
    if (!ctx || muted) return;
    while (voices.length >= MAX_VOICES) { const v = voices.shift(); try { v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.008); v.s.stop(ctx.currentTime + 0.03); } catch (e) {} }
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf;
    if (def.vars === 1) s.playbackRate.value = Math.pow(2, (Math.random() * 16 - 8) / 1200);   // ±8 cents so repeats never sound copy-pasted
    g.gain.value = def.g;
    s.connect(g); g.connect(master);
    const v = { s, g, name: def.name }; voices.push(v);
    s.onended = () => { const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1); try { g.disconnect(); } catch (e) {} };
    s.start(ctx.currentTime);
  }
  const htmlVoices = [];
  function htmlPlay(def, k) {
    try {
      const key = keyOf(def, k);
      let u = urls.get(key);
      if (!u) { u = URL.createObjectURL(new Blob([wav(render(def, k))], { type: 'audio/wav' })); urls.set(key, u); }
      while (htmlVoices.length >= MAX_VOICES) { const a = htmlVoices.shift(); try { a.pause(); } catch (e) {} }
      const a = new Audio(u); a.volume = Math.min(1, def.g * level()); htmlVoices.push(a);
      a.onended = () => { const i = htmlVoices.indexOf(a); if (i >= 0) htmlVoices.splice(i, 1); };
      const p = a.play(); p && p.catch(() => {});
    } catch (e) {}
  }
  function playDef(def) {
    let k = 0;
    if (def.vars > 1) { k = Math.floor(Math.random() * def.vars); if (k === lastVar[def.name]) k = (k + 1 + Math.floor(Math.random() * (def.vars - 1))) % def.vars; lastVar[def.name] = k; }
    if (mode === 'html') return htmlPlay(def, k);
    if (!ctx) return;                                    // no tap yet: the browser would block it anyway
    const buf = buffer(def, k);
    if (ctx.state === 'running') return start(def, k, buf);
    waitRunning(350).then((ok) => ok && start(def, k, buf));   // resume first, then schedule from the new currentTime
  }
  let touchUntil = 0;
  function play(name) {
    try {
      if (muted || !name) return;
      const t = now();
      if (name === 'tap' && t < touchUntil) return;      // the press already sounded on pointerdown
      if (t - (lastPlay[name] || -1e9) < DEDUPE_MS) return;
      const def = defOf(pack, name); if (!def) return;
      lastPlay[name] = t; last = name; lastAt = Date.now(); hist.push(name); if (hist.length > 40) hist.shift();
      playDef(def); dbg();
    } catch (e) {}
  }

  /* ---------- pre-render at idle (never during a screen change) ---------- */
  let queue = [], qTimer = 0;
  const ORDER = ['touch', 'touchTile', 'touchBack', 'touchToggle', 'softtick', 'whoosh', 'deal', 'reveal', 'ringtick', 'lock1', 'lock2', 'lock3', 'release', 'reset', 'buzzer', 'tick', 'count', 'go', 'win', 'endnight', 'unlock'];
  function schedule() {
    if (muted || (mode === 'web' && !ctx)) return;
    const names = [...new Set([...ORDER, ...Object.keys(CLASSIC), ...Object.keys(pack === 'velvet' ? VELVET : {})])].filter((n) => n !== 'preview' && has(pack, n));
    queue = [];
    for (const n of names) { const def = defOf(pack, n); if (!def) continue; for (let k = 0; k < def.vars; k++) { const key = keyOf(def, k); if (!(mode === 'web' ? bufs : urls).has(key)) queue.push([def, k, key]); } }
    pump();
  }
  const idle = (f) => (W.requestIdleCallback ? W.requestIdleCallback(f, { timeout: 2000 }) : setTimeout(() => f({ timeRemaining: () => 8 }), 60));
  let job = null;                                     // [key, generator] being rendered across idle slices
  function pump() {
    if (qTimer || (!queue.length && !job)) return;
    qTimer = 1;
    idle((dl) => {
      qTimer = 0;
      if (D.documentElement.classList.contains('hc-nav') || D.hidden) { qTimer = 1; setTimeout(() => { qTimer = 0; pump(); }, 250); return; }
      const dest = mode === 'web' ? bufs : urls, t0 = now();
      do {
        try {
          if (!job) {
            const [def, k, key] = queue.shift();
            if (def.p !== pack || muted || dest.has(key) || (mode === 'web' && !ctx)) continue;
            job = [key, renderGen(def, k)];
          }
          const r = job[1].next();
          if (r.done) { const key = job[0]; job = null; if (!dest.has(key)) dest.set(key, mode === 'web' ? toBuf(r.value) : URL.createObjectURL(new Blob([wav(r.value)], { type: 'audio/wav' }))); }
        } catch (e) { job = null; }
      } while ((queue.length || job) && (dl.timeRemaining() > 3 || now() - t0 < 8));
      dbg(); pump();
    });
  }

  /* ---------- touch feedback: one delegated handler, on press ---------- */
  const TOUCH = 'button, [role="button"], [role="tab"], a.btn, .tile, .chip, [data-nav], [data-back]';
  const SKIP = '#holdBtn, .hold, [data-nosfx], [disabled], [aria-disabled="true"]';
  const touchName = (el) => (el.matches('.tile') ? 'touchTile' : el.matches('[data-back], .nav-back, [data-nav="home"]') ? 'touchBack'
    : el.matches('.seg button, .side-switch [data-side], .heat-steps .hs, [role="tab"], [data-prefsw], [data-sw]') ? 'touchToggle' : 'touch');
  let pressAt = -1e9, keyAt = -1e9;
  function onPress(e) {
    try {
      const t = now();
      if (e.type === 'pointerdown' && (e.button > 0 || e.isPrimary === false)) return;
      const el = e.target && e.target.closest && e.target.closest(TOUCH);
      if (!el || el.closest(SKIP)) return;
      if (e.type === 'click') {
        if (t - pressAt < 1500) { touchUntil = Math.max(touchUntil, t + 250); return; }   // pointer press already sounded
        if (t - keyAt > 600) return;                     // a script's .click(), not the keyboard: the handler decides
      } else pressAt = t;
      if (armed) gesture();                              // first tap of the session: unlock before its own sound
      play(touchName(el));
      touchUntil = t + (e.type === 'click' ? 250 : 1500);
    } catch (err) {}
  }
  D.addEventListener('pointerdown', onPress, { capture: true, passive: true });
  D.addEventListener('click', onPress, { capture: true, passive: true });
  D.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') keyAt = now(); }, { capture: true, passive: true });

  /* ---------- lifecycle: tab switch, bfcache, phone lock ---------- */
  D.addEventListener('visibilitychange', () => { if (D.hidden) { silentStop(); ringStop(); } else { wake(); silentStart(); } dbg(); });
  W.addEventListener('pageshow', () => { wake(); silentStart(); });
  W.addEventListener('focus', wake);
  arm();

  /* ---------- Velvet hold ring: a live tone that follows the ring ---------- */
  function ringStart() {
    if (muted || !ctx || mode !== 'web') return;
    ringStop();
    try {
      const t = ctx.currentTime, o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o2g = ctx.createGain(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      o1.type = 'sine'; o2.type = 'triangle'; o1.frequency.value = 392; o2.frequency.value = 784; o2g.gain.value = 0.22;
      lp.type = 'lowpass'; lp.frequency.value = 1300; lp.Q.value = 0.5;
      g.gain.setValueAtTime(0, t); g.gain.setTargetAtTime(0.3, t, 0.06);
      o1.connect(lp); o2.connect(o2g); o2g.connect(lp); lp.connect(g); g.connect(master);
      o1.start(t); o2.start(t);
      live = { o1, o2, lp, g, f: 392, seg: 0 };
      if (ctx.state !== 'running') waitRunning(350);
    } catch (e) { live = null; }
  }
  function ringTurn(v) {
    if (!live) return;
    const turns = Math.max(0, Math.min(3, v)), f = 392 * Math.pow(2, (2 * turns) / 3), t = ctx.currentTime;
    if (Math.abs(f - live.f) / f > 0.002) { live.f = f; live.o1.frequency.setTargetAtTime(f, t, 0.03); live.o2.frequency.setTargetAtTime(f * 2, t, 0.03); live.lp.frequency.setTargetAtTime(1300 + 700 * turns, t, 0.05); }
    const s = Math.floor(turns * 8);
    if (s > live.seg) { live.seg = s; if (s % 8) play('ringtick'); }   // a soft tick per eighth of a turn; level marks get the lock sound
  }
  function ringStop() {
    if (!live) return;
    const l = live; live = null;
    try { const t = ctx.currentTime; l.g.gain.cancelScheduledValues(t); l.g.gain.setTargetAtTime(0, t, 0.04); l.o1.stop(t + 0.3); l.o2.stop(t + 0.3); setTimeout(() => { try { l.g.disconnect(); } catch (e) {} }, 400); } catch (e) {}
  }

  /* ---------- debug strip (?sounddebug=1) ---------- */
  let dbgEl = null;
  const state = () => ({ ctx: ctx ? ctx.state : 'none', mode, muted, pack, last, lastAt, voices: voices.length, buffers: bufs.size + urls.size, armed, queue: queue.length + (job ? 1 : 0), compressor: !!comp, compressed: warm, hist: hist.slice() });
  function dbg() {
    if (!DEBUG) return;
    try {
      if (!dbgEl) { if (!D.body) return; dbgEl = D.createElement('div'); dbgEl.id = 'sfx-debug'; dbgEl.setAttribute('aria-hidden', 'true'); dbgEl.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:2147483647;pointer-events:none;font:11px/1.35 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.72);padding:4px 7px;border-radius:6px;white-space:pre'; D.body.appendChild(dbgEl); setInterval(dbg, 500); }
      const s = state();
      dbgEl.textContent = `ctx ${s.ctx} | ${s.mode} | ${s.muted ? 'muted' : 'sound on'} | ${s.pack}\nlast ${s.last || '-'}${s.lastAt ? ' @' + new Date(s.lastAt).toTimeString().slice(0, 8) : ''} | voices ${s.voices} | buffers ${s.buffers}`;
    } catch (e) {}
  }
  if (DEBUG) { if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', dbg); else dbg(); }

  /* ---------- public API (callers unchanged: SFX.play('name')) ---------- */
  function setMuted(m) {
    muted = !!m; store.set('hc_muted', muted ? '1' : '0');
    session();
    if (muted) { silentStop(); ringStop(); } else { gesture(); }   // unmuting is a tap: unlock + warm the buffers
    if (master) { try { master.gain.setTargetAtTime(muted ? 0 : level(), ctx.currentTime, 0.015); } catch (e) { master.gain.value = muted ? 0 : level(); } }
    dbg(); return muted;
  }
  return {
    play,
    get muted() { return muted; },
    get pack() { return pack; },
    toggle() { return setMuted(!muted); },
    setMuted,
    setPack(p) {
      const n = p === 'velvet' ? 'velvet' : 'classic'; if (n === pack) return;
      pack = n; ringStop();
      if (master && !muted) { try { master.gain.setTargetAtTime(level(), ctx.currentTime, 0.02); } catch (e) {} }
      if (ctx || mode === 'html') schedule();
      dbg();
    },
    unlock() { gesture(); },
    // Home hold ring. Classic keeps its original sounds (tick per level, tap on reset); Velvet gets the full set.
    ring(ev, v) {
      try {
        if (pack !== 'velvet') { if (ev === 'level') play('softtick'); else if (ev === 'reset') play('tap'); return; }
        if (ev === 'start') ringStart();
        else if (ev === 'turn') ringTurn(v);
        else if (ev === 'level') { play('lock' + Math.max(1, Math.min(3, v | 0))); if (live) { const t = ctx.currentTime; live.g.gain.setTargetAtTime(0.3 + 0.04 * v, t, 0.05); } }
        else if (ev === 'release') { ringStop(); play('release'); }
        else if (ev === 'cancel') ringStop();
        else if (ev === 'reset') play('reset');
      } catch (e) {}
    },
    // Basic users tapping the locked Velvet option hear ~2 s of it before the paywall. Muted: no preview.
    preview() {
      return new Promise((res) => {
        try {
          if (muted) return res(false);
          gesture();
          const def = defOf('velvet', 'preview');
          if (mode !== 'html' && !ctx) return res(false);
          playDef(def); last = 'preview'; lastAt = Date.now(); hist.push('preview'); dbg();
          setTimeout(() => res(true), 2000);
        } catch (e) { res(false); }
      });
    },
    state,
    // test/debug hooks
    _render: (p, name, k = 0) => { const d = defOf(p, name); return d ? render(d, k) : null; },
    _names: (p) => [...new Set([...Object.keys(CLASSIC), ...Object.keys(p === 'velvet' ? VELVET : {})])],
    _vars: (p, name) => { const d = defOf(p, name); return d ? d.vars : 0; },
    _wav: wav,
    _ctx: () => ({ ctx, master, comp, wet, dry }),
  };
})();
