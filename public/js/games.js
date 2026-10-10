/* Heat Check — the games. Each one owns its theme, flow and sounds. */
const N = (i) => esc(Core.name(i));

function mount(theme, title, body) {
  const app = document.getElementById('app');
  app.dataset.theme = theme;
  Core.cardHeat = 0;
  app.innerHTML = Core.hud(title) + `<main class="screen" id="stage">${body}</main>` + Core.controls();
  Core.updateHud();
  return $('#stage');
}
// Every card shows its heat and penalty points ("Spicy · 2 pts penalty")
const CARD_HOSTS = '.lower-third, .neon-sign, .stage .inner, .arena, .bulb-frame, .mirror, .panel, .playing';
function stageHTML(html) {
  const s = $('#stage'); if (!s) throw new Error('left-game');
  s.innerHTML = html;
  const host = s.querySelector(CARD_HOSTS);
  if (host && !host.querySelector('.pts-tag')) host.insertAdjacentHTML('afterbegin', Core.ptsTag());
  s.style.animation = 'none'; void s.offsetWidth; s.style.animation = '';
  return s;
}
function ctl() { const c = $('#ctl'); if (!c) throw new Error('left-game'); return c; }
// Asks the deck for the next card. null: this tier's limit is reached and the lock sheet is up.
async function deal(game, again) { const c = await Core.next(game, again); if (!$('#stage')) throw new Error('left-game'); return c; }

const Games = {};

/* =========================================================
   1. RED FLAG / GREEN FLAG  — talk-show couples reveal
   One scenario stays on screen until Next (or Chicken Out). The Flags / Rate toggle
   only changes how answers are collected: it never re-deals or re-renders the card.
   ========================================================= */
Games.redflag = {
  title: 'Red Flag / Green Flag', tag: 'Lock in. 3-2-1. Reveal.', mode: 'flags', card: null, token: 0,
  start() { mount('redflag', '🚩 Red Flag / Green Flag 🟢', ''); this.deal(); },
  async deal() {
    Core.stopTimers(); Core.setPrimary(null);
    const card = await deal('redflag', () => this.deal());
    if (!card) return;
    this.card = card;
    const s = stageHTML(`<div class="seg rf-mode" style="margin-bottom:14px">
        <button class="${this.mode === 'flags' ? 'on' : ''}" data-m="flags">🚩 Flags</button>
        <button class="${this.mode === 'rate' ? 'on' : ''}" data-m="rate">⭐ Rate your partner</button></div>
      <div class="lower-third"><span class="tag">● TONIGHT'S SCENARIO</span><div class="prompt">${esc(card.text)}</div></div>
      <div id="answer"></div>`);
    $$('[data-m]', s).forEach((b) => (b.onclick = () => {
      if (this.mode === b.dataset.m || s.dataset.answering) return;
      SFX.play('tap'); this.mode = b.dataset.m;
      $$('[data-m]', s).forEach((x) => x.classList.toggle('on', x === b));
      this.collect();
    }));
    this.collect();
  },
  next() { Core.nextRound(); Core.nextTurn(); this.deal(); },
  // Answer area only. A token makes any async step from the other mode a no-op.
  collect() {
    Core.stopTimers(); Core.setPrimary(null);
    const tok = ++this.token;
    const st = $('#stage'); if (st) delete st.dataset.answering;
    this.mode === 'flags' ? this.flags(tok) : this.rate(tok);
  },
  answer(html) { const a = $('#answer'); if (!a) throw new Error('left-game'); a.innerHTML = html; return a; },
  begin() { const st = $('#stage'); if (st) st.dataset.answering = '1'; $$('.rf-mode button').forEach((b) => (b.disabled = !b.classList.contains('on'))); },
  live(tok) { if (tok !== this.token || !$('#answer')) throw new Error('left-game'); },

  flags(tok) {
    const [A, B] = Core.currentCouple();
    const card = this.card;
    const picks = {};
    Core.setTurn(A);
    Core.onSkip(() => this.next());
    const s = this.answer(`
      <div class="frames">
        <div class="frame active" data-p="${A}"><span class="rec">● REC</span><div class="big">🤔</div><div class="nm">${N(A)}</div></div>
        <div class="frame" data-p="${B}"><span class="rec">● REC</span><div class="big">🤔</div><div class="nm">${N(B)}</div></div>
      </div>
      <p class="center muted" id="instr"><b style="color:#fff">${N(A)}</b>, lock in secretly. ${N(B)}, look away 🙈</p>
      <div class="flagbtns">
        <button class="flagbtn red" data-f="red"><span>🚩</span>RED FLAG</button>
        <button class="flagbtn green" data-f="green"><span>🟢</span>GREEN FLAG</button>
      </div>`);
    let who = A;
    $$('.flagbtn', s).forEach((b) => (b.onclick = async () => {
      SFX.play('tap'); vibrate(20); this.begin();
      picks[who] = b.dataset.f;
      const fr = $(`.frame[data-p="${who}"]`, s);
      fr.classList.remove('active'); fr.classList.add('locked'); $('.big', fr).textContent = '🔒';
      if (who === A) {
        who = B; $(`.frame[data-p="${B}"]`, s).classList.add('active'); Core.setTurn(B);
        $('#instr').innerHTML = `<b style="color:#fff">${N(B)}</b>, your turn. ${N(A)}, eyes off the screen 🙈`;
        return;
      }
      $('.flagbtns', s).remove(); $('#instr').textContent = 'Both locked in. On the count of three…';
      await Core.countdown(3); this.live(tok);
      [A, B].forEach((p) => { const big = $(`.frame[data-p="${p}"] .big`, s); big.textContent = picks[p] === 'red' ? '🚩' : '🟢'; big.classList.add('wave'); $(`.frame[data-p="${p}"]`, s).style.borderColor = picks[p] === 'red' ? '#ff3b4e' : '#3ee08a'; });
      if (picks[A] === picks[B]) {
        SFX.play('applause'); SFX.play('ding');
        $('#instr').outerHTML = `<div class="verdict" style="color:#3ee08a">SAME PAGE 💞</div><p class="center muted">Nobody drinks. Smug kiss optional.</p>`;
        Core.setPrimary('Next scenario →', () => this.next());
      } else {
        SFX.play('buzzer'); vibrate([60, 40, 60]);
        const secs = Core.timerSecs();
        $('#instr').outerHTML = `<div class="verdict" style="color:#ffcf33">DEBATE! 🎤</div>
          <p class="center muted">${secs} seconds. Make your case. The couch decides.</p>
          ${Core.timerRing(secs)}`;
        let ended = false;
        const finish = async () => {
          if (ended) return; ended = true;
          t.stop(); Core.setPrimary(null);
          const loser = await Core.ask('Who lost the debate?', 'Be honest. Or be dramatic.', [{ label: Core.name(A), value: A }, { label: Core.name(B), value: B }]);
          this.live(tok);
          await Core.penalty({ who: loser, card, reason: 'Lost the debate' });
          this.next();
        };
        const t = Core.timer(s, secs, () => { SFX.play('buzzer'); finish(); });
        Core.setPrimary('Debate over', finish);
      }
    }));
  },

  // Same scenario, scored instead: how big a red flag is it, 1 to 10?
  rate(tok) {
    const rater = Core.current(), target = Core.partnerOf(rater);
    const card = this.card;
    Core.setTurn(rater);
    Core.onSkip(() => this.next());
    const pad = () => `<div class="ratepad">${Array.from({ length: 10 }, (_, i) => `<button data-n="${i + 1}">${i + 1}</button>`).join('')}</div>`;
    const s = this.answer(`
      <div class="frames">
        <div class="frame active"><span class="rec">● RATER</span><div class="big" id="r1">?</div><div class="nm">${N(rater)}</div></div>
        <div class="frame"><span class="rec">● GUESSER</span><div class="big" id="r2">?</div><div class="nm">${N(target)}</div></div>
      </div>
      <p class="center muted" id="instr"><b style="color:#fff">${N(rater)}</b>: how big a red flag is this, 1 to 10? Rate it secretly.</p>
      <div id="pad">${pad()}</div>`);
    let step = 0, score, guess;
    $('#pad', s).onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      SFX.play('tap'); this.begin();
      if (step === 0) {
        score = +b.dataset.n; step = 1; $('#r1').textContent = '🔒';
        await Core.handoff(Core.name(target), `Guess the score ${Core.name(rater)} gave this one.`); this.live(tok);
        Core.setTurn(target);
        $('#instr').innerHTML = `<b style="color:#fff">${N(target)}</b>: what did ${N(rater)} give it?`;
        $('#pad').innerHTML = pad();
      } else if (step === 1) {
        guess = +b.dataset.n; step = 2; $('#r2').textContent = '🔒'; $('#pad').innerHTML = '';
        await Core.countdown(3); this.live(tok);
        $('#r1').textContent = score; $('#r2').textContent = guess;
        const diff = Math.abs(score - guess);
        if (diff >= 3) {
          SFX.play('buzzer');
          $('#instr').outerHTML = `<div class="verdict" style="color:#ff3b4e">WAY OFF 😬</div><p class="center muted">${N(rater)} explains the ${score}. ${N(target)} pays for doubting.</p>`;
          await sleep(900); this.live(tok);
          await Core.penalty({ who: target, card, reason: `Off by ${diff}` });
          this.next(); return;
        }
        SFX.play('applause');
        $('#instr').outerHTML = `<div class="verdict" style="color:#3ee08a">${diff === 0 ? 'MIND READER 🔮' : 'CLOSE ENOUGH 👌'}</div><p class="center muted">${N(rater)}, defend that ${score} out loud.</p>`;
        Core.setPrimary('Next scenario →', () => this.next());
      }
    };
  },
};


/* =========================================================
   2. NEVER HAVE I EVER  — neon house party, red cups
   ========================================================= */
Games.nhie = {
  title: 'Never Have I Ever', tag: 'Tilt the cup if you have.', tally: {},
  start() { mount('nhie', 'Never Have I Ever', ''); SFX.play('bass'); this.round(); },
  async round() {
    Core.setPrimary(null);
    const card = await deal('nhie', () => this.round());
    if (!card) return;
    const tilted = new Set();
    Core.setTurn(-1);
    const ps = Core.players();
    const text = card.text.replace(/^never have i ever\s*/i, '');
    const s = stageHTML(`
      <div class="neon-sign"><span class="nh">Never have I ever</span>${esc(text)}</div>
      <p class="center muted" style="margin-top:18px">Done it? Tap your cup. It tips. You sip.</p>
      <div class="cups">${ps.map((p, i) => `
        <button class="cup" data-i="${i}" aria-label="${esc(p.name)}">
          <div class="solo"><div class="rim"></div><div class="ridge" style="top:30%"></div><div class="ridge" style="top:55%"></div><div class="body"></div><div class="liquid"></div></div>
          <div class="who">${esc(p.name)}</div><div class="tally">${this.tally[i] || 0}</div>
        </button>`).join('')}</div>`);
    $$('.cup', s).forEach((c) => (c.onclick = () => {
      const i = +c.dataset.i;
      if (tilted.has(i)) { tilted.delete(i); c.classList.remove('tilted'); this.tally[i]--; SFX.play('tap'); }
      else {
        tilted.add(i); c.classList.add('tilted'); this.tally[i] = (this.tally[i] || 0) + 1; SFX.play('sip'); vibrate(25);
        const f = document.createElement('div'); f.className = 'sips'; f.textContent = `+${pts(card.heat)}`; c.appendChild(f); setTimeout(() => f.remove(), 1100);
      }
      $('.tally', c).textContent = this.tally[i];
    }));
    const next = async () => {
      if (tilted.size) await Core.penalty({ who: [...tilted], card, reason: 'Guilty as charged' });
      else { SFX.play('win'); Core.toast('Saints, all of you. Suspicious.'); }
      Core.nextRound(); this.round();
    };
    Core.setPrimary('Next →', next);
    Core.onSkip(() => { Core.nextRound(); this.round(); });
  },
};

/* =========================================================
   4. STRIP CHARADES  — velvet curtain cabaret
   Only real movies, TV shows and songs. A flop means one item of clothing comes off
   (and the card's penalty points). No dares, no sips, no alternative penalty.
   ========================================================= */
const wordCount = (t) => String(t).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
Games.charades = {
  title: 'Strip Charades', tag: 'Curtain up. Beat the clock.',
  start() { mount('charades', 'Strip Charades', ''); this.round(); },
  async round() {
    Core.stopTimers(); Core.setPrimary(null);
    const actor = Core.current();
    const card = await deal('charades', () => this.round());
    if (!card) return;
    const n = wordCount(card.text), secs = Core.timerSecs();
    Core.setTurn(actor);
    Core.onSkip(() => { Core.nextRound(); Core.nextTurn(); this.round(); });
    const s = stageHTML(`
      <div class="stage" id="st">
        <div class="valance"></div><div class="curtain l"></div><div class="curtain r"></div>
        <div class="inner">
          <div class="marquee">${'<i></i>'.repeat(9)}</div>
          <div class="muted" style="letter-spacing:.3em;font-size:12px;margin-top:8px">NOW PERFORMING</div>
          <h1 class="gold" style="font-size:44px;margin:6px 0 10px">${N(actor)}</h1>
          <div class="ch-chips"><span class="ch-chip">${esc(card.category || 'Title')}</span><span class="ch-chip alt">${esc(card.origin || 'Global')}</span><span class="ch-chip">${n} word${n === 1 ? '' : 's'}</span></div>
          ${Core.timerRing(secs, 'id="tm"')}
          <div class="muted" style="font-size:13px">No words, no sounds. Flop and lose a layer.</div>
        </div>
      </div>
      <div class="spacer"></div>
      <div id="ctl">
        <div class="hold velvet" id="h" style="min-height:150px">
          <div class="cover">Hold to read your secret</div>
          <div class="secret"><div class="heat-badge h${card.heat}b">${esc(card.category || '')} · ${esc(card.origin || '')}</div><p class="prompt" style="font-size:26px;margin:10px 0 0">${esc(card.text)}</p></div>
        </div>
        <div class="spacer"></div>
        <button class="btn block" id="up" disabled>Curtain up! 🎭</button>
      </div>`);
    Core.holdReveal($('#h', s), () => { SFX.play('reveal'); $('#up', s).disabled = false; });
    $('#up', s).onclick = () => {
      SFX.play('drumroll');
      $('#st').classList.add('open');
      ctl().innerHTML = `<div class="col"><button class="btn block" id="got">They got it! 🎉</button><button class="btn block ghost" id="fail">Flop 💀</button></div>`;
      const t = Core.timer($('#tm'), secs, () => { SFX.play('buzzer'); fail(); });
      let ended = false;
      const fail = async () => {
        if (ended) return; ended = true;
        t.stop();
        const left = Core.layersLeft(actor);
        SFX.play('penalty'); vibrate(120);
        const p = pts(card.heat);
        await Core.ask(`${esc(Core.name(actor))} flopped`,
          left > 0 ? `One item of clothing comes off. ${left} layer${left === 1 ? '' : 's'} left. ${esc(ptsLabel(card.heat))}.` : `Out of layers. ${esc(ptsLabel(card.heat))} still counts.`,
          [{ label: left > 0 ? `Done: one item off (+${ptsWord(p)})` : `Next act (+${ptsWord(p)})`, value: 'off' }]);
        if (left > 0) Core.removeLayer(actor);
        Core.addPts(actor, p);
        Core.nextRound(); Core.nextTurn(); this.round();
      };
      $('#got').onclick = () => { if (ended) return; ended = true; t.stop(); SFX.play('cymbal'); SFX.play('applause'); Core.toast(`Standing ovation for ${Core.name(actor)} 👏`); Core.setPrimary('Next act →', () => { Core.nextRound(); Core.nextTurn(); this.round(); }); ctl().innerHTML = `<div class="gold center" style="font-size:38px">BRAVO!</div>`; };
      $('#fail').onclick = () => { SFX.play('wrong'); fail(); };
    };
  },
};


/* =========================================================
   5. WOULD YOU RATHER  — fighting-game VS
   ========================================================= */
Games.wyr = {
  title: 'Would You Rather', tag: 'Red vs Blue. Fight.', mode: null,
  start() {
    if (!this.mode) this.mode = Core.players().length > 2 ? 'vote' : 'couples';
    mount('wyr', 'Would You Rather', ''); this.round();
  },
  arena(card) {
    return `<div class="seg" style="margin-bottom:6px">
        <button class="${this.mode === 'vote' ? 'on' : ''}" data-m="vote">👥 Group vote</button>
        <button class="${this.mode === 'couples' ? 'on' : ''}" data-m="couples">💑 Guess your partner</button></div>
      <div class="arena" id="ar">
        <div class="side a" data-s="a"><div class="tag">PLAYER 1 · RED</div>${esc(card.a)}</div>
        <div class="vs">VS</div>
        <div class="side b" data-s="b"><div class="tag">BLUE · PLAYER 2</div>${esc(card.b)}</div>
      </div>
      <div id="ctl"></div>`;
  },
  async round() {
    Core.stopTimers(); Core.setPrimary(null);
    const card = await deal('wyr', () => this.round());
    if (!card) return;
    if (!card.a) { const m = card.text.replace(/^would you rather\s*/i, '').replace(/\?$/, '').split(/\s+or\s+/i); card.a = m[0]; card.b = m.slice(1).join(' or '); }
    Core.setTurn(-1);
    const s = stageHTML(this.arena(card));
    setTimeout(() => { SFX.play('clash'); $('#ar')?.classList.add('shake'); vibrate(50); }, 450);
    $$('[data-m]', s).forEach((b) => (b.onclick = () => { this.mode = b.dataset.m; SFX.play('tap'); this.round(); }));
    Core.onSkip(() => { Core.nextRound(); this.round(); });
    this.mode === 'vote' ? this.vote(card) : this.couples(card);
  },
  // The talk clock (Timer setting): counts down, then the vote starts on its own. Tap to start early.
  clock(msg, label) {
    return new Promise((resolve) => {
      ctl().innerHTML = `<div class="wyr-clock">${Core.timerRing(Core.timerSecs(), 'id="tm"')}<p class="center muted">${msg}</p></div>
        <button class="btn block" id="go" style="margin-top:12px">${label}</button>`;
      let done = false;
      const go = () => { if (done) return; done = true; t.stop(); resolve(); };
      const t = Core.timer($('#tm'), Core.timerSecs(), () => { SFX.play('buzzer'); go(); });
      $('#go').onclick = () => { SFX.play('tap'); go(); };
    });
  },
  btns(who, label) {
    return `<p class="center muted" style="margin:10px 0 0">${label}</p>
      <div class="vsbtns"><button class="vsbtn a" data-v="a">RED</button><button class="vsbtn b" data-v="b">BLUE</button></div>`;
  },
  pick(who, label) {
    return new Promise((res) => {
      ctl().innerHTML = this.btns(who, label);
      $$('.vsbtn').forEach((b) => (b.onclick = () => { SFX.play('chip'); vibrate(20); res(b.dataset.v); }));
    });
  },
  async vote(card) {
    const ps = Core.players(), votes = {};
    await this.clock('Talk it out. Voting starts when the clock runs out.', 'Start secret vote');
    for (let i = 0; i < ps.length; i++) {
      await Core.handoff(ps[i].name, 'Vote in secret. Then hand it on.');
      Core.setTurn(i);
      votes[i] = await this.pick(i, `<b>${N(i)}</b>, choose your fighter`);
    }
    ctl().innerHTML = '';
    await Core.countdown(3, 'clash');
    const a = Object.keys(votes).filter((k) => votes[k] === 'a').map(Number), b = Object.keys(votes).filter((k) => votes[k] === 'b').map(Number);
    const sa = $('.side.a'), sb = $('.side.b');
    sa.insertAdjacentHTML('beforeend', `<div class="tag" style="margin-top:8px">${a.length} vote${a.length !== 1 ? 's' : ''}: ${a.map(N).join(', ') || '—'}</div>`);
    sb.insertAdjacentHTML('beforeend', `<div class="tag" style="margin-top:8px">${b.length} vote${b.length !== 1 ? 's' : ''}: ${b.map(N).join(', ') || '—'}</div>`);
    ctl().innerHTML = `<div class="hpbars"><div class="hp a"><i style="width:${(a.length / ps.length) * 100}%"></i></div><div class="hp b"><i style="width:${(b.length / ps.length) * 100}%"></i></div></div><div id="res"></div>`;
    let losers = [];
    if (!a.length || !b.length) { $('#res').innerHTML = `<div class="ko">FLAWLESS!</div><p class="center muted">Unanimous. Nobody pays.</p>`; SFX.play('win'); }
    else if (a.length === b.length) { $('#res').innerHTML = `<div class="ko">DOUBLE K.O.</div><p class="center muted">Dead even. Everyone takes 1.</p>`; SFX.play('ko'); losers = 'all'; }
    else {
      losers = a.length < b.length ? a : b; (a.length < b.length ? sa : sb).classList.add('dim'); (a.length < b.length ? sb : sa).classList.add('pick');
      $('#res').innerHTML = `<div class="ko">K.O.!</div><p class="center muted">Minority takes the hit.</p>`; SFX.play('ko');
    }
    await sleep(900);
    if (losers === 'all') await Core.penalty({ who: ps.map((_, i) => i), card, heat: 1, reason: 'Double K.O.' });
    else if (losers.length) await Core.penalty({ who: losers, card, reason: 'Minority' });
    Core.setPrimary('Next round →', () => { Core.nextRound(); Core.nextTurn(); this.round(); });
  },
  async couples(card) {
    const [P, G] = Core.currentCouple();
    await this.clock(`Make your case. ${N(P)} picks when the clock runs out.`, `${N(P)} picks now`);
    await Core.handoff(Core.name(P), 'Pick in secret.');
    Core.setTurn(P);
    const pick = await this.pick(P, `<b>${N(P)}</b>, what would YOU rather?`);
    await Core.handoff(Core.name(G), `Guess what ${Core.name(P)} picked.`);
    Core.setTurn(G);
    const guess = await this.pick(G, `<b>${N(G)}</b>, what did ${N(P)} pick?`);
    ctl().innerHTML = '';
    await Core.countdown(3, 'clash');
    $(`.side.${pick}`).classList.add('pick'); $(`.side.${pick === 'a' ? 'b' : 'a'}`).classList.add('dim');
    if (pick === guess) { ctl().innerHTML = `<div class="ko">PERFECT!</div><p class="center muted">${N(G)} reads ${N(P)} like a book.</p>`; SFX.play('win'); }
    else { ctl().innerHTML = `<div class="ko">K.O.!</div><p class="center muted">Wrong read. ${N(G)} pays.</p>`; SFX.play('ko'); await sleep(800); await Core.penalty({ who: G, card, reason: 'Wrong guess' }); }
    Core.setPrimary('Next round →', () => { Core.nextRound(); Core.nextTurn(); this.round(); });
  },
};

/* =========================================================
   6b. HOT SEAT QUIZ  — game-show stage
   ========================================================= */
Games.hotseat = {
  title: 'Hot Seat Quiz', tag: 'How well do you know them?', streak: 0,
  start() { mount('hotseat', 'Hot Seat Quiz', ''); this.round(); },
  async round() {
    Core.setPrimary(null);
    const seat = Core.current(), guesser = Core.partnerOf(seat);
    const card = await deal('hotseat', () => this.round());
    if (!card) return;
    Core.setTurn(seat);
    Core.onSkip(() => { Core.nextRound(); Core.nextTurn(); this.round(); });
    const s = stageHTML(`
      <div class="seat-name">🔥 In the hot seat: ${N(seat)} 🔥</div>
      <div class="streak" title="Streak">${this.streak}<span style="font-size:16px"> streak</span></div>
      <div class="bulb-frame"><p class="prompt" style="margin:0">${esc(card.text)}</p></div>
      <div class="spacer"></div>
      <div id="ctl"><p class="center muted">${N(seat)} locks in the real answer first.</p>
        <button class="btn block" id="lock">${N(seat)}: lock my answer</button></div>`);
    $('#lock', s).onclick = async () => {
      await Core.handoff(Core.name(seat), `Type your real answer (optional). ${Core.name(guesser)} won't see it until the reveal.`);
      ctl().innerHTML = `<div class="field"><label>Your secret answer</label><input class="input" id="ans" type="password" autocomplete="off" placeholder="Type it, or just remember it"></div>
        <div class="spacer"></div><button class="btn block" id="ok">Locked 🔒</button>`;
      $('#ans').focus();
      $('#ok').onclick = async () => {
        const ans = $('#ans').value.trim();
        await Core.handoff(Core.name(guesser), 'Say your guess out loud.');
        Core.setTurn(guesser);
        ctl().innerHTML = `<p class="center" style="font-size:18px"><b>${N(guesser)}</b>, say your answer out loud. Final answer?</p>
          <button class="btn block alt" id="rv">Reveal 🎺</button>`;
        $('#rv').onclick = () => {
          SFX.play('reveal');
          ctl().innerHTML = `${ans ? `<div class="card center" style="margin-bottom:14px"><div class="muted" style="font-size:12px;letter-spacing:.2em">THE REAL ANSWER</div><div class="prompt">${esc(ans)}</div></div>` : ''}
            <p class="center muted">${N(seat)}, were they right?</p>
            <div class="col"><button class="btn block" id="y">Correct ✅</button><button class="btn block ghost" id="n">Wrong ❌</button></div>`;
          $('#y').onclick = () => { SFX.play('correct'); this.streak++; Core.toast(`${this.streak} in a row 🔥`); Core.nextRound(); Core.nextTurn(); this.round(); };
          $('#n').onclick = async () => { SFX.play('wrong'); this.streak = 0; await Core.penalty({ who: guesser, card, reason: "Didn't know that one" }); Core.nextRound(); Core.nextTurn(); this.round(); };
        };
      };
    };
  },
};

/* =========================================================
   6d. SWAP ROUNDS  — chrome mirror, answer as each other
   ========================================================= */
Games.swap = {
  title: 'Swap Rounds', tag: 'Answer as your partner.',
  start() { mount('swap', 'Swap Rounds', ''); SFX.play('shimmer'); this.round(); },
  async round() {
    Core.setPrimary(null);
    const me = Core.current(), them = Core.partnerOf(me);
    const card = await deal('swap', () => this.round());
    if (!card) return;
    Core.setTurn(me);
    Core.onSkip(() => { Core.nextRound(); Core.nextTurn(); this.round(); });
    const s = stageHTML(`
      <div class="swapnames"><span>${N(me)}</span><span class="arrow">⇄</span><span>${N(them)}</span></div>
      <div class="reflect" data-t="YOU ARE NOW ${esc(Core.name(them).toUpperCase())}">YOU ARE NOW ${esc(Core.name(them).toUpperCase())}</div>
      <div class="spacer"></div>
      <div class="mirror"><div><p class="prompt" style="margin:0">${esc(card.text)}</p></div></div>
      <p class="center muted" style="margin-top:16px">${N(me)} answers in character: their voice, their gestures, their excuses. ${N(them)} judges.</p>
      <div class="col">
        <button class="btn block" id="y">${N(them)}: "That's so me" 💯</button>
        <button class="btn block ghost" id="n">${N(them)}: "I would NEVER" 🙄</button>
      </div>`);
    $('#y', s).onclick = () => { SFX.play('shimmer'); Core.toast('Perfect impression ✨'); Core.nextRound(); Core.nextTurn(); this.round(); };
    $('#n', s).onclick = async () => { SFX.play('wrong'); await Core.penalty({ who: me, card, reason: 'Bad impression' }); Core.nextRound(); Core.nextTurn(); this.round(); };
  },
};

/* =========================================================
   GROUPS: no couples, no pairing, no dares. Everyone plays for themselves.
   Penalties are heat points shown as sips (or water).
   ========================================================= */
const voteSeg = (cur, opts) => `<div class="seg vote-seg" style="margin-bottom:12px">${opts.map(([v, l]) => `<button data-v="${v}" class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;

/* 6a. WHO'S MOST LIKELY TO  — pop-art comic. Point on 3, or a secret vote. */
Games.mostlikely = {
  title: "Who's Most Likely To", tag: '3… 2… 1… POINT!', vote: 'point', card: null, token: 0,
  start() { mount('mostlikely', "WHO'S MOST LIKELY TO", ''); this.deal(); },
  async deal() {
    Core.stopTimers(); Core.setPrimary(null);
    const card = await deal('mostlikely', () => this.deal());
    if (!card) return;
    this.card = card;
    Core.setTurn(-1);
    Core.onSkip(() => this.next());
    const text = card.text.replace(/^who'?s most likely to\s*/i, '').replace(/\?\s*$/, '');
    const s = stageHTML(`${voteSeg(this.vote, [['point', '👉 Point on 3'], ['secret', '🤫 Secret vote']])}
      <div class="panel"><span class="cap">WHO'S MOST LIKELY TO…</span><div class="bubble">${esc(text)}?</div></div>
      <div class="ml-clock">${Core.timerRing(Core.timerSecs(), 'id="tm"')}<p class="note">Argue it out. When the clock runs out, everyone votes.</p></div>
      <div class="spacer"></div><div id="ctl"></div>`);
    this.clock = Core.timer($('#tm', s), Core.timerSecs(), () => { SFX.play('buzzer'); const b = $('.controls .primary'); if (b && !b.hidden && !s.dataset.answering) b.click(); });
    $$('.vote-seg button', s).forEach((b) => (b.onclick = () => {
      if (b.classList.contains('on') || s.dataset.answering) return;
      SFX.play('tap'); this.vote = b.dataset.v;
      $$('.vote-seg button', s).forEach((x) => x.classList.toggle('on', x === b));
      this.collect();
    }));
    this.collect();
  },
  next() { Core.nextRound(); Core.nextTurn(); this.deal(); },
  collect() { Core.setPrimary(null); const tok = ++this.token; this.vote === 'point' ? this.point(tok) : this.secret(tok); },
  begin() { const st = $('#stage'); if (st) st.dataset.answering = '1'; if (this.clock) this.clock.stop(); $$('.vote-seg button').forEach((b) => (b.disabled = !b.classList.contains('on'))); },
  live(tok) { if (tok !== this.token || !$('#ctl')) throw new Error('left-game'); },
  point(tok) {
    ctl().innerHTML = '<p class="center muted">On zero, everyone points at the guilty one.</p>';
    Core.setPrimary('Countdown!', async () => {
      this.begin(); Core.setPrimary(null);
      await Core.countdown(3, 'count'); this.live(tok);
      SFX.play('boing'); vibrate([30, 30, 30]);
      const picked = new Set();
      ctl().innerHTML = `<div class="pow">POINT!</div><p class="center muted">Who got the most fingers? Tap everyone tied for most.</p>
        <div class="who-grid">${Core.players().map((p, i) => `<button data-i="${i}">${esc(p.name)}</button>`).join('')}</div>
        <div class="spacer"></div><button class="btn block" id="ok" disabled>That’s the verdict</button>`;
      $$('.who-grid button').forEach((b) => (b.onclick = () => {
        SFX.play('tap'); const i = +b.dataset.i;
        picked.has(i) ? picked.delete(i) : picked.add(i);
        b.classList.toggle('on', picked.has(i)); $('#ok').disabled = !picked.size;
      }));
      $('#ok').onclick = () => this.verdict([...picked], tok);
    });
  },
  secret(tok) {
    const ps = Core.players();
    ctl().innerHTML = `<p class="center muted">Hand the phone around. Everyone votes in secret, then the tally drops.</p>`;
    Core.setPrimary('Start the vote', async () => {
      this.begin(); Core.setPrimary(null);
      const tally = ps.map(() => 0);
      for (let v = 0; v < ps.length; v++) {
        await Core.handoff(ps[v].name, 'Vote in secret. Everyone else look away.'); this.live(tok);
        const choice = await new Promise((resolve) => {
          ctl().innerHTML = `<p class="center"><b>${esc(ps[v].name)}</b>, who’s most likely?</p>
            <div class="who-grid">${ps.map((p, i) => `<button data-i="${i}">${esc(p.name)}</button>`).join('')}</div>`;
          $$('.who-grid button').forEach((b) => (b.onclick = () => { SFX.play('tap'); vibrate(15); resolve(+b.dataset.i); }));
        });
        this.live(tok);
        tally[choice]++;
        ctl().innerHTML = '<p class="center muted">Vote locked 🔒</p>';
      }
      const max = Math.max(...tally), winners = tally.map((n, i) => (n === max ? i : -1)).filter((i) => i >= 0);
      ctl().innerHTML = '<p class="center muted">And the votes say…</p>';
      SFX.play('drumroll'); await sleep(1100); this.live(tok);
      const order = ps.map((p, i) => ({ i, n: tally[i] })).sort((a, b) => b.n - a.n);
      ctl().innerHTML = `<div class="tally">${order.map(({ i, n }) => `<div class="tally-row ${n === max ? 'top' : ''}"><span>${esc(ps[i].name)}</span><i style="--w:${max ? n / max : 0}"></i><b>${n}</b></div>`).join('')}</div>`;
      SFX.play('cymbal');
      Core.setPrimary(winners.length > 1 ? 'Tie: they share it →' : 'Take the penalty →', () => this.verdict(winners, tok));
    });
  },
  async verdict(who, tok) {
    this.live(tok); Core.setPrimary(null);
    who.forEach((i) => { const n = Core.name(i); Core.S.named[n] = (Core.S.named[n] || 0) + 1; });
    Core.save();
    await Core.penalty({ who, card: this.card, reason: who.length > 1 ? 'Tied: you share it' : `Named ${Core.S.named[Core.name(who[0])]}× tonight` });
    this.next();
  },
};

/* 6c. TWO TRUTHS & A LIE  — casino felt. Tell, vote, reveal, rotate. */
Games.twotruths = {
  title: 'Two Truths & a Lie', tag: 'Read the table.', vote: 'secret', card: null, token: 0,
  start() { mount('twotruths', 'Two Truths & a Lie', ''); this.deal(); },
  async deal() {
    Core.stopTimers(); Core.setPrimary(null);
    const teller = Core.current();
    const card = await deal('twotruths', () => this.deal());
    if (!card) return;
    this.card = card;
    const tok = ++this.token;
    Core.setTurn(teller);
    Core.onSkip(() => this.next());
    SFX.play('chip');
    const topic = card.text.replace(/^two truths and a lie about\s*/i, '');
    const s = stageHTML(`
      <p class="center muted" style="letter-spacing:.2em;font-size:12px">THE DEALER CALLS</p>
      <h2 class="center" style="font-size:34px;margin:4px 0 12px">${N(teller)}</h2>
      <div class="playing" data-suit="${rand(['♥', '♦', '♠', '♣'])}"><span class="cap">Two truths and a lie about…</span><p class="prompt" style="margin:6px 0 0">${esc(topic)}</p></div>
      ${Core.timerRing(Core.timerSecs(), 'id="tm"')}
      <p class="center muted">${N(teller)} tells three: #1, #2, #3. Two true, one lie.</p>
      ${voteSeg(this.vote, [['secret', '🤫 Secret vote'], ['fingers', '✋ Fingers on 3']])}
      <div id="ctl"></div>`);
    $$('.vote-seg button', s).forEach((b) => (b.onclick = () => {
      if (b.classList.contains('on') || s.dataset.voting) return;
      SFX.play('tap'); this.vote = b.dataset.v; $$('.vote-seg button', s).forEach((x) => x.classList.toggle('on', x === b));
    }));
    let t = null;
    const toVote = () => { if (t) t.stop(); Core.setPrimary(null); this.collect(teller, tok); };
    Core.setPrimary(`Start the ${Core.timerSecs()}s clock`, () => {
      t = Core.timer($('#tm'), Core.timerSecs(), () => { SFX.play('buzzer'); toVote(); });
      Core.setPrimary('Done telling → vote', toVote);
    });
  },
  next() { Core.nextRound(); Core.nextTurn(); this.deal(); },
  live(tok) { if (tok !== this.token || !$('#ctl')) throw new Error('left-game'); },
  async collect(teller, tok) {
    const st = $('#stage'); if (st) st.dataset.voting = '1';
    $$('.vote-seg button').forEach((b) => (b.disabled = !b.classList.contains('on')));
    const ps = Core.players(), voters = ps.map((_, i) => i).filter((i) => i !== teller);
    const guesses = {};
    const chips = '<div class="chips3"><button data-c="1">#1</button><button data-c="2">#2</button><button data-c="3">#3</button></div>';
    if (this.vote === 'secret') {
      for (const v of voters) {
        await Core.handoff(ps[v].name, 'Which one was the lie? Vote in secret.'); this.live(tok);
        guesses[v] = await new Promise((resolve) => {
          ctl().innerHTML = `<p class="center"><b>${esc(ps[v].name)}</b>, the lie was…</p>${chips}`;
          $$('.chips3 button').forEach((b) => (b.onclick = () => { SFX.play('chip'); vibrate(15); resolve(+b.dataset.c); }));
        });
        this.live(tok);
        ctl().innerHTML = '<p class="center muted">Vote locked 🔒</p>';
      }
    } else {
      await Core.countdown(3, 'count'); this.live(tok);
      SFX.play('boing');
      await new Promise((resolve) => {
        ctl().innerHTML = `<p class="center muted">Everyone shows 1, 2 or 3 fingers. Tap what each player showed.</p>
          <div class="finger-rows">${voters.map((v) => `<div class="finger-row" data-v="${v}"><span>${esc(ps[v].name)}</span>${[1, 2, 3].map((c) => `<button data-c="${c}">${c}</button>`).join('')}</div>`).join('')}</div>
          <div class="spacer"></div><button class="btn block" id="ok" disabled>Lock the votes</button>`;
        $$('.finger-row').forEach((row) => row.addEventListener('click', (e) => {
          const b = e.target.closest('button'); if (!b) return;
          SFX.play('chip'); guesses[+row.dataset.v] = +b.dataset.c;
          $$('button', row).forEach((x) => x.classList.toggle('on', x === b));
          $('#ok').disabled = voters.some((v) => !guesses[v]);
        }));
        $('#ok').onclick = resolve;
      });
      this.live(tok);
    }
    await Core.handoff(ps[teller].name, 'Time to come clean. Only you tap.'); this.live(tok);
    const lie = await new Promise((resolve) => {
      ctl().innerHTML = `<p class="center"><b>${esc(ps[teller].name)}</b>, which one was the lie?</p>${chips}`;
      $$('.chips3 button').forEach((b) => (b.onclick = () => { SFX.play('reveal'); resolve(+b.dataset.c); }));
    });
    this.live(tok);
    const fooled = voters.filter((v) => guesses[v] !== lie);
    ctl().innerHTML = `<div class="verdict" style="color:${fooled.length ? '#ffcf33' : '#3ee08a'}">${fooled.length ? `FOOLED ${fooled.length} 😈` : 'BUSTED 🃏'}</div>
      <p class="center muted">The lie was #${lie}.</p>`;
    await sleep(700); this.live(tok);
    if (fooled.length) await Core.penalty({ who: fooled, card: this.card, reason: `${Core.name(teller)} fooled you` });
    else await Core.penalty({ who: teller, card: this.card, reason: 'Nobody was fooled' });
    this.next();
  },
};

