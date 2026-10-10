/* Heat Check: app shell: gates, home, setup, routing */
const GAME_ORDER = HC.GAMES.map((g) => g.id); // every list and count comes from config.js
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
    Core.game = null;
    window.Taste && (Taste.showing = null);
    this.set('home', Intro.html());
    Intro.bind();
    $('#cfg').onclick = () => this.setup();
    $('#reset').onclick = async () => {
      const ok = await Core.ask('Start a fresh night?', 'Heat goes back to Lv1, scores and layers clear. Players stay.', [{ label: 'Reset', value: 1 }, { label: 'Cancel', value: 0, cls: 'ghost' }]);
      if (ok) { Object.assign(Core.S, { scores: {}, layers: {}, named: {}, round: 0, turn: 0, heat: 1, rampCount: 0 }); Core.used = {}; window.Prefs && Prefs.applyNightDefaults(); Core.save(); this.home(); }
    };
    $$('.tile').forEach((t) => (t.onclick = () => this.choose(t.dataset.game)));
  },

  minPlayers() { return Core.isGroup() ? HC.GROUP_MIN : 2; },

  /* Picking a game: consent once per session, players, then a free Hot card if one is armed */
  async choose(id) {
    if (!Games[id] || !HC.modeOf(id)) return;
    if (window.Cfg && !Cfg.gameOn(id)) return Core.toast('That game is taking a night off');
    const side = HC.modeOf(id) === 'group' ? 'group' : 'couples';
    if (Core.S.side !== side) { Core.S.side = side; Core.save(); }
    let consented = false;
    try { consented = sessionStorage.getItem('hc_consent') === '1'; } catch (e) {}
    if (!consented) return this.consent(() => this.choose(id));
    if (Core.players().length < this.minPlayers()) { this.pendingGame = id; return this.setup(); }
    if (window.Taste && Taste.armed) {
      if (Taste.canClaim(id)) { try { await Taste.claim(id); Core.toast('Your free Hot card is up first'); } catch (e) { Core.toast(e.message); } }
      else { Taste.armed = false; Core.toast(Taste.used(id) ? 'This game’s free Hot card is used. Still at Spicy.' : 'Hot stays locked'); }
    }
    this.play(id);
  },

  play(id) {
    if (Core.players().length < this.minPlayers()) { this.pendingGame = id; return this.setup(); }
    SFX.unlock(); SFX.play('tap');
    Core.game = id;
    window.Stats && Stats.game(id);
    Core.stopTimers();
    Core._wantWake = true; Core.wake(true);
    Games[id].start();
  },

  /* ---------- setup: couples (pairs) or a group roster ---------- */
  setup() {
    const S = Core.S, st = S.settings, group = Core.isGroup();
    const unlimited = !!(window.Ent && Ent.unlimitedPlayers());
    const savedNames = unlimited && window.Prefs ? Prefs.get().savedNames : [];
    const coupleCap = HC.FREE_PLAYERS / 2;
    const cappedCouples = !unlimited && S.couples.length >= coupleCap;
    const filledGroup = S.group.players.length;
    const cappedGroup = !unlimited && filledGroup >= HC.FREE_PLAYERS;
    const coupleRow = (c, i) => `<div class="couple" data-c="${i}">
        <input class="input" data-k="a" maxlength="14" placeholder="Name" value="${esc(c.a)}">
        <span class="amp">&amp;</span>
        <input class="input" data-k="b" maxlength="14" placeholder="Name" value="${esc(c.b)}">
        <button class="icon-btn" data-del="${i}" aria-label="Remove couple" ${S.couples.length < 2 ? 'style="visibility:hidden"' : ''}>✕</button></div>`;
    const groupRow = (n, i) => `<div class="grow-row" data-g="${i}">
        <span class="gnum">${i + 1}</span><input class="input" data-k="p" maxlength="14" placeholder="Player ${i + 1}" value="${esc(n)}">
        <button class="icon-btn" data-gdel="${i}" aria-label="Remove player" ${S.group.players.length <= HC.GROUP_MIN ? 'style="visibility:hidden"' : ''}>✕</button></div>`;
    const seg = (key, opts, obj = st) => `<div class="seg" data-seg="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(obj[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const canBack = Core.players().length >= this.minPlayers();
    this.set('home', `<main class="screen setup ${group ? 'is-group' : ''}" style="padding-bottom:40px">
      <div class="row" style="justify-content:space-between;margin-bottom:16px"><h1 style="font-size:34px">${group ? 'Who’s in?' : 'Who’s playing?'}</h1>
        ${canBack ? '<button class="icon-btn" id="back" aria-label="Back">✕</button>' : ''}</div>
      ${group ? `
        <p class="note">${HC.GROUP_MIN} to ${HC.GROUP_MAX} players. Everyone plays for themselves.</p>
        <div class="col" id="roster">${S.group.players.map(groupRow).join('')}</div>
        <button class="btn ghost sm" id="addp" style="margin-top:12px;align-self:flex-start">+ Add a player${cappedGroup ? ' <span class="pro-tag">Pro</span>' : ''}</button>
        ${!unlimited && filledGroup > HC.FREE_PLAYERS ? `<p class="note">Free plays the first ${HC.FREE_PLAYERS}. Pro brings everyone.</p>` : ''}`
      : `
        <div class="col" id="couples">${S.couples.map(coupleRow).join('')}</div>
        <button class="btn ghost sm" id="addc" style="margin-top:12px;align-self:flex-start">+ Add a couple${cappedCouples ? ' <span class="pro-tag">Pro</span>' : ''}</button>
        ${!unlimited && S.couples.length > coupleCap ? `<p class="note">Free plays the first ${coupleCap} couples. Pro brings everyone.</p>` : ''}`}
      ${savedNames.length ? `<div class="saved-names"><span class="note">Saved names, tap to add</span><div class="chips-row">${savedNames.map((n) => `<button class="chip" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>` : ''}
      <div class="spacer"></div>

      <div class="field"><label>How do penalties work?</label>
        ${group ? seg('mode', [['drink', '🍸 Sips'], ['water', '💧 No alcohol']], S.group) : seg('mode', [['drink', '🍸 Drinks'], ['water', '💧 Water'], ['dare', '🎲 Dares']])}
        <p class="note" id="modeNote"></p></div>
      <div class="spacer"></div>

      <div class="toggle"><div><b>Auto-ramp</b><div class="note">Heat climbs one level every few cards, up to the highest level you have.</div></div><button class="switch ${st.autoRamp ? 'on' : ''}" data-sw="autoRamp" aria-label="Auto-ramp"></button></div>
      <div class="field" id="rpl" ${st.autoRamp ? '' : 'hidden'}><label>Cards per ramp</label>
        <div class="stepper"><button class="icon-btn" data-step="-1" aria-label="Fewer">−</button><b id="cpr">${st.cardsPerRamp}</b><button class="icon-btn" data-step="1" aria-label="More">+</button></div></div>
      ${group ? '' : `<div class="spacer"></div>
      <div class="field"><label>Strip Charades: layers each</label>${seg('layers', [[3, '3'], [4, '4'], [5, '5'], [6, '6']])}</div>`}

      <div class="spacer"></div>
      <p class="note">1 pt per Flirty card, 2 per Spicy, 3 per Hot. Points set the penalty size and land on the scoreboard.${group ? '' : ' Pass is always free on dares and intimate cards.'}</p>
      <div class="spacer"></div>
      <button class="btn block" id="save">Let’s play →</button>
    </main>`);
    const notes = { drink: 'Points = sips. Drink responsibly: pace yourselves, keep water on the table, and nobody drives.', water: 'Points = sips of water. Same game, no hangover.', dare: 'No drinks. Lv1 = truth or compliment, Lv2 = kiss, massage or whisper, Lv3 = hot dare.' };
    const refreshNote = () => ($('#modeNote').textContent = notes[group ? S.group.mode : st.mode]);
    refreshNote();
    const readCouples = () => { if (!group) S.couples = $$('.couple').map((r) => ({ a: $('[data-k=a]', r).value, b: $('[data-k=b]', r).value })); };
    const readGroup = () => { if (group) S.group.players = $$('.grow-row [data-k=p]').map((i) => i.value); };
    const read = () => { readCouples(); readGroup(); Core.save(); };
    $('#addc') && ($('#addc').onclick = () => {
      read();
      if (cappedCouples) return window.UI ? UI.paywall({ reason: 'players' }) : Core.toast(`Free plays up to ${HC.FREE_PLAYERS} people`);
      S.couples.push({ a: '', b: '' }); Core.save(); this.setup();
    });
    $('#addp') && ($('#addp').onclick = () => {
      read();
      if (S.group.players.length >= HC.GROUP_MAX) return Core.toast(`${HC.GROUP_MAX} players max`);
      if (cappedGroup) return window.UI ? UI.paywall({ reason: 'players' }) : Core.toast(`Free plays up to ${HC.FREE_PLAYERS} people`);
      S.group.players.push(''); Core.save(); this.setup();
    });
    $$('[data-name]').forEach((b) => (b.onclick = () => {
      const empty = $$(group ? '.grow-row input' : '.couple input').find((i) => !i.value.trim());
      if (!empty) return Core.toast(group ? 'Add a player first' : 'Add a couple first');
      empty.value = b.dataset.name; SFX.play('tap');
    }));
    $$('[data-del]').forEach((b) => (b.onclick = () => { read(); S.couples.splice(+b.dataset.del, 1); Core.save(); this.setup(); }));
    $$('[data-gdel]').forEach((b) => (b.onclick = () => { read(); S.group.players.splice(+b.dataset.gdel, 1); Core.save(); this.setup(); }));
    $$('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const k = g.dataset.seg; const v = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
      const obj = group && k === 'mode' ? S.group : st;
      obj[k] = v; SFX.play('tap');
      $$('button', g).forEach((x) => x.classList.toggle('on', x === b));
      refreshNote();
    }));
    $$('[data-sw]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.sw; st[k] = !st[k]; b.classList.toggle('on', st[k]); SFX.play('tap');
      $('#rpl').hidden = !st.autoRamp;
      if (k === 'autoRamp') { S.rampCount = 0; window.Prefs && Prefs.set({ auto_ramp: st.autoRamp }); }
    }));
    $$('[data-step]').forEach((b) => (b.onclick = () => {
      st.cardsPerRamp = Math.min(HC.RAMP_MAX, Math.max(HC.RAMP_MIN, st.cardsPerRamp + +b.dataset.step));
      S.rampCount = 0; $('#cpr').textContent = st.cardsPerRamp; SFX.play('tap');
      window.Prefs && Prefs.set({ cards_per_ramp: st.cardsPerRamp });
    }));
    $('#back') && ($('#back').onclick = () => { read(); this.home(); });
    $('#save').onclick = () => {
      read();
      let names;
      if (group) {
        const list = S.group.players.map((n) => n.trim()).filter(Boolean);
        const unique = new Set(list.map((n) => n.toLowerCase()));
        if (list.length < HC.GROUP_MIN) return Core.toast(`Groups need at least ${HC.GROUP_MIN} players`);
        if (unique.size !== list.length) return Core.toast('Two players have the same name');
        S.group.players = list; names = list;
      } else {
        const full = S.couples.filter((c) => c.a.trim() && c.b.trim());
        if (!full.length) return Core.toast('Add at least one couple (two names)');
        S.couples = full; names = full.flatMap((c) => [c.a.trim(), c.b.trim()]);
      }
      Core.save(); SFX.play('reveal');
      if (unlimited && window.Prefs) Prefs.set({ savedNames: [...Prefs.get().savedNames, ...names] });
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
