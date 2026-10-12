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
  // v16.1 fire: filtered noise with a slow random amplitude (flicker), low-pass sweeping lp[0] -> lp[1] over `sl`,
  // plus a 1-4 kHz sizzle band (`hiss`) so phone speakers hear the fire. Stereo = decorrelated noise per side.
  function* opFire(b, o) {
    const i0 = Math.round((o.when || 0) * SR), n = Math.max(1, Math.round(o.dur * SR)), vol = o.vol, env = o.env || 'ad';
    const atkN = Math.max(1, Math.round((o.atk || 0.002) * SR)), curve = o.curve || 1, kd = Math.exp(-1 / ((o.dec || 0.3) * SR)), fadeN = Math.round(0.006 * SR);
    const [f0, f1] = o.lp || [800, 800], slN = Math.max(1, Math.round((o.sl || o.dur) * SR)), hiss = o.hiss || 0, flick = o.flick == null ? 0.5 : o.flick;
    const L = b.L, R = b.R, end = Math.min(n, b.n - i0), hop = Math.max(1, Math.round(SR / ((o.rate || 7) * 2))), ks = 1 - Math.exp(-1 / (hop * 0.8));
    const fl = new Float32Array(end), hs = new Float32Array(end);   // shared flicker (body) and a faster one (sizzle)
    let tg = 1, cur = 1, tg2 = 1, cur2 = 1;
    for (let i = 0; i < end; i++) {
      if (i % hop === 0) tg = 1 - flick * Math.pow(rnd(), 1.4);
      if (i % (hop >> 1 || 1) === 0) tg2 = 1 - flick * rnd();
      cur += (tg - cur) * ks; cur2 += (tg2 - cur2) * ks * 2; fl[i] = cur; hs[i] = cur2;
      if (!(i & 16383)) yield;
    }
    const sides = R ? [0, 1] : [-1], [gl, gr] = gainLR(o.pan || 0);
    const hb = bq('bp', o.hf || 2400, 0.7), flat = env === 'flat', BL = 4096;
    for (const side of sides) {
      const out = side === 1 ? R : L, gs = side === 0 ? gl : side === 1 ? gr : 1, st = new Float64Array(10);   // filter + envelope state between blocks
      st[9] = vol;
      // plain function per block (hot loops inside a generator optimize poorly); the generator only yields between blocks
      const block = (from, to) => {
        let l1 = st[0], l2 = st[1], ly1 = st[2], ly2 = st[3], h1 = st[4], h2 = st[5], hy1 = st[6], hy2 = st[7], br = st[8], gd = st[9];
        const [c0, c1, c2, c3, c4] = hb;
        let k0 = 0, k1 = 0, k2 = 0, k3 = 0, k4 = 0;
        for (let i = from; i < to; i++) {
          if (!(i & 31) || i === from) { const c = bq('lp', f0 * Math.pow(f1 / f0, Math.min(1, i / slN)), 0.9); k0 = c[0]; k1 = c[1]; k2 = c[2]; k3 = c[3]; k4 = c[4]; }
          const w = nz(); br = br * 0.985 + w * 0.15;                    // a little brown noise = rumble
          let x = w * 0.8 + br * 0.45;
          const y = k0 * x + k1 * l1 + k2 * l2 - k3 * ly1 - k4 * ly2; l2 = l1; l1 = x; ly2 = ly1; ly1 = y; x = y * fl[i];
          if (hiss) { const z = nz(), hy = c0 * z + c1 * h1 + c2 * h2 - c3 * hy1 - c4 * hy2; h2 = h1; h1 = z; hy2 = hy1; hy1 = hy; x += hy * hiss * hs[i]; }
          let a;
          if (flat) a = vol;
          else { if (i < atkN) a = vol * (curve === 1 ? i / atkN : Math.pow(i / atkN, curve)); else { a = gd; gd *= kd; } if (n - i < fadeN) a *= (n - i) / fadeN; }
          out[i0 + i] += x * a * gs;
        }
        st[0] = l1; st[1] = l2; st[2] = ly1; st[3] = ly2; st[4] = h1; st[5] = h2; st[6] = hy1; st[7] = hy2; st[8] = br; st[9] = gd;
      };
      for (let i = 0; i < end; i += BL) { block(i, Math.min(end, i + BL)); yield; }
    }
  }
  // v16.1 crackle: sparse random pops (1.5-5.5 ms bursts through a 2-6 kHz resonance, a few low woody snaps);
  // density `rate` per second decaying with `rdec`, amplitude decaying with `adec`.
  function* opPops(b, o) {
    const i0 = Math.round((o.when || 0) * SR), dur = o.dur, vol = o.vol, [fa, fb] = o.f || [2000, 6000], L = b.L, R = b.R;
    let t = 0, cnt = 0;
    for (;;) {
      const rate = Math.max(0.5, o.rate * (o.rdec ? Math.exp(-t / o.rdec) : 1));
      t += -Math.log(1 - rnd() * 0.999) / rate; if (t >= dur) break;
      const snapP = rnd() < (o.snap || 0.12), amp = vol * (0.25 + 0.75 * Math.pow(rnd(), 1.5)) * (o.adec ? Math.exp(-t / o.adec) : 1) * (snapP ? 0.8 : 1);
      const len = Math.round((snapP ? 0.006 : 0.0015 + rnd() * 0.004) * SR), f = snapP ? 700 + rnd() * 700 : fa * Math.pow(fb / fa, rnd());
      const c = bq('bp', f, snapP ? 1.2 : 1.6), [gl, gr] = gainLR((rnd() - 0.5) * (o.spread == null ? 1.2 : o.spread)), s0 = i0 + Math.round(t * SR);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let j = 0; j < len && s0 + j < b.n; j++) {
        const x = (nz() + (j === 0 ? 3 : 0)) * Math.exp(-j / (len * 0.28));
        const y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2; x2 = x1; x1 = x; y2 = y1; y1 = y;
        const v = y * amp * 2.2;
        if (!R) L[s0 + j] += v; else { L[s0 + j] += v * gl; R[s0 + j] += v * gr; }
      }
      if (!(++cnt % 12)) yield;
    }
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
      fire: (o) => ops.push({ k: 'f', ...o }),
      pops: (o) => ops.push({ k: 'p', ...o }),
      n2: (o) => ops.push({ k: 'n', ...o }),
      click: (f, vol, when = 0, pan = 0) => ops.push({ k: 'n', dur: 0.008, vol, when, pan, atk: 0.0004, dec: 0.0016, bp: [f, f, 1.2] }),
      bell: (f, dur, when, vol, fmi = 1.6, pan = 0, ratio = 3.5) => ops.push({ k: 't', f, dur, when, vol, fm: ratio, fmi, fmd: dur * 0.3, atk: 0.002, dec: dur * 0.32, pan }),
      thump: (vol, f0 = 170, f1 = 70, when = 0, pan = 0) => { ops.push({ k: 't', f: f0, to: f1, sl: 0.05, dur: 0.14, type: 'sine', vol, when, atk: 0.002, dec: 0.05, sat: 1.6, pan }); ops.push({ k: 'n', dur: 0.04, vol: vol * 0.35, when, lp: 900, atk: 0.001, dec: 0.012, pan }); },
    };
    return x;
  };
  // v16.1 home hold ring: shared fire layers (both packs); each pack puts its own voice on top
  const FIRE = {
    ignite: (x, v = 1) => {                           // whoosh as it locks + punch + sub swell (saturated so phones hear it)
      x.n2({ dur: 0.42, vol: 0.7 * v, atk: 0.014, curve: 1.5, dec: 0.12, bp: [380, 3400, 1.1] });
      x.thump(0.8 * v, 140, 44);
      x.t2({ f: 58, to: 45, sl: 1.3, dur: 1.4, type: 'sine', vol: 0.36 * v, atk: 0.05, dec: 0.5, sat: 2.6 });
    },
    roar: (x, dur, v, lp0, lp1, sl, o = {}) => x.fire({ dur, vol: v, atk: 0.03, dec: dur * 0.42, lp: [lp0, lp1], sl, flick: 0.6, rate: 8, hiss: 1.1, ...o }),
    crackle: (x, dur, rate, v, when = 0, o = {}) => x.pops({ dur, rate, vol: v, when, rdec: dur * 0.6, adec: dur * 0.9, f: [2000, 6000], ...o }),
    loop: (x, lp) => { x.fire({ dur: LOOP + XF, vol: 0.9, env: 'flat', lp: [lp, lp], flick: 0.55, rate: 6, hiss: 0.8 }); x.pops({ dur: LOOP + XF, rate: 12, vol: 0.5, f: [1800, 6000] }); },
    tail: (x) => {                                     // embers: roar cooling down, crackle thinning out (~1.1 s)
      x.fire({ dur: 1.15, vol: 0.5, atk: 0.12, curve: 1.5, dec: 0.45, lp: [1800, 650], sl: 1.1, flick: 0.7, rate: 6, hiss: 0.7 });
      x.pops({ dur: 1.1, rate: 26, vol: 0.5, rdec: 0.7, adec: 0.9, f: [2000, 6000], snap: 0.18 });
    },
    burst: (x) => {                                    // release at the top level: flame burst
      x.n2({ dur: 0.5, vol: 0.8, atk: 0.006, dec: 0.13, bp: [520, 2800, 1] });
      x.fire({ dur: 0.85, vol: 1, atk: 0.008, dec: 0.24, lp: [3600, 900], sl: 0.7, flick: 0.5, rate: 10, hiss: 1.1 });
      x.thump(0.65, 160, 55);
      x.pops({ dur: 0.7, rate: 55, vol: 0.55, rdec: 0.35, adec: 0.5, f: [2000, 6000] });
    },
  };
  const LOOP = 2, XF = 0.25;                          // roar bed loop length + crossfade (seamless)
  const DRIVE = { lock3: 2, hotrelease: 1.6 };       // top-level sounds get soft saturation (more heat, less crest)
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
    // v16.1 hold ring (Classic palette: triangle/square/saw, bright and game-show)
    ringtick: [0.42, (x, k) => { const f = [988, 1109, 1245, 1319, 1480, 1661, 1865][k]; x.click(4200, 0.55); x.t2({ f, dur: 0.045, type: 'square', vol: 0.32, atk: 0.001, dec: 0.012, lp: 5200 }); x.t2({ f: f / 2, dur: 0.055, type: 'triangle', vol: 0.55, atk: 0.001, dec: 0.016 }); }, 0, 7],
    lock1: [0.75, (x) => { x.click(5200, 0.5); [1318.5, 1760, 2637, 3520].forEach((f, i) => x.t2({ f, dur: 0.28, when: i * 0.035, type: 'triangle', vol: 0.5 - i * 0.06, atk: 0.001, dec: 0.07 })); x.t2({ f: 659.3, dur: 0.22, type: 'sine', vol: 0.32, atk: 0.002, dec: 0.06 }); x.n2({ dur: 0.38, vol: 0.12, atk: 0.03, dec: 0.1, hp: 6500 }); }],
    lock2: [0.88, (x) => { x.thump(0.55, 175, 70); x.t2({ f: 1046.5, dur: 0.3, when: 0.01, type: 'triangle', vol: 0.3, atk: 0.002, dec: 0.08 }); x.fire({ dur: 0.4, vol: 0.25, atk: 0.01, dec: 0.12, lp: [1000, 2600], flick: 0.5, rate: 10, hiss: 0.8 }); [523.25, 783.99].forEach((f) => x.t2({ f, dur: 0.48, type: 'sawtooth', vol: 0.3, atk: 0.003, dec: 0.13, lp: 2300, sat: 1.3 })); x.t2({ f: 261.6, dur: 0.42, type: 'triangle', vol: 0.45, atk: 0.003, dec: 0.12 }); x.t2({ f: 130.8, dur: 0.35, type: 'square', vol: 0.18, atk: 0.003, dec: 0.1, lp: 900 }); x.pops({ dur: 0.36, rate: 70, vol: 0.22, rdec: 0.25, f: [3000, 7000], snap: 0 }); x.n2({ dur: 0.3, vol: 0.14, atk: 0.004, dec: 0.08, hp: 5000 }); }],
    lock3: [1, (x) => { FIRE.ignite(x); FIRE.roar(x, 1.45, 0.95, 480, 3300, 0.42); FIRE.crackle(x, 1.35, 38, 0.55); [523.25, 783.99, 1046.5].forEach((f, i) => x.t2({ f, dur: 0.55, when: 0.01 + i * 0.03, type: 'sawtooth', vol: 0.2, atk: 0.004, dec: 0.16, lp: 3200 })); x.t2({ f: 1318.5, dur: 0.6, when: 0.1, type: 'triangle', vol: 0.18, atk: 0.003, dec: 0.18, trem: 0.4 }); x.t2({ f: 116.5, dur: 1.0, type: 'triangle', vol: 0.3, atk: 0.04, dec: 0.35, lp: 800 }); }],
    hottail: [0.7, (x) => FIRE.tail(x)],
    hotrelease: [0.95, (x) => { FIRE.burst(x); [783.99, 1046.5].forEach((f, i) => x.t2({ f, dur: 0.32, when: 0.02 + i * 0.05, type: 'sawtooth', vol: 0.22, atk: 0.003, dec: 0.09, lp: 3000 })); x.t2({ f: 1568, dur: 0.35, when: 0.1, type: 'triangle', vol: 0.18, atk: 0.002, dec: 0.1 }); }],
    release: [0.7, (x) => { x.click(3800, 0.5); x.t2({ f: 784, dur: 0.12, type: 'triangle', vol: 0.6, atk: 0.0015, dec: 0.04 }); x.t2({ f: 1046.5, dur: 0.2, when: 0.06, type: 'triangle', vol: 0.6, atk: 0.0015, dec: 0.06 }); x.t2({ f: 2093, dur: 0.1, when: 0.06, type: 'sine', vol: 0.2, atk: 0.001, dec: 0.03 }); }],
    roarloop: [0.6, (x) => FIRE.loop(x, 2600)],
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
    // v16.1 hold ring: ticks rise through C pentatonic within each turn (k = eighth of the turn)
    ringtick: [0.32, (x, k) => { const f = [C6, D6, E6, G6, A6, C6 * 2, D6 * 2][k], p = (k - 3) * 0.1; x.n2({ dur: 0.012, vol: 0.3, atk: 0.0005, dec: 0.003, lp: 1800, pan: p }); x.click(2600, 0.22, 0, p); x.t2({ f, dur: 0.075, type: 'sine', vol: 0.8, atk: 0.0015, dec: 0.02, pan: p }); x.bell(f, 0.13, 0, 0.3, 0.7, -p); }, 7, 0.1],
    lock1: [0.6, (x) => { x.thump(0.22, 260, 140); [E6, G6, C6 * 2].forEach((f, i) => x.bell(f, 0.75, i * 0.04, 0.55 - i * 0.08, 1.5, (i - 1) * 0.3)); x.t2({ f: E5, dur: 0.5, type: 'sine', vol: 0.32, atk: 0.004, dec: 0.16, det: 4 }); x.n2({ dur: 0.42, vol: 0.13, atk: 0.03, dec: 0.12, hp: 6500, pan: 0.2 }); }, 1, 0.3],
    lock2: [1, (x) => { x.thump(0.75, 180, 75); [C5, G5].forEach((f, i) => x.t2({ f, dur: 0.6, when: i * 0.02, type: 'triangle', vol: 0.55, atk: 0.006, dec: 0.18, lp: 2400, pan: i ? 0.3 : -0.3, det: 5 })); x.t2({ f: C5 / 2, dur: 0.5, type: 'sine', vol: 0.42, atk: 0.006, dec: 0.15, sat: 1.4 }); x.bell(C6, 0.8, 0.02, 0.42, 2, 0); x.fire({ dur: 0.4, vol: 0.22, atk: 0.01, dec: 0.12, lp: [900, 2400], flick: 0.5, rate: 10, hiss: 0.5 }); x.pops({ dur: 0.38, rate: 55, vol: 0.18, rdec: 0.25, f: [2500, 6500], snap: 0 }); }, 1, 0.26],
    lock3: [1, (x) => {
      FIRE.ignite(x, 0.65);                                                                                 // whoosh + punch + sub swell, at once
      x.t2({ f: 110, to: 98, sl: 1.2, dur: 1.2, type: 'triangle', vol: 0.3, atk: 0.04, dec: 0.35, lp: 700 });
      FIRE.roar(x, 1.5, 1.25, 450, 3000, 0.45);                                                               // fire roar opening up
      FIRE.crackle(x, 1.4, 34, 0.5, 0.03);
      [C6, E6, G6, A6, C6 * 2].forEach((f, i) => x.t2({ f, dur: 1.1, when: 0.04 + i * 0.03, type: 'sine', vol: 0.1, atk: 0.02, dec: 0.4, trem: 0.3, pan: (i - 2) * 0.22, det: 6 }));
      x.bell(C6, 1.2, 0.03, 0.38, 2.2, 0);
    }, 1, 0.28, 0.84],
    hottail: [0.95, (x) => FIRE.tail(x), 1, 0.18],
    hotrelease: [0.95, (x) => { FIRE.burst(x); [G5, C6].forEach((f, i) => { x.bell(f, 0.6, 0.03 + i * 0.07, 0.45, 1.4, i ? 0.25 : -0.25); x.t2({ f: f / 2, dur: 0.4, when: 0.03 + i * 0.07, type: 'triangle', vol: 0.28, atk: 0.004, dec: 0.12, lp: 1800 }); }); }, 1, 0.24],
    release: [0.7, (x) => { [G5, C6].forEach((f, i) => { x.bell(f, 0.45, i * 0.07, 0.55, 1.3, i ? 0.2 : -0.2); x.t2({ f: f / 2, dur: 0.3, when: i * 0.07, type: 'sine', vol: 0.3, atk: 0.003, dec: 0.09 }); }); }, 1, 0.22],
    roarloop: [0.6, (x) => FIRE.loop(x, 2200)],
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
    if (p !== 'velvet') return { p, name, g: c[0], r: c[1], vars: c[3] || 1, wet: 0 };
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
    for (const o of ops) { if (o.k === 'f') yield* opFire(b, o); else if (o.k === 'p') yield* opPops(b, o); else { (o.k === 't' ? opTone : opNoise)(b, o); yield; } }
    const dr = DRIVE[def.name];
    if (dr) {                                           // soft saturation: the fire sounds denser/louder at the same -3 dBFS peak
      let pk = 0; for (const c of [b.L, b.R]) if (c) for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(c[i]));
      yield;
      const k = Math.tanh(dr), sat = (c, a, z) => { for (let i = a; i < z; i++) c[i] = Math.tanh(dr * c[i] / pk) / k * pk; };
      if (pk > 0) for (const c of [b.L, b.R]) if (c) for (let i = 0; i < n; i += 8192) { sat(c, i, Math.min(n, i + 8192)); yield; }
    }
    if (b.R && def.wet) yield* plate(b, def.wet, def.fb);
    let chs = b.R ? [b.L, b.R] : [b.L];
    if (def.name === 'roarloop') {                     // seamless loop: equal-power crossfade of the end into the start
      const ln = Math.round(LOOP * SR), xf = Math.round(XF * SR);
      const xfade = (c) => { const o = c.slice(0, ln); for (let i = 0; i < xf; i++) { const k = i / xf; o[i] = c[i] * Math.sqrt(k) + c[ln + i] * Math.sqrt(1 - k); } return o; };
      const peak = (c) => { let m = 0; for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > m) m = v; } return m; };
      const xc = []; for (const c of chs) { xc.push(xfade(c)); yield; }
      chs = xc; let pk = 0; for (const c of chs) pk = Math.max(pk, peak(c));
      yield;
      const scale = (c, g) => { for (let i = 0; i < c.length; i++) c[i] *= g; };
      for (const c of chs) { scale(c, PEAK / pk); yield; }
      return { sr: SR, ch: chs };
    }
    yield;
    const pkOf = (c) => { let m = 0; for (let i = 0; i < n; i++) { const a = Math.abs(c[i]); if (a > m) m = a; } return m; };
    const scl = (c, g) => { let l = 0; for (let i = 0; i < n; i++) { c[i] *= g; if (Math.abs(c[i]) > 0.0015) l = i; } return l; };
    let pk = 0; for (const c of chs) pk = Math.max(pk, pkOf(c));
    yield;
    const s = pk > 0 ? PEAK / pk : 1;
    let last = 0; for (const c of chs) { last = Math.max(last, scl(c, s)); yield; }
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
  let ctx = null, master = null, comp = null, wet = null, dry = null, warm = false, armed = false, last = '', lastAt = 0, sil = null;
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
  function start(def, k, buf, o) {
    if (!ctx || muted) return;
    while (voices.length >= MAX_VOICES) { const v = voices.shift(); try { v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.008); v.s.stop(ctx.currentTime + 0.03); } catch (e) {} }
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf;
    if (o && o.rate) s.playbackRate.value = o.rate;
    else if (def.vars === 1) s.playbackRate.value = Math.pow(2, (Math.random() * 16 - 8) / 1200);   // ±8 cents so repeats never sound copy-pasted
    g.gain.value = def.g;
    s.connect(g); g.connect(master);
    const v = { s, g, name: def.name }; voices.push(v);
    s.onended = () => { const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1); try { g.disconnect(); } catch (e) {} };
    s.start(ctx.currentTime + ((o && o.delay) || 0));
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

  // Ring sounds pick their variant / pitch / delay (ticks rise with the ring; the ember tail starts after the lock)
  function ringPlay(name, o = {}) {
    try {
      if (muted) return;
      const t = now();
      if (t - (lastPlay[name] || -1e9) < DEDUPE_MS) return;
      const def = defOf(pack, name); if (!def) return;
      const k = Math.max(0, Math.min(def.vars - 1, o.k || 0));
      lastPlay[name] = t; last = name; lastAt = Date.now(); hist.push(name); if (hist.length > 40) hist.shift();
      if (mode === 'html') { o.delay ? setTimeout(() => htmlPlay(def, k), o.delay * 1000) : htmlPlay(def, k); return dbg(); }
      if (!ctx) return;
      const buf = buffer(def, k);
      if (ctx.state === 'running') start(def, k, buf, o); else waitRunning(350).then((ok) => ok && start(def, k, buf, o));
      dbg();
    } catch (e) {}
  }

  /* ---------- pre-render at idle (never during a screen change) ---------- */
  let queue = [], qTimer = 0;
  const ORDER = ['touch', 'touchTile', 'touchBack', 'touchToggle', 'ringtick', 'roarloop', 'lock1', 'lock2', 'lock3', 'hottail', 'release', 'hotrelease', 'softtick', 'whoosh', 'deal', 'reveal', 'reset', 'buzzer', 'tick', 'count', 'go', 'win', 'endnight', 'unlock'];
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
      } while ((queue.length || job) && now() - t0 < 8 && dl.timeRemaining() > 1);   // v16.1: hard 8 ms budget per idle callback
      dbg(); pump();
    });
  }

  /* ---------- touch feedback: one delegated handler, on a real tap (v16.1) ----------
     v16 played on pointerdown, so a finger that started a scroll/swipe on a button made the press sound.
     Now pointerdown only remembers the press; the sound plays on pointerup when it was a tap: same pointer,
     moved < 10 px, no pointercancel, nothing scrolled in between, and the finger lifts on the same control.
     A press rejected only for moving (a mouse drag inside a button) still sounds if the browser fires its click
     on that control, so an action that happens always has its sound. Hover / pointerover / mouse moves never play. */
  const TOUCH = 'button, [role="button"], [role="tab"], a.btn, .tile, .chip, [data-nav], [data-back]';
  const SKIP = '#holdBtn, .hold, [data-nosfx], [disabled], [aria-disabled="true"]';
  const SLOP = 10;
  const touchName = (el) => (el.matches('.tile') ? 'touchTile' : el.matches('[data-back], .nav-back, [data-nav="home"]') ? 'touchBack'
    : el.matches('.seg button, .side-switch [data-side], .heat-steps .hs, [role="tab"], [data-prefsw], [data-sw]') ? 'touchToggle' : 'touch');
  const ctl = (e) => { const el = e.target && e.target.closest && e.target.closest(TOUCH); return el && !el.closest(SKIP) ? el : null; };
  const scrollPos = () => (W.scrollY || W.pageYOffset || 0) + (W.scrollX || W.pageXOffset || 0) * 1e4;
  let press = null, pressAt = -1e9, upAt = -1e9, keyAt = -1e9, moved = null;
  function onDown(e) {
    try {
      if (e.button > 0 || e.isPrimary === false) return;
      pressAt = now(); moved = null;
      const el = ctl(e);
      press = el ? { el, id: e.pointerId, x: e.clientX || 0, y: e.clientY || 0, sp: scrollPos(), dead: false } : null;
      if (el && armed) gesture();                       // unlock early (silent); the sound waits for the lift
    } catch (err) { press = null; }
  }
  const same = (e) => press && (press.id == null || e.pointerId == null || e.pointerId === press.id);
  function onMove(e) { if (same(e) && !press.dead && Math.hypot((e.clientX || 0) - press.x, (e.clientY || 0) - press.y) > SLOP) press.dead = 'move'; }
  function onCancel(e) { if (same(e)) { press.dead = 'cancel'; press = null; } }
  function onScroll() { if (press) press.dead = 'scroll'; }
  function onUp(e) {
    try {
      if (!same(e)) return;
      const p = press; press = null; const t = now(); upAt = t;
      if (!p.dead && Math.hypot((e.clientX || 0) - p.x, (e.clientY || 0) - p.y) > SLOP) p.dead = 'move';
      if (!p.dead && Math.abs(scrollPos() - p.sp) > 1) p.dead = 'scroll';
      if (!p.dead && (ctl(e) !== p.el || !p.el.isConnected)) p.dead = 'off';
      if (p.dead) { touchUntil = t + 400; moved = p.dead === 'move' ? p.el : null; return; }   // a swipe/scroll: silent
      if (armed) gesture();                             // first tap of the session: unlock before its own sound
      play(touchName(p.el));
      touchUntil = t + 600;                             // the click handler's own SFX.play('tap') stays quiet
    } catch (err) {}
  }
  function onClick(e) {
    try {
      const t = now(), el = ctl(e); if (!el) return;
      if (t - upAt < 1000 || t - pressAt < 1000) {      // a pointer press already decided
        if (moved && moved === el && t - upAt < 120) { moved = null; play(touchName(el)); }
        touchUntil = Math.max(touchUntil, t + 250); return;
      }
      if (t - keyAt > 600) return;                      // a script's .click(), not the keyboard: the handler decides
      if (armed) gesture();
      play(touchName(el));
      touchUntil = t + 250;
    } catch (err) {}
  }
  const CP = { capture: true, passive: true };
  D.addEventListener('pointerdown', onDown, CP);
  D.addEventListener('pointermove', onMove, CP);
  D.addEventListener('pointerup', onUp, CP);
  D.addEventListener('pointercancel', onCancel, CP);
  D.addEventListener('scroll', onScroll, CP);          // capture also sees scrolls of inner scrollers
  D.addEventListener('click', onClick, CP);
  D.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') keyAt = now(); }, CP);

  /* ---------- lifecycle: tab switch, bfcache, phone lock ---------- */
  D.addEventListener('visibilitychange', () => { if (D.hidden) { silentStop(); ringStop(); } else { wake(); silentStart(); } dbg(); });
  W.addEventListener('pageshow', () => { wake(); silentStart(); });
  W.addEventListener('focus', wake);
  arm();

  /* ---------- home hold ring (v16.1, both packs) ----------
     A live voice follows the ring: a tone rising over the three turns (every change via setTargetAtTime, so no
     zipper noise) and, from the second turn on, a looped fire bed (pre-rendered) whose low-pass opens toward the
     top level. Ticks per eighth of a turn rise with the ring; each level has its own lock; the top level locks with
     ignition + roar + crackle and leaves an ember tail; letting go there is a flame burst. The voice only starts
     once the ring has really turned (RING_GO), so a press that turns into a move/scroll stays silent. */
  const RING_GO = 0.08;                               // turns (~100 ms at 1.2 s per turn)
  // g = [level, change per turn]: the tone gets a touch quieter as it climbs (higher pitches sound louder), so each lock and the top-level climax stand above it
  const VOICE = {
    classic: { f0: 262, types: ['triangle', 'sawtooth', 'square'], mix: [1, 0.1, 0.05], mul: [1, 1.003, 0.5], lp: [900, 1000], q: 0.9, g: [0.12, -0.012], vib: 6, roar: 0.36 },
    velvet: { f0: 392, types: ['sine', 'triangle', 'sine'], mix: [1, 0.2, 0.22], mul: [1, 2, 1.0015], lp: [1300, 700], q: 0.5, g: [0.12, -0.015], vib: 5, roar: 0.4 },
  };
  // Builds the voice on any context (live, or an OfflineAudioContext for the hold simulation)
  function makeVoice(c, dest, p, roarBuf, t, turns) {
    const V = VOICE[p] || VOICE.classic, fq = (v) => V.f0 * Math.pow(2, (2 * v) / 3);
    const g = c.createGain(), lp = c.createBiquadFilter(), lfo = c.createOscillator(), dep = c.createGain(), oscs = [];
    lp.type = 'lowpass'; lp.Q.value = V.q; lp.frequency.value = V.lp[0] + V.lp[1] * turns;
    g.gain.setValueAtTime(0, t); g.gain.setTargetAtTime(V.g[0] + V.g[1] * turns, t, 0.05);
    lfo.frequency.value = V.vib; dep.gain.value = 0; lfo.connect(dep);
    V.types.forEach((type, i) => { const o = c.createOscillator(), og = c.createGain(); o.type = type; o.frequency.value = fq(turns) * V.mul[i]; og.gain.value = V.mix[i]; dep.connect(o.frequency); o.connect(og); og.connect(lp); o.start(t); oscs.push(o); });
    lfo.start(t); oscs.push(lfo);
    lp.connect(g); g.connect(dest);
    let rs = null, rlp = null, rg = null;
    if (roarBuf) {
      rs = c.createBufferSource(); rs.buffer = roarBuf; rs.loop = true; rlp = c.createBiquadFilter(); rlp.type = 'lowpass'; rlp.Q.value = 0.7; rlp.frequency.value = 400; rg = c.createGain(); rg.gain.value = 0;
      rs.connect(rlp); rlp.connect(rg); rg.connect(dest); rs.start(t); oscs.push(rs);
    }
    let lastF = 0, lastR = -1, top = false;
    return {
      set(v, at) {
        if (top) return;
        const f = fq(v);
        if (Math.abs(f - lastF) / f > 0.002) {
          lastF = f;
          oscs.forEach((o, i) => { if (i < V.types.length) o.frequency.setTargetAtTime(f * V.mul[i], at, 0.03); });
          lp.frequency.setTargetAtTime(V.lp[0] + V.lp[1] * v, at, 0.05);
          dep.gain.setTargetAtTime(f * 0.005 * Math.max(0, v - 0.5) / 2.5, at, 0.1);     // vibrato grows with the heat
          g.gain.setTargetAtTime(V.g[0] + V.g[1] * v, at, 0.05);
        }
        if (rg) { const r = v < 1.3 ? 0 : Math.pow((Math.min(3, v) - 1.3) / 1.7, 2); if (Math.abs(r - lastR) > 0.004) { lastR = r; rg.gain.setTargetAtTime(V.roar * r, at, 0.08); rlp.frequency.setTargetAtTime(400 + 3400 * r, at, 0.08); } }
      },
      lock(lv, at) {                                   // a small duck under each lock so it punches through
        if (top) return;
        if (lv >= 3) { top = true; g.gain.cancelScheduledValues(at); g.gain.setTargetAtTime(0, at, 0.06); if (rg) { rg.gain.cancelScheduledValues(at); rg.gain.setTargetAtTime(0, at + 0.05, 0.25); } return; }
        const to = V.g[0] + V.g[1] * lv; g.gain.setTargetAtTime(to * 0.55, at, 0.01); g.gain.setTargetAtTime(to, at + 0.12, 0.08);
      },
      stop(at, tau = 0.04) {
        try { g.gain.cancelScheduledValues(at); g.gain.setTargetAtTime(0, at, tau); if (rg) { rg.gain.cancelScheduledValues(at); rg.gain.setTargetAtTime(0, at, tau * 2); } oscs.forEach((o) => o.stop(at + tau * 10 + 0.1)); } catch (e) {}
        return () => { try { g.disconnect(); rg && rg.disconnect(); } catch (e) {} };
      },
    };
  }
  let ring = null;                                    // { seg, voice, lv }
  const tickOf = (s) => ({ k: (s % 8) - 1, rate: Math.pow(2, (2 * Math.floor(s / 8)) / 12) });   // 7 ticks per turn, a whole tone up per level
  function ringStart() { ringStop(); if (muted) return; ring = { seg: 0, voice: null, lv: 0 }; }
  function ringTurn(v) {
    if (!ring || muted) return;
    const turns = Math.max(0, Math.min(3, v));
    if (!ring.voice && turns >= RING_GO && turns < 3 && ctx && mode === 'web') {
      try {
        const rb = ctx.state === 'running' ? buffer(defOf(pack, 'roarloop'), 0) : null;
        ring.voice = makeVoice(ctx, master, pack, rb, ctx.currentTime, turns);
      } catch (e) { ring.voice = null; }
    }
    if (ring.voice) ring.voice.set(turns, ctx.currentTime);
    const s = Math.floor(turns * 8);
    if (s > ring.seg) { ring.seg = s; if (s % 8 && turns >= RING_GO) ringPlay('ringtick', tickOf(s)); }   // level marks get the lock instead
  }
  function ringLevel(lv) {
    lv = Math.max(1, Math.min(3, lv | 0));
    if (ring) { ring.lv = lv; if (ring.voice) ring.voice.lock(lv, ctx.currentTime); }
    ringPlay('lock' + lv);
    if (lv === 3) ringPlay('hottail', { delay: 0.85 });
  }
  function ringStop(tau) {
    const r = ring; ring = null;
    if (!r || !r.voice || !ctx) return;
    const done = r.voice.stop(ctx.currentTime, tau); setTimeout(done, 800);
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
    // Home hold ring (v16.1): both packs get the full set (live voice, rising ticks, a lock per level, fiery top level)
    ring(ev, v) {
      try {
        if (ev === 'start') ringStart();
        else if (ev === 'turn') ringTurn(v);
        else if (ev === 'level') ringLevel(v);
        else if (ev === 'release') { const top = (v | 0) >= 3; ringStop(top ? 0.03 : 0.05); ringPlay(top ? 'hotrelease' : 'release'); }
        else if (ev === 'cancel') ringStop();          // let go / moved before a full turn: no sound of its own
        else if (ev === 'reset') play(pack === 'velvet' ? 'reset' : 'tap');
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
    _ring: () => (ring ? { seg: ring.seg, voice: !!ring.voice, lv: ring.lv } : null),
    // Offline render of a full hold (browser only): the live voice + ticks + locks + tail + release, through the same chain
    _holdSim: async (p = pack, o = {}) => {
      const rot = o.rot || 1.2, hold = o.hold || 4, after = o.after || 1.6, sr = o.sr || 48000;
      const oc = new OfflineAudioContext(2, Math.ceil((hold + after) * sr), sr), cp = oc.createDynamicsCompressor(), m = oc.createGain();
      cp.threshold.value = -18; cp.ratio.value = 4; cp.knee.value = 20; cp.attack.value = 0.003; cp.release.value = 0.15;
      m.gain.value = p === 'velvet' ? 1 : 0.92; m.connect(cp); cp.connect(oc.destination);
      const ob = (name, k = 0) => { const d = defOf(p, name), pcm = render(d, k), bf = oc.createBuffer(pcm.ch.length, pcm.ch[0].length, pcm.sr); pcm.ch.forEach((c, i) => bf.copyToChannel(c, i)); return [d, bf]; };
      const fire = (name, at, x = {}) => { const [d, bf] = ob(name, x.k || 0), sN = oc.createBufferSource(), g = oc.createGain(); sN.buffer = bf; sN.playbackRate.value = x.rate || 1; g.gain.value = d.g; sN.connect(g); g.connect(m); sN.start(at); };
      let voice = null, seg = 0, lv = 0;
      for (let t = 0; t <= hold + 1e-9; t += 1 / 60) {
        const turns = Math.min(3, t / rot);
        if (!voice && turns >= RING_GO && turns < 3) voice = makeVoice(oc, m, p, ob('roarloop')[1], t, turns);
        if (voice) voice.set(turns, t);
        const s = Math.floor(turns * 8);
        if (s > seg) { seg = s; if (s % 8) fire('ringtick', t, tickOf(s)); }
        const done = Math.floor(turns + 1e-9);
        if (done > lv) { lv = done; voice && voice.lock(lv, t); fire('lock' + lv, t); if (lv === 3) fire('hottail', t + 0.85); }
      }
      voice && voice.stop(hold, lv >= 3 ? 0.03 : 0.05); fire(lv >= 3 ? 'hotrelease' : 'release', hold);
      const r = await oc.startRendering();
      return { sr, ch: [r.getChannelData(0), r.getChannelData(1)] };
    },
  };
})();
