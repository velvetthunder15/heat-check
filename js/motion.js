/* Heat Check: motion layer. No libraries. Hooks onto App / Core / mount / stageHTML without touching game logic. */
(() => {
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => RM.matches;
  const app = () => document.getElementById('app');
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const SPRING = () => css('--spring') || 'cubic-bezier(.34,1.4,.64,1)';
  const SPRING_SOFT = () => css('--spring-soft') || 'cubic-bezier(.3,1.2,.6,1)';
  const EASE = 'cubic-bezier(.16,1,.3,1)';
  const HEAT_COLORS = ['#ffd166', '#ff7a3c', '#ff2e63'];
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

  /* ---------------- Ambience: gradient mesh + grain, heat reactive ---------------- */
  const amb = document.createElement('div');
  amb.id = 'amb'; amb.setAttribute('aria-hidden', 'true');
  amb.innerHTML = '<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="glow"></div><div class="grain"></div>';
  const meshAnims = [];
  const startMesh = () => {
    if (reduced() || meshAnims.length || !amb.animate) return;
    const drift = (el, a, b, dur) => meshAnims.push(el.animate([{ transform: `translate(0,0) scale(1)` }, { transform: `translate(${a}) scale(${b})` }], { duration: dur, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }));
    drift(amb.querySelector('.b1'), '18vmax, 14vmax', 1.12, 18000);
    drift(amb.querySelector('.b2'), '-16vmax, -12vmax', 1.18, 22000);
    drift(amb.querySelector('.b3'), '-12vmax, 10vmax', 0.9, 26000);
    meshAnims.push(amb.querySelector('.glow').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }], { duration: 4000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }));
  };
  let heatT = 0, rateTarget = 1, rate = 1;
  const setHeat = (t) => {
    heatT = Math.max(0, Math.min(1, t));
    app().style.setProperty('--heat-t', heatT.toFixed(3));
    rateTarget = 1 + heatT * 1.6; // background pulses faster as it heats up
  };
  // ease playback rate toward target so the speed-up is smooth, never a jump
  const rateLoop = () => {
    if (Math.abs(rate - rateTarget) > 0.01) {
      rate += (rateTarget - rate) * 0.04;
      meshAnims.forEach((a) => (a.updatePlaybackRate ? a.updatePlaybackRate(rate) : (a.playbackRate = rate)));
    }
    setTimeout(rateLoop, 120);
  };
  const ensureAmb = () => { const r = app(); if (r && amb.parentNode !== r) r.prepend(amb); };

  /* ---------------- Splash: ignition, cold start only ---------------- */
  const splash = document.getElementById('splash');
  const runSplash = () => {
    if (!splash) return;
    const html = document.documentElement;
    if (sessionStorage.getItem('hc_lit') || !splash.animate) { splash.remove(); html.classList.remove('booting'); return; }
    sessionStorage.setItem('hc_lit', '1');
    const inner = splash.querySelector('.sp-inner'), bars = [...splash.querySelectorAll('.sp-meter i')], bloom = splash.querySelector('.sp-bloom');
    let done = false;
    const finish = (fast) => {
      if (done) return; done = true;
      const d = fast ? 220 : 380;
      if (!reduced()) {
        bloom.animate([{ opacity: 0.9, transform: 'scale(.6)' }, { opacity: 0, transform: 'scale(3.2)' }], { duration: d + 120, easing: EASE, fill: 'forwards' });
        inner.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.08)', opacity: 0 }], { duration: d, easing: EASE, fill: 'forwards' });
      }
      splash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d, delay: fast ? 0 : 80, easing: EASE, fill: 'forwards' }).onfinish = () => { splash.remove(); html.classList.remove('booting'); };
    };
    splash.addEventListener('pointerdown', () => finish(true), { once: true });
    if (reduced()) { setTimeout(() => finish(true), 500); return; }
    inner.animate([{ opacity: 0, transform: 'translateY(10px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE, fill: 'backwards' });
    bars.forEach((b, i) => {
      const fill = b.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 220, delay: 220 + i * 210, easing: EASE, fill: 'forwards', pseudoElement: '::after' });
      fill.onfinish = () => { buzz(8); window.SFX && SFX.play('softtick'); };
    });
    // Hold for fonts (no flash of unstyled text), but never past 1.2 s total
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    const minT = new Promise((r) => setTimeout(r, 900));
    Promise.race([Promise.all([fontsReady, minT]), new Promise((r) => setTimeout(r, 1150))]).then(() => finish(false));
  };

  /* ---------------- View transitions: tile ⇄ game morph ---------------- */
  const canVT = typeof document.startViewTransition === 'function';
  let lastGame = null;
  const navigate = (update, { from, back } = {}) => {
    const r = app();
    window.SFX && SFX.play('whoosh');
    if (!canVT) {
      update();
      if (!reduced()) { r.classList.remove('fx-in'); void r.offsetWidth; r.classList.add('fx-in'); setTimeout(() => r.classList.remove('fx-in'), 500); }
      return;
    }
    const html = document.documentElement;
    if (from && !reduced()) from.style.viewTransitionName = 'hero';
    if (back && !reduced()) r.style.viewTransitionName = 'hero';
    html.classList.add('vt-run');
    let t;
    try {
      t = document.startViewTransition(() => {
        if (from) r.style.viewTransitionName = reduced() ? '' : 'hero';
        if (back) r.style.viewTransitionName = '';
        update();
        if (back && lastGame && !reduced()) { const tile = r.querySelector(`.tile[data-game="${lastGame}"]`); if (tile) tile.style.viewTransitionName = 'hero'; }
      });
    } catch (e) { update(); html.classList.remove('vt-run'); return; }
    t.finished.finally(() => {
      html.classList.remove('vt-run');
      r.style.viewTransitionName = '';
      $$('.tile').forEach((x) => (x.style.viewTransitionName = ''));
    });
  };

  /* ---------------- Game intros (0.6–0.8 s, genre specific, palette only) ---------------- */
  const INTROS = {
    redflag: ['<i class="pole r"></i><i class="flag r"></i><i class="pole g"></i><i class="flag g"></i>', (o) => {
      $$('.flag', o).forEach((f, k) => f.animate([
        { transform: 'scaleX(0) skewY(0)', opacity: 0 }, { transform: 'scaleX(1.05) skewY(-6deg)', opacity: 1, offset: .45 },
        { transform: 'scaleX(.97) skewY(5deg)', offset: .65 }, { transform: 'scaleX(1) skewY(-2deg)', offset: .82 }, { transform: 'scaleX(1) skewY(0)', opacity: 1 }], { duration: 620, delay: k * 60, easing: EASE, fill: 'both' }));
      $$('.pole', o).forEach((p) => p.animate([{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: EASE, fill: 'both' }));
      return 720;
    }],
    nhie: ['<i class="cup l"></i><i class="cup r"></i><i class="clink"></i>', (o) => {
      const [l, r] = $$('.cup', o);
      l.animate([{ transform: 'translateX(-60vw) rotate(-20deg)' }, { transform: 'translateX(0) rotate(14deg)', offset: .55 }, { transform: 'translateX(-6px) rotate(8deg)', offset: .75 }, { transform: 'translateX(0) rotate(10deg)' }], { duration: 640, easing: EASE, fill: 'both' });
      r.animate([{ transform: 'translateX(60vw) rotate(20deg)' }, { transform: 'translateX(0) rotate(-14deg)', offset: .55 }, { transform: 'translateX(6px) rotate(-8deg)', offset: .75 }, { transform: 'translateX(0) rotate(-10deg)' }], { duration: 640, easing: EASE, fill: 'both' });
      $('.clink', o).animate([{ opacity: 0, transform: 'scale(.3)' }, { opacity: 0, transform: 'scale(.3)', offset: .5 }, { opacity: 1, transform: 'scale(.8)', offset: .58 }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 700, easing: 'ease-out', fill: 'both' });
      setTimeout(() => { buzz(15); window.SFX && SFX.play('softtick'); }, 350);
      return 760;
    }],
    bodypart: ['<i class="iris"></i>', (o) => {
      $('.iris', o).animate([{ transform: 'scale(0)' }, { transform: 'scale(.6)', offset: .3 }, { transform: 'scale(60)' }], { duration: 760, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'both' });
      return 780;
    }],
    charades: ['<i class="curtain l"></i><i class="curtain r"></i><i class="valance"></i>', (o) => {
      $('.curtain.l', o).animate([{ transform: 'translateX(0) scaleX(1)' }, { transform: 'translateX(-90%) scaleX(.45)' }], { duration: 760, delay: 60, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'both' });
      $('.curtain.r', o).animate([{ transform: 'translateX(0) scaleX(1)' }, { transform: 'translateX(90%) scaleX(.45)' }], { duration: 760, delay: 60, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'both' });
      $('.valance', o).animate([{ transform: 'none' }, { transform: 'translateY(-100%)' }], { duration: 400, delay: 420, easing: EASE, fill: 'both' });
      return 800;
    }],
    wyr: ['<i class="half l"></i><i class="half r"></i><b class="vs">VS</b>', (o) => {
      $('.half.l', o).animate([{ transform: 'translateX(-105%)' }, { transform: 'translateX(0)', offset: .4 }, { transform: 'translateX(0)', offset: .7 }, { transform: 'translateX(-105%)' }], { duration: 760, easing: EASE, fill: 'both' });
      $('.half.r', o).animate([{ transform: 'translateX(105%)' }, { transform: 'translateX(0)', offset: .4 }, { transform: 'translateX(0)', offset: .7 }, { transform: 'translateX(105%)' }], { duration: 760, easing: EASE, fill: 'both' });
      $('.vs', o).animate([{ transform: 'scale(4) rotate(-14deg)', opacity: 0 }, { transform: 'scale(4) rotate(-14deg)', opacity: 0, offset: .3 }, { transform: 'scale(.9) rotate(-6deg)', opacity: 1, offset: .45 }, { transform: 'scale(1) rotate(-6deg)', opacity: 1, offset: .7 }, { transform: 'scale(1.2) rotate(-6deg)', opacity: 0 }], { duration: 760, easing: 'ease-out', fill: 'both' });
      o.classList.add('shake'); setTimeout(() => buzz([20, 30, 40]), 300);
      return 780;
    }],
    mostlikely: ['<i class="burst"></i><b class="pow">WHO?!</b>', (o) => {
      $('.burst', o).animate([{ transform: 'scale(0) rotate(-30deg)', opacity: 1 }, { transform: 'scale(1.1) rotate(4deg)', opacity: 1, offset: .45 }, { transform: 'scale(1) rotate(0)', opacity: 1, offset: .7 }, { transform: 'scale(1.3) rotate(6deg)', opacity: 0 }], { duration: 700, easing: EASE, fill: 'both' });
      $('.pow', o).animate([{ transform: 'scale(0) rotate(-10deg)' }, { transform: 'scale(1.15) rotate(-6deg)', offset: .5 }, { transform: 'scale(1) rotate(-4deg)', opacity: 1, offset: .75 }, { transform: 'scale(1.1) rotate(-4deg)', opacity: 0 }], { duration: 700, easing: EASE, fill: 'both' });
      return 720;
    }],
    hotseat: ['<i class="spot"></i><i class="ring"></i><b class="q">?</b>', (o) => {
      $('.spot', o).animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)', offset: .4 }, { opacity: 0, transform: 'scale(1.4)' }], { duration: 720, easing: EASE, fill: 'both' });
      $('.ring', o).animate([{ opacity: 0, transform: 'scale(.6) rotate(0)' }, { opacity: 1, transform: 'scale(1) rotate(90deg)', offset: .5 }, { opacity: 0, transform: 'scale(1.25) rotate(160deg)' }], { duration: 720, easing: EASE, fill: 'both' });
      $('.q', o).animate([{ transform: 'translateY(30px) scale(.6)', opacity: 0 }, { transform: 'translateY(0) scale(1.05)', opacity: 1, offset: .45 }, { transform: 'scale(1)', opacity: 1, offset: .7 }, { transform: 'scale(.9)', opacity: 0 }], { duration: 720, easing: EASE, fill: 'both' });
      return 740;
    }],
    twotruths: ['<i class="pc">♥</i><i class="pc s">♠</i><i class="pc">♦</i>', (o) => {
      $$('.pc', o).forEach((c, k) => c.animate([
        { transform: 'translateY(-70vh) rotate(-30deg)', opacity: 0 }, { transform: `translateX(${(k - 1) * 62}px) rotate(${(k - 1) * 14}deg)`, opacity: 1, offset: .55 },
        { transform: `translateX(${(k - 1) * 62}px) rotate(${(k - 1) * 14}deg)`, opacity: 1, offset: .8 }, { transform: `translateX(${(k - 1) * 62}px) translateY(20px) rotate(${(k - 1) * 14}deg)`, opacity: 0 }],
        { duration: 720, delay: k * 50, easing: EASE, fill: 'both' }));
      return 820;
    }],
    swap: ['<i class="sheen"></i><b class="mir">⇄</b>', (o) => {
      $('.sheen', o).animate([{ transform: 'translateX(0) skewX(-12deg)' }, { transform: 'translateX(380%) skewX(-12deg)' }], { duration: 700, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'both' });
      $('.mir', o).animate([{ transform: 'rotateY(0) scale(.7)', opacity: 0 }, { transform: 'rotateY(180deg) scale(1.1)', opacity: 1, offset: .55 }, { transform: 'rotateY(360deg) scale(1)', opacity: 0 }], { duration: 700, easing: EASE, fill: 'both' });
      return 720;
    }],
  };
  const intro = (theme) => {
    const def = INTROS[theme]; if (!def || reduced() || !document.body.animate) return;
    const o = document.createElement('div');
    o.className = 'intro intro-' + theme; o.setAttribute('aria-hidden', 'true'); o.innerHTML = def[0];
    app().appendChild(o);
    const ms = def[1](o);
    setTimeout(() => o.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).onfinish = () => o.remove(), ms);
  };

  /* ---------------- Cards: spring flip in, drag with tilt, swipe to pass ---------------- */
  const CARD_SEL = '.lower-third, .neon-sign, .casefile, .panel, .bulb-frame, .playing, .mirror, #stage > .card';
  const flipIn = (el) => {
    if (!el || reduced() || !el.animate) return;
    el.animate([
      { transform: 'perspective(900px) rotateY(-70deg) translateZ(-60px) scale(.94)', opacity: 0 },
      { opacity: 1, offset: .35 },
      { transform: 'perspective(900px) rotateY(0) translateZ(0) scale(1)', opacity: 1 }], { duration: 650, easing: SPRING_SOFT(), fill: 'backwards', delay: 40 });
  };
  const makeDraggable = (el) => {
    if (!el || el.dataset.drag) return;
    el.dataset.drag = '1'; el.classList.add('hc-card');
    let sx = 0, sy = 0, dx = 0, active = false, horiz = null, raf = 0, armed = false;
    const paint = () => {
      raf = 0;
      const w = el.offsetWidth || 300, k = dx / w;
      el.style.transform = `perspective(900px) translateX(${dx}px) rotate(${k * 12}deg) rotateY(${k * 18}deg) scale(${1 + Math.min(Math.abs(k), .3) * .1})`;
      const nowArmed = Math.abs(k) > .38;
      if (nowArmed !== armed) { armed = nowArmed; if (armed) buzz(12); }
    };
    el.addEventListener('pointerdown', (e) => {
      if (reduced() || e.target.closest('button, input, a, .hold, .ratepad')) return;
      active = true; horiz = null; sx = e.clientX; sy = e.clientY; dx = 0; armed = false;
      el.getAnimations().forEach((a) => a.cancel());
    });
    el.addEventListener('pointermove', (e) => {
      if (!active) return;
      const mx = e.clientX - sx, my = e.clientY - sy;
      if (horiz === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) { horiz = Math.abs(mx) > Math.abs(my); if (horiz) el.setPointerCapture(e.pointerId); }
      if (!horiz) return;
      dx = mx; if (!raf) raf = requestAnimationFrame(paint);
    });
    const end = () => {
      if (!active) return; active = false;
      if (!horiz) return;
      const from = el.style.transform; el.style.transform = '';
      const pass = document.querySelector('.controls [data-act="pass"]');
      if (armed && pass && !Core.paused) {
        const dir = Math.sign(dx);
        buzz([10, 20, 30]);
        el.animate([{ transform: from, opacity: 1 }, { transform: `perspective(900px) translateX(${dir * 130}vw) rotate(${dir * 28}deg)`, opacity: 0 }], { duration: 320, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' })
          .onfinish = () => pass.click();
      } else {
        el.animate([{ transform: from }, { transform: 'none' }], { duration: 650, easing: SPRING() });
        if (Math.abs(dx) > 20) buzz(6);
      }
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  };
  const enhanceStage = (root) => { const c = root && root.querySelector(CARD_SEL); if (c) { flipIn(c); makeDraggable(c); } };

  /* ---------------- Scores: smooth count + embers ---------------- */
  const countTo = (b, from, to) => {
    if (reduced() || from === to) { b.textContent = to; return; }
    const t0 = performance.now(), d = 520;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - p, 3);
      b.textContent = Math.round(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    };
    b.textContent = from; requestAnimationFrame(step);
    window.SFX && SFX.play('softtick');
  };
  const embers = (heat = 1, x, y) => {
    if (!document.body.animate) return;
    const n = reduced() ? 0 : [0, 8, 16, 30][heat] || 8, spread = [0, 70, 120, 190][heat] || 70;
    for (let i = 0; i < n; i++) {
      const e = document.createElement('i'); e.className = 'ember';
      const c = HEAT_COLORS[Math.min(2, Math.floor(Math.random() * (heat + 0.5)))];
      e.style.left = x + 'px'; e.style.top = y + 'px';
      e.style.background = `radial-gradient(circle, #fff 0 20%, ${c} 45%, transparent 70%)`;
      app().appendChild(e);
      const ang = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.4, dist = spread * (.4 + Math.random() * .8);
      const s = .6 + Math.random() * (0.5 + heat * .35);
      e.animate([
        { transform: `translate(0,0) scale(${s})`, opacity: 1 },
        { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist + 30}px) scale(0)`, opacity: 0 }],
        { duration: 500 + Math.random() * 400 + heat * 80, easing: EASE, fill: 'forwards' }).onfinish = () => e.remove();
    }
  };

  /* ---------------- Hook everything up ---------------- */
  let backNav = false;
  const hook = () => {
    // updateHud: transform-based heat fill, heat-reactive ambience, counting scores
    const origHud = Core.updateHud.bind(Core);
    Core.updateHud = function () {
      const before = {};
      $$('.chip').forEach((c) => { const b = c.querySelector('b'); if (b) before[c.dataset.i] = +b.textContent; });
      origHud();
      const fill = $('.heat-fill');
      const hp = Math.min(1, Core.heatProgress());
      if (fill) fill.style.setProperty('--hp', hp.toFixed(3));
      setHeat(hp);
      $$('.chip').forEach((c) => { const b = c.querySelector('b'); if (!b) return; const to = +b.textContent, from = before[c.dataset.i]; if (from != null && from !== to) countTo(b, from, to); });
    };
    // penalties: ember burst scaled to heat, haptics
    const origPen = Core.penalty.bind(Core);
    Core.penalty = function (opts = {}) {
      const p = origPen(opts);
      const heat = opts.heat || (opts.card && opts.card.heat) || Core.heat();
      requestAnimationFrame(() => {
        const m = $('.modal'); const r = m ? m.getBoundingClientRect() : { left: innerWidth / 2 - 1, width: 2, top: innerHeight / 2 };
        embers(heat, r.left + r.width / 2, r.top + 28);
        buzz([[0], [15], [20, 40, 25], [30, 40, 60, 40, 80]][heat] || 15);
      });
      return p;
    };
    // pause: instant crossfade, no white flash
    const origPause = Core.pause.bind(Core), pz = document.getElementById('pause');
    Core.pause = function () {
      origPause();
      if (pz.animate) pz.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 90, easing: 'linear' });
    };
    Core.resume = function () {
      this.paused = false; document.title = 'Heat Check';
      if (!pz.animate) { pz.hidden = true; return; }
      pz.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'linear' }).onfinish = () => { if (!Core.paused) pz.hidden = true; };
    };
    // game screens: intro on mount, flip-in + drag for each new card
    const origMount = window.mount;
    window.mount = function (theme, ...rest) { const s = origMount(theme, ...rest); ensureAmb(); intro(theme); return s; };
    const origStage = window.stageHTML;
    window.stageHTML = function (html) { const s = origStage(html); enhanceStage(s); return s; };
    // navigation: tile → game morph, game → home collapse
    const origPlay = App.play.bind(App);
    App.play = function (id) {
      if (Core.players().length < 2) return origPlay(id);
      lastGame = id;
      navigate(() => origPlay(id), { from: document.querySelector(`.tile[data-game="${id}"]`) });
    };
    const origSet = App.set.bind(App);
    App.set = function (theme, html) {
      origSet(theme, html); ensureAmb();
      if (theme === 'home') { app().classList.toggle('no-stagger', backNav); setHeat(Core.heatProgress()); $$('.tile').forEach((t, k) => t.style.setProperty('--i', k)); }
    };
    document.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav="home"]'); if (!nav) return;
      e.stopImmediatePropagation(); e.preventDefault();
      window.SFX && SFX.play('tap');
      backNav = true;
      navigate(() => App.home(), { back: true });
      setTimeout(() => (backNav = false), 50);
    }, true);
    // soft tick on button press (sound is off by default)
    document.addEventListener('pointerdown', (e) => { if (e.target.closest('.btn, .tile, .icon-btn')) window.SFX && SFX.play('softtick'); }, { passive: true });
  };

  hook();
  ensureAmb();
  startMesh();
  rateLoop();
  setHeat(Core.S ? Core.heatProgress() : 0);
  runSplash();
  RM.addEventListener && RM.addEventListener('change', () => { if (reduced()) { meshAnims.forEach((a) => a.cancel()); meshAnims.length = 0; } else startMesh(); });
  window.Motion = { intro, embers, navigate };
})();
