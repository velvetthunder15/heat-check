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

  game: null, // id of the game on screen
  defaults() {
    return {
      side: 'couples',
      couples: [{ a: '', b: '' }],
      group: { players: ['', '', ''], mode: 'drink' },
      settings: { mode: 'drink', autoRamp: true, cardsPerRamp: HC.RAMP_DEFAULT, layers: 5 },
      heat: 1, rampCount: 0,
      scores: {}, layers: {}, named: {}, round: 0, turn: 0,
    };
  },
  load() {
    const d = this.defaults();
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('hc_state') || '{}') || {}; } catch (e) {}
    this.S = Object.assign(d, saved);
    const st = saved.settings || {};
    // Only known settings survive; anything retired from older builds is dropped here
    this.S.settings = {
      mode: ['drink', 'water', 'dare'].includes(st.mode) ? st.mode : 'drink',
      autoRamp: st.autoRamp !== false,
      cardsPerRamp: Math.min(HC.RAMP_MAX, Math.max(HC.RAMP_MIN, Math.round(+st.cardsPerRamp || HC.RAMP_DEFAULT))),
      layers: [3, 4, 5, 6].includes(+st.layers) ? +st.layers : 5,
    };
    this.S.side = this.S.side === 'group' ? 'group' : 'couples';
    const g = saved.group || {};
    this.S.group = { players: Array.isArray(g.players) ? g.players.map((n) => String(n || '').slice(0, 14)).slice(0, HC.GROUP_MAX) : ['', '', ''], mode: g.mode === 'water' ? 'water' : 'drink' };
    while (this.S.group.players.length < HC.GROUP_MIN) this.S.group.players.push('');
    this.S.named = this.S.named && typeof this.S.named === 'object' ? this.S.named : {};
    // Every session starts at Lv1 with a fresh ramp
    let fresh = true;
    try { fresh = !sessionStorage.getItem('hc_session'); sessionStorage.setItem('hc_session', '1'); } catch (e) {}
    if (fresh) { this.S.heat = 1; this.S.rampCount = 0; }
    this.S.heat = [1, 2, 3].includes(+this.S.heat) ? +this.S.heat : 1;
    this.S.rampCount = Math.max(0, +this.S.rampCount || 0);
    this.save();
  },
  isGroup() { return this.S.side === 'group'; },
  save() { localStorage.setItem('hc_state', JSON.stringify(this.S)); },

  async loadCards() {
    const r = await fetch('cards.json', { cache: 'no-cache' }).catch(() => fetch('cards.json'));
    this.cards = await r.json();
  },

  /* ---------- players ---------- */
  /* Free play is up to 4 people (2 couples, or 4 in a group). Pro: unlimited. */
  activeCouples() { return window.Ent && Ent.unlimitedPlayers() ? this.S.couples : this.S.couples.slice(0, HC.FREE_PLAYERS / 2); },
  players() {
    if (this.isGroup()) {
      const cap = window.Ent && Ent.unlimitedPlayers() ? HC.GROUP_MAX : HC.FREE_PLAYERS;
      // No pairing in groups: everyone gets their own slot
      return this.S.group.players.map((n) => String(n).trim()).filter(Boolean).slice(0, cap).map((name, i) => ({ name, couple: 1000 + i }));
    }
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

  /* ---------- heat ----------
     S.heat is the level the group chose (hold ring) or auto-ramp reached.
     It can never sit above the highest level this account may play:
     Lv3 needs Pro. A free Hot card (Taste) makes exactly one card Lv3. */
  heatCap() { return window.Ent && Ent.pro() ? 3 : 2; },
  heat() {
    if (window.Taste && Taste.showing && Taste.showing === this.game) return 3;
    return Math.max(1, Math.min(this.S.heat || 1, this.heatCap()));
  },
  heatProgress() {
    const st = this.S.settings, h = this.heat();
    if (!st.autoRamp || h >= this.heatCap()) return h / 3;
    return (h - 1 + Math.min(1, this.S.rampCount / st.cardsPerRamp)) / 3 + 0.02;
  },
  // Manual change (hold ring): clamps to what's allowed and resets the ramp counter
  setHeat(level) {
    this.S.heat = Math.max(1, Math.min(+level || 1, this.heatCap()));
    this.S.rampCount = 0;
    this.save(); this.updateHud();
    window.Bus && Bus.emit('heat');
    return this.S.heat;
  },
  resetHeat() { this.S.heat = 1; this.S.rampCount = 0; this.save(); this.updateHud(); window.Bus && Bus.emit('heat'); },
  nextRound() {
    this.S.round++;
    const st = this.S.settings;
    if (st.autoRamp) {
      this.S.rampCount++;
      if (this.S.rampCount >= st.cardsPerRamp) {
        this.S.rampCount = 0;
        const cur = Math.min(this.S.heat, this.heatCap());
        if (cur < this.heatCap()) {
          this.S.heat = cur + 1;
          this.toast(`Heating up: ${HEAT[cur + 1].name}`);
          vibrate([40, 40, 80]);
          this._rampFx = true;
          window.Bus && Bus.emit('heat');
        } else if (cur === 2) window.Lock && Lock.rampLocked(this.game);
      }
    }
    this.save();
    this.updateHud();
  },

  /* ---------- decks ----------
     Lv1/Lv2 cards are bundled. Lv3 only ever comes from the server: Premium (Pro,
     in memory) or one Taste card from /api/taste. Nothing hot is in the bundle. */
  draw(game) {
    if (window.Ent) Ent.checkExpiry();
    if (window.Taste) {
      if (Taste.showing) Taste.finish();               // the free Hot card was the last one: back to Spicy
      const t = Taste.take(game);
      if (t) { Taste.showing = game; this.updateHud(); window.Stats && Stats.heat(3); return t; }
    }
    const heat = this.heat();
    for (let h = heat; h >= 1; h--) {
      const src = h === 3 ? ((window.Premium && Premium.cards) || []) : this.cards;
      const pool = src.filter((c) => c.game === game && c.heat === h);
      if (!pool.length) continue;
      const key = game + h;
      this.used[key] = this.used[key] || new Set();
      let fresh = pool.filter((c) => !this.used[key].has(c.text));
      if (!fresh.length) { this.used[key].clear(); fresh = pool; }
      const c = rand(fresh);
      this.used[key].add(c.text);
      window.Stats && Stats.heat(c.heat);
      return c;
    }
    return { game, heat: 1, text: 'No cards loaded. Close and reopen the app.' };
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
    const named = this.isGroup() ? (n) => (this.S.named[n] ? ` <small class="muted">· named ${this.S.named[n]}×</small>` : '') : () => '';
    return this.ask('Scoreboard', 'Points taken tonight. Higher means more penalties.', [{ label: 'Close', value: 0, cls: 'ghost' }], `<ol class="standings">${rows.map((r) => `<li><span>${esc(r.n)}${named(r.n)}</span><b>${r.s}</b></li>`).join('')}</ol>`);
  },

  /* Groups only use sips or water. Couples can also play dares-only. */
  penMode() { return this.isGroup() ? this.S.group.mode : this.S.settings.mode; },
  penaltyText(heat) {
    const m = this.penMode();
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
    const mode = this.penMode();
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
      <div class="heat"><div class="heat-bar"><div class="heat-fill"></div></div><div class="heat-label"><span class="hchip"><i class="mring"></i><span class="hchip-t"></span></span></div></div>
      <button class="scores" data-act="standings" aria-label="Open scoreboard"></button>
    </div>`;
  },
  updateHud() {
    const fill = $('.heat-fill'); if (!fill) return;
    const h = this.heat();
    fill.style.width = Math.min(100, this.heatProgress() * 100) + '%';
    // Heat chip: a mini ring in the level's colour; pulses when auto-ramp raises the level
    const chip = $('.hchip');
    if (chip) {
      if (chip.dataset.h !== String(h)) { chip.dataset.h = h; $('.hchip-t', chip).textContent = `Lv${h} ${HEAT[h].name}`; }
      if (this._rampFx) { this._rampFx = false; chip.classList.remove('ramp'); void chip.offsetWidth; chip.classList.add('ramp'); }
    }
    const app = document.getElementById('app');
    app.dataset.heat = h;
    const showLayers = app.dataset.theme === 'charades';
    // Stable chips: update in place unless the roster changed, so their animations never restart
    const sc = $('.scores'), ps = this.players();
    const key = ps.map((p) => p.name).join('|') + (showLayers ? '#L' + this.S.settings.layers : '');
    if (sc.dataset.key !== key) {
      sc.dataset.key = key;
      sc.innerHTML = ps.map((p, i) => `<div class="chip" data-i="${i}">${esc(p.name)} <b>${this.score(i)}</b>${showLayers ? `<span class="layers">${Array.from({ length: this.S.settings.layers }, () => '<i></i>').join('')}</span>` : ''}</div>`).join('');
    }
    $$('.chip', sc).forEach((c) => {
      const i = +c.dataset.i, b = $('b', c), v = String(this.score(i));
      if (b.textContent !== v) b.textContent = v;
      c.classList.toggle('turn', i === this.turnHighlight);
      if (showLayers) $$('.layers i', c).forEach((x, k) => x.classList.toggle('off', k >= this.layersLeft(i)));
    });
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
  isFreePass(card) { return !card || card.heat >= 2 || card.game === 'charades'; },
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
