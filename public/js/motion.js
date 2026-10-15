/* Heat Check: motion layer. No libraries. Hooks onto App / Core / mount / stageHTML without touching game logic. */
(() => {
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  // Profile can override the phone setting: data-motion="reduce" | "full" on <html>
  const reduced = () => { const m = document.documentElement.dataset.motion; return m === 'reduce' || (m !== 'full' && RM.matches); };
  const app = () => document.getElementById('app');
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  // v14: read once (getComputedStyle here forced a full style recalc inside every card deal)
  let _spring = '', _springSoft = '';
  const SPRING = () => _spring || (_spring = css('--spring') || 'cubic-bezier(.34,1.4,.64,1)');
  const SPRING_SOFT = () => _springSoft || (_springSoft = css('--spring-soft') || 'cubic-bezier(.3,1.2,.6,1)');
  const EASE = 'cubic-bezier(.16,1,.3,1)';
  const HEAT_COLORS = ['#ff2e63', '#ff7a3c', '#fff4e0'];
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

  /* ---------------- Ambience: gradient mesh + grain, heat reactive ---------------- */
  const amb = document.createElement('div');
  amb.id = 'amb'; amb.setAttribute('aria-hidden', 'true');
  amb.innerHTML = '<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="glow"></div><div class="grain"></div>';
  const meshAnims = [];
  const startMesh = () => {
    return;   // v12.2: static ambience (60 fps on phones); heat still shifts it via --heat-t
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
    // v20.2: only #amb reads --heat-t. Set on #app it restyled every element of the screen on each heat
    // change and HUD update; on #amb it restyles five layers.
    const v = heatT.toFixed(3);
    if (amb.style.getPropertyValue('--heat-t') !== v) amb.style.setProperty('--heat-t', v);
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

  /* ---------------- Screen transitions (v14) ----------------
     One transition for every screen change, transform + opacity only, on the compositor:
       1. the old screen fades out (~120ms) while the main thread is idle
       2. the swap: the new screen is built, its first card dealt and the page scrolled to its
          place (home: where you left it; anything else: the top) while nothing is on show
       3. the new screen fades/slides in (~200ms), fully laid out, nothing moves after it.
     The two screens are never visible together. No View Transitions: their snapshot capture
     froze the full old screen for 300ms+ on a throttled phone, and the tile -> game "hero"
     snapshot stretched the old text on the way back. Reduced motion: an instant swap. */
  const lowEnd = () => document.documentElement.classList.contains('low-end');
  const isHome = () => !!document.getElementById('stack');
  let homeScroll = 0, pendingIntro = null, navSeq = 0, pendingSwap = null;
  const ENTER_SEL = '.screen, .tile, .home-head, .home-sub, .lower-third, .playing, .side, .verdict';
  const settled = async () => {
    for (let i = 0; i < 12; i++) await null;    // a Flirty deal resolves within a few microtasks: no macrotask hop
    const st = document.getElementById('stage');
    if (!st || st.childElementCount) return;
    await new Promise((res) => {
      let t = 0;
      const mo = new MutationObserver(() => { if (st.childElementCount) { mo.disconnect(); clearTimeout(t); res(); } });
      mo.observe(st, { childList: true });
      t = setTimeout(() => { mo.disconnect(); res(); }, 280);
    });
  };
  // Home comes back exactly where it was left; every other screen starts at the top
  const place = (back) => { const y = back && isHome() ? homeScroll : 0; if (Math.abs(window.scrollY - y) > 0.5) window.scrollTo(0, y); };
  const navigate = (update, { back, dir } = {}) => {
    if (pendingSwap) pendingSwap();            // a screen still leaving: finish that change first
    const d = dir || (back ? 'back' : 'fwd'), isBack = d === 'back';
    const html = document.documentElement, r = app(), seq = ++navSeq;
    window.SFX && SFX.play('whoosh');
    if (isHome()) homeScroll = window.scrollY;
    html.classList.add('hc-nav');
    const quiet = reduced() || !r.animate;
    let exit = null;
    const upd = () => { backNav = isBack; try { update(); } finally { backNav = false; } };
    const finish = () => {
      if (seq !== navSeq) return;
      // entrances that stood down during the transition must not replay when it ends
      $$(ENTER_SEL, r).forEach((el) => el.classList.add('hc-entered'));
      html.classList.remove('hc-nav');
      r.classList.remove('fx-in', 'fx-back');
      place(isBack);
      runPendingIntro();
    };
    const swap = () => {
      if (pendingSwap !== swap) return;
      pendingSwap = null;
      try { upd(); } catch (e) { if (exit) exit.cancel(); html.classList.remove('hc-nav'); throw e; }
      settled().then(() => {
        place(isBack);
        if (exit) { exit.cancel(); exit = null; }
        if (quiet || seq !== navSeq) return finish();
        r.classList.remove('fx-in', 'fx-back'); r.classList.add(isBack ? 'fx-back' : 'fx-in');
        setTimeout(finish, 300);              // v20.2: 290ms spring entrance (motion2.css)
      });
    };
    pendingSwap = swap;
    if (quiet) return swap();
    exit = r.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
    exit.finished.then(swap, swap);
    setTimeout(swap, 400);                     // never wait on a paused animation (hidden tab)
  };

  /* ---------------- Game intros (0.6–0.8 s, genre specific, palette only) ---------------- */
  const INTROS = {
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
    const def = INTROS[theme]; if (!def || !document.body.animate || reduced()) return;
    const o = document.createElement('div');
    o.className = 'intro intro-' + theme; o.setAttribute('aria-hidden', 'true'); o.innerHTML = def[0];
    app().appendChild(o);
    const ms = def[1](o);
    setTimeout(() => o.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).onfinish = () => o.remove(), ms);
  };

  /* Red Flag / Green Flag (v14): two curved cloth flags (S-curve top and bottom edges, fold
     shading) on poles, in their own reserved row above the question card. They unfurl in
     ~500ms after the screen is stable, then sway gently (transform only). Reduced motion and
     low-end phones get them static. Never overlaps the card or the player tiles. */
  const CLOTH = 'M0 6C16 -1 31 13 50 6S84 -1 100 8C96 19 103 30 99 41C82 48 67 34 48 41S15 48 0 43Z';
  const flagSVG = (id, a, b) => `<svg viewBox="0 0 100 48" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs>
      <linearGradient id="${id}c" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
      <linearGradient id="${id}f" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".2"/><stop offset=".2" stop-color="#fff" stop-opacity=".24"/><stop offset=".45" stop-color="#000" stop-opacity=".2"/><stop offset=".7" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#000" stop-opacity=".24"/></linearGradient></defs>
      <path d="${CLOTH}" fill="url(#${id}c)"/><path d="${CLOTH}" fill="url(#${id}f)"/></svg>`;
  const rfBanner = () => `<div class="rf-banner${reduced() || lowEnd() ? '' : ' pending'}" aria-hidden="true">
      <div class="rff rff-l"><i class="rff-pole"></i><div class="rff-cloth">${flagSVG('rffl', '#ff5a68', '#b0101f')}</div></div>
      <div class="rff rff-r"><i class="rff-pole"></i><div class="rff-cloth">${flagSVG('rffr', '#5ff0a0', '#13995a')}</div></div></div>`;
  const IN_PLACE = {
    redflag() {
      const bn = $('.rf-banner'); if (!bn) return;
      const still = reduced() || lowEnd() || !bn.animate;
      bn.classList.remove('pending');
      if (still) return;
      $$('.rff-pole', bn).forEach((p) => p.animate([{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 200, easing: EASE, fill: 'backwards' }));
      const an = $$('.rff-cloth', bn).map((c, k) => c.animate([
        { transform: 'scaleX(.05) skewY(6deg)', opacity: 0 },
        { transform: 'scaleX(1.05) skewY(-3deg)', opacity: 1, offset: 0.6 },
        { transform: 'scaleX(1) skewY(0deg)', opacity: 1 }], { duration: 500, delay: 120 + k * 60, easing: EASE, fill: 'backwards' }));
      Promise.all(an.map((x) => x.finished)).then(() => bn.classList.add('live')).catch(() => {});
    },
    // Never Have I Ever (v14): the players' own cups slide into their row below the
    // instruction text (~350ms), then one clink. Transform/opacity only, nothing overlaps.
    nhie() {
      const r = app(), cups = $$('.cups .cup');
      r.classList.remove('cups-wait');
      if (reduced() || !cups.length || !cups[0].animate) return;
      cups.forEach((c, k) => { const side = k % 2 ? 1 : -1; c.animate([{ transform: `translateX(${side * 36}px) rotate(${side * 12}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 350, delay: Math.min(k, 5) * 40, easing: EASE, fill: 'backwards' }); });
      setTimeout(() => {
        if (!r.contains(cups[0])) return;
        buzz(15); window.SFX && SFX.play('softtick');
        cups.slice(0, 2).forEach((c, k) => { const s = $('.solo', c); if (s && !c.classList.contains('tilted')) s.animate([{ transform: 'none' }, { transform: `rotate(${k ? -9 : 9}deg)` }, { transform: 'none' }], { duration: 220, easing: 'ease-out' }); });
      }, 330 + Math.min(cups.length - 1, 5) * 40);
    },
  };
  const playIntro = (theme) => (IN_PLACE[theme] ? IN_PLACE[theme]() : intro(theme));
  // Intros wait for the transition to finish and the final layout to paint
  const runPendingIntro = () => {
    const th = pendingIntro; pendingIntro = null; if (!th) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (app().dataset.theme === th && document.getElementById('stage')) playIntro(th); else app().classList.remove('cups-wait'); }));
  };

  /* ---------------- Cards: spring flip in, drag with tilt, swipe to Chicken Out ---------------- */
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
      const ck = document.querySelector('.controls [data-act="chicken"]');   // swipe away = Chicken Out
      if (armed && ck && Core._skip) {
        const dir = Math.sign(dx);
        buzz([10, 20, 30]);
        el.animate([{ transform: from, opacity: 1 }, { transform: `perspective(900px) translateX(${dir * 130}vw) rotate(${dir * 28}deg)`, opacity: 0 }], { duration: 320, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' })
          .onfinish = () => ck.click();
      } else {
        el.animate([{ transform: from }, { transform: 'none' }], { duration: 650, easing: SPRING() });
        if (Math.abs(dx) > 20) buzz(6);
      }
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  };
  const enhanceStage = (root) => { const c = root && root.querySelector(CARD_SEL); if (c) { if (Core.cardHeat === 3 && window.Motion2) Motion2.hotDeal(c); else flipIn(c); makeDraggable(c); } };

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
  let backNav = false;   // set by navigate() for the length of a back update: home skips its entrance stagger
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
        const m = $('.modal-wrap .modal'); const r = m ? m.getBoundingClientRect() : { left: innerWidth / 2 - 1, width: 2, top: innerHeight / 2 };
        embers(heat, r.left + r.width / 2, r.top + 28);
        buzz([[0], [15], [20, 40, 25], [30, 40, 60, 40, 80]][heat] || 15);
      });
      return p;
    };
    // game screens: intro on mount, flip-in + drag for each new card
    const origMount = window.mount;
    window.mount = function (theme, ...rest) {
      const s = origMount(theme, ...rest); ensureAmb();
      if (theme === 'redflag' && s) s.insertAdjacentHTML('beforebegin', rfBanner());
      if (theme === 'nhie' && !reduced()) app().classList.add('cups-wait');
      pendingIntro = theme;
      if (!document.documentElement.classList.contains('hc-nav')) runPendingIntro();
      return s;
    };
    const origStage = window.stageHTML;
    window.stageHTML = function (html) { const s = origStage(html); enhanceStage(s); return s; };
    // navigation: tile → game morph, game → home collapse
    const origPlay = App.play.bind(App);
    App.play = function (id) {
      if (Core.players().length < 2) return origPlay(id);
      navigate(() => origPlay(id), { dir: 'fwd' });
    };
    const origSet = App.set.bind(App);
    App.set = function (theme, html) {
      app().classList.remove('cups-wait');
      origSet(theme, html); ensureAmb();
      if (theme === 'home') { app().classList.toggle('no-stagger', backNav); setHeat(Core.heatProgress()); $$('.tile').forEach((t, k) => t.style.setProperty('--i', k)); }
    };
    document.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav="home"]'); if (!nav) return;
      e.stopImmediatePropagation(); e.preventDefault();
      window.SFX && SFX.play('tap');
      navigate(() => App.home(), { back: true });
    }, true);
    // v16: press feedback lives in audio.js (one delegated pointerdown handler for every button, tile and tab)
  };

  hook();
  // Hidden tab: every loop rests (html.tab-hidden, v14.css)
  document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('tab-hidden', document.hidden));
  ensureAmb();
  // Idle warm-up: the easing tokens and the first two games' decks are ready before any tap
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 600));
  idle(() => { document.documentElement.classList.add('hc-ready'); SPRING(); SPRING_SOFT(); try { if (Core.cards && Core.cards.length) HC.GAMES.slice(0, 2).forEach((g) => Core.pool(g.id, 1)); } catch (e) {} }, { timeout: 2500 });
  startMesh();
  // rateLoop(); (v12.2: ambience is static, nothing to retime)
  setHeat(Core.S ? Core.heatProgress() : 0);
  runSplash();
  RM.addEventListener && RM.addEventListener('change', () => { if (reduced()) { meshAnims.forEach((a) => a.cancel()); meshAnims.length = 0; } else startMesh(); });
  window.Motion = { intro, embers, navigate, setHeat };
})();

/* ---------------- v20.2: HOT ignition + motion pass (no libraries) ----------------
   Transform + opacity only, small layers, WAAPI so every piece is cancellable.
   - ignite(hero, kind): the moment heat reaches HOT. kind 'lock' (third turn of the hold ring, rides
     the lock3 sound and the Burn flames), 'release' (letting go at HOT, rides the hotrelease flame
     burst), 'pill' (tapping the HOT pill). White-hot ring flash, shockwave rings, the HOT word
     ignites (punch + glow flare), embers burst up off the ring, one warmth pulse on #amb, then the
     standing .ring-hot takes over. ~1s, interruptible, nothing left behind.
   - hotDeal(card): HOT cards deal in with their own rise + heat shimmer + ember edge.
   - closing sheets / dialogs leave an inert ghost that slides away (the real one is gone at once,
     so game logic, keyboard and tests see exactly what they saw before).
   - level pill pop, Charades layer pips, end-night count-up.
   Reduced motion: fades only. html.low-end: no embers, no warmth pulse, one shockwave.
   Nothing starts during a screen change or in a hidden tab. */
(() => {
  const H = document.documentElement;
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => { const m = H.dataset.motion; return m === 'reduce' || (m !== 'full' && RM.matches); };
  const low = () => H.classList.contains('low-end');
  const hidden = () => document.hidden || H.classList.contains('tab-hidden');
  const navving = () => H.classList.contains('hc-nav');
  const app = () => document.getElementById('app');
  let _sp = '', _ss = '';
  const tok = (n, f) => getComputedStyle(H).getPropertyValue(n).trim() || f;
  const SP = () => _sp || (_sp = tok('--spring', 'cubic-bezier(.34,1.4,.64,1)'));
  const SS = () => _ss || (_ss = tok('--spring-soft', 'cubic-bezier(.3,1.2,.6,1)'));
  const OUT = 'cubic-bezier(.16,1,.3,1)';
  const after = (a, f) => a.finished.then(f, f);
  // run f once the screen change (if any) has finished; never waits more than 900ms
  const whenSettled = (f) => {
    if (!navving()) return f();
    let t = 0;
    const mo = new MutationObserver(() => { if (!navving()) { mo.disconnect(); clearTimeout(t); requestAnimationFrame(f); } });
    mo.observe(H, { attributes: true, attributeFilter: ['class'] });
    t = setTimeout(() => { mo.disconnect(); f(); }, 900);
  };

  /* ---------- HOT ignition ---------- */
  const live = new Set();   // running ignitions: { el, warm, anims, t }
  const kill = (g) => { clearTimeout(g.t); g.anims.forEach((a) => { try { a.cancel(); } catch (e) {} }); g.el.remove(); if (g.warm) g.warm.remove(); live.delete(g); };
  const stop = () => { [...live].forEach(kill); document.querySelectorAll('.ht-hot.ig-hot').forEach((x) => x.classList.remove('ig-hot')); };
  const ignite = (hero, kind = 'lock') => {
    const btn = hero && hero.querySelector('#holdBtn');
    if (!btn || !btn.animate || hidden() || navving()) return;
    if (kind !== 'release') stop();   // a new ignition replaces a running one; the release burst layers on top
    // the heading word takes the HOT palette at the lock (the hero's data-heat only moves at the release:
    // setting it early woke the hidden standing HOT loops for the rest of the hold)
    const hh = hero.querySelector('.ht-hot');
    if (hh) hh.classList.toggle('ig-hot', kind === 'lock');
    const rm = reduced(), lo = low(), big = kind !== 'release';
    // embers ride in three clusters (each one layer holding several dots) that fly up and spread:
    // three composited layers instead of one per ember
    const nc = rm || lo ? 0 : 3;
    const el = document.createElement('span');
    el.className = 'hc-ign ig-' + kind; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<i class="ig-flash"></i>' + (rm ? '' : '<i class="ig-wave"></i>' + (lo || !big ? '' : '<i class="ig-wave w2"></i>')) + (nc ? '<i class="ig-em e1"></i><i class="ig-em e2"></i><i class="ig-em e3"></i>' : '');
    btn.appendChild(el);
    const g = { el, warm: null, anims: [], t: 0 }; live.add(g);
    const A = (node, kf, o) => { const a = node.animate(kf, o); g.anims.push(a); return a; };
    const flash = el.firstChild;
    // the heading colour switches at once at the ignition (no 400ms repaint of the masked word under the punch)
    const hsvg = hero.querySelector('.ht-svg');
    if (hsvg && big) { hsvg.classList.add('ig-now'); setTimeout(() => hsvg.classList.remove('ig-now'), 500); }
    if (rm) A(flash, [{ opacity: 0 }, { opacity: big ? 0.9 : 0.6, offset: 0.25 }, { opacity: 0 }], { duration: 420, easing: 'linear' });
    else {
      A(flash, [{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'scale(1.04)', offset: 0.2 }, { opacity: 0, transform: 'scale(1.38)' }], { duration: big ? 560 : 400, easing: OUT });
      const w = el.querySelectorAll('.ig-wave');
      if (w[0]) A(w[0], [{ opacity: 0.95, transform: 'scale(.92)' }, { opacity: 0, transform: `scale(${big ? 2.4 : 2})` }], { duration: big ? 760 : 560, easing: OUT });
      if (w[1]) A(w[1], [{ opacity: 0.8, transform: 'scale(.9)' }, { opacity: 0, transform: 'scale(1.9)' }], { duration: 640, delay: 120, easing: OUT, fill: 'backwards' });
      const up = big ? 1 : 0.75;
      el.querySelectorAll('.ig-em').forEach((c, i) => {
        const dx = [-26, 6, 30][i] * up, dy = [-150, -190, -135][i] * up, r = [-14, 4, 16][i];
        A(c, [{ transform: 'translate(0, 10px) scale(.45)', opacity: 0 }, { opacity: 1, offset: 0.14 }, { transform: `translate(${dx}px, ${dy}px) scale(1.35) rotate(${r}deg)`, opacity: 0 }],
          { duration: [880, 1020, 940][i], delay: 30 + i * 50, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
      });
    }
    // the HOT word ignites: a punch on its own layer and the glow flares (transform only)
    const word = hero.querySelector('.ht-hot'), glow = hero.querySelector('.ht-glow');
    // no scale on the word: scaling an ancestor of SVG text re-lays the text out every frame (measured);
    // a lift + twist on the word and a scale flare on its glow read as the same punch
    if (word && !rm) A(word, big
      ? [{ transform: 'none' }, { transform: 'translateY(-9px) rotate(-4deg)', offset: 0.2 }, { transform: 'translateY(1.5px) rotate(1deg)', offset: 0.52 }, { transform: 'translateY(-.5px) rotate(-.3deg)', offset: 0.76 }, { transform: 'none' }]
      : [{ transform: 'none' }, { transform: 'translateY(-5px) rotate(-2deg)', offset: 0.3 }, { transform: 'none' }], { duration: big ? 780 : 480, easing: 'cubic-bezier(.2,.7,.3,1)' });
    if (glow && !rm) A(glow, [{ transform: 'scale(.8)' }, { transform: `scale(${big ? 1.4 : 1.2})`, offset: 0.25 }, { transform: 'none' }], { duration: big ? 900 : 560, easing: OUT });
    // one warmth pulse behind everything, centred on the ring (skipped on low-end)
    if (big && !lo) {
      const amb = document.getElementById('amb');
      // read the ring's place just after a frame has painted (layout is clean then: no forced reflow)
      if (amb) requestAnimationFrame(() => setTimeout(() => {
        if (!live.has(g)) return;
        const r = btn.getBoundingClientRect();
        const w = document.createElement('i'); w.className = 'hc-warm';
        w.style.setProperty('--x', (r.left + r.width / 2).toFixed(0) + 'px'); w.style.setProperty('--y', (r.top + r.height / 2).toFixed(0) + 'px');
        amb.appendChild(w); g.warm = w;
        A(w, [{ opacity: 0 }, { opacity: 1, offset: 0.28 }, { opacity: 0 }], { duration: 1000, easing: 'ease-out' });
      }, 0));
    }
    // cleaned up when its last piece finishes (cancel counts), with a safety net
    setTimeout(() => Promise.all(g.anims.map((a) => a.finished)).then(() => live.has(g) && kill(g), () => {}), 120);
    g.t = setTimeout(() => live.has(g) && kill(g), 2600);
  };

  /* ---------- HOT card deal ---------- */
  const hotDeal = (el) => {
    if (!el || !el.animate) return;
    if (reduced()) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'linear', fill: 'backwards' }); return; }
    const go = () => {
      el.classList.remove('hc-hot-wait');
      if (!el.isConnected) return;
      el.animate([
        { transform: 'perspective(900px) translateY(48px) rotateX(26deg) scale(.9)', opacity: 0 },
        { opacity: 1, offset: 0.3 },
        { transform: 'perspective(900px) translateY(0) rotateX(0) scale(1)', opacity: 1 }], { duration: 760, easing: SS(), fill: 'backwards' });
      if (low() || hidden()) return;
      const fx = document.createElement('span');
      fx.className = 'hc-hotfx'; fx.setAttribute('aria-hidden', 'true');
      fx.innerHTML = '<i class="hf-edge"></i><i class="hf-sheen"></i><span class="hf-sparks"><b></b><b></b><b></b><b></b><b></b><b></b></span>';
      if (getComputedStyle(el).position === 'static') el.classList.add('hc-rel');
      el.appendChild(fx);
      const an = [];
      an.push(fx.querySelector('.hf-edge').animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 1100, delay: 120, easing: 'ease-out', fill: 'backwards' }));
      an.push(fx.querySelector('.hf-sheen').animate([{ transform: 'translateX(-130%) skewX(-18deg)' }, { transform: 'translateX(260%) skewX(-18deg)' }], { duration: 900, delay: 200, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'backwards' }));
      fx.querySelectorAll('.hf-sparks b').forEach((b, i) => {
        const x = (i - 2.5) * 34 + (Math.random() - 0.5) * 18, up = 50 + Math.random() * 60;
        an.push(b.animate([{ transform: `translate(${x.toFixed(0)}px, 0) scale(1)`, opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: `translate(${(x * 1.25).toFixed(0)}px, ${-up.toFixed(0)}px) scale(0)`, opacity: 0 }], { duration: 760 + Math.random() * 300, delay: 260 + i * 35, easing: OUT, fill: 'backwards' }));
      });
      Promise.all(an.map((a) => a.finished)).catch(() => {}).then(() => { fx.remove(); el.classList.remove('hc-rel'); });
    };
    if (navving()) { el.classList.add('hc-hot-wait'); whenSettled(go); } else go();
  };

  /* ---------- Closing sheets / dialogs: an inert ghost leaves (the real one is already gone) ---------- */
  const desk = matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
  document.addEventListener('scroll', (e) => { const t = e.target; if (t && t.classList && t.classList.contains('modal')) t._st = t.scrollTop; }, true);
  const ghost = (node) => {
    if (!node.classList || !node.classList.contains('modal-wrap') || node.classList.contains('full') || node.classList.contains('hc-ghost')) return;
    if (navving() || hidden() || !node.animate) return;
    const m0 = node.querySelector('.modal'); if (!m0) return;
    const g = node.cloneNode(true);
    g.classList.remove('modal-wrap', 'acct-wrap'); g.classList.add('hc-ghost');
    g.removeAttribute('id'); g.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
    g.setAttribute('aria-hidden', 'true'); g.inert = true;
    app().appendChild(g);
    const m = g.querySelector('.modal');
    if (m0._st) m.scrollTop = m0._st;
    const a = g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced() ? 160 : 220, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    if (!reduced()) m.animate(desk.matches ? [{ transform: 'none' }, { transform: 'translateY(8px) scale(.955)' }] : [{ transform: 'none' }, { transform: 'translateY(42%)' }], { duration: 220, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
    after(a, () => g.remove());
  };
  const watchApp = () => {
    const r = app(); if (!r || !window.MutationObserver) return;
    new MutationObserver((recs) => recs.forEach((rec) => {
      if (rec.removedNodes.length !== 1 || rec.addedNodes.length) return;   // a whole-screen swap is not a close
      ghost(rec.removedNodes[0]);
    })).observe(r, { childList: true });
  };

  /* ---------- Level pills: a spring pop; the HOT pill ignites ---------- */
  let heatBefore = 0;
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('.heat-steps .hs'); if (b && window.Core) heatBefore = Core.heat(); }, true);
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.heat-steps .hs'); if (!b || b.classList.contains('locked') || !b.animate) return;
    if (!reduced()) b.animate([{ scale: '1' }, { scale: '1.12', offset: 0.3 }, { scale: '1' }], { duration: 420, easing: 'ease-out' });
    if (+b.dataset.step === 3 && heatBefore !== 3 && window.Core && Core.heat() === 3) ignite(document.getElementById('hero'), 'pill');
  });

  /* ---------- HUD: Charades layer pips drop out with a spring ---------- */
  const hookHud = () => {
    if (!window.Core || !Core.updateHud) return;
    const orig = Core.updateHud.bind(Core);
    Core.updateHud = function () {
      const before = {};
      document.querySelectorAll('.scores .chip').forEach((c) => { const l = c.querySelectorAll('.layers i.off').length; before[c.dataset.i] = l; });
      orig();
      if (reduced() || navving()) return;
      document.querySelectorAll('.scores .chip').forEach((c) => {
        const offs = c.querySelectorAll('.layers i.off'), was = before[c.dataset.i];
        if (was == null || offs.length <= was || !offs[0].animate) return;
        for (let k = 0; k < offs.length - was; k++) offs[k].animate([{ transform: 'translateY(-8px) scale(1.5) rotate(-24deg)', opacity: 0.25 }, { transform: 'none', opacity: 1 }], { duration: 520, delay: k * 60, easing: SP(), fill: 'backwards' });
      });
    };
  };

  /* ---------- End of the night: the stat cards rise in and the numbers count up ---------- */
  const countUp = (b, to, delay) => {
    const t0 = performance.now() + delay, d = 760;
    b.textContent = '0';
    const step = (t) => {
      if (!b.isConnected) return;
      const p = Math.max(0, Math.min(1, (t - t0) / d)), e = 1 - Math.pow(1 - p, 3);
      b.textContent = String(Math.round(to * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const night = () => {
    const grid = document.querySelector('#app .night .night-grid'); if (!grid || grid.dataset.nc) return;
    grid.dataset.nc = '1';
    if (reduced() || !grid.animate) return;
    [...grid.children].forEach((d, i) => d.style.setProperty('--i', i));
    grid.classList.add('nc-wait');
    whenSettled(() => {
      grid.classList.remove('nc-wait'); grid.classList.add('nc-go');
      grid.querySelectorAll('b').forEach((b, i) => { const v = b.textContent.trim(); if (/^\d+$/.test(v) && +v > 0) countUp(b, +v, 140 + i * 70); });
    });
  };
  const hookSet = () => {
    if (typeof App === 'undefined' || !App.set) return;   // App is a script-level const, not a window property
    const orig = App.set.bind(App);
    App.set = function (...a) { const r = orig(...a); try { night(); } catch (e) {} return r; };
  };

  hookHud(); hookSet(); watchApp();
  window.Motion2 = { ignite, hotDeal, stop };
})();
