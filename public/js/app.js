/* Heat Check: app shell: gates, home, setup, routing */
const GAME_ORDER = ['redflag', 'nhie', 'bodypart', 'charades', 'wyr', 'mostlikely', 'hotseat', 'twotruths', 'swap'];
const TILE_EXTRA = { redflag: '<span class="onair">ON AIR</span>' };

const App = {
  pendingGame: null,
  async init() {
    Core.load();
    try { await Core.loadCards(); } catch (e) { console.error(e); }
    this.bind();
    if (localStorage.getItem('hc_age') !== 'yes') this.ageGate();
    else this.home();
  },

  root() { return document.getElementById('app'); },
  set(theme, html) {
    Core.stopTimers(); Core._wantWake = false; Core.wake(false);
    $$('.modal-wrap, .countdown').forEach((m) => m.remove());
    const r = this.root(); r.dataset.theme = theme; r.innerHTML = html; window.scrollTo(0, 0);
  },

  /* ---------- gates ---------- */
  ageGate() {
    this.set('home', `<div class="gate">
      <div class="flame">🔥</div><div class="logo">Heat<br>Check</div>
      <p>Flirty party games for couples and groups of couples.<br><b>Adults only.</b></p>
      <button class="btn block" id="y18">I'm 18 or older</button>
      <button class="btn block ghost" id="n18">I'm under 18</button>
      <p class="note">By continuing you confirm you're of legal age where you live, and of legal drinking age if you play drinking mode.</p>
    </div>`);
    $('#y18').onclick = () => { SFX.unlock(); SFX.play('tap'); localStorage.setItem('hc_age', 'yes'); this.home(); };
    $('#n18').onclick = () => { this.set('home', `<div class="gate"><div class="logo" style="font-size:40px">Come back later</div><p>This one's for grown-ups. See you in a few years.</p></div>`); };
  },
  /* Shown once per session, before the first game */
  consent(next) {
    this.set('home', `<div class="gate">
      <div class="flame">🤝</div>
      <div class="consent-quote">“Anyone can skip or stop at any time, no questions asked.”</div>
      <p>Every card has a free Pass. ⏸ Pause swaps to a boring page instantly. Check in with each other, keep it clothed when a card says so, and only play with people who are all in.</p>
      <button class="btn block" id="agree">We're all in</button>
    </div>`);
    $('#agree').onclick = () => {
      SFX.unlock(); SFX.play('reveal');
      try { sessionStorage.setItem('hc_consent', '1'); } catch (e) {}
      next ? next() : this.home();
    };
  },

  /* ---------- home (intro + game picker, see intro.js) ---------- */
  home() {
    this.set('home', Intro.html());
    Intro.bind();
    $('#cfg').onclick = () => this.setup();
    $('#reset').onclick = async () => {
      const ok = await Core.ask('Start a fresh night?', 'Heat goes back to the start, scores and layers clear. Players stay.', [{ label: 'Reset', value: 1 }, { label: 'Cancel', value: 0, cls: 'ghost' }]);
      if (ok) { Object.assign(Core.S, { scores: {}, layers: {}, round: 0, turn: 0 }); Core.used = {}; Core.vibeDraws = 0; window.Prefs && Prefs.applyNightDefaults(); Core.save(); this.home(); }
    };
    $$('.tile').forEach((t) => (t.onclick = () => this.choose(t.dataset.game)));
  },

  /* Picking a game: consent once per session, players, then the Lv3 moment if it's due */
  async choose(id) {
    if (window.Cfg && !Cfg.gameOn(id)) return Core.toast('That game is taking a night off');
    let consented = false;
    try { consented = sessionStorage.getItem('hc_consent') === '1'; } catch (e) {}
    if (!consented) return this.consent(() => this.choose(id));
    if (Core.players().length < 2) { this.pendingGame = id; return this.setup(); }
    if (window.Lock) await Lock.beforeStart(id);
    this.play(id);
  },

  play(id) {
    if (Core.players().length < 2) { this.pendingGame = id; return this.setup(); }
    SFX.unlock(); SFX.play('tap');
    window.Stats && Stats.game(id);
    Core.stopTimers();
    Core._wantWake = true; Core.wake(true);
    Games[id].start();
  },

  /* ---------- setup ---------- */
  setup() {
    const S = Core.S, st = S.settings;
    const unlimited = !!(window.Ent && Ent.unlimitedPlayers());
    const capped = !unlimited && S.couples.length >= 2;
    const savedNames = unlimited && window.Prefs ? Prefs.get().savedNames : [];
    const coupleRow = (c, i) => `<div class="couple" data-c="${i}">
        <input class="input" data-k="a" maxlength="14" placeholder="Name" value="${esc(c.a)}">
        <span class="amp">&amp;</span>
        <input class="input" data-k="b" maxlength="14" placeholder="Name" value="${esc(c.b)}">
        <button class="icon-btn" data-del="${i}" aria-label="Remove couple" ${S.couples.length < 2 ? 'style="visibility:hidden"' : ''}>✕</button></div>`;
    const seg = (key, opts) => `<div class="seg" data-seg="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(st[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    this.set('home', `<main class="screen" style="padding-bottom:40px">
      <div class="row" style="justify-content:space-between;margin-bottom:18px"><h1 style="font-size:34px">Who's playing?</h1>
        ${Core.players().length >= 2 ? '<button class="icon-btn" id="back" aria-label="Back">✕</button>' : ''}</div>
      <div class="col" id="couples">${S.couples.map(coupleRow).join('')}</div>
      ${savedNames.length ? `<div class="saved-names"><span class="note">Saved names, tap to add</span><div class="chips-row">${savedNames.map((n) => `<button class="chip" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>` : ''}
      <button class="btn ghost sm" id="addc" style="margin-top:12px;align-self:flex-start">+ Add a couple${capped ? ' <span class="pro-tag">Pro</span>' : ''}</button>
      ${!unlimited && S.couples.length > 2 ? '<p class="note">Free plays the first 2 couples. Pro brings everyone.</p>' : ''}
      <div class="spacer"></div>

      <div class="field"><label>How do penalties work?</label>
        ${seg('mode', [['drink', '🍸 Drinks'], ['water', '💧 Water'], ['dare', '🎲 Dares']])}
        <p class="note" id="modeNote"></p></div>
      <div class="spacer"></div>

      <div class="field"><label>Start at</label>${seg('startHeat', [[1, '😏 Flirty'], [2, '🌶️ Spicy'], [3, '🔥 Hot']])}</div>
      <div class="spacer"></div>
      <div class="field"><label>Max heat tonight</label>${seg('maxHeat', [[1, '😏 Flirty'], [2, '🌶️ Spicy'], [3, '🔥 Hot']])}</div>
      <div class="toggle"><div><b>Heat Meter auto-ramp</b><div class="note">Cards climb a level every few rounds.</div></div><button class="switch ${st.ramp ? 'on' : ''}" data-sw="ramp" aria-label="Auto-ramp"></button></div>
      <div class="field" id="rpl" ${st.ramp ? '' : 'hidden'}><label>Rounds per level</label>${seg('roundsPerLevel', [[4, '4'], [6, '6'], [8, '8'], [12, '12']])}</div>
      <div class="spacer"></div>

      <div class="toggle"><div><b>Strip Charades: layers</b><div class="note">Off = kiss, massage or sip instead.</div></div><button class="switch ${st.strip ? 'on' : ''}" data-sw="strip" aria-label="Strip penalties"></button></div>
      <div class="field" id="lay" ${st.strip ? '' : 'hidden'}><label>Layers each</label>${seg('layers', [[3, '3'], [4, '4'], [5, '5'], [6, '6']])}</div>

      <div class="spacer"></div>
      <p class="note">1 pt per Flirty card, 2 per Spicy, 3 per Hot. Points set the penalty size and land on the scoreboard. Pass is always free on dares and intimate cards.</p>
      <div class="spacer"></div>
      <button class="btn block" id="save">Let's play →</button>
    </main>`);
    const notes = { drink: 'Points = sips. Drink responsibly: pace yourselves, keep water on the table, and nobody drives.', water: 'Points = sips of water. Same game, no hangover.', dare: 'No drinks. Lv1 = truth or compliment, Lv2 = kiss, massage or whisper, Lv3 = hot dare.' };
    const refreshNote = () => ($('#modeNote').textContent = notes[st.mode]);
    refreshNote();
    const readCouples = () => { S.couples = $$('.couple').map((r) => ({ a: $('[data-k=a]', r).value, b: $('[data-k=b]', r).value })); };
    $('#addc').onclick = () => {
      readCouples(); Core.save();
      if (capped) return window.UI ? UI.paywall({ reason: 'players' }) : Core.toast('Free plays up to 4 people');
      S.couples.push({ a: '', b: '' }); Core.save(); this.setup();
    };
    $$('[data-name]').forEach((b) => (b.onclick = () => {
      const empty = $$('.couple input').find((i) => !i.value.trim());
      if (!empty) return Core.toast('Add a couple first');
      empty.value = b.dataset.name; SFX.play('tap');
    }));
    $$('[data-del]').forEach((b) => (b.onclick = () => { readCouples(); S.couples.splice(+b.dataset.del, 1); Core.save(); this.setup(); }));
    $$('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const k = g.dataset.seg; const v = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
      st[k] = v; SFX.play('tap');
      if (k === 'startHeat' && st.maxHeat < v) st.maxHeat = v;
      if (k === 'maxHeat' && st.startHeat > v) st.startHeat = v;
      $$('[data-seg]').forEach((gg) => $$('button', gg).forEach((x) => x.classList.toggle('on', String(st[gg.dataset.seg]) === x.dataset.v)));
      refreshNote();
    }));
    $$('[data-sw]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.sw; st[k] = !st[k]; b.classList.toggle('on', st[k]); SFX.play('tap');
      $('#rpl').hidden = !st.ramp; $('#lay').hidden = !st.strip;
    }));
    $('#back') && ($('#back').onclick = () => { readCouples(); Core.save(); this.home(); });
    $('#save').onclick = () => {
      readCouples();
      const full = S.couples.filter((c) => c.a.trim() && c.b.trim());
      if (!full.length) return Core.toast('Add at least one couple (two names)');
      S.couples = full; Core.save(); SFX.play('reveal');
      if (unlimited && window.Prefs) Prefs.set({ savedNames: [...Prefs.get().savedNames, ...full.flatMap((c) => [c.a.trim(), c.b.trim()])] });
      const g = this.pendingGame; this.pendingGame = null;
      if (g) this.choose(g); else this.home();
    };
  },

  /* ---------- global delegation ---------- */
  bind() {
    document.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav && nav.dataset.nav === 'home') { SFX.play('tap'); return this.home(); }
      const act = e.target.closest('[data-act]'); if (!act) return;
      const a = act.dataset.act;
      if (a === 'mute') { const m = SFX.toggle(); act.textContent = m ? '🔇' : '🔊'; window.Prefs && Prefs.set({}); }
      if (a === 'profile') window.UI && UI.profile();
      if (a === 'account') window.UI && UI.account();
      if (a === 'paywall') window.UI && UI.paywall({ game: act.dataset.game || null });
      if (a === 'pause') Core.pause();
      if (a === 'standings') Core.standings();
      if (a === 'pass') { SFX.play('tap'); Core.stopTimers(); $$('.modal-wrap').forEach((m) => m.remove()); Core._pass && Core._pass(); }
    });
    // Spotlight follows the finger in noir mode
    let px = 0, py = 0, queued = false;
    document.addEventListener('pointermove', (e) => {
      const r = this.root(); if (r.dataset.theme !== 'bodypart') return;
      px = e.clientX; py = e.clientY;
      if (queued) return; queued = true;
      requestAnimationFrame(() => { queued = false; r.style.setProperty('--sx', (px / innerWidth) * 100 + '%'); r.style.setProperty('--sy', (py / innerHeight) * 100 + '%'); });
    }, { passive: true });
    // Panic: Escape key or hiding the tab pauses
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') Core.paused ? Core.resume() : Core.pause(); });
  },
};

/* A game flow that was mid-await when you left just stops quietly */
window.addEventListener('unhandledrejection', (e) => { if (e.reason && e.reason.message === 'left-game') e.preventDefault(); });
window.addEventListener('error', (e) => {
  if (e.message && e.message.includes('left-game')) { e.preventDefault(); return; }
  Report.error(e.message, e.filename + ':' + e.lineno);
});
window.addEventListener('unhandledrejection', (e) => { if (!(e.reason && e.reason.message === 'left-game')) Report.error(String((e.reason && e.reason.message) || e.reason), 'promise'); });

/* First-party error beacon. Posts to /api/event once a server exists; harmless no-op until then. */
const Report = {
  error(msg, where) {
    const body = JSON.stringify({ type: 'error', data: String(msg + ' @ ' + where).slice(0, 300), path: location.pathname, t: Date.now() });
    try { navigator.sendBeacon && navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' })); } catch (err) {}
  },
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
