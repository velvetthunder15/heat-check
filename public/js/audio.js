/* Heat Check: synthesized sound effects (no audio files, works offline) */
const SFX = window.SFX = (() => {
  let ctx = null;
  let muted = localStorage.getItem('hc_muted') !== '0'; // muted by default; unmute is remembered
  const ac = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  let pack = 'classic'; // Pro sound pack: 'velvet' is softer and lower
  function tone(freq, dur = 0.15, type = 'sine', vol = 0.18, when = 0, slideTo = null) {
    if (muted) return;
    if (pack === 'velvet') { freq *= 0.84; if (slideTo) slideTo *= 0.84; type = type === 'square' || type === 'sawtooth' ? 'triangle' : type; vol *= 0.8; dur *= 1.15; }
    const c = ac(), t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur = 0.2, vol = 0.15, when = 0, hp = 800) {
    if (muted) return;
    const c = ac(), t = c.currentTime + when;
    const b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
    s.buffer = b; s.connect(f).connect(g).connect(c.destination); s.start(t);
  }
  const chord = (fs, dur, type, vol, step = 0) => fs.forEach((f, i) => tone(f, dur, type, vol, i * step));

  const lib = {
    tap: () => tone(660, 0.05, 'triangle', 0.08),
    softtick: () => tone(1500, 0.018, 'sine', 0.035),
    whoosh: () => { if (muted) return; const c = ac(), t = c.currentTime, d = 0.32;
      const b = c.createBuffer(1, c.sampleRate * d, c.sampleRate), x = b.getChannelData(0);
      for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / x.length);
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2400, t + d);
      g.gain.value = 0.07; s.buffer = b; s.connect(f).connect(g).connect(c.destination); s.start(t); },
    reveal: () => chord([523, 659, 784], 0.35, 'triangle', 0.12, 0.06),
    tick: () => tone(1200, 0.03, 'square', 0.05),
    count: () => tone(440, 0.12, 'square', 0.1),
    go: () => chord([523, 784, 1046], 0.4, 'sawtooth', 0.08, 0.04),
    penalty: () => { tone(300, 0.25, 'sawtooth', 0.12, 0, 120); tone(200, 0.3, 'sawtooth', 0.08, 0.12, 90); },
    win: () => chord([659, 784, 988, 1318], 0.25, 'triangle', 0.12, 0.08),
    // talk show
    applause: () => { for (let i = 0; i < 14; i++) noise(0.06, 0.1, i * 0.05 + Math.random() * 0.03, 1500); },
    buzzer: () => tone(140, 0.6, 'square', 0.14),
    ding: () => chord([1318, 1760], 0.5, 'sine', 0.12, 0.08),
    // party
    sip: () => { tone(300, 0.08, 'sine', 0.12, 0, 600); tone(380, 0.08, 'sine', 0.1, 0.1, 700); },
    bass: () => tone(70, 0.3, 'sine', 0.3, 0, 40),
    // noir
    sax: () => { tone(233, 0.5, 'sawtooth', 0.05); tone(277, 0.6, 'sawtooth', 0.05, 0.35); tone(208, 0.9, 'sawtooth', 0.05, 0.8); },
    heartbeat: () => { tone(60, 0.12, 'sine', 0.4); tone(55, 0.14, 'sine', 0.3, 0.18); },
    // cabaret
    drumroll: () => { for (let i = 0; i < 18; i++) noise(0.04, 0.08, i * 0.045, 300); },
    cymbal: () => noise(0.9, 0.12, 0, 5000),
    // fighting game
    clash: () => { noise(0.25, 0.25, 0, 200); tone(110, 0.3, 'square', 0.12, 0, 55); },
    ko: () => tone(880, 0.5, 'square', 0.1, 0, 110),
    // comic
    boing: () => tone(200, 0.35, 'sine', 0.2, 0, 800),
    // quiz
    correct: () => chord([784, 988, 1175], 0.3, 'triangle', 0.12, 0.07),
    wrong: () => { tone(220, 0.3, 'square', 0.1); tone(196, 0.45, 'square', 0.1, 0.25); },
    // casino
    chip: () => { tone(2400, 0.04, 'triangle', 0.08); tone(2000, 0.05, 'triangle', 0.06, 0.05); },
    // mirror
    shimmer: () => chord([1046, 1318, 1568, 2093], 0.6, 'sine', 0.05, 0.05),
  };
  return {
    play(n) { try { lib[n] && lib[n](); } catch (e) {} },
    get muted() { return muted; },
    toggle() { muted = !muted; localStorage.setItem('hc_muted', muted ? '1' : '0'); return muted; },
    setMuted(m) { muted = !!m; localStorage.setItem('hc_muted', muted ? '1' : '0'); return muted; },
    setPack(p) { pack = p === 'velvet' ? 'velvet' : 'classic'; },
    unlock() { try { ac(); } catch (e) {} },
  };
})();
