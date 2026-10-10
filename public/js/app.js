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
      <div class="logo logo-img gate-logo"><img src="/logo-wordmark.webp" width="694" height="289" alt="Heat Check" draggable="false" fetchpriority="high" /></div>
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
      <p>Anyone can Chicken Out of a card, no penalty, once a round. Check in with each other, keep it clothed when a card says so, and only play with people who are all in.</p>
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
      if (!Taste.canClaim(id)) { Taste.armed = false; Core.toast(Taste.used(id) ? 'This game’s free Hot card is used. Still at Spicy.' : 'Hot stays locked'); }
    }
    this.play(id);
  },

  play(id) {
    if (Core.players().length < this.minPlayers()) { this.pendingGame = id; return this.setup(); }
    SFX.unlock(); SFX.play('tap');
    Core.game = id;
    Core.dealt = {};
    gateWait = null;
    window.Stats && Stats.game(id);
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
    Object.assign(Core.S, { scores: {}, layers: {}, named: {}, chicken: {}, round: 0, turn: 0, heat: 1, rampCount: 0, night: Core.freshNight() });
    Core.used = {}; Core.recent = {}; Core.cardHeat = 0;
    window.Prefs && Prefs.applyNightDefaults(); Core.save();
    Night.show(summary);
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
    const sw = (key, label, note) => `<div class="toggle"><div><b>${label}</b>${note ? `<div class="note">${note}</div>` : ''}</div><button class="switch ${st[key] ? 'on' : ''}" data-sw="${key}" aria-label="${label}"></button></div>`;
    const canBack = Core.players().length >= this.minPlayers();
    this.set('home', `<main class="screen setup ${group ? 'is-group' : ''}" style="padding-bottom:40px">
      <div class="row" style="justify-content:space-between;margin-bottom:16px"><h1 style="font-size:34px">${group ? 'Who’s in?' : 'Who’s playing?'}</h1>
        ${canBack ? '<button class="icon-btn" id="back" aria-label="Back">✕</button>' : ''}</div>
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
      <section class="set-sec"><h3 class="set-h">Penalties</h3>
        <div class="field"><label>How do penalties work?</label>
          ${group ? seg('mode', [['drink', '🍸 Sips'], ['water', '💧 No alcohol']], S.group) : seg('mode', [['drink', '🍸 Drinks'], ['water', '💧 Water'], ['dare', '🎲 Dares']])}
          <p class="note" id="modeNote"></p></div>
        <p class="note">Penalty points: Flirty ${HC.PENALTY_PTS[1]}, Spicy ${HC.PENALTY_PTS[2]}, Hot ${HC.PENALTY_PTS[3]}. Each penalty is taken on the spot and its points land on the scoreboard. Anyone can Chicken Out once a round, no penalty.</p></section>

      <section class="set-sec"><h3 class="set-h">Timer</h3>
        <div class="field">${seg('timer', HC.TIMER_OPTIONS.map((n) => [n, n + 's']))}<p class="note">Every timed game uses this clock.</p></div></section>

      <section class="set-sec"><h3 class="set-h">Content</h3>
        ${sw('hollywood', 'Hollywood', 'Movies, shows and songs from Hollywood.')}
        ${sw('bollywood', 'Bollywood', 'Films, shows and songs from Bollywood.')}</section>

      <section class="set-sec"><h3 class="set-h">Heat</h3>
        ${sw('autoRamp', 'Auto-ramp', 'Heat climbs one level every few cards, up to the highest level you have.')}
        <div class="field" id="rpl" ${st.autoRamp ? '' : 'hidden'}><label>Cards per ramp</label>
          <div class="stepper"><button class="icon-btn" data-step="-1" aria-label="Fewer">−</button><b id="cpr">${st.cardsPerRamp}</b><button class="icon-btn" data-step="1" aria-label="More">+</button></div></div></section>
      ${group ? '' : `
      <section class="set-sec"><h3 class="set-h">Strip Charades</h3>
        <div class="field"><label>Layers each</label>${seg('layers', [[3, '3'], [4, '4'], [5, '5'], [6, '6']])}</div></section>`}

      <button class="btn block" id="save">Let’s play →</button>
    </main>`);
    const notes = { drink: 'Points = sips. Dares can stand in for the sips. Drink responsibly: pace yourselves, keep water on the table, and nobody drives.', water: 'Points = sips of water. Dares can stand in. Same game, no hangover.', dare: 'No drinks. Every penalty is the card’s dare, nothing else.' };
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
      if (k === 'timer') window.Prefs && Prefs.set({ timer: v });
      refreshNote();
    }));
    $$('[data-sw]').forEach((b) => (b.onclick = () => {
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
    };
  },
  // Guests keep it on this device; signed-in accounts get it in their profile stats
  save(s) { window.Stats && Stats.night(s); },
  show(s) {
    const cardsTotal = Object.values(s.cards).reduce((a, b) => a + b, 0);
    const showPaywall = s.limitHit && window.Ent && Ent.tier() !== 'premium';
    App.set('home', `<main class="screen night">
      <p class="night-kicker">That’s a wrap</p>
      <h1 class="night-title">Tonight’s damage</h1>
      <section class="night-taunt"><p>${esc(s.taunt)}</p>${s.tauntFor ? `<span class="note">${esc(s.tauntFor)} · ${s.tauntPts} pts together</span>` : ''}</section>
      <section class="night-grid">
        <div><b>${s.games.length}</b><span>game${s.games.length === 1 ? '' : 's'} played</span></div>
        <div><b>${cardsTotal}</b><span>cards played</span></div>
        <div><b class="h${s.topHeat}">${HEAT[s.topHeat].name}</b><span>highest heat</span></div>
        <div><b>${s.total}</b><span>penalty points</span></div>
      </section>
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
    SFX.play('win'); vibrate([30, 40, 60]);
  },
  // One-tap share: draws the summary onto a canvas and shares the PNG (or downloads it)
  async share(s, btn) {
    try {
      const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 1080, 1350); g.addColorStop(0, '#2a0b1c'); g.addColorStop(1, '#120a12');
      x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
      const rg = x.createRadialGradient(540, 360, 40, 540, 360, 620); rg.addColorStop(0, 'rgba(255,46,99,.45)'); rg.addColorStop(1, 'rgba(255,46,99,0)');
      x.fillStyle = rg; x.fillRect(0, 0, 1080, 1350);
      const font = (w, sz, it) => `${it ? 'italic ' : ''}${w} ${sz}px Inter, system-ui, sans-serif`;
      x.textAlign = 'center'; x.fillStyle = '#ffd166'; x.font = font(800, 40, false); x.fillText('HEAT CHECK', 540, 120);
      x.fillStyle = '#fff'; x.font = font(900, 92, true); x.fillText('Tonight’s damage', 540, 250);
      const wrap = (t, y, w, lh) => { const words = t.split(' '); let line = ''; for (const wd of words) { const tt = line ? line + ' ' + wd : wd; if (x.measureText(tt).width > w && line) { x.fillText(line, 540, y); y += lh; line = wd; } else line = tt; } x.fillText(line, 540, y); return y + lh; };
      x.fillStyle = '#ffe3ec'; x.font = font(600, 46, true); let y = wrap(s.taunt, 370, 900, 60);
      const cardsTotal = Object.values(s.cards).reduce((a, b) => a + b, 0);
      const tiles = [[String(s.games.length), 'games'], [String(cardsTotal), 'cards'], [HEAT[s.topHeat].name, 'top heat'], [String(s.total), 'points']];
      tiles.forEach(([v, l], k) => { const cx = 150 + k * 260; x.fillStyle = '#ffffff14'; x.fillRect(cx - 115, y + 20, 230, 190); x.fillStyle = '#fff'; x.font = font(900, 64, true); x.fillText(v, cx, y + 120); x.fillStyle = '#d9b8c8'; x.font = font(600, 30, false); x.fillText(l, cx, y + 175); });
      y += 290;
      x.font = font(700, 40, false);
      s.players.slice().sort((a, b) => b.pts - a.pts).slice(0, 8).forEach((p) => { x.textAlign = 'left'; x.fillStyle = '#fff'; x.fillText(p.name, 170, y); x.textAlign = 'right'; x.fillStyle = '#ffd166'; x.fillText(p.pts + ' pts', 910, y); y += 62; });
      x.textAlign = 'center'; x.fillStyle = '#d9b8c8'; x.font = font(600, 30, false); x.fillText('heat-check · 18+', 540, 1290);
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
