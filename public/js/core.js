/* Heat Check — core: state, heat meter, decks, penalties, shared UI */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

const HEAT = {
  1: { name: 'Flirty', emoji: '😏', dare: 'Truth or compliment' },
  2: { name: 'Spicy', emoji: '🌶️', dare: 'Kiss, massage or whisper' },
  3: { name: 'Hot', emoji: '🔥', dare: 'Hot dare' },
};

const Core = {
  cards: [],
  used: {},
  paused: false,
  S: null,
  _timers: new Set(),
  _wake: null,
  _pass: null,
  root() { return document.getElementById('app'); },

  defaults() {
    return {
      couples: [{ a: '', b: '' }],
      settings: { mode: 'drink', startHeat: 1, maxHeat: 3, ramp: true, roundsPerLevel: 6, strip: true, layers: 5 },
      scores: {}, layers: {}, round: 0, turn: 0,
    };
  },
  load() {
    try { this.S = Object.assign(this.defaults(), JSON.parse(localStorage.getItem('hc_state') || '{}')); }
    catch (e) { this.S = this.defaults(); }
    this.S.settings = Object.assign(this.defaults().settings, this.S.settings);
  },
  save() { localStorage.setItem('hc_state', JSON.stringify(this.S)); },

  async loadCards() {
    const r = await fetch('cards.json', { cache: 'no-cache' }).catch(() => fetch('cards.json'));
    this.cards = await r.json();
  },

  /* ---------- players ---------- */
  /* Free play is up to 4 people (2 couples). Pro: unlimited. */
  activeCouples() { return window.Ent && Ent.unlimitedPlayers() ? this.S.couples : this.S.couples.slice(0, 2); },
  players() {
    const out = [];
    this.activeCouples().forEach((c, ci) => {
      if (c.a.trim()) out.push({ name: c.a.trim(), couple: ci });
      if (c.b.trim()) out.push({ name: c.b.trim(), couple: ci });
    });
    return out;
  },
  name(i) { return this.players()[i]?.name ?? '?'; },
  partnerOf(i) {
    const ps = this.players(), me = ps[i];
    if (!me) return 0;
    const j = ps.findIndex((p, k) => k !== i && p.couple === me.couple);
    return j >= 0 ? j : (i + 1) % ps.length;
  },
  current() { const n = this.players().length || 1; return this.S.turn % n; },
  couples() { return [...new Set(this.players().map((p) => p.couple))].filter((ci) => this.couplePlayers(ci).length === 2); },
  couplePlayers(ci) { return this.players().map((p, i) => (p.couple === ci ? i : -1)).filter((i) => i >= 0); },
  /* the couple whose turn it is: [a, b] player indexes */
  currentCouple() {
    const cs = this.couples();
    if (!cs.length) return [0, 1 % Math.max(1, this.players().length)];
    const pair = this.couplePlayers(cs[this.S.turn % cs.length]);
    return Math.floor(this.S.turn / cs.length) % 2 ? [pair[1], pair[0]] : pair;
  },
  nextTurn() { this.S.turn++; this.save(); },

  /* ---------- heat ---------- */
  heat() {
    const s = this.S.settings;
    if (!s.ramp) return Math.min(s.maxHeat, Math.max(1, s.startHeat));
    return Math.min(s.maxHeat, s.startHeat + Math.floor(this.S.round / s.roundsPerLevel));
  },
  heatProgress() {
    const s = this.S.settings, h = this.heat();
    if (!s.ramp || h >= s.maxHeat) return h / 3;
    const within = (this.S.round % s.roundsPerLevel) / s.roundsPerLevel;
    return (h - 1 + within) / 3 + 0.02;
  },
  nextRound() {
    const before = this.heat();
    this.S.round++; this.save();
    const after = this.heat();
    if (after > before) { this.toast(`Heat rising: Lv${after} ${HEAT[after].name} ${HEAT[after].emoji}`); vibrate([40, 40, 80]); }
    this.updateHud();
  },

  /* ---------- decks ---------- */
  /* Lv1/Lv2 cards are bundled. Lv3 comes from Premium (pro, in memory only),
     or one free taste per game. Without access, Lv3 plays Lv2 cards. */
  vibeDraws: 0,
  draw(game, heat = this.heat()) {
    if (window.Ent) Ent.checkExpiry();
    const pro = !!(window.Ent && Ent.pro());
    if (heat >= 3 && !pro) {
      const g = window.GAME_OF ? GAME_OF(game) : game;
      if (window.Taste && Taste.pending === g && !Taste.used(g)) {
        const t = Taste.card(g);
        if (t && t.game === game) { Taste.pending = null; Taste.markUsed(g); window.Stats && Stats.heat(3); return t; }
      }
      window.Lock && Lock.onLockedDraw(g);
      heat = 2;
    }
    const vibe = this.vibeDraws < 6 && window.Vibe ? Vibe.regex() : null;
    for (let h = heat; h >= 1; h--) {
      const src = h === 3 ? ((window.Premium && Premium.cards) || []) : this.cards;
      const pool = src.filter((c) => c.game === game && c.heat === h && !c.taste);
      if (!pool.length) continue;
      const key = game + h;
      this.used[key] = this.used[key] || new Set();
      let fresh = pool.filter((c) => !this.used[key].has(c.text));
      if (!fresh.length) { this.used[key].clear(); fresh = pool; }
      if (vibe) { const m = fresh.filter((c) => vibe.test(c.text + ' ' + (c.optionalDare || ''))); if (m.length) fresh = m; this.vibeDraws++; }
      const c = rand(fresh);
      this.used[key].add(c.text);
      window.Stats && Stats.heat(c.heat);
      return c;
    }
    return { game, heat: 1, text: 'No cards found. Pull to refresh and try again.', optionalDare: 'Give a compliment.' };
  },

  /* ---------- scoring ---------- */
  /* Scores and layers are keyed by player name, so editing couples never shifts them onto someone else */
  score(i) { return this.S.scores[this.name(i)] || 0; },
  addPts(i, n) {
    const k = this.name(i); if (k === '?' || !n) return;
    this.S.scores[k] = (this.S.scores[k] || 0) + n; this.save(); this.updateHud();
    const chip = $(`.chip[data-i="${i}"]`);
    if (chip) {
      chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump');
      const f = document.createElement('span'); f.className = 'plus'; f.textContent = `+${n}`; chip.appendChild(f); setTimeout(() => f.remove(), 1000);
    }
  },
  layersLeft(i) { return this.S.layers[this.name(i)] ?? this.S.settings.layers; },
  removeLayer(i) { this.S.layers[this.name(i)] = Math.max(0, this.layersLeft(i) - 1); this.save(); this.updateHud(); },
  standings() {
    const rows = this.players().map((p, i) => ({ n: p.name, s: this.score(i) })).sort((a, b) => b.s - a.s);
    return this.ask('Scoreboard', 'Points taken tonight. Higher means more penalties.', [{ label: 'Close', value: 0, cls: 'ghost' }], `<ol class="standings">${rows.map((r) => `<li><span>${esc(r.n)}</span><b>${r.s}</b></li>`).join('')}</ol>`);
  },

  penaltyText(heat) {
    const m = this.S.settings.mode;
    if (m === 'drink') return `Take ${heat} sip${heat > 1 ? 's' : ''} 🍸`;
    if (m === 'water') return `${heat} sip${heat > 1 ? 's' : ''} of water 💧`;
    return `${HEAT[heat].dare} ${HEAT[heat].emoji}`;
  },

  /**
   * Penalty sheet. who: array of player indexes. extra: [{label, cls, fn}] extra choices.
   * Resolves with 'done' | 'pass' | extra label.
   */
  penalty({ who, card, heat = card?.heat || this.heat(), reason = '', extra = [] }) {
    who = [].concat(who).filter((i) => i >= 0);
    if (!who.length) return Promise.resolve('none');
    SFX.play('penalty'); vibrate(120);
    const names = who.map((i) => esc(this.name(i))).join(' & ');
    const dare = card?.optionalDare;
    const mode = this.S.settings.mode;
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          <div class="row" style="justify-content:space-between">
            <span class="heat-badge h${heat}b">Lv${heat} ${HEAT[heat].name} · ${heat} pt${heat > 1 ? 's' : ''}</span>
            ${reason ? `<span class="muted" style="font-size:13px">${esc(reason)}</span>` : ''}
          </div>
          <h2 style="margin-top:14px">${names}</h2>
          ${mode !== 'dare' ? `<div class="penalty-big">${this.penaltyText(heat)}</div>` : ''}
          ${dare ? `<div class="dare-box"><span class="lbl">${mode === 'dare' ? HEAT[heat].dare : 'Or swap it for the dare'}</span>${esc(dare)}</div>` : ''}
          <div class="col">
            ${extra.map((x, k) => `<button class="btn block ${x.cls || 'alt'}" data-x="${k}">${esc(x.label)}</button>`).join('')}
            <button class="btn block" data-a="done">Done ✓ <small style="opacity:.7">+${heat} pt${heat > 1 ? 's' : ''}</small></button>
            <button class="btn block ghost" data-a="pass">Pass — free, no questions</button>
          </div>
          ${mode === 'drink' ? '<p class="note center" style="margin:14px 0 0">Drink responsibly. Water counts. Nobody drives.</p>' : ''}
        </div>`;
      Core.root().appendChild(wrap);
      const close = (v) => { wrap.remove(); resolve(v); };
      wrap.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        SFX.play('tap');
        if (b.dataset.a === 'done') { who.forEach((i) => this.addPts(i, heat)); close('done'); }
        else if (b.dataset.a === 'pass') close('pass');
        else if (b.dataset.x != null) { const x = extra[+b.dataset.x]; who.forEach((i) => this.addPts(i, heat)); x.fn && x.fn(); close(x.label); }
      });
    });
  },

  /* Ask a question with buttons. opts: [{label, value, cls}] */
  ask(title, body, opts, html = '') {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = `<div class="modal"><h2>${title}</h2>${body ? `<p class="muted">${body}</p>` : ''}${html}<div class="col" style="margin-top:14px">
        ${opts.map((o, k) => `<button class="btn block ${o.cls || ''}" data-k="${k}">${esc(o.label)}</button>`).join('')}</div></div>`;
      Core.root().appendChild(wrap);
      wrap.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; SFX.play('tap'); wrap.remove(); resolve(opts[+b.dataset.k].value); });
    });
  },

  /* ---------- shared UI ---------- */
  hud(title) {
    return `<div class="hud">
      <div class="hud-top">
        <button class="icon-btn" data-nav="home" aria-label="Back to games">←</button>
        <div class="hud-title">${title}</div>
        <button class="icon-btn" data-act="mute" aria-label="Sound">${SFX.muted ? '🔇' : '🔊'}</button>
      </div>
      <div class="heat"><div class="heat-bar"><div class="heat-fill"></div></div><div class="heat-label"></div></div>
      <button class="scores" data-act="standings" aria-label="Open scoreboard"></button>
    </div>`;
  },
  updateHud() {
    const fill = $('.heat-fill'); if (!fill) return;
    const h = this.heat();
    fill.style.width = Math.min(100, this.heatProgress() * 100) + '%';
    $('.heat-label').innerHTML = `Lv${h} ${HEAT[h].name} ${HEAT[h].emoji}`;
    const showLayers = document.getElementById('app').dataset.theme === 'charades' && this.S.settings.strip;
    $('.scores').innerHTML = this.players().map((p, i) => `
      <div class="chip ${i === this.turnHighlight ? 'turn' : ''}" data-i="${i}">${esc(p.name)} <b>${this.score(i)}</b>
      ${showLayers ? `<span class="layers">${Array.from({ length: this.S.settings.layers }, (_, k) => `<i class="${k < this.layersLeft(i) ? '' : 'off'}"></i>`).join('')}</span>` : ''}</div>`).join('');
  },
  setTurn(i) { this.turnHighlight = i; this.updateHud(); },

  controls(passInfo = '') {
    return `<div class="controls">
      <button class="btn pause" data-act="pause" aria-label="Pause">⏸</button>
      <button class="btn pass" data-act="pass">Pass <small>${passInfo}</small></button>
      <button class="btn primary" data-act="primary" hidden></button>
    </div>`;
  },
  setPrimary(label, fn) {
    const b = $('.controls .primary'); if (!b) return;
    if (!label) { b.hidden = true; b.onclick = null; return; }
    b.hidden = false; b.innerHTML = label; b.onclick = () => { SFX.play('tap'); fn(); };
  },
  setPassInfo(t) { const s = $('.controls .pass small'); if (s) s.textContent = t; },
  onPass(fn) { this._pass = fn; },

  /* A card is "intimate" when passing it should be free */
  isFreePass(card) { return !card || card.heat >= 2 || ['bodypart', 'charades'].includes(card.game); },
  doPass(card, who = this.current()) {
    if (who < 0 || this.isFreePass(card)) this.toast('Passed — no questions asked');
    else { this.addPts(who, 1); this.toast(`${this.name(who)} passed (+1)`); }
  },

  toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; Core.root().appendChild(t); setTimeout(() => t.remove(), 2300); },

  async countdown(n = 3, sound = 'count') {
    const o = document.createElement('div'); o.className = 'countdown'; Core.root().appendChild(o);
    for (let i = n; i >= 1; i--) { o.innerHTML = `<span>${i}</span>`; SFX.play(sound); vibrate(30); await sleep(850); }
    o.remove(); SFX.play('go');
  },

  /* timer ring: el contains .timer > span */
  timer(el, secs, onEnd, tickSound = 'tick') {
    let left = secs, stopped = false;
    const ring = $('.timer', el) || el, label = $('span', ring);
    const draw = () => { ring.style.setProperty('--p', left / secs); label.textContent = Math.ceil(left); ring.classList.toggle('warn', left <= 10); ring.classList.toggle('final', left <= 5 && left > 0); };
    draw();
    const id = setInterval(() => {
      if (stopped || this.paused) return;
      left -= 0.1;
      if (Math.abs(left - Math.round(left)) < 0.05 && left <= 10 && left > 0) SFX.play(tickSound);
      if (left <= 0) { left = 0; draw(); clearInterval(id); this._timers.delete(h); if (!stopped) onEnd && onEnd(); return; }
      draw();
    }, 100);
    const h = { stop() { stopped = true; clearInterval(id); } };
    this._timers.add(h);
    return h;
  },
  stopTimers() { this._timers.forEach((t) => t.stop()); this._timers.clear(); },

  holdReveal(el, onReveal) {
    let first = true;
    const on = (e) => { e.preventDefault(); el.classList.add('on'); vibrate(15); if (first) { first = false; onReveal && onReveal(); } };
    const off = () => el.classList.remove('on');
    el.addEventListener('pointerdown', on);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, off));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  /* Pass-the-phone screen: resolves when the right person taps */
  handoff(name, sub = 'Eyes only. Everyone else look away.') {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.style.placeItems = 'center';
      wrap.style.background = 'var(--bg, #000)';
      wrap.innerHTML = `<div class="handoff"><div class="muted">Pass the phone to</div><div class="who">${esc(name)}</div><p class="muted">${sub}</p>
        <button class="btn" style="margin-top:18px">I'm ${esc(name)} 👀</button></div>`;
      // inherit theme vars
      document.getElementById('app').appendChild(wrap);
      $('button', wrap).onclick = () => { SFX.play('tap'); wrap.remove(); resolve(); };
    });
  },

  /* ---------- pause & wake lock ---------- */
  pause() {
    this.paused = true;
    const p = $('#pause'); p.hidden = false;
    $('#pzTime').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.title = 'Notes';
  },
  resume() { this.paused = false; $('#pause').hidden = true; document.title = 'Heat Check'; },
  async wake(on) {
    try {
      if (on && 'wakeLock' in navigator) { this._wake = await navigator.wakeLock.request('screen'); }
      else if (!on && this._wake) { await this._wake.release(); this._wake = null; }
    } catch (e) {}
  },
};

/* Re-acquire wake lock when returning to the tab */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Core._wantWake) Core.wake(true);
});

/* Resume from the neutral page: press and hold, or double-tap the title bar */
(() => {
  let t;
  const btn = document.getElementById('pzResume');
  const start = () => { t = setTimeout(() => Core.resume(), 700); };
  const cancel = () => clearTimeout(t);
  btn.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => btn.addEventListener(e, cancel));
  document.querySelector('.pz-bar').addEventListener('dblclick', () => Core.resume());
})();
