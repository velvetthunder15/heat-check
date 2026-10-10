/* Heat Check: core. State, heat, decks and tier limits, penalties, Chicken Out, shared UI */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

const HEAT = {
  1: { name: 'Flirty', emoji: '😏' },
  2: { name: 'Spicy', emoji: '🌶️' },
  3: { name: 'Hot', emoji: '🔥' },
};
const pts = (h) => HC.PENALTY_PTS[h] || h;
const ptsWord = (n) => `${n} pt${n === 1 ? '' : 's'}`;
// "Hot · 3 pts penalty": on every card, the heat chip and the heat selector
const ptsLabel = (h) => `${HEAT[h].name} · ${ptsWord(pts(h))} penalty`;

// Dares-only mode: every Spicy/Hot couples card carries its own dare (the build checks).
// These cover the odd Flirty card without one. Never "truth or compliment": dares mode is dares only.
const FLIRTY_DARES = [
  'Give your partner a 10-second hug and don’t let go early.',
  'Hold your partner’s hand for the next two cards.',
  'Kiss your partner’s hand like royalty.',
  'Trace a heart on your partner’s palm with one finger.',
  'Give your partner a 20-second shoulder rub.',
  'Slow dance with your partner for 15 seconds, no music.',
];

const Core = {
  cards: [],          // bundled Flirty deck (Lv1 only)
  used: {},
  recent: {},         // game -> last texts shown (sent as exclude when refilling Hot)
  S: null,
  _timers: new Set(),
  _wake: null,
  _skip: null,
  cardHeat: 0,        // heat of the card on screen
  root() { return document.getElementById('app'); },

  game: null, // id of the game on screen
  defaults() {
    return {
      side: 'couples',
      couples: [{ a: '', b: '' }],
      group: { players: ['', '', ''], mode: 'drink' },
      settings: { mode: 'drink', autoRamp: true, cardsPerRamp: HC.RAMP_DEFAULT, layers: 5, timer: HC.TIMER_DEFAULT, hollywood: true, bollywood: true },
      heat: 1, rampCount: 0,
      scores: {}, layers: {}, named: {}, chicken: {}, round: 0, turn: 0,
      night: this.freshNight(),
    };
  },
  freshNight() { return { started: 0, cards: {}, games: [], topHeat: 0, limitHit: false }; },
  load() {
    const d = this.defaults();
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('hc_state') || '{}') || {}; } catch (e) {}
    // Retired state from older builds (banked points, covers, pause) is simply never read
    for (const k of ['bank', 'banked', 'covers', 'stored', 'paused']) delete saved[k];
    this.S = Object.assign(d, saved);
    const st = saved.settings || {};
    // Only known settings survive; anything retired from older builds is dropped here
    this.S.settings = {
      mode: ['drink', 'water', 'dare'].includes(st.mode) ? st.mode : 'drink',
      autoRamp: st.autoRamp !== false,
      cardsPerRamp: Math.min(HC.RAMP_MAX, Math.max(HC.RAMP_MIN, Math.round(+st.cardsPerRamp || HC.RAMP_DEFAULT))),
      layers: [3, 4, 5, 6].includes(+st.layers) ? +st.layers : 5,
      timer: HC.TIMER_OPTIONS.includes(+st.timer) ? +st.timer : HC.TIMER_DEFAULT,
      hollywood: st.hollywood !== false,
      bollywood: st.bollywood !== false,
    };
    if (!this.S.settings.hollywood && !this.S.settings.bollywood) this.S.settings.hollywood = this.S.settings.bollywood = true;
    this.S.side = this.S.side === 'group' ? 'group' : 'couples';
    const g = saved.group || {};
    this.S.group = { players: Array.isArray(g.players) ? g.players.map((n) => String(n || '').slice(0, 14)).slice(0, HC.GROUP_MAX) : ['', '', ''], mode: g.mode === 'water' ? 'water' : 'drink' };
    while (this.S.group.players.length < HC.GROUP_MIN) this.S.group.players.push('');
    this.S.named = this.S.named && typeof this.S.named === 'object' ? this.S.named : {};
    this.S.chicken = this.S.chicken && typeof this.S.chicken === 'object' ? this.S.chicken : {};
    const n = saved.night && typeof saved.night === 'object' ? saved.night : {};
    this.S.night = { ...this.freshNight(), ...n, cards: n.cards && typeof n.cards === 'object' ? n.cards : {}, games: Array.isArray(n.games) ? n.games : [] };
    // Every session starts at Flirty with a fresh ramp
    let fresh = true;
    try { fresh = !sessionStorage.getItem('hc_session'); sessionStorage.setItem('hc_session', '1'); } catch (e) {}
    if (fresh) { this.S.heat = 1; this.S.rampCount = 0; }
    this.S.heat = [1, 2, 3].includes(+this.S.heat) ? +this.S.heat : 1;
    this.S.rampCount = Math.max(0, +this.S.rampCount || 0);
    this.save();
  },
  isGroup() { return this.S.side === 'group'; },
  save() { try { localStorage.setItem('hc_state', JSON.stringify(this.S)); } catch (e) {} },

  async loadCards() {
    const r = await fetch('cards.json', { cache: 'no-cache' }).catch(() => fetch('cards.json'));
    this.cards = await r.json();
  },

  /* ---------- settings: timer and Hollywood / Bollywood ---------- */
  timerSecs() { return this.S.settings.timer || HC.TIMER_DEFAULT; },
  origins() { const st = this.S.settings; return HC.ORIGINS.filter((o) => (o === 'Hollywood' ? st.hollywood : st.bollywood)); },
  // Only cards tagged Hollywood or Bollywood are filtered. Untagged and Global cards always play.
  originOk(c) { const o = c.origin || (c.extra && c.extra.origin); return !o || !HC.ORIGINS.includes(o) || this.origins().includes(o); },
  setOrigin(key, on) {
    const st = this.S.settings, other = key === 'hollywood' ? 'bollywood' : 'hollywood';
    if (!on && !st[other]) return false;   // at least one stays on
    st[key] = !!on;
    this.used = {}; this.recent = {};        // rebuild the decks right away
    this.save();
    window.Bus && Bus.emit('deck');
    return true;
  },

  /* ---------- players ---------- */
  /* Guest, Base and Lite: up to 4 people (2 couples, or 4 in a group). Premium: unlimited. */
  activeCouples() { return window.Ent && Ent.unlimitedPlayers() ? this.S.couples : this.S.couples.slice(0, HC.FREE_PLAYERS / 2); },
  players() {
    if (this.isGroup()) {
      const cap = window.Ent && Ent.unlimitedPlayers() ? HC.GROUP_MAX : HC.FREE_PLAYERS;
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
  currentCouple() {
    const cs = this.couples();
    if (!cs.length) return [0, 1 % Math.max(1, this.players().length)];
    const pair = this.couplePlayers(cs[this.S.turn % cs.length]);
    return Math.floor(this.S.turn / cs.length) % 2 ? [pair[1], pair[0]] : pair;
  },
  nextTurn() { this.S.turn++; this.save(); this.updateChicken(); },

  /* ---------- heat ----------
     S.heat is the level the ring set or auto-ramp reached. It never plays above what this
     tier allows: guest/Base = Flirty, Lite = Hot while this game has Hot cards left, Premium = Hot.
     A free Hot card (taste) makes exactly one card Hot. */
  tier() { return window.Ent ? Ent.tier() : 'guest'; },
  levelCap(game = this.game) {
    const t = this.tier();
    if (t === 'premium') return 3;
    if (t === 'lite') return game && window.Limits && Limits.hotLeft(game) === 0 ? 2 : 3;
    return 1;
  },
  heatCap() { return this.levelCap(); },
  heat() {
    if (window.Taste && Taste.showing && Taste.showing === this.game) return 3;
    return Math.max(1, Math.min(this.S.heat || 1, this.heatCap()));
  },
  heatProgress() {
    const st = this.S.settings, h = this.heat();
    if (!st.autoRamp || h >= this.heatCap()) return h / 3;
    return (h - 1 + Math.min(1, this.S.rampCount / st.cardsPerRamp)) / 3 + 0.02;
  },
  // Manual change (hold ring or heat sheet): clamps to what's allowed and resets the ramp counter
  setHeat(level) {
    this.S.heat = Math.max(1, Math.min(+level || 1, this.heatCap()));
    this.S.rampCount = 0;
    this.save(); this.updateHud();
    window.Bus && Bus.emit('heat');
    return this.S.heat;
  },
  resetHeat() { this.S.heat = 1; this.S.rampCount = 0; this.save(); this.updateHud(); window.Bus && Bus.emit('heat'); },
  // Auto-ramp: every N cards heat climbs one level, up to the highest allowed. Never nags.
  nextRound() {
    this.S.round++;
    const st = this.S.settings;
    if (st.autoRamp) {
      this.S.rampCount++;
      if (this.S.rampCount >= st.cardsPerRamp) {
        this.S.rampCount = 0;
        const cap = this.heatCap(), cur = Math.min(this.S.heat, cap);
        if (cur < cap) {
          this.S.heat = cur + 1;
          this.toast(`Heating up: ${HEAT[cur + 1].name}`);
          vibrate([40, 40, 80]);
          this._rampFx = true;
          window.Bus && Bus.emit('heat');
        }
      }
    }
    this.save();
    this.updateHud();
    this.updateChicken();
  },

  /* ---------- decks ----------
     Flirty is bundled. Spicy and Hot only ever come from the server: Lite/Premium read them
     (RLS), Lite's 3 Hot cards per game and the free Hot card come one at a time from the API.
     next() resolves with a card, or null when this tier's limit is reached (the lock sheet
     is showing then). It's only called when the next card is asked for, never mid-card. */
  async next(game, again) {
    if (window.Ent) Ent.checkExpiry();
    if (window.Taste) {
      if (Taste.showing) Taste.finish();                    // the free Hot card was the last one
      const t = Taste.take(game);
      if (t) { Taste.showing = game; return this.show(t); }
    }
    let want = Math.min(this.S.heat, this.levelCap(game));
    if (this.S.heat === 3 && want < 3 && this.tier() === 'lite' && window.Cards) Cards.usedUp(game);   // says so once per game
    if (want === 3) {
      const c = window.Cards ? await Cards.hot(game) : null;
      if (!document.getElementById('stage') || this.game !== game) throw new Error('left-game');
      if (c) return this.show(c);
      want = 2;
    }
    if (want === 2) { const c = this.pick(game, 2); if (c) return this.show(c); }
    const left = window.Limits ? Limits.flirtyLeft(game) : null;   // null = unlimited
    if (left !== null && left <= 0) { this.S.night.limitHit = true; this.save(); window.UI && UI.limitReached(game, again); return null; }
    const c = this.pick(game, 1) || { game, heat: 1, text: 'No cards loaded. Close and reopen the app.' };
    if (left !== null) Limits.countFlirty(game);
    return this.show(c);
  },
  pick(game, h) {
    const src = h === 1 ? this.cards : ((window.Premium && Premium.cards) || []);
    const pool = src.filter((c) => c.game === game && c.heat === h && this.originOk(c));
    if (!pool.length) return null;
    const key = game + h;
    this.used[key] = this.used[key] || new Set();
    let fresh = pool.filter((c) => !this.used[key].has(c.text));
    if (!fresh.length) { this.used[key].clear(); fresh = pool; }
    const c = rand(fresh);
    this.used[key].add(c.text);
    return c;
  },
  show(c) {
    this.cardHeat = c.heat;
    const r = (this.recent[c.game] = this.recent[c.game] || []);
    r.push(c.text); if (r.length > 40) r.shift();
    const n = this.S.night;
    if (!n.started) n.started = Date.now();
    n.cards[c.game] = (n.cards[c.game] || 0) + 1;
    if (!n.games.includes(c.game)) n.games.push(c.game);
    n.topHeat = Math.max(n.topHeat || 0, c.heat);
    this.save();
    window.Stats && Stats.heat(c.heat);
    this.updateHud();
    return c;
  },
  // A small chip on every card: "Spicy · 2 pts penalty"
  ptsTag(h = this.cardHeat || this.heat()) { return `<span class="pts-tag h${h}" data-h="${h}">${esc(ptsLabel(h))}</span>`; },

  /* ---------- scoring: penalty points taken tonight, per player ---------- */
  /* Points are a tally of penalties already taken. Nothing is stored up, banked or reduced. */
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
    return this.ask('Scoreboard', 'Penalty points taken tonight.', [{ label: 'Close', value: 0, cls: 'ghost' }], `<ol class="standings">${rows.map((r) => `<li><span>${esc(r.n)}${named(r.n)}</span><b>${r.s} <small>pts</small></b></li>`).join('')}</ol>`);
  },

  /* ---------- Chicken Out: skip a card, no penalty, once per player per round ----------
     A round is one lap of turns around the table. */
  lap() { return Math.floor(this.S.round / Math.max(1, this.players().length)); },
  chickenLeft(i) {
    const k = this.name(i); if (k === '?') return 0;
    const c = this.S.chicken[k];
    return c && c.lap === this.lap() ? Math.max(0, HC.CHICKEN_PER_ROUND - c.n) : HC.CHICKEN_PER_ROUND;
  },
  useChicken(i) {
    const k = this.name(i); if (k === '?' || this.chickenLeft(i) <= 0) return false;
    const c = this.S.chicken[k], lap = this.lap();
    this.S.chicken[k] = { lap, n: c && c.lap === lap ? c.n + 1 : 1 };
    this.save(); this.updateChicken();
    return true;
  },
  chickenIcon: '<span class="ck-ico" aria-hidden="true">🐔</span>',

  /* Groups only use sips or water. Couples can also play dares only. */
  penMode() { return this.isGroup() ? this.S.group.mode : this.S.settings.mode; },
  penaltyText(heat) {
    const n = pts(heat), m = this.penMode();
    if (m === 'drink') return `Take ${n} sip${n > 1 ? 's' : ''} 🍸`;
    if (m === 'water') return `${n} sip${n > 1 ? 's' : ''} of water 💧`;
    return '';
  },
  dareFor(card) { return (card && card.optionalDare) || rand(FLIRTY_DARES); },

  /**
   * Penalty sheet. who: player index or indexes. Points = heat (1/2/3), added when it's done.
   * Each player can Chicken Out of it once per round: no points, no penalty.
   * DARES mode shows only the dare. DRINKS and WATER show sips, with the dare as an optional swap.
   */
  penalty({ who, card, heat = card?.heat || this.heat(), reason = '' }) {
    who = [].concat(who).filter((i) => i >= 0);
    if (!who.length) return Promise.resolve('none');
    SFX.play('penalty'); vibrate(120);
    const mode = this.penMode(), n = pts(heat);
    const dare = mode === 'dare' ? this.dareFor(card) : (card && card.optionalDare) || '';
    const single = who.length === 1;
    const chickens = who.filter((i) => this.chickenLeft(i) > 0);
    return new Promise((resolve) => {
      const out = new Set();   // players who chickened out of this one
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          <div class="row" style="justify-content:space-between">
            <span class="heat-badge h${heat}b">${esc(ptsLabel(heat))}</span>
            ${reason ? `<span class="muted" style="font-size:13px">${esc(reason)}</span>` : ''}
          </div>
          <h2 style="margin-top:14px">${who.map((i) => esc(this.name(i))).join(' &amp; ')}</h2>
          ${mode !== 'dare' ? `<div class="penalty-big">${this.penaltyText(heat)}</div>` : ''}
          ${dare ? `<div class="dare-box"><span class="lbl">${mode === 'dare' ? 'Your dare' : 'Or swap it for the dare'}</span>${esc(dare)}</div>` : ''}
          ${!single && chickens.length ? `<div class="ck-row"><span class="note">Chicken Out (once a round):</span>${chickens.map((i) => `<button class="chip ck-chip" data-ck="${i}">${this.chickenIcon} ${esc(this.name(i))}</button>`).join('')}</div>` : ''}
          <div class="col">
            <button class="btn block" data-a="done">Done ✓ <small style="opacity:.7">+${ptsWord(n)}${single ? '' : ' each'}</small></button>
            ${single ? `<button class="btn block ghost chicken" data-a="chicken" ${chickens.length ? '' : 'disabled'}>${this.chickenIcon} Chicken Out <small>${chickens.length ? 'no penalty' : 'used this round'}</small></button>` : ''}
          </div>
          ${mode === 'drink' ? '<p class="note center" style="margin:14px 0 0">Drink responsibly. Water counts. Nobody drives.</p>' : ''}
        </div>`;
      Core.root().appendChild(wrap);
      const close = (v) => { wrap.remove(); resolve(v); };
      wrap.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b || b.disabled) return;
        SFX.play('tap');
        if (b.dataset.ck != null) { const i = +b.dataset.ck; out.has(i) ? out.delete(i) : out.add(i); b.classList.toggle('on', out.has(i)); return; }
        if (b.dataset.a === 'chicken') { this.useChicken(who[0]); this.toast(`${this.name(who[0])} chickened out 🐔`); close('chicken'); return; }
        if (b.dataset.a === 'done') {
          who.forEach((i) => { if (out.has(i)) this.useChicken(i); else this.addPts(i, n); });
          close(out.size === who.length ? 'chicken' : 'done');
        }
      });
    });
  },

  /* Ask a question with buttons. opts: [{label, value, cls}] */
  ask(title, body, opts, html = '') {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = `<div class="modal"><h2>${title}</h2>${body ? `<p class="muted">${body}</p>` : ''}${html}<div class="col" style="margin-top:14px">
        ${opts.map((o, k) => `<button class="btn block ${o.cls || ''}" data-k="${k}" ${o.disabled ? 'disabled' : ''}>${o.html || esc(o.label)}</button>`).join('')}</div></div>`;
      Core.root().appendChild(wrap);
      wrap.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.disabled || b.dataset.k == null) return; SFX.play('tap'); wrap.remove(); resolve(opts[+b.dataset.k].value); });
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
      <div class="heat"><div class="heat-bar"><div class="heat-fill"></div></div><div class="heat-label"><button class="hchip" data-act="heatsheet" aria-label="Change heat"><i class="mring"></i><span class="hchip-t"></span></button></div></div>
      <p class="limit-line" aria-live="polite"></p>
      <button class="scores" data-act="standings" aria-label="Open scoreboard"></button>
    </div>`;
  },
  updateHud() {
    const fill = $('.heat-fill'); if (!fill) return;
    const h = this.heat();
    fill.style.width = Math.min(100, this.heatProgress() * 100) + '%';
    // Heat chip: the card on screen's heat and its penalty points
    const chip = $('.hchip'), shown = this.cardHeat || h;
    if (chip) {
      if (chip.dataset.h !== String(shown)) { chip.dataset.h = shown; $('.hchip-t', chip).textContent = ptsLabel(shown); }
      if (this._rampFx) { this._rampFx = false; chip.classList.remove('ramp'); void chip.offsetWidth; chip.classList.add('ramp'); }
    }
    // Limit counters: quiet line above the card. Hidden for Premium.
    const ll = $('.limit-line');
    if (ll) { const t = window.Limits && this.game ? Limits.line(this.game) : ''; if (ll.textContent !== t) ll.textContent = t; ll.hidden = !t; }
    const app = document.getElementById('app');
    app.dataset.heat = h;
    const showLayers = app.dataset.theme === 'charades';
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
  setTurn(i) { this.turnHighlight = i; this.updateHud(); this.updateChicken(); },

  controls() {
    return `<div class="controls">
      <button class="btn pass chicken" data-act="chicken">${this.chickenIcon} Chicken Out <small></small></button>
      <button class="btn primary" data-act="primary" hidden></button>
    </div>`;
  },
  setPrimary(label, fn) {
    const b = $('.controls .primary'); if (!b) return;
    if (!label) { b.hidden = true; b.onclick = null; return; }
    b.hidden = false; b.innerHTML = label; b.onclick = () => { SFX.play('tap'); fn(); };
  },
  updateChicken() {
    const s = $('.controls .chicken small'); if (!s) return;
    const i = this.turnHighlight;
    s.textContent = i >= 0 && i != null ? (this.chickenLeft(i) ? `${this.name(i)}: 1 left` : `${this.name(i)}: used`) : 'no penalty';
  },
  onSkip(fn) { this._skip = fn; },
  // Control-bar Chicken Out: the player whose turn it is, or ask who when the whole table plays
  async chickenOut() {
    if (!this._skip) return;
    let i = this.turnHighlight;
    if (i == null || i < 0) {
      const ps = this.players();
      i = await this.ask(`Who’s chickening out? ${this.chickenIcon}`, 'Skips this card. No penalty. Once per player per round.',
        [...ps.map((p, k) => ({ label: `${p.name}${this.chickenLeft(k) ? '' : ' (used)'}`, value: k, disabled: !this.chickenLeft(k) })), { label: 'Never mind', value: -1, cls: 'ghost' }]);
      if (i < 0) return;
    }
    if (!this.useChicken(i)) return this.toast(`${this.name(i)} already chickened out this round`);
    this.stopTimers(); $$('.modal-wrap').forEach((m) => m.remove());
    this.toast(`${this.name(i)} chickened out 🐔`);
    this._skip();
  },

  toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; Core.root().appendChild(t); setTimeout(() => t.remove(), 2300); },

  async countdown(n = 3, sound = 'count') {
    const o = document.createElement('div'); o.className = 'countdown'; Core.root().appendChild(o);
    for (let i = n; i >= 1; i--) { o.innerHTML = `<span>${i}</span>`; SFX.play(sound); vibrate(30); await sleep(850); }
    o.remove(); SFX.play('go');
  },

  /* Timer ring: el contains .timer > span. secs defaults to the Timer setting. */
  timer(el, secs = this.timerSecs(), onEnd, tickSound = 'tick') {
    let left = secs, stopped = false;
    const ring = $('.timer', el) || el, label = $('span', ring);
    const warnAt = Math.min(10, Math.ceil(secs / 3));
    const draw = () => { ring.style.setProperty('--p', left / secs); label.textContent = Math.ceil(left); ring.classList.toggle('warn', left <= warnAt); ring.classList.toggle('final', left <= 5 && left > 0); };
    draw();
    const id = setInterval(() => {
      if (stopped) return;
      left -= 0.1;
      if (Math.abs(left - Math.round(left)) < 0.05 && left <= warnAt && left > 0) SFX.play(tickSound);
      if (left <= 0) { left = 0; draw(); clearInterval(id); this._timers.delete(h); if (!stopped) onEnd && onEnd(); return; }
      draw();
    }, 100);
    const h = { stop() { stopped = true; clearInterval(id); } };
    this._timers.add(h);
    return h;
  },
  timerRing(secs = this.timerSecs(), extra = '') { return `<div class="timer" ${extra} style="--p:1"><span>${secs}</span></div>`; },
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
      wrap.innerHTML = `<div class="handoff"><div class="muted">Hand the phone to</div><div class="who">${esc(name)}</div><p class="muted">${sub}</p>
        <button class="btn" style="margin-top:18px">I'm ${esc(name)} 👀</button></div>`;
      document.getElementById('app').appendChild(wrap);
      $('button', wrap).onclick = () => { SFX.play('tap'); wrap.remove(); resolve(); };
    });
  },

  /* ---------- wake lock ---------- */
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
