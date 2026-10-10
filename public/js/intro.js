/* Heat Check: the intro / home screen. A hold-to-heat-check moment, tonight's vibe,
   and the games as a loose, tilted stack of cards that fans out as you scroll. */

const MICRO = [
  'Phones down. Well, except this one.',
  'Rule one: the Pass button is not a personality.',
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
  redflag: 'Judge each other’s dating habits. Lovingly. Mostly.',
  nhie: 'Confess things. Sip accordingly.',
  bodypart: 'Blindfold on. Guess where that was.',
  charades: 'Act it out. Lose a sock if you flop.',
  wyr: 'Two options. One of them gets you in trouble.',
  mostlikely: 'Point fingers. Everyone already knows.',
  hotseat: 'Find out how well you really listen.',
  twotruths: 'Lie with a straight face. Good luck.',
  swap: 'Answer as your partner. Do the voice.',
};

const TILT = [-5, 4, -3, 5, -4, 3, -5, 2, -3];

const Vibe = {
  options: {
    cute: { label: 'Cute', note: 'Giggles first, heat later.', re: /laugh|giggl|smile|compliment|cute|hug|tickl|nickname|cheek|forehead|silly|hand/i },
    chaotic: { label: 'Chaotic', note: 'Loud, silly, slightly unhinged.', re: /dance|loud|accent|impression|scream|sing|fail|trip|honk|chaos|fast|race|drama|wildest|ridiculous/i },
    romantic: { label: 'Romantic', note: 'Slow, close, a lot of eye contact.', re: /kiss|eyes|eye contact|slow|whisper|hold|close|love|neck|candle|dance slowly|lips/i },
  },
  get() { const v = Store.get('hc_vibe', null); return this.options[v] ? v : null; },
  set(v) { Store.set('hc_vibe', this.options[v] ? v : null); Core.vibeDraws = 0; },
  regex() { const v = this.get(); return v ? this.options[v].re : null; },
};

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
  hotBadge(id) {
    if (Ent.pro()) return '<span class="t-hot open">Lv3 open</span>';
    return Taste.used(id) ? '<span class="t-hot">Lv3 locked</span>' : '<span class="t-hot free">1 free hot card</span>';
  },
  avatar() {
    if (Auth.signedIn()) {
      const ch = (Auth.email()[0] || '?').toUpperCase();
      return `<button class="avatar on" data-act="profile" aria-label="Your profile">${esc(ch)}</button>`;
    }
    return '<button class="avatar" data-act="profile" aria-label="Profile and sign in"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4"/><path d="M4 20.5c1.4-4 4.4-6 8-6s6.6 2 8 6"/></svg></button>';
  },
  html() {
    const ps = Core.players(), h = Core.heat(), vibe = Vibe.get();
    const games = GAME_ORDER.filter((id) => Cfg.gameOn(id));
    const who = ps.length >= 2
      ? `${ps.map((p) => esc(p.name)).join(' · ')}`
      : 'Nobody on the couch yet. Pick a game and add names.';
    return `
      <div class="home-head"><div class="logo" id="logo">Heat<br>Check</div>
        <div class="row head-actions"><span id="passChipSlot"></span>
          <button class="icon-btn" data-act="mute" aria-label="Sound">${SFX.muted ? '🔇' : '🔊'}</button>
          <button class="icon-btn" id="cfg" aria-label="Players and settings">⚙️</button>
          <span id="avatarSlot">${this.avatar()}</span></div></div>

      <section class="hc-hero" id="hero">
        <p class="hero-micro">${esc(this.micro())}</p>
        <h1 class="hero-title">How hot is tonight?</h1>
        <button class="hold-btn" id="holdBtn" aria-describedby="holdLine">
          <span class="hold-ring" aria-hidden="true"><i></i></span>
          <span class="hold-core"><span class="hold-word" id="holdWord">Hold</span><span class="hold-sub">to heat check</span></span>
        </button>
        <div class="hold-meter" aria-hidden="true">
          <span class="hm-seg" data-l="1"><i></i><b>Flirty</b></span>
          <span class="hm-seg" data-l="2"><i></i><b>Spicy</b></span>
          <span class="hm-seg lock" data-l="3"><i></i><b>Hot${Ent.pro() ? '' : ' <em>locked</em>'}</b></span>
        </div>
        <p class="hold-line" id="holdLine" aria-live="polite">Press and hold. Be honest.</p>
      </section>

      <section class="vibe">
        <div class="field"><label>Tonight’s vibe</label>
          <div class="seg" id="vibeSeg">${Object.entries(Vibe.options).map(([k, o]) => `<button data-v="${k}" class="${vibe === k ? 'on' : ''}">${o.label}</button>`).join('')}</div>
          <p class="note" id="vibeNote">${vibe ? Vibe.options[vibe].note : 'Pick one and the first few cards lean that way.'}</p></div>
      </section>

      <div class="home-sub">${who}<br>
        <span class="heat-badge h${h}b" style="margin-top:8px">Lv${h} ${HEAT[h].name} ${HEAT[h].emoji}</span>
        <span class="heat-badge" style="background:#ffffff14;margin-top:8px">${{ drink: '🍸 Drinks', water: '💧 Water', dare: '🎲 Dares only' }[Core.S.settings.mode]}</span></div>

      <h2 class="stack-title" id="pick">Pick your poison</h2>
      <section class="stack" id="stack" style="--n:${games.length}">
        ${games.map((id, k) => `<button class="tile ${id}" data-game="${id}" style="--i:${k};--r:${TILT[k % TILT.length]}deg">
          <div class="t-art"></div>${TILE_EXTRA[id] || ''}
          ${this.hotBadge(id)}
          <div class="t-name">${Games[id].title}</div><div class="t-tag">${CHEEKY[id] || Games[id].tag}</div></button>`).join('')}
        ${games.length ? '' : '<p class="note center">Every game is taking a breather. Check back in a bit.</p>'}
      </section>

      <div class="center" style="padding:0 18px 40px"><button class="btn ghost sm" id="reset">New night: reset heat & scores</button>
        <nav class="legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/refund">Refunds</a></nav></div>`;
  },

  bind() {
    this._cleanup.forEach((f) => f()); this._cleanup = [];
    this.bindVibe();
    this.bindHold();
    this.bindStack();
    this.bindLogo();
    window.UI && UI.updatePassChip();
  },

  // Account state changed while on home: refresh the bits that depend on it, in place
  refresh() {
    if (document.getElementById('app').dataset.theme !== 'home' || !$('#stack')) return;
    const slot = $('#avatarSlot'); if (slot) slot.innerHTML = this.avatar();
    $$('#stack .tile').forEach((t) => { const b = $('.t-hot', t); if (b) b.outerHTML = this.hotBadge(t.dataset.game); });
    const lock = $('.hm-seg.lock b'); if (lock) lock.innerHTML = 'Hot' + (Ent.pro() ? '' : ' <em>locked</em>');
    window.UI && UI.updatePassChip();
  },

  bindVibe() {
    const seg = $('#vibeSeg'); if (!seg) return;
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const v = Vibe.get() === b.dataset.v ? null : b.dataset.v;
      Vibe.set(v); SFX.play('tap'); vibrate(10);
      $$('button', seg).forEach((x) => x.classList.toggle('on', x.dataset.v === v));
      $('#vibeNote').textContent = v ? Vibe.options[v].note : 'Pick one and the first few cards lean that way.';
    });
  },

  /* Hold to heat check: Lv1 -> Lv2, then the Lv3 lock (a gentle paywall tease) */
  bindHold() {
    const btn = $('#holdBtn'), hero = $('#hero'), app = document.getElementById('app');
    if (!btn) return;
    const reduced = () => document.documentElement.dataset.motion === 'reduce' || (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const HOLD_MS = 2600, LOCK_AT = 0.86;
    const word = $('#holdWord'), line = $('#holdLine'), sub = $('.hold-sub', btn);
    let raf = 0, t0 = 0, p = 0, holding = false, level = 0, beatT = 0, locked = false;
    const setP = (v) => {
      p = v;
      app.style.setProperty('--hold', p.toFixed(3));
      window.Motion && Motion.setHeat && Motion.setHeat(Math.max(p, 0.05));
      $$('.hm-seg', hero).forEach((s) => { const l = +s.dataset.l; s.style.setProperty('--f', Math.max(0, Math.min(1, (p - (l - 1) / 3) * 3)).toFixed(3)); });
    };
    const say = (w, l, lv) => { word.textContent = w; line.textContent = l; sub.textContent = lv ? 'Lv' + lv : 'to heat check'; };
    const beat = () => {
      if (!holding) return;
      hero.classList.remove('thump'); void hero.offsetWidth; hero.classList.add('thump');
      vibrate(p < 0.45 ? [12] : [16, 70, 22]);
      SFX.play('heartbeat');
      beatT = setTimeout(beat, Math.max(380, 1000 - p * 650));
    };
    const step = (t) => {
      if (!holding) return;
      const pro = Ent.pro();
      let v = Math.min(1, (t - t0) / HOLD_MS);
      if (!pro && v >= LOCK_AT) {
        v = LOCK_AT;
        if (!locked) {
          locked = true; level = 3;
          hero.classList.add('locked'); vibrate([40, 40, 40]); SFX.play('buzzer');
          say('Locked', Taste.usedCount() < GAME_IDS.length ? 'Hot’s behind a door. Every game lets you peek once, free.' : 'Hot’s behind a door. Pro has the key.', 3);
        }
      }
      setP(v);
      const lv = v >= LOCK_AT ? 3 : v >= 0.45 ? 2 : 1;
      if (lv !== level && !locked) {
        level = lv;
        if (lv === 1) say('Flirty', 'Cute. Suspicious, but cute.', 1);
        if (lv === 2) { say('Spicy', 'Somebody open a window.', 2); vibrate([20, 40, 20]); }
        if (lv === 3) { say('Hot', 'No locks tonight. Behave. Or don’t.', 3); vibrate([30, 30, 60]); }
      }
      raf = requestAnimationFrame(step);
    };
    const start = (e) => {
      if (holding) return;
      if (e && e.cancelable) e.preventDefault();
      SFX.unlock();
      holding = true; locked = false; level = 0; t0 = performance.now();
      hero.classList.remove('locked', 'released'); hero.classList.add('holding'); app.classList.add('warming');
      if (reduced()) { setP(Ent.pro() ? 1 : LOCK_AT); }
      raf = requestAnimationFrame(step); beat();
    };
    const end = () => {
      if (!holding) return;
      holding = false; cancelAnimationFrame(raf); clearTimeout(beatT);
      hero.classList.remove('holding', 'thump'); hero.classList.add('released'); app.classList.remove('warming');
      const reached = p;
      const back = Core.heatProgress();
      if (reduced() || !document.body.animate) setP(0);
      else {
        const from = p, t1 = performance.now();
        const fall = (t) => { const k = Math.min(1, (t - t1) / 520); setP(from * (1 - (1 - Math.pow(1 - k, 3)))); if (k < 1 && !holding) requestAnimationFrame(fall); };
        requestAnimationFrame(fall);
      }
      window.Motion && Motion.setHeat && setTimeout(() => !holding && Motion.setHeat(back), 560);
      if (reached < 0.12) { say('Hold', 'Hold it. Don’t just poke it.'); return; }
      sub.textContent = 'Lv' + (locked ? 3 : level || 1);
      if (locked) line.innerHTML = 'Hot’s locked. <button class="linkish" data-act="paywall">See what’s behind it</button>';
      const pick = $('#pick');
      if (pick) setTimeout(() => pick.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }), 120);
    };
    btn.addEventListener('pointerdown', start);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn.addEventListener(ev, end));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e); });
    btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') end(); });
    this._cleanup.push(() => { holding = false; cancelAnimationFrame(raf); clearTimeout(beatT); app.classList.remove('warming'); app.style.removeProperty('--hold'); });
  },

  /* The stack fans out as it scrolls into view (transform only, no layout shift) */
  bindStack() {
    const stack = $('#stack'); if (!stack) return;
    const reduced = () => document.documentElement.dataset.motion === 'reduce' || (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (reduced()) { stack.style.setProperty('--fan', '1'); return; }
    let queued = false;
    const update = () => {
      queued = false;
      const r = stack.getBoundingClientRect(), vh = innerHeight || 800;
      // 0 when the stack's top sits at the bottom of the screen, 1 once it reaches the top third
      const f = Math.max(0, Math.min(1, (vh - r.top) / (vh * 0.72)));
      stack.style.setProperty('--fan', f.toFixed(3));
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    update();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    this._cleanup.push(() => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); });
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

Bus.on((type) => {
  const onHome = document.getElementById('app').dataset.theme === 'home' && $('#stack');
  if (!onHome) return;
  // Re-render only if the admin switched a game off; otherwise update in place
  if (type === 'config' && GAME_ORDER.some((id) => !Cfg.gameOn(id)) && !$('#hero.holding')) return App.home();
  Intro.refresh();
});

Object.assign(window, { Vibe, Intro });
