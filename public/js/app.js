/* Heat Check: app shell: gates, home, setup, routing */
const GAME_ORDER = HC.GAMES.map((g) => g.id); // every list and count comes from config.js
const TILE_EXTRA = { redflag: '<span class="onair">ON AIR</span>' };

const App = {
  pendingGame: null,
  async init() {
    window.Nav && Nav.init();
    Core.load();
    try { await Core.loadCards(); } catch (e) { console.error(e); }
    this.bind();
    if (localStorage.getItem('hc_age') !== 'yes') this.ageGate();
    else this.home();
    try { const f = sessionStorage.getItem('hc_flash'); if (f) { sessionStorage.removeItem('hc_flash'); setTimeout(() => Core.toast(f), 400); } } catch (e) {}
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
      <div class="logo logo-img gate-logo"><img src="/logo-wordmark.webp" width="694" height="289" alt="Heat Check" draggable="false" fetchpriority="high" /></div>
      <p>Flirty party games for couples and groups of couples.<br><b>Adults only.</b></p>
      <button class="btn block" id="y18">I'm 18 or older</button>
      <button class="btn block ghost" id="n18">I'm under 18</button>
      <p class="note">By continuing you confirm you're of legal age where you live, and of legal drinking age if you play drinking mode.</p>
    </div>`);
    $('#y18').onclick = () => { SFX.unlock(); SFX.play('tap'); localStorage.setItem('hc_age', 'yes'); this.home(); };
    $('#n18').onclick = () => {
      const onBack = () => { onBack.handled = true; Nav.go(() => this.ageGate(), 'back'); };
      Nav.enter('under18', onBack);
      Nav.go(() => this.set('home', `<div class="view-top">${Nav.button()}</div><div class="gate"><div class="logo" style="font-size:40px">Come back later</div><p>This one's for grown-ups. See you in a few years.</p></div>`));
    };
  },
  /* Shown once per session, before the first game */
  // One screen, no scrolling: back, headline, one subline, names, start, one small line
  consent(next) {
    Nav.enter('consent', () => { this.pendingGame = null; });
    Nav.go(() => {
      const names = Core.players().map((p) => p.name).filter(Boolean);
      const drink = (Core.isGroup() ? Core.S.group.mode : Core.S.settings.mode) === 'drink';
      this.set('home', `<main class="screen allin">
        <div class="view-top">${Nav.button()}</div>
        <div class="allin-body">
          <h1 class="allin-h">Everyone in?</h1>
          <p class="allin-sub">Anyone can skip a card or stop, any time.</p>
          ${names.length ? `<div class="allin-names">${names.map((n) => `<span class="chip">${esc(n)}</span>`).join('')}</div>` : ''}
          <button class="btn block" id="agree">We're all in</button>
          <p class="allin-fine">${drink ? '18+ only. Pace yourselves, nobody drives.' : '18+ only. Keep it kind.'}</p>
        </div>
      </main>`);
      $('#agree').onclick = () => {
        SFX.unlock(); SFX.play('reveal');
        try { sessionStorage.setItem('hc_consent', '1'); } catch (e) {}
        next ? next() : this.home();
      };
    });
  },

  /* ---------- home (intro + game picker, see intro.js) ---------- */
  home() {
    window.Nav && Nav.leave();
    Core.game = null;
    window.Taste && (Taste.showing = null, Taste.showingLv = 0);
    this.set('home', Intro.html());
    Intro.bind();
    $('#cfg').onclick = () => this.setup();
    const end = $('#endNight');
    if (end) end.onclick = () => this.endNight();
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
      const lv = Taste.armedLv(), n = Taste.name(lv), at = HEAT[Core.levelCap(id)].name;
      if (!Taste.canClaim(id, lv)) { Taste.armed = false; Core.toast(Taste.used(id, lv) ? `This game’s free ${n} card is used. Still at ${at}.` : `${n} stays locked`); }
    }
    this.play(id);
  },

  play(id) {
    if (Core.players().length < this.minPlayers()) { this.pendingGame = id; return this.setup(); }
    SFX.unlock(); SFX.play('tap');
    window.Nav && Nav.enter('game');
    Core.game = id;
    Core.dealt = {};
    Core.restoreFor = id;   // v20.1: the first deal brings back this game's card if it had one
    gateWait = null;
    window.Stats && Stats.game(id);
    window.Track && Track.ev('game_start', { g: id, h: Core.heat() });
    Core.stopTimers();
    Core._wantWake = true; Core.wake(true);
    Games[id].start();
  },

  /* ---------- End Night: confirm once, then the summary ---------- */
  nightActive() { const n = Core.S.night; return !!(n && n.started && Object.keys(n.cards).length); },
  async endNight() {
    if (!this.nightActive()) return;
    const ok = await Core.ask('End the night?', 'You’ll get the night’s summary. Scores and heat reset after.', [{ label: 'End night', value: 1 }, { label: 'Keep playing', value: 0, cls: 'ghost' }]);
    if (!ok) return;
    const summary = Night.summarize();
    Night.save(summary);
    // The night is over: scores, layers, Chicken Outs, heat and ramp reset. Players stay.
    Object.assign(Core.S, { scores: {}, layers: {}, named: {}, chicken: {}, round: 0, turn: 0, heat: 1, rampCount: 0, held: {}, night: Core.freshNight() });
    Core.used = {}; Core.recent = {}; Core.cardHeat = 0;
    window.Prefs && Prefs.applyNightDefaults(); Core.save();
    Nav.enter('night');
    Nav.go(() => Night.show(summary));
  },

  /* ---------- setup: couples (pairs) or a group roster ---------- */
  setup() {
    if (Nav.view() === 'setup') return this._setup();
    // Back (chevron or the system gesture) saves what's typed and keeps every setting
    Nav.enter('setup', () => { this._setupRead && this._setupRead(); this.pendingGame = null; });
    Nav.go(() => this._setup());
  },
  _setup() {
    const S = Core.S, st = S.settings, group = Core.isGroup();
    const unlimited = !!(window.Ent && Ent.unlimitedPlayers());
    const savedNames = unlimited && window.Prefs ? Prefs.get().savedNames : [];
    // v15: guests see their settings read-only; players stay editable so they can still play
    const locked = !!(window.Guest && Guest.is());
    const coupleCap = HC.FREE_PLAYERS / 2;
    const cappedCouples = !unlimited && S.couples.length >= coupleCap;
    const filledGroup = S.group.players.length;
    // v19.3: Strip Charades settings only when opening Strip Charades itself (or the general settings screen, no game picked);
    // another game's opening (pendingGame = redflag, nhie, ...) never shows them.
    const showStrip = !group && (!this.pendingGame || this.pendingGame === 'charades');
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
    const sw = (key, label, note) => `<div class="toggle"><div><b>${label}</b>${note ? `<div class="note">${note}</div>` : ''}</div><button class="switch ${st[key] ? 'on' : ''}" data-sw="${key}" aria-label="${label}"></button></div>`;
    this.set('home', `<main class="screen setup ${group ? 'is-group' : ''}" style="padding-bottom:40px">
      <div class="view-top">${Nav.button('Back to games')}<h1 style="font-size:34px">${group ? 'Who’s in?' : 'Who’s playing?'}</h1></div>
      <h3 class="set-h first">Players</h3>
      ${group ? `
        <p class="note">${HC.GROUP_MIN} to ${HC.GROUP_MAX} players. Everyone plays for themselves.</p>
        <div class="col" id="roster">${S.group.players.map(groupRow).join('')}</div>
        <button class="btn ghost sm" id="addp" style="margin-top:12px;align-self:flex-start">+ Add a player${cappedGroup ? ' <span class="pro-tag">Premium</span>' : ''}</button>
        ${!unlimited && filledGroup > HC.FREE_PLAYERS ? `<p class="note">This plan plays the first ${HC.FREE_PLAYERS}. Premium brings everyone.</p>` : ''}`
      : `
        <div class="col" id="couples">${S.couples.map(coupleRow).join('')}</div>
        <button class="btn ghost sm" id="addc" style="margin-top:12px;align-self:flex-start">+ Add a couple${cappedCouples ? ' <span class="pro-tag">Premium</span>' : ''}</button>
        ${!unlimited && S.couples.length > coupleCap ? `<p class="note">This plan plays the first ${coupleCap} couples. Premium brings everyone.</p>` : ''}`}
      ${savedNames.length ? `<div class="saved-names"><span class="note">Saved names, tap to add</span><div class="chips-row">${savedNames.map((n) => `<button class="chip" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>` : ''}
      <div class="set-lockwrap${locked ? ' locked' : ''}"${locked ? ' aria-disabled="true"' : ''}>
      ${locked ? `<div class="set-lock" role="note"><span class="sl-ico" aria-hidden="true">${typeof icon === 'function' ? icon('lock') : '🔒'}</span><div class="sl-txt"><b>Settings are locked</b><span>Sign in free to change them.</span></div><button class="btn sm sl-go" id="setSignIn">Sign in</button></div>` : ''}
      <section class="set-sec"><h3 class="set-h">Penalties</h3>
        <div class="field"><label>How do penalties work?</label>
          ${group ? seg('mode', [['drink', '🍸 Sips'], ['water', '💧 No alcohol']], S.group) : seg('mode', [['drink', '🍸 Drinks'], ['water', '💧 Water'], ['dare', '🎲 Dares']])}
          <p class="note" id="modeNote"></p>
          ${!group && (!this.pendingGame || this.pendingGame === 'nhie') ? '<p class="note nhie-note">Never Have I Ever always plays dares: the sipping is already the game.</p>' : ''}</div>
        <p class="note">Penalty points: Flirty ${HC.PENALTY_PTS[1]}, Spicy ${HC.PENALTY_PTS[2]}, ${HOT} ${HC.PENALTY_PTS[3]}. Each penalty is taken on the spot and its points land on the scoreboard. Anyone can Chicken Out once a round, no penalty.</p></section>

      <section class="set-sec"><h3 class="set-h">Timer</h3>
        <div class="field">${seg('timer', HC.TIMER_OPTIONS.map((n) => [n, n + 's']))}<p class="note">Every timed game uses this clock.</p></div></section>

      <section class="set-sec"><h3 class="set-h">Content</h3>
        ${sw('hollywood', 'Hollywood', 'Movies, shows and songs from Hollywood.')}
        ${sw('bollywood', 'Bollywood', 'Films, shows and songs from Bollywood.')}</section>

      <section class="set-sec"><h3 class="set-h">Heat</h3>
        ${sw('autoRamp', 'Auto-ramp', 'Heat climbs one level every few cards, up to the highest level you have.')}
        <div class="field" id="rpl" ${st.autoRamp ? '' : 'hidden'}><label>Cards per ramp</label>
          <div class="stepper"><button class="icon-btn" data-step="-1" aria-label="Fewer">−</button><b id="cpr">${st.cardsPerRamp}</b><button class="icon-btn" data-step="1" aria-label="More">+</button></div></div></section>
      ${!showStrip ? '' : `
      <section class="set-sec" id="setStrip"><h3 class="set-h">Strip Charades</h3>
        <div class="field"><label>Layers each</label>${seg('layers', [[3, '3'], [4, '4'], [5, '5'], [6, '6']])}</div></section>`}
      </div>

      <button class="btn block" id="save">Let’s play →</button>
    </main>`);
    const notes = { drink: 'Points = sips. Dares can stand in for the sips. Drink responsibly: pace yourselves, keep water on the table, and nobody drives.', water: 'Points = sips of water. Dares can stand in. Same game, no hangover.', dare: 'No drinks. Every penalty is the card’s dare, nothing else.' };
    const refreshNote = () => ($('#modeNote').textContent = notes[group ? S.group.mode : st.mode]);
    refreshNote();
    const readCouples = () => { if (!group) S.couples = $$('.couple').map((r) => ({ a: $('[data-k=a]', r).value, b: $('[data-k=b]', r).value })); };
    const readGroup = () => { if (group) S.group.players = $$('.grow-row [data-k=p]').map((i) => i.value); };
    const read = () => { readCouples(); readGroup(); Core.save(); };
    this._setupRead = read;
    // Guests: every settings control is read-only. A tap nudges the lock card instead.
    const nudge = () => {
      const c = $('.set-lock'); SFX.play('buzzer'); vibrate([20, 30, 20]);
      if (c) { c.classList.remove('nudge'); void c.offsetWidth; c.classList.add('nudge'); }
      return true;
    };
    const lockedNow = () => locked && window.Guest && Guest.is() && nudge();
    $('#setSignIn') && ($('#setSignIn').onclick = () => { read(); SFX.play('tap'); window.UI && UI.signIn({ reason: 'Sign in free to change settings.', then: () => { if (Nav.view() === 'setup') this._setup(); } }); });
    $('#addc') && ($('#addc').onclick = () => {
      read();
      if (cappedCouples) return window.UI ? UI.paywall({ reason: 'players' }) : Core.toast(`Free plays up to ${HC.FREE_PLAYERS} people`);
      S.couples.push({ a: '', b: '' }); Core.save(); this._setup();
    });
    $('#addp') && ($('#addp').onclick = () => {
      read();
      if (S.group.players.length >= HC.GROUP_MAX) return Core.toast(`${HC.GROUP_MAX} players max`);
      if (cappedGroup) return window.UI ? UI.paywall({ reason: 'players' }) : Core.toast(`Free plays up to ${HC.FREE_PLAYERS} people`);
      S.group.players.push(''); Core.save(); this._setup();
    });
    $$('[data-name]').forEach((b) => (b.onclick = () => {
      const empty = $$(group ? '.grow-row input' : '.couple input').find((i) => !i.value.trim());
      if (!empty) return Core.toast(group ? 'Add a player first' : 'Add a couple first');
      empty.value = b.dataset.name; SFX.play('tap');
    }));
    $$('[data-del]').forEach((b) => (b.onclick = () => { read(); S.couples.splice(+b.dataset.del, 1); Core.save(); this._setup(); }));
    $$('[data-gdel]').forEach((b) => (b.onclick = () => { read(); S.group.players.splice(+b.dataset.gdel, 1); Core.save(); this._setup(); }));
    $$('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (lockedNow()) return;
      const k = g.dataset.seg; const v = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
      const obj = group && k === 'mode' ? S.group : st;
      obj[k] = v; SFX.play('tap');
      $$('button', g).forEach((x) => x.classList.toggle('on', x === b));
      if (k === 'timer') window.Prefs && Prefs.set({ timer: v });
      refreshNote();
    }));
    $$('[data-sw]').forEach((b) => (b.onclick = () => {
      if (lockedNow()) return;
      const k = b.dataset.sw; SFX.play('tap');
      if (k === 'hollywood' || k === 'bollywood') {
        // Recalculates the deck right away. At least one stays on.
        if (!Core.setOrigin(k, !st[k])) { b.classList.remove('on'); void b.offsetWidth; b.classList.add('on', 'nope'); setTimeout(() => b.classList.remove('nope'), 400); return Core.toast('Keep at least one of Hollywood or Bollywood on'); }
        b.classList.toggle('on', st[k]); window.Prefs && Prefs.set({ [k]: st[k] }); return;
      }
      st[k] = !st[k]; b.classList.toggle('on', st[k]);
      $('#rpl').hidden = !st.autoRamp;
      if (k === 'autoRamp') { S.rampCount = 0; window.Prefs && Prefs.set({ auto_ramp: st.autoRamp }); }
    }));
    $$('[data-step]').forEach((b) => (b.onclick = () => {
      if (lockedNow()) return;
      st.cardsPerRamp = Math.min(HC.RAMP_MAX, Math.max(HC.RAMP_MIN, st.cardsPerRamp + +b.dataset.step));
      S.rampCount = 0; $('#cpr').textContent = st.cardsPerRamp; SFX.play('tap');
      window.Prefs && Prefs.set({ cards_per_ramp: st.cardsPerRamp });
    }));
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
      if (a === 'signin') { SFX.play('tap'); window.UI && UI.signIn({ reason: typeof FREE_REASON === 'string' ? FREE_REASON : undefined, then: () => window.Intro && Intro.refresh() }); }
      if (a === 'account') window.UI && UI.account();
      if (a === 'paywall') window.UI && UI.paywall({ game: act.dataset.game || Core.game || null });
      if (a === 'standings') Core.standings();
      if (a === 'heatsheet') window.UI && UI.heatSheet(Core.game);
      if (a === 'chicken') { SFX.play('tap'); Core.chickenOut(); }
      if (a === 'players') { SFX.play('tap'); this.setup(); }
    });
  },
};

/* A game flow that was mid-await when you left just stops quietly */
window.addEventListener('unhandledrejection', (e) => { if (e.reason && e.reason.message === 'left-game') e.preventDefault(); });
window.addEventListener('error', (e) => {
  if (e.message && e.message.includes('left-game')) { e.preventDefault(); return; }
  Report.error(e.message, e.filename + ':' + e.lineno);
});
window.addEventListener('unhandledrejection', (e) => { if (!(e.reason && e.reason.message === 'left-game')) Report.error(String((e.reason && e.reason.message) || e.reason), 'promise'); });

/* ---------- End Night summary ---------- */
const Night = {
  summarize() {
    const n = Core.S.night, ps = Core.players();
    const players = ps.map((p, i) => ({ name: p.name, couple: p.couple, pts: Core.score(i) }));
    const couples = Core.isGroup() ? [] : Core.couples().map((ci) => { const pair = players.filter((p) => p.couple === ci); return { names: pair.map((p) => p.name), pts: pair.reduce((a, p) => a + p.pts, 0) }; });
    const total = players.reduce((a, p) => a + p.pts, 0);
    // The taunt reads the couple's combined points: the only couple, or the hottest one tonight
    const top = couples.slice().sort((a, b) => b.pts - a.pts)[0];
    const tauntPts = top ? top.pts : total;
    return {
      at: new Date().toISOString(), side: Core.S.side,
      cards: { ...n.cards }, games: n.games.slice(), topHeat: n.topHeat || 1,
      players: players.map(({ name, pts }) => ({ name, pts })), couples, total,
      tauntFor: top ? top.names.join(' & ') : null, tauntPts, taunt: HC.taunt(tauntPts),
      limitHit: !!n.limitHit,
      heatMix: { 1: (n.heat && n.heat[1]) || 0, 2: (n.heat && n.heat[2]) || 0, 3: (n.heat && n.heat[3]) || 0 },
      chickens: Object.values(n.chickens || {}).reduce((a, b) => a + b, 0),
      chickenKing: Night.leader(n.chickens || {}),
      guilty: players.length && players.slice().sort((a, b) => b.pts - a.pts)[0].pts > 0 ? players.slice().sort((a, b) => b.pts - a.pts)[0] : null,
      penalties: n.penalties || 0,
      minutes: n.started ? Math.max(1, Math.round(((n.last || Date.now()) - n.started) / 60000)) : 0,
    };
  },
  leader(map) { const e = Object.entries(map).sort((a, b) => b[1] - a[1])[0]; return e && e[1] > 0 ? { name: e[0], n: e[1] } : null; },
  dur(m) { return !m ? '0m' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; },
  mixHtml(s) {
    const t = s.heatMix[1] + s.heatMix[2] + s.heatMix[3]; if (!t) return '';
    return `<section class="night-card"><h3>Heat mix</h3><div class="mix-bar">${[1, 2, 3].filter((l) => s.heatMix[l]).map((l) => `<i class="mx${l}" style="flex:${s.heatMix[l]}"></i>`).join('')}</div>
      <ul class="mix-legend">${[1, 2, 3].map((l) => `<li class="mx${l}"><i></i>${HEAT[l].name}<b>${Math.round(s.heatMix[l] * 100 / t)}%</b></li>`).join('')}</ul></section>`;
  },
  awardsHtml(s) {
    const a = [];
    if (s.guilty) a.push(`<li><span>😈 Most guilty</span><b>${esc(s.guilty.name)} · ${s.guilty.pts} pts</b></li>`);
    if (s.chickenKing) a.push(`<li><span>🐔 Biggest chicken</span><b>${esc(s.chickenKing.name)} · ${s.chickenKing.n}×</b></li>`);
    if (s.couples.length > 1) { const c = s.couples.slice().sort((x, y) => y.pts - x.pts)[0]; a.push(`<li><span>🔥 Hottest pair</span><b>${c.names.map(esc).join(' &amp; ')}</b></li>`); }
    return a.length ? `<section class="night-card"><h3>Awards</h3><ul class="night-list">${a.join('')}</ul></section>` : '';
  },
  // Guests keep it on this device; signed-in accounts get it in their profile stats
  save(s) { window.Stats && Stats.night(s); },
  show(s) {
    const cardsTotal = Object.values(s.cards).reduce((a, b) => a + b, 0);
    const showPaywall = s.limitHit && window.Ent && Ent.tier() !== 'premium';
    App.set('home', `<main class="screen night">
      <div class="view-top">${Nav.button('Back to games')}</div>
      <div class="night-logo"><img src="/logo-wordmark.webp" width="694" height="289" alt="Heat Check" draggable="false" decoding="async" /></div>
      <p class="night-kicker">That’s a wrap</p>
      <h1 class="night-title">Tonight’s damage</h1>
      <section class="night-taunt"><p>${esc(s.taunt)}</p>${s.tauntFor ? `<span class="note">${esc(s.tauntFor)} · ${s.tauntPts} pts together</span>` : ''}</section>
      <section class="night-grid">
        <div><b>${this.dur(s.minutes)}</b><span>on the clock</span></div>
        <div><b>${cardsTotal}</b><span>cards across ${s.games.length} game${s.games.length === 1 ? '' : 's'}</span></div>
        <div><b class="h${s.topHeat}">${HEAT[s.topHeat].name}</b><span>highest heat</span></div>
        <div><b>${s.total}</b><span>penalty points</span></div>
      </section>
      ${this.awardsHtml(s)}${this.mixHtml(s)}
      ${s.couples.length ? `<section class="night-card"><h3>Couples</h3><ul class="night-list">${s.couples.map((c) => `<li><span>${c.names.map(esc).join(' &amp; ')}</span><b>${c.pts} pts</b></li>`).join('')}</ul></section>` : ''}
      <section class="night-card"><h3>Penalty points</h3><ul class="night-list">${s.players.slice().sort((a, b) => b.pts - a.pts).map((p) => `<li><span>${esc(p.name)}</span><b>${p.pts}</b></li>`).join('')}</ul></section>
      <section class="night-card"><h3>Cards per game</h3><ul class="night-list">${s.games.map((g) => `<li><span>${esc(Games[g] ? Games[g].title : g)}</span><b>${s.cards[g] || 0}</b></li>`).join('')}</ul></section>
      ${showPaywall ? `<section class="night-card"><h3>Hit a limit tonight?</h3><div id="nightPlans"></div></section>` : ''}
      <div class="col night-actions">
        <button class="btn block" id="nightShare">Share the summary</button>
        <button class="btn block ghost" id="nightHome">New night</button>
      </div>
    </main>`);
    if (showPaywall && window.UI) UI.plans($('#nightPlans'), {});
    $('#nightHome').onclick = () => { SFX.play('tap'); App.home(); };
    $('#nightShare').onclick = (e) => this.share(s, e.currentTarget);
    SFX.play('endnight'); vibrate([30, 40, 60]);   // Velvet: chord resolve; Classic: the old win fanfare
  },
  // One-tap share: a 1080x1350 poster of the night, drawn on a canvas, shared as PNG (or downloaded)
  async share(s, btn) {
    try {
      const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d');
      try { await document.fonts.ready; } catch (e) {}
      const F = (w, sz, it) => `${it ? 'italic ' : ''}${w} ${sz}px Inter, system-ui, sans-serif`;
      const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
      const lin = (x0, y0, x1, y1, stops) => { const g = x.createLinearGradient(x0, y0, x1, y1); stops.forEach((st, k) => g.addColorStop(k / (stops.length - 1), st)); return g; };
      const PAL = { 1: ['#ffb3c6', '#ff2e63', '#d61f6e'], 2: ['#ff2e63', '#ff7a3c'], 3: ['#ff7a3c', '#fff4e0'] };
      // Backdrop: deep plum, a pink bloom top-left, an ember bloom bottom-right, soft grain
      x.fillStyle = lin(0, 0, 0, H, ['#1d0716', '#140912', '#0d070d']); x.fillRect(0, 0, W, H);
      const bloom = (cx, cy, r, col) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); };
      bloom(180, 160, 700, 'rgba(255,46,99,.38)'); bloom(980, 1260, 760, 'rgba(255,122,60,.28)'); bloom(900, 260, 420, 'rgba(214,31,110,.18)');
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      x.fillStyle = 'rgba(255,255,255,.035)'; for (let k = 0; k < 900; k++) x.fillRect(rnd() * W, rnd() * H, 1.6, 1.6);
      // Thin gradient frame
      x.lineWidth = 3; x.strokeStyle = lin(0, 0, W, H, ['rgba(255,179,198,.55)', 'rgba(255,46,99,.25)', 'rgba(255,122,60,.5)']); rr(28, 28, W - 56, H - 56, 44); x.stroke();
      x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      // Logo + kicker
      const logo = await new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = '/logo-wordmark.webp'; });
      if (logo) { const w = 300, h = Math.round(w * (logo.naturalHeight || 289) / (logo.naturalWidth || 694)); x.drawImage(logo, W / 2 - w / 2, 70, w, h); }
      const date = new Date(s.at || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      x.fillStyle = 'rgba(255,227,236,.6)'; x.font = F(800, 24); if ('letterSpacing' in x) x.letterSpacing = '6px';
      x.fillText(`THAT’S A WRAP  ·  ${date.toUpperCase()}`, W / 2, 245); if ('letterSpacing' in x) x.letterSpacing = '0px';
      // Title with the brand gradient
      x.font = F(900, 104, true); x.fillStyle = lin(220, 0, 860, 0, ['#ffb3c6', '#ff2e63', '#ff7a3c']); x.fillText('Tonight’s damage', W / 2, 352);
      // Taunt
      const wrap = (t, y, w, lh) => { const words = t.split(' '); let line = ''; for (const wd of words) { const tt = line ? line + ' ' + wd : wd; if (x.measureText(tt).width > w && line) { x.fillText(line, W / 2, y); y += lh; line = wd; } else line = tt; } x.fillText(line, W / 2, y); return y + lh; };
      x.fillStyle = '#ffe3ec'; x.font = F(600, 38, true); let y = wrap(`“${s.taunt}”`, 422, 860, 50);
      if (s.tauntFor) { x.fillStyle = 'rgba(255,227,236,.55)'; x.font = F(700, 24); x.fillText(`${s.tauntFor}  ·  ${s.tauntPts} pts together`, W / 2, y - 6); y += 30; }
      y += 10;
      // Stat cards
      const cardsTotal = Object.values(s.cards).reduce((a, b) => a + b, 0);
      const stats = [[Night.dur(s.minutes), 'ON THE CLOCK'], [String(cardsTotal), 'CARDS'], [String(s.total), 'PENALTY PTS'], [HEAT[s.topHeat].name, 'TOP HEAT', s.topHeat]];
      const cw = 222, gap = 20, x0 = (W - (cw * 4 + gap * 3)) / 2, ch = 168;
      stats.forEach(([v, l, lv], k) => {
        const X = x0 + k * (cw + gap);
        x.fillStyle = 'rgba(255,255,255,.06)'; rr(X, y, cw, ch, 28); x.fill();
        x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,.10)'; x.stroke();
        let sz = 68; x.font = F(900, sz, true); while (x.measureText(v).width > cw - 28 && sz > 34) { sz -= 4; x.font = F(900, sz, true); }
        x.fillStyle = lv ? lin(X + 20, 0, X + cw - 20, 0, PAL[lv]) : '#ffffff'; x.fillText(v, X + cw / 2, y + 96);
        x.fillStyle = 'rgba(255,227,236,.55)'; x.font = F(800, 19); if ('letterSpacing' in x) x.letterSpacing = '3px'; x.fillText(l, X + cw / 2, y + 138); if ('letterSpacing' in x) x.letterSpacing = '0px';
      });
      y += ch + 52;
      // Heat mix bar
      const mt = s.heatMix[1] + s.heatMix[2] + s.heatMix[3], bx = 90, bw = W - 180;
      if (mt) {
        x.textAlign = 'left'; x.fillStyle = 'rgba(255,227,236,.6)'; x.font = F(800, 22); if ('letterSpacing' in x) x.letterSpacing = '4px'; x.fillText('HEAT MIX', bx, y); if ('letterSpacing' in x) x.letterSpacing = '0px';
        y += 22; let cx = bx;
        x.save(); rr(bx, y, bw, 26, 13); x.clip(); x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(bx, y, bw, 26);
        [1, 2, 3].forEach((l) => { const w = bw * s.heatMix[l] / mt; if (!w) return; x.fillStyle = lin(cx, 0, cx + w, 0, PAL[l]); x.fillRect(cx, y, w + 1, 26); cx += w; });
        x.restore(); y += 64;
        const seg = bw / 3; [1, 2, 3].forEach((l, k) => { const X = bx + k * seg; x.fillStyle = lin(X, 0, X + 22, 0, PAL[l]); x.beginPath(); x.arc(X + 11, y - 9, 10, 0, Math.PI * 2); x.fill();
          x.fillStyle = '#fff'; x.font = F(800, 28); x.fillText(HEAT[l].name, X + 32, y); const tw = x.measureText(HEAT[l].name).width; x.fillStyle = 'rgba(255,227,236,.6)'; x.font = F(700, 26); x.fillText(`${Math.round(s.heatMix[l] * 100 / mt)}%`, X + 44 + tw, y); });
        y += 40;
      }
      // Awards
      const aw = [];
      if (s.guilty) aw.push(['😈', 'MOST GUILTY', s.guilty.name, `${s.guilty.pts} pts`]);
      if (s.chickenKing) aw.push(['🐔', 'BIGGEST CHICKEN', s.chickenKing.name, `${s.chickenKing.n}×`]);
      else aw.push(['😇', 'CHICKEN OUTS', 'Nobody', 'brave lot']);
      const awW = (bw - 20) / 2;
      aw.slice(0, 2).forEach(([e, l, nm, v], k) => {
        const X = bx + k * (awW + 20);
        x.fillStyle = lin(X, y, X + awW, y + 120, ['rgba(255,46,99,.16)', 'rgba(255,122,60,.10)']); rr(X, y, awW, 108, 26); x.fill();
        x.lineWidth = 2; x.strokeStyle = 'rgba(255,179,198,.22)'; x.stroke();
        x.textAlign = 'left'; x.fillStyle = '#fff'; x.font = F(400, 50); x.fillText(e, X + 24, y + 72);
        x.fillStyle = 'rgba(255,227,236,.6)'; x.font = F(800, 18); if ('letterSpacing' in x) x.letterSpacing = '3px'; x.fillText(l, X + 98, y + 42); if ('letterSpacing' in x) x.letterSpacing = '0px';
        let sz = 34; x.font = F(900, sz, true); const label = `${nm}  ·  ${v}`; while (x.measureText(label).width > awW - 120 && sz > 22) { sz -= 2; x.font = F(900, sz, true); }
        x.fillStyle = '#fff'; x.fillText(label, X + 98, y + 82);
      });
      y += 158;
      // Leaderboard with gradient bars
      const rows = s.players.slice().sort((a, b) => b.pts - a.pts), maxP = Math.max(1, rows[0] ? rows[0].pts : 1);
      const room = Math.max(1, Math.floor((H - 120 - y) / 50)), shown = rows.slice(0, Math.min(5, room));
      x.textAlign = 'left'; x.fillStyle = 'rgba(255,227,236,.6)'; x.font = F(800, 22); if ('letterSpacing' in x) x.letterSpacing = '4px'; x.fillText('SCOREBOARD', bx, y); if ('letterSpacing' in x) x.letterSpacing = '0px';
      y += 40;
      const medal = ['🥇', '🥈', '🥉'];
      shown.forEach((p, k) => {
        x.textAlign = 'left'; x.font = F(400, 30); x.fillStyle = '#fff'; x.fillText(medal[k] || `${k + 1}`, bx, y + 10);
        x.font = F(800, 30); let nm = p.name; while (x.measureText(nm).width > 230 && nm.length > 2) nm = nm.slice(0, -2) + '…'; x.fillText(nm, bx + 56, y + 10);
        const barX = bx + 310, barW = bw - 310 - 110;
        x.fillStyle = 'rgba(255,255,255,.07)'; rr(barX, y - 10, barW, 20, 10); x.fill();
        const w = Math.max(20, barW * p.pts / maxP); x.fillStyle = lin(barX, 0, barX + barW, 0, ['#ffb3c6', '#ff2e63', '#ff7a3c']); rr(barX, y - 10, w, 20, 10); x.fill();
        x.textAlign = 'right'; x.font = F(900, 30, true); x.fillStyle = '#fff'; x.fillText(`${p.pts}`, bx + bw, y + 10);
        y += 50;
      });
      // Footer
      x.textAlign = 'center'; x.fillStyle = 'rgba(255,227,236,.45)'; x.font = F(700, 22); if ('letterSpacing' in x) x.letterSpacing = '4px';
      x.fillText(`${(location.host || 'heat-check').toUpperCase()}  ·  18+`, W / 2, H - 66); if ('letterSpacing' in x) x.letterSpacing = '0px';
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const file = new File([blob], 'heat-check-night.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Heat Check: tonight’s damage' }); return; }
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'heat-check-night.png'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      Core.toast('Saved the summary image');
    } catch (e) { if (e && e.name !== 'AbortError') Core.toast('Couldn’t share right now'); }
  },
};
window.Night = Night;

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
