/* Heat Check: the intro / home screen.
   - Couples | Groups switch
   - Hold-to-heat ring: each full turn (HC.ROTATION_MS) is one heat level
   - The games as a loose, tilted stack of cards that fans out once, when it scrolls into view */

const MICRO = [
  'Phones down. Well, except this one.',
  'Rule one: Chicken Out is not a personality.',
  'Somebody’s blushing by round four. Place your bets.',
  'Lights low, volume up, dignity optional.',
  'You brought the snacks. We brought the questions.',
  'Warning: may cause eye contact.',
  'Tonight’s forecast: 90% chance of giggling.',
  'Be honest. You opened this on purpose.',
  'Hydrate. Flirt. Repeat.',
  'Your group chat will never know.',
];

const CHEEKY = {
  redflag: 'Judge wild dating moves. Find out where you stand.',
  nhie: 'Confess things. Sip accordingly.',
  charades: 'Act out the title. Flop and lose a layer.',
  wyr: 'Two options. One of them gets you in trouble.',
  hotseat: 'Find out how well you really listen.',
  swap: 'Answer as your partner. Do the voice.',
  mostlikely: 'Point fingers. Everyone already knows.',
  twotruths: 'Lie with a straight face. The table votes.',
};

const TILT = [-5, 4, -3, 5, -4, 3, -5, 2, -3];
const HEAT_RING = ['#ffd166', '#ff7a3c', '#ff2e63'];
const LOW_END = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 2;
document.documentElement.classList.toggle('low-end', LOW_END); // CSS: static gradients, no idle loops
const reducedMotion = () => document.documentElement.dataset.motion === 'reduce' || (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);

const Intro = {
  _cleanup: [],
  micro() {
    let n = 0;
    try {
      n = +(localStorage.getItem('hc_visits') || 0);
      if (!sessionStorage.getItem('hc_visit_counted')) { n += 1; localStorage.setItem('hc_visits', String(n)); sessionStorage.setItem('hc_visit_counted', '1'); }
    } catch (e) {}
    return MICRO[n % MICRO.length];
  },
  // One shared style for every tile tag (uppercase, bold): see .t-hot in tiers.css
  hotBadge(id) {
    const t = Ent.tier();
    if (t === 'premium') return '<span class="t-hot open">Fully unlocked 🔓</span>';
    if (t === 'lite') { const left = Limits.hotLeft(id); return left > 0 ? `<span class="t-hot open">${HOT} open · ${left} left</span>` : `<span class="t-hot">${HOT} used</span>`; }
    if (t === 'base' && Taste.canClaim(id)) return `<span class="t-hot free">1 free ${HOT} card</span>`;
    return `<span class="t-hot">🔒 ${HOT} locked</span>`;
  },
  /* "How HOT is tonight?": HOT is an SVG word. Three per-level gradients sit stacked inside a
     mask made of the glyphs and a hand-drawn wave, and crossfade on opacity (~400ms). The idle
     flow is a transform on that masked group (the gradients repeat, so the loop is seamless);
     nothing animates background-position or the gradient itself. */
  _drawn: false,
  heading() {
    const once = this._drawn ? ' drawn' : ''; this._drawn = true;
    const g = (id, a, b) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="260" y2="40" spreadMethod="repeat"><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient>`;
    return `<h1 class="hero-title${once}" aria-label="How ${HOT} is tonight?">
      <span class="ht-l1" aria-hidden="true"><span class="ht-soft">How</span>
        <span class="ht-hot"><i class="ht-glow"></i>
          <svg class="ht-svg" viewBox="0 0 260 124" aria-hidden="true" focusable="false">
            <defs>${g('htg1', '#ffb3c6', '#ff2e63')}${g('htg2', '#ff2e63', '#ff7a3c')}${g('htg3', '#ff7a3c', '#fff4e0')}
              <mask id="htm" maskUnits="userSpaceOnUse" x="0" y="0" width="260" height="124">
                <text class="ht-t" x="12" y="86" textLength="232" lengthAdjust="spacingAndGlyphs" fill="#fff">${HOT}</text>
                <path class="ht-wave" pathLength="100" d="M16 112 C38 102 58 120 82 111 S124 101 146 111 S190 120 212 109 S238 104 246 107" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
              </mask></defs>
            <g mask="url(#htm)"><g class="ht-flow">
              <rect class="l1" x="0" y="0" width="520" height="124" fill="url(#htg1)"/>
              <rect class="l2" x="0" y="0" width="520" height="124" fill="url(#htg2)"/>
              <rect class="l3" x="0" y="0" width="520" height="124" fill="url(#htg3)"/></g></g>
          </svg></span></span>
      <span class="ht-l2 ht-soft" aria-hidden="true">is tonight<span class="ht-q">?</span></span></h1>`;
  },
  /* "Pick your poison": a stamped label, deliberately unlike the HOT heading */
  _pickDrawn: false,
  pickHeading() {
    const once = this._pickDrawn ? ' drawn' : ''; this._pickDrawn = true;
    return `<section class="pick-sec${once}" id="pick">
      <h2 class="pick-title" aria-label="Pick your poison"><span class="pk-small" aria-hidden="true">Pick your</span>
        <span class="pk-big" aria-hidden="true">POISON<svg class="pk-line" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"><path pathLength="100" d="M3 6 H112"/><path class="pk-b" pathLength="100" d="M126 6 H197"/></svg></span></h2>
      <span class="pk-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 6l6 5 6-5"/><path d="M6 13l6 5 6-5"/></svg></span>
    </section>`;
  },
  avatar() {
    if (Auth.signedIn()) {
      const ch = (Auth.email()[0] || '?').toUpperCase();
      return `<button class="avatar on" data-act="profile" aria-label="Your profile">${esc(ch)}</button>`;
    }
    return '<button class="avatar" data-act="profile" aria-label="Profile and sign in"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4"/><path d="M4 20.5c1.4-4 4.4-6 8-6s6.6 2 8 6"/></svg></button>';
  },
  tiles(side) {
    return HC.gamesFor(side).filter((id) => Cfg.gameOn(id) && Games[id]);
  },
  html() {
    this._tier = window.Ent ? Ent.tier() : null;
    const side = Core.isGroup() ? 'group' : 'couples';
    const ps = Core.players();
    const games = this.tiles(side);
    const need = side === 'group' ? HC.GROUP_MIN : 2;
    const who = ps.length >= need ? ps.map((p) => esc(p.name)).join(' · ')
      : side === 'group' ? `Nobody here yet. Pick a game and add ${HC.GROUP_MIN} or more names.` : 'Nobody on the couch yet. Pick a game and add names.';
    const mode = side === 'group' ? { drink: '🍸 Sips', water: '💧 No alcohol' }[Core.S.group.mode] : { drink: '🍸 Drinks', water: '💧 Water', dare: '🎲 Dares only' }[Core.S.settings.mode];
    return `
      <div class="home-head"><div class="logo logo-img" id="logo"><img src="/logo-wordmark.webp" width="694" height="289" alt="Heat Check" draggable="false" decoding="async" fetchpriority="high" /></div>
        <div class="row head-actions">
          <button class="icon-btn" data-act="mute" aria-label="Sound">${SFX.muted ? '🔇' : '🔊'}</button>
          <button class="icon-btn" id="cfg" aria-label="Players and settings">⚙️</button>
          <span id="avatarSlot">${this.avatar()}</span></div></div>
      <div class="session-bar">
        <button class="sb-chip sb-who" data-act="players" aria-label="Players">${ps.length >= need ? `👥 ${who}` : '👥 Add players'}</button>
        <span class="sb-chip">${mode}</span>
        ${App.nightActive() ? '<button class="btn sm end-night" id="endNight">End night</button>' : ''}</div>
      <div id="passBanner" class="pass-banner-slot"></div>

      <div class="side-switch" role="tablist" aria-label="Who's playing">
        <button role="tab" data-side="couples" aria-selected="${side === 'couples'}" class="${side === 'couples' ? 'on' : ''}">Couples</button>
        <button role="tab" data-side="group" aria-selected="${side === 'group'}" class="${side === 'group' ? 'on' : ''}">Groups</button>
        <i class="side-pill" aria-hidden="true"></i>
      </div>

      <section class="hc-hero" id="hero">
        <p class="hero-micro">${esc(this.micro())}</p>
        ${this.heading()}
        <div class="ring-row">
          <span class="ring-side" aria-hidden="true"></span>
          <button class="hold-btn" id="holdBtn" aria-describedby="holdLine" aria-label="Hold to set the heat level">
            <span class="ring-glow" aria-hidden="true"><i class="l1"></i><i class="l2"></i><i class="l3"></i></span>
            <span class="ring-rot" aria-hidden="true"><i class="l1"></i><i class="l2"></i><i class="l3"></i></span>
            <svg class="ring-svg" viewBox="0 0 120 120" aria-hidden="true">
              <defs>
                <linearGradient id="rfg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3c6"/><stop offset="1" stop-color="#ff2e63"/></linearGradient>
                <linearGradient id="rfg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2e63"/><stop offset="1" stop-color="#ff7a3c"/></linearGradient>
                <linearGradient id="rfg3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a3c"/><stop offset="1" stop-color="#fff4e0"/></linearGradient>
                <radialGradient id="rspk"><stop offset="0" stop-color="#fff4e0" stop-opacity=".95"/><stop offset=".45" stop-color="#ffd2b0" stop-opacity=".55"/><stop offset="1" stop-color="#ff7a3c" stop-opacity="0"/></radialGradient>
              </defs>
              <circle class="ring-track" cx="60" cy="60" r="54" pathLength="100"/>
              <circle class="ring-base" cx="60" cy="60" r="54" pathLength="100"/>
              <circle class="ring-fill" cx="60" cy="60" r="54" pathLength="100"/>
              <g class="ring-spark" transform="translate(114 60)"><circle r="9" fill="url(#rspk)"/><circle r="2.6" fill="#fff"/></g>
            </svg>
            <span class="ring-lock" aria-hidden="true">${typeof icon === 'function' ? icon('lock') : '🔒'}</span>
            <span class="hold-core"><span class="hold-word" id="holdWord"></span><span class="hold-sub" id="holdSub">hold to heat check</span></span>
          </button>
          <button class="ring-reset" id="ringReset" aria-label="Reset heat to level 1" title="Back to Lv1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4.5v4h4"/></svg></button>
        </div>
        <div class="heat-steps" role="group" aria-label="Heat levels">${[1, 2, 3].map((l) => `<button class="hs" data-step="${l}"><span class="hs-lk" aria-hidden="true">🔒</span><i aria-hidden="true"></i>${HEAT[l].name}</button>`).join('')}</div>
        <p class="hold-line" id="holdLine" aria-live="polite">Press and hold. Each turn of the ring is one level.</p>
      </section>


      ${this.pickHeading()}
      <section class="stack" id="stack">
        ${games.map((id, k) => `<button class="tile ${id}" data-game="${id}" style="--i:${k};--r:${TILT[k % TILT.length]}deg">
          <div class="t-art"></div>${TILE_EXTRA[id] || ''}
          ${this.hotBadge(id)}
          <div class="t-name">${Games[id].title}</div><div class="t-tag">${CHEEKY[id] || Games[id].tag}</div></button>`).join('')}
        ${games.length ? '' : '<p class="note center">Every game here is taking a breather. Check back in a bit.</p>'}
      </section>

      <div class="center" style="padding:0 18px 40px">
        <nav class="legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/refund">Refunds</a></nav></div>`;
  },

  bind() {
    this._cleanup.forEach((f) => f()); this._cleanup = [];
    document.getElementById('app').dataset.side = Core.isGroup() ? 'group' : 'couples';
    this.bindSide();
    this.bindRing();
    this.bindStack();
    this.bindLogo();
    window.UI && UI.updatePassChip();
  },

  // Account or heat changed while on home: refresh in place
  refresh() {
    if (document.getElementById('app').dataset.theme !== 'home' || !$('#stack')) return;
    // Plan changed (signed in, bought Lite/Premium, pass ended): redraw home so no stale
    // lock or purchase prompt survives. If a sheet is open (e.g. checkout), redraw when it closes.
    if (window.Ent && this._tier !== Ent.tier() && !$('#hero.holding')) {
      if (!$('.modal-wrap')) return App.home();
      this.softReset();
      clearInterval(this._waitSheet);
      this._waitSheet = setInterval(() => { if ($('#app').dataset.theme !== 'home') return clearInterval(this._waitSheet); if (!$('.modal-wrap')) { clearInterval(this._waitSheet); if (this._tier !== Ent.tier()) App.home(); } }, 400);
    }
    const slot = $('#avatarSlot'); if (slot) slot.innerHTML = this.avatar();
    $$('#stack .tile').forEach((t) => { const b = $('.t-hot', t); if (b) b.outerHTML = this.hotBadge(t.dataset.game); });
    this.ring && this.ring.sync();
    window.UI && UI.updatePassChip();
  },

  // Drop a lock message / lock badge that no longer applies at the current plan
  softReset() {
    const hero = $('#hero'), line = $('#holdLine'); if (!hero) return;
    hero.classList.remove('locked');
    if (line && line.querySelector('.lk, [data-lock]')) line.textContent = 'Press and hold. Each turn of the ring is one level.';
  },
  bindSide() {
    $$('.side-switch [data-side]').forEach((b) => (b.onclick = () => {
      if (Core.S.side === b.dataset.side) return;
      Core.S.side = b.dataset.side; Core.save(); SFX.play('tap'); vibrate(10);
      App.home();
    }));
  },

  /* ---------- Hold-to-heat ring ---------- */
  bindRing() {
    const btn = $('#holdBtn'), hero = $('#hero'), app = document.getElementById('app');
    if (!btn) return;
    const ROT = HC.ROTATION_MS;
    const fill = $('.ring-fill', btn), base = $('.ring-base', btn), spark = $('.ring-spark', btn), word = $('#holdWord'), sub = $('#holdSub'), line = $('#holdLine');
    let raf = 0, t0 = 0, holding = false, completed = 0, blocked = 0, shown = 0;

    const paint = (level, frac) => {
      // base ring = the last completed level in full; fill = progress into the next turn
      const lv = Math.max(0, Math.min(3, level));
      base.style.stroke = lv ? HEAT_RING[lv - 1] : 'transparent';
      base.style.strokeDashoffset = lv ? '0' : '100';
      // Progress arc: a bright gradient for the level being filled, with a spark at its tip
      const f = Math.max(0, Math.min(1, frac));
      fill.style.stroke = `url(#rfg${Math.min(3, lv + 1)})`;
      fill.style.strokeDashoffset = String(100 - f * 100);
      fill.classList.toggle('empty', frac <= 0.001);
      if (spark) {
        const a = f * Math.PI * 2;
        spark.setAttribute('transform', `translate(${(60 + 54 * Math.cos(a)).toFixed(2)} ${(60 + 54 * Math.sin(a)).toFixed(2)})`);
        spark.classList.toggle('on', holding && f > 0.02);
      }
      // Per frame we only touch the ring and one variable on the hero (not #app), so style
      // recalculation stays local. Page-wide ambience changes once per level, not per frame.
      hero.style.setProperty('--hold', ((lv + frac) / 3).toFixed(3));
      if (hero.dataset.level !== String(lv)) {
        hero.dataset.level = lv;
        $$('.heat-steps .hs', hero).forEach((d) => d.classList.toggle('on', +d.dataset.step === lv));
        window.Motion && Motion.setHeat && Motion.setHeat(Math.max(0.05, lv / 3));
      }
    };
    // The ring is the heat selector: each level shows its penalty points
    const label = (lv) => { word.textContent = lv ? HEAT[lv].name : 'Hold'; sub.textContent = !lv ? 'hold to heat check' : Taste.armed && !holding ? `free ${HOT} card armed` : `${ptsWord(pts(lv))} penalty`; };
    const lockMessage = (level) => {
      const info = UI.lockInfo(level, null);
      return info ? `<span class="lk" aria-hidden="true">${icon('lock')}</span> <span>${esc(info.text)}</span> ${UI.lockActions(info)}` : '';
    };
    // Level chips: show every level, lock the ones this account can't play yet
    const steps = $$('.heat-steps .hs', hero);
    const syncSteps = () => { const cap = Core.heatCap(); steps.forEach((b) => { const lk = +b.dataset.step > cap; b.classList.toggle('locked', lk); b.setAttribute('aria-label', `${HEAT[+b.dataset.step].name}${lk ? ', locked' : ''}`); }); };
    steps.forEach((b) => (b.onclick = () => {
      const lv = +b.dataset.step;
      if (lv > Core.heatCap()) {
        SFX.play('buzzer'); vibrate([30, 30, 30]);
        hero.classList.remove('locked'); void hero.offsetWidth; hero.classList.add('locked');
        line.innerHTML = lockMessage(lv); return;
      }
      SFX.play('tap'); vibrate(10); hero.classList.remove('locked');
      Core.setHeat(lv); setHeatAttr(Core.heat());
      line.textContent = `Locked in: ${ptsLabel(lv)}.`;
    }));
    const setHeatAttr = (h) => { hero.dataset.heat = String(Math.max(1, Math.min(3, h || 1))); };
    const sync = () => {
      syncSteps(); setHeatAttr(Core.heat());
      if (holding) return;
      const h = Core.heat(); shown = h;
      paint(h, 0); label(h);
      if (!Taste.armed) sub.textContent = `${ptsWord(pts(h))} penalty`;
      hero.classList.toggle('burning', h === 3 && Core.heatCap() === 3);
    };
    // Animate the ring from one level to another (reset, auto-ramp, release)
    const sweep = (from, to) => {
      if (reducedMotion() || !btn.animate) { paint(to, 0); label(to); return; }
      const t1 = performance.now(), d = 520;
      const step = (t) => {
        const k = Math.min(1, (t - t1) / d), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e;
        paint(Math.floor(v + 1e-6), v - Math.floor(v + 1e-6));
        if (k < 1 && !holding) requestAnimationFrame(step); else if (!holding) { paint(to, 0); label(to); }
      };
      requestAnimationFrame(step);
    };
    const step = (t) => {
      if (!holding) return;
      const allowedMax = Core.heatCap();
      const turns = (t - t0) / ROT;
      let done = Math.min(3, Math.floor(turns)), frac = turns - Math.floor(turns);
      if (done >= 3) frac = 0;
      // A locked level never engages: the ring holds at the highest allowed level and shakes.
      // Holding on into the next turn swaps the message to that level's lock (Spicy, then Hot).
      if (allowedMax < 3 && turns >= allowedMax + 0.15) {
        const tried = Math.min(3, Math.floor(turns - 0.15) + 1);
        done = allowedMax; frac = 0;
        if (blocked !== tried) {
          blocked = tried;
          hero.classList.remove('locked'); void hero.offsetWidth; hero.classList.add('locked');
          vibrate([40, 40, 40]); SFX.play('buzzer');
          line.innerHTML = lockMessage(tried);
        }
      } else if (allowedMax < 3 && done >= allowedMax) { done = allowedMax; }
      if (done > completed) {
        completed = done;
        label(done); vibrate(done === 3 ? [30, 30, 60, 30, 90] : 18); SFX.play('softtick');
        if (done === 1 && !blocked) line.textContent = `Flirty · ${ptsWord(pts(1))} penalty. Cute. Suspicious, but cute.`;
        if (done === 2 && !blocked) line.textContent = `Spicy · ${ptsWord(pts(2))} penalty. Somebody open a window.`;
        if (done === 3) { line.textContent = `${HOT} · ${ptsWord(pts(3))} penalty. No locks tonight.`; Burn.play(hero); }
      }
      paint(done, frac);
      if (done < 3) raf = requestAnimationFrame(step);
    };
    const start = (e) => {
      if (holding) return;
      if (e && e.cancelable) e.preventDefault();
      if (e && e.pointerId != null) { try { btn.setPointerCapture(e.pointerId); } catch (err) {} }
      SFX.unlock();
      holding = true; completed = 0; blocked = 0; t0 = performance.now();
      hero.classList.remove('locked', 'burning'); Burn.stop(hero); hero.classList.add('holding'); app.classList.add('warming');
      line.textContent = 'Keep holding…';
      paint(0, 0); label(0);
      raf = requestAnimationFrame(step);
    };
    const end = () => {
      if (!holding) return;
      holding = false; cancelAnimationFrame(raf);
      hero.classList.remove('holding', 'locked'); app.classList.remove('warming');
      if (completed >= 1) {
        const set = Core.setHeat(completed);   // clamps to what this account may play, resets the ramp
        shown = set; paint(set, 0); label(set); setHeatAttr(set);
        hero.classList.toggle('burning', set === 3);
        if (!blocked) line.textContent = set === 3 ? `${HOT} it is · ${ptsWord(pts(3))} penalty. Behave. Or don’t.` : `Locked in: ${ptsLabel(set)}.`;
        const pick = $('#pick');
        if (pick) setTimeout(() => pick.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }), 160);
      } else {
        // Let go before the first full turn: keep the current level, ease the ring back
        const fromV = parseFloat(hero.style.getPropertyValue('--hold') || '0') * 3;
        line.textContent = 'Hold it. A full turn sets the level.';
        sweep(fromV, shown);
      }
    };
    btn.addEventListener('pointerdown', start);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => btn.addEventListener(ev, end));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e); });
    btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') end(); });
    hero.addEventListener('click', (e) => {
      const r = e.target.closest('[data-lock]'); if (!r) return;
      SFX.play('tap');
      UI.lockAct(r.dataset.lock, null, () => {
        if (Taste.armed) { sub.textContent = `free ${HOT} card armed`; line.textContent = `Armed. Pick a game: its first card is ${HOT}.`; vibrate(20); }
        else Intro.refresh();
      });
    });
    $('#ringReset').onclick = () => {
      const from = Core.heat();
      Core.resetHeat(); Taste.armed = false; shown = 1; setHeatAttr(1);
      hero.classList.remove('burning', 'locked'); Burn.stop(hero);
      line.textContent = `Back to Flirty · ${ptsWord(pts(1))} penalty. Ramp counter reset.`;
      sweep(from, 1); vibrate(12); SFX.play('tap');
    };
    this.ring = { sync, sweep };
    // Idle loops (ring spin, glow breath, HOT flow) only run while the hero is on screen
    if ('IntersectionObserver' in window) {
      const vis = new IntersectionObserver((es) => es.forEach((e) => hero.classList.toggle('offscreen', !e.isIntersecting)));
      vis.observe(hero); this._cleanup.push(() => vis.disconnect());
    }
    const off = Bus.on((type) => { if (type === 'heat' && !holding) { const to = Core.heat(); setHeatAttr(to); hero.classList.remove('locked'); if (to !== shown) { sweep(shown, to); shown = to; } hero.classList.toggle('burning', to === 3 && Core.heatCap() === 3); } });
    sync();
    this._cleanup.push(() => { holding = false; cancelAnimationFrame(raf); off(); app.classList.remove('warming'); Burn.stop(hero); this.ring = null; });
  },

  /* Fan the stack out once when it first scrolls into view. One-time and idempotent:
     scrolling back up never collapses it again (the v10 scroll-driven transform did,
     which is what made "Pick your poison" and the cards blank out on fast scrolls). */
  bindStack() {
    const stack = $('#stack'); if (!stack) return;
    const pick = $('#pick');
    if (pick && !pick.classList.contains('drawn')) {
      if ('IntersectionObserver' in window && !reducedMotion()) {
        const po = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { pick.classList.add('go'); po.disconnect(); } }, { rootMargin: '0px 0px -10% 0px' });
        po.observe(pick); this._cleanup.push(() => po.disconnect());
      } else pick.classList.add('drawn');
    }
    // 60 fps: idle loops only run on tiles in view; sheens pause while the page scrolls
    if ('IntersectionObserver' in window) {
      const vis = new IntersectionObserver((es) => es.forEach((e) => e.target && e.target.classList.toggle('offscreen', !e.isIntersecting)), { rootMargin: '80px 0px' });
      $$('.tile', stack).forEach((t) => vis.observe(t));
      this._cleanup.push(() => vis.disconnect());
    }
    let st = 0;
    const onScroll = () => { if (!st) document.documentElement.classList.add('is-scrolling'); clearTimeout(st); st = setTimeout(() => { st = 0; document.documentElement.classList.remove('is-scrolling'); }, 140); };
    window.addEventListener('scroll', onScroll, { passive: true });
    this._cleanup.push(() => { window.removeEventListener('scroll', onScroll); clearTimeout(st); document.documentElement.classList.remove('is-scrolling'); });
    if (stack.dataset.fanned || reducedMotion() || !('IntersectionObserver' in window)) { stack.classList.add('fanned', 'no-anim'); stack.dataset.fanned = '1'; return; }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      if (stack.dataset.fanned) return;
      stack.dataset.fanned = '1';
      stack.classList.add('fanned');
    }, { rootMargin: '0px 0px -15% 0px' });
    io.observe(stack);
    this._cleanup.push(() => io.disconnect());
  },

  /* Hidden admin entry: long-press the logo for 3 seconds (admins only; nothing shows otherwise) */
  bindLogo() {
    const logo = $('#logo'); if (!logo) return;
    let t = 0, sx = 0, sy = 0;
    const cancel = () => clearTimeout(t);
    logo.addEventListener('pointerdown', (e) => {
      sx = e.clientX; sy = e.clientY;
      t = setTimeout(() => { if (Admin.isAdminUser() && window.UI) { vibrate(30); UI.adminEntry(); } }, 3000);
    });
    logo.addEventListener('pointermove', (e) => { if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) cancel(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => logo.addEventListener(ev, cancel));
    logo.addEventListener('contextmenu', (e) => e.preventDefault());
  },
};

/* ---------- The Hot burn: ~1.5 s ignition, then a cheap smolder (opacity only) ----------
   Budget: transform/opacity only, no animated blur/filter, no blend modes, at most 9
   animated layers plus capped embers. Low-end phones: one flame + glow, no embers.
   Reduced motion: a static glow and the label. */
const Burn = {
  play(hero) {
    this.stop(hero);
    const layer = document.createElement('div');
    layer.className = 'burn' + (LOW_END ? ' lite' : '');
    layer.setAttribute('aria-hidden', 'true');
    if (reducedMotion()) { layer.innerHTML = '<i class="b-glow static"></i>'; hero.appendChild(layer); hero.classList.add('burning'); return; }
    const flames = LOW_END ? 1 : 3;
    const embers = LOW_END ? 0 : 16;
    // Screen edges ignite: a fixed layer on #app (above everything, never catches taps)
    if (!LOW_END) {
      const edges = document.createElement('div');
      edges.className = 'burn-edges igniting'; edges.setAttribute('aria-hidden', 'true');
      edges.innerHTML = '<i class="b-edge t"></i><i class="b-edge b"></i><i class="b-edge l"></i><i class="b-edge r"></i>';
      document.getElementById('app').appendChild(edges);
      this._edges = edges;
      setTimeout(() => edges.remove(), 1600);
    }
    layer.innerHTML =
      '<i class="b-glow"></i>' +
      Array.from({ length: flames }, (_, k) => `<i class="b-flame f${k}"></i>`).join('') +
      (embers ? `<span class="b-embers">${Array.from({ length: embers }, (_, k) => `<i style="--x:${(Math.random() * 2 - 1) * 90}px;--d:${(Math.random() * 0.6).toFixed(2)}s;--s:${(0.6 + Math.random() * 0.8).toFixed(2)}"></i>`).join('')}</span>` : '');
    hero.appendChild(layer);
    hero.classList.add('burning', 'igniting');
    const word = $('#holdWord'); if (word) { word.classList.remove('pop'); void word.offsetWidth; word.classList.add('pop'); }
    this._t = setTimeout(() => { hero.classList.remove('igniting'); layer.classList.add('smolder'); }, 1500);
  },
  stop(hero) {
    clearTimeout(this._t);
    if (this._edges) { this._edges.remove(); this._edges = null; }
    if (!hero) return;
    hero.classList.remove('igniting');
    $$('.burn', hero).forEach((b) => b.remove());
  },
};

Bus.on((type) => {
  const onHome = document.getElementById('app').dataset.theme === 'home' && $('#stack');
  if (!onHome || type === 'heat') return;
  if (type === 'config' && GAME_ORDER.some((id) => !Cfg.gameOn(id)) && !$('#hero.holding')) return App.home();
  Intro.refresh();
});

Object.assign(window, { Intro, Burn });
