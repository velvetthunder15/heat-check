/* Heat Check — the games. Each one owns its theme, flow and sounds. */
const N = (i) => esc(Core.name(i));

function mount(theme, title, body, passInfo = '') {
  const app = document.getElementById('app');
  app.dataset.theme = theme;
  app.innerHTML = Core.hud(title) + `<main class="screen" id="stage">${body}</main>` + Core.controls(passInfo);
  Core.updateHud();
  return $('#stage');
}
function stageHTML(html) { const s = $('#stage'); if (!s) throw new Error('left-game'); s.innerHTML = html; s.style.animation = 'none'; void s.offsetWidth; s.style.animation = ''; return s; }
function ctl() { const c = $('#ctl'); if (!c) throw new Error('left-game'); return c; }
function passCost(card) { return Core.isFreePass(card) ? 'free' : '+1'; }

const Games = {};

/* =========================================================
   1. RED FLAG / GREEN FLAG  — talk-show couples reveal
   ========================================================= */
Games.redflag = {
  title: 'Red Flag / Green Flag', tag: 'Lock in. 3-2-1. Reveal.', mode: 'flags',
  start() { mount('redflag', '🚩 Red Flag / Green Flag 🟢', ''); this.round(); },
  modeSwitch() {
    return `<div class="seg" style="margin-bottom:14px">
      <button class="${this.mode === 'flags' ? 'on' : ''}" data-m="flags">🚩 Flags</button>
      <button class="${this.mode === 'rate' ? 'on' : ''}" data-m="rate">⭐ Rate your partner</button></div>`;
  },
  bindMode(s) { $$('[data-m]', s).forEach((b) => (b.onclick = () => { SFX.play('tap'); this.mode = b.dataset.m; this.round(); })); },
  round() {
    Core.stopTimers();
    this.mode === 'flags' ? this.flags() : this.rate();
  },

  flags() {
    const [A, B] = Core.currentCouple();
    const card = Core.draw('redflag');
    const picks = {};
    Core.setTurn(A); Core.setPrimary(null); Core.setPassInfo(passCost(card));
    const s = stageHTML(`${this.modeSwitch()}
      <div class="lower-third"><span class="tag">● TONIGHT'S SCENARIO</span><div class="prompt">${esc(card.text)}</div></div>
      <div class="frames">
        <div class="frame active" data-p="${A}"><span class="rec">● REC</span><div class="big">🤔</div><div class="nm">${N(A)}</div></div>
        <div class="frame" data-p="${B}"><span class="rec">● REC</span><div class="big">🤔</div><div class="nm">${N(B)}</div></div>
      </div>
      <p class="center muted" id="instr"><b style="color:#fff">${N(A)}</b>, lock in secretly. ${N(B)}, look away 🙈</p>
      <div class="flagbtns">
        <button class="flagbtn red" data-f="red"><span>🚩</span>RED FLAG</button>
        <button class="flagbtn green" data-f="green"><span>🟢</span>GREEN FLAG</button>
      </div>`);
    this.bindMode(s);
    let who = A;
    Core.onPass(() => { Core.doPass(card, A); Core.nextRound(); Core.nextTurn(); this.round(); });
    $$('.flagbtn', s).forEach((b) => (b.onclick = async () => {
      SFX.play('tap'); vibrate(20);
      picks[who] = b.dataset.f;
      const fr = $(`.frame[data-p="${who}"]`, s);
      fr.classList.remove('active'); fr.classList.add('locked'); $('.big', fr).textContent = '🔒';
      if (who === A) {
        who = B; $(`.frame[data-p="${B}"]`, s).classList.add('active'); Core.setTurn(B);
        $('#instr').innerHTML = `<b style="color:#fff">${N(B)}</b>, your turn. ${N(A)}, eyes off the screen 🙈`;
        return;
      }
      $('.flagbtns', s).remove(); $('#instr').textContent = 'Both locked in. On the count of three…';
      await Core.countdown(3);
      [A, B].forEach((p) => { const big = $(`.frame[data-p="${p}"] .big`, s); big.textContent = picks[p] === 'red' ? '🚩' : '🟢'; big.classList.add('wave'); $(`.frame[data-p="${p}"]`, s).style.borderColor = picks[p] === 'red' ? '#ff3b4e' : '#3ee08a'; });
      if (picks[A] === picks[B]) {
        SFX.play('applause'); SFX.play('ding');
        $('#instr').outerHTML = `<div class="verdict" style="color:#3ee08a">SAME PAGE 💞</div><p class="center muted">Nobody drinks. Smug kiss optional.</p>`;
        Core.setPrimary('Next scenario →', () => { Core.nextRound(); Core.nextTurn(); this.round(); });
      } else {
        SFX.play('buzzer'); vibrate([60, 40, 60]);
        $('#instr').outerHTML = `<div class="verdict" style="color:#ffcf33">DEBATE! 🎤</div>
          <p class="center muted">30 seconds. Make your case. The couch decides.</p>
          <div class="timer"><span>30</span></div>`;
        let ended = false;
        const finish = async () => {
          if (ended) return; ended = true;
          t.stop(); Core.setPrimary(null);
          const loser = await Core.ask('Who lost the debate?', 'Be honest. Or be dramatic.', [{ label: Core.name(A), value: A }, { label: Core.name(B), value: B }]);
          await Core.penalty({ who: loser, card, reason: 'Lost the debate' });
          Core.nextRound(); Core.nextTurn(); this.round();
        };
        const t = Core.timer(s, 30, () => { SFX.play('buzzer'); finish(); });
        Core.setPrimary('Debate over', finish);
      }
    }));
  },

  rate() {
    const rater = Core.current(), target = Core.partnerOf(rater);
    const card = Core.draw('rate');
    Core.setTurn(rater); Core.setPrimary(null); Core.setPassInfo(passCost(card));
    Core.onPass(() => { Core.doPass(card, rater); Core.nextRound(); Core.nextTurn(); this.round(); });
    const pad = () => `<div class="ratepad">${Array.from({ length: 10 }, (_, i) => `<button data-n="${i + 1}">${i + 1}</button>`).join('')}</div>`;
    const s = stageHTML(`${this.modeSwitch()}
      <div class="lower-third"><span class="tag">● RATE YOUR PARTNER</span><div class="prompt">${esc(card.text)}</div></div>
      <div class="frames">
        <div class="frame active"><span class="rec">● RATER</span><div class="big" id="r1">?</div><div class="nm">${N(rater)}</div></div>
        <div class="frame"><span class="rec">● GUESSER</span><div class="big" id="r2">?</div><div class="nm">${N(target)}</div></div>
      </div>
      <p class="center muted" id="instr"><b style="color:#fff">${N(rater)}</b>: rate ${N(target)} out of 10, secretly.</p>
      <div id="pad">${pad()}</div>`);
    this.bindMode(s);
    let step = 0, score, guess;
    $('#pad', s).onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      SFX.play('tap');
      if (step === 0) {
        score = +b.dataset.n; step = 1; $('#r1').textContent = '🔒';
        await Core.handoff(Core.name(target), `Guess the score ${Core.name(rater)} gave you.`);
        Core.setTurn(target);
        $('#instr').innerHTML = `<b style="color:#fff">${N(target)}</b>: what did ${N(rater)} give you?`;
        $('#pad').innerHTML = pad();
      } else if (step === 1) {
        guess = +b.dataset.n; step = 2; $('#r2').textContent = '🔒'; $('#pad').innerHTML = '';
        await Core.countdown(3);
        $('#r1').textContent = score; $('#r2').textContent = guess;
        const diff = Math.abs(score - guess);
        if (diff >= 3) {
          SFX.play('buzzer');
          $('#instr').outerHTML = `<div class="verdict" style="color:#ff3b4e">WAY OFF 😬</div><p class="center muted">${N(rater)} explains the ${score}. ${N(target)} pays for doubting.</p>`;
          await sleep(900);
          await Core.penalty({ who: target, card, reason: `Off by ${diff}` });
        } else {
          SFX.play('applause');
          $('#instr').outerHTML = `<div class="verdict" style="color:#3ee08a">${diff === 0 ? 'MIND READER 🔮' : 'CLOSE ENOUGH 👌'}</div><p class="center muted">${N(rater)}, defend that ${score} out loud.</p>`;
        }
        Core.setPrimary('Next →', () => { Core.nextRound(); Core.nextTurn(); this.round(); });
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
  round() {
    const card = Core.draw('nhie');
    const tilted = new Set();
    Core.setTurn(-1); Core.setPassInfo('free');
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
        const f = document.createElement('div'); f.className = 'sips'; f.textContent = `+${card.heat}`; c.appendChild(f); setTimeout(() => f.remove(), 1100);
      }
      $('.tally', c).textContent = this.tally[i];
    }));
    const next = async () => {
      if (tilted.size) await Core.penalty({ who: [...tilted], card, reason: 'Guilty as charged' });
      else { SFX.play('win'); Core.toast('Saints, all of you. Suspicious.'); }
      Core.nextRound(); this.round();
    };
    Core.setPrimary('Next →', next);
    Core.onPass(() => { Core.doPass(card, -1); Core.nextRound(); this.round(); });
  },
};

/* =========================================================
   3. GUESS THE BODY PART  — noir, blindfold, spotlight
   ========================================================= */
const ZONES = {
  forehead: [60, 16, 'Forehead'], eyelids: [60, 24, 'Eyelids'], ear: [44, 27, 'Ear'], cheek: [52, 32, 'Cheek'], lips: [60, 36, 'Lips'], jaw: [66, 40, 'Jawline'],
  neck: [60, 50, 'Neck'], nape: [60, 47, 'Nape of the neck', 1], collarbone: [60, 60, 'Collarbone'], shoulder: [37, 63, 'Shoulder'], upperarm: [29, 84, 'Upper arm'],
  elbow: [24, 104, 'Inner elbow'], wrist: [19, 134, 'Wrist'], palm: [17, 146, 'Palm'], fingers: [15, 158, 'Fingertips'], upperback: [60, 78, 'Upper back', 1],
  lowerback: [60, 124, 'Lower back', 1], waist: [76, 112, 'Waist'], hip: [43, 140, 'Hip'], thigh: [47, 176, 'Thigh (over clothes)'], knee: [47, 206, 'Knee'],
  calf: [47, 234, 'Calf', 1], ankle: [47, 268, 'Ankle'], foot: [47, 284, 'Foot'],
};
function bodyMap(zone) {
  const z = ZONES[zone] || ZONES.palm;
  return `<svg class="bodymap" viewBox="0 0 120 300" aria-label="Body map: ${z[2]}">
    <g class="sil">
      <circle cx="60" cy="27" r="15"/>
      <rect x="54" y="40" width="12" height="14" rx="4"/>
      <path d="M36 56 Q60 50 84 56 L82 118 Q86 138 80 150 L40 150 Q34 138 38 118 Z"/>
      <path d="M37 58 L23 108 L15 150 L22 153 L31 112 L44 76 Z"/>
      <path d="M83 58 L97 108 L105 150 L98 153 L89 112 L76 76 Z"/>
      <path d="M41 148 L40 282 L54 282 L59 152 Z"/>
      <path d="M61 152 L66 282 L80 282 L79 148 Z"/>
      <ellipse cx="45" cy="287" rx="10" ry="5"/><ellipse cx="75" cy="287" rx="10" ry="5"/>
    </g>
    <circle class="hot" cx="${z[0]}" cy="${z[1]}" r="9"/>
  </svg>`;
}
Games.bodypart = {
  title: 'Guess the Body Part', tag: 'Blindfold on. Lights low.', caseNo: 1,
  start() {
    mount('bodypart', 'Guess the Body Part', '', 'free');
    SFX.play('sax');
    this.round();
  },
  round() {
    const toucher = Core.current(), guesser = Core.partnerOf(toucher);
    const card = Core.draw('bodypart');
    const z = ZONES[card.zone] || ZONES.palm;
    Core.setTurn(toucher); Core.setPassInfo('free'); Core.setPrimary(null);
    Core.onPass(() => { Core.toast('Passed — no questions asked'); Core.nextRound(); Core.nextTurn(); this.round(); });
    const s = stageHTML(`
      <div class="spotlight"></div>
      <div class="noir-title" style="margin:8px 0 14px">Case No. ${String(this.caseNo).padStart(3, '0')}</div>
      <div class="casefile">
        <p style="margin:0 0 6px">THE SUSPECT: <b>${N(guesser)}</b></p>
        <p style="margin:0">THE HANDS: <b>${N(toucher)}</b></p>
      </div>
      <div class="spacer"></div>
      <p class="prompt center">${N(guesser)}, put the blindfold on.</p>
      <p class="center muted">No peeking. ${N(toucher)} gets the orders.</p>
      <div class="spacer"></div>
      <button class="btn block" id="bf">Blindfold's on 🕶</button>`);
    $('#bf', s).onclick = () => { SFX.play('heartbeat'); this.orders(card, z, toucher, guesser); };
  },
  orders(card, z, toucher, guesser) {
    const s = stageHTML(`
      <div class="spotlight"></div>
      <p class="center muted" style="margin:6px 0 12px">${N(toucher)}, eyes only.</p>
      <div class="hold noir" id="h">
        <div class="cover">Hold to read your orders<br><small class="muted" style="font-family:'Special Elite'">release to hide</small></div>
        <div class="secret">
          ${bodyMap(card.zone)}
          <div class="heat-badge h${card.heat}b" style="margin-top:10px">${z[2]}${z[3] ? ' · back' : ''}</div>
          <p class="prompt" style="font-size:22px;margin:12px 0 0">${esc(card.text)}</p>
        </div>
      </div>
      <div class="spacer"></div>
      <button class="btn block" id="go" disabled>Done — make them guess</button>
      <p class="note center" style="margin-top:12px">Clothed, gentle, and stop the second anyone says so.</p>`);
    Core.holdReveal($('#h', s), () => { SFX.play('reveal'); $('#go', s).disabled = false; });
    $('#go', s).onclick = () => this.verdict(card, z, toucher, guesser);
  },
  verdict(card, z, toucher, guesser) {
    SFX.play('heartbeat');
    const s = stageHTML(`
      <div class="noir-title" style="margin:10px 0">The interrogation.</div>
      <p class="prompt center">${N(guesser)}, where were you touched?</p>
      <p class="center muted">Blindfold off after the answer.</p>
      <div class="spacer"></div>
      <div class="col">
        <button class="btn block" id="yes">Nailed it 🎯</button>
        <button class="btn block ghost" id="no">Wrong guess</button>
      </div>`);
    const done = () => { this.caseNo++; Core.nextRound(); Core.nextTurn(); this.round(); };
    $('#yes', s).onclick = () => { SFX.play('correct'); Core.toast(`Case closed: ${z[2]}`); done(); };
    $('#no', s).onclick = async () => {
      SFX.play('wrong');
      await Core.penalty({ who: guesser, card, reason: `It was the ${z[2].toLowerCase()}` });
      done();
    };
  },
};

/* =========================================================
   4. STRIP CHARADES  — velvet curtain cabaret
   ========================================================= */
Games.charades = {
  title: 'Strip Charades', tag: 'Curtain up. 60 seconds.',
  start() { mount('charades', 'Strip Charades', '', 'free'); this.round(); },
  round() {
    Core.stopTimers();
    const actor = Core.current();
    const card = Core.draw('charades');
    Core.setTurn(actor); Core.setPassInfo('free'); Core.setPrimary(null);
    Core.onPass(() => { Core.stopTimers(); Core.toast('Passed — no questions asked'); Core.nextRound(); Core.nextTurn(); this.round(); });
    const s = stageHTML(`
      <div class="stage" id="st">
        <div class="valance"></div><div class="curtain l"></div><div class="curtain r"></div>
        <div class="inner">
          <div class="marquee">${'<i></i>'.repeat(9)}</div>
          <div class="muted" style="letter-spacing:.3em;font-size:12px;margin-top:8px">NOW PERFORMING</div>
          <h1 class="gold" style="font-size:44px;margin:6px 0 14px">${N(actor)}</h1>
          <div class="timer" id="tm" style="--p:1"><span>60</span></div>
          <div class="muted" style="font-size:13px">${esc(card.category || 'Charade')} · no words, no sounds</div>
        </div>
      </div>
      <div class="spacer"></div>
      <div id="ctl">
        <div class="hold velvet" id="h" style="min-height:150px">
          <div class="cover">Hold to read your secret</div>
          <div class="secret"><div class="heat-badge h${card.heat}b">${esc(card.category || '')}</div><p class="prompt" style="font-size:26px;margin:10px 0 0">${esc(card.text)}</p></div>
        </div>
        <div class="spacer"></div>
        <button class="btn block" id="up" disabled>Curtain up! 🎭</button>
      </div>`);
    Core.holdReveal($('#h', s), () => { SFX.play('reveal'); $('#up', s).disabled = false; });
    $('#up', s).onclick = () => {
      SFX.play('drumroll');
      $('#st').classList.add('open');
      ctl().innerHTML = `<div class="col"><button class="btn block" id="got">They got it! 🎉</button><button class="btn block ghost" id="fail">Fail 💀</button></div>`;
      const t = Core.timer($('#tm'), 60, () => { SFX.play('buzzer'); fail(); });
      let ended = false;
      const fail = async () => {
        if (ended) return; ended = true;
        t.stop();
        const extra = [];
        const canStrip = Core.S.settings.strip && Core.layersLeft(actor) > 0;
        if (canStrip) extra.push({ label: `Remove one item 👗 (${Core.layersLeft(actor)} left)`, cls: 'alt', fn: () => Core.removeLayer(actor) });
        await Core.penalty({ who: actor, card, reason: canStrip ? 'Strip, sip, or do the dare' : 'Sip or do the dare', extra });
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
  round() {
    Core.stopTimers();
    const card = Core.draw('wyr');
    if (!card.a) { const m = card.text.replace(/^would you rather\s*/i, '').replace(/\?$/, '').split(/\s+or\s+/i); card.a = m[0]; card.b = m.slice(1).join(' or '); }
    Core.setPrimary(null); Core.setPassInfo('free');
    const s = stageHTML(this.arena(card));
    setTimeout(() => { SFX.play('clash'); $('#ar')?.classList.add('shake'); vibrate(50); }, 450);
    $$('[data-m]', s).forEach((b) => (b.onclick = () => { this.mode = b.dataset.m; SFX.play('tap'); this.round(); }));
    Core.onPass(() => { Core.doPass(card, -1); Core.nextRound(); this.round(); });
    this.mode === 'vote' ? this.vote(card) : this.couples(card);
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
    ctl().innerHTML = `<button class="btn block" id="go" style="margin-top:12px">Start secret vote</button>`;
    await new Promise((r) => ($('#go').onclick = r));
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
    ctl().innerHTML = `<button class="btn block" id="go" style="margin-top:12px">${N(P)} picks first</button>`;
    await new Promise((r) => ($('#go').onclick = r));
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
   6a. WHO'S MOST LIKELY TO  — pop-art comic
   ========================================================= */
Games.mostlikely = {
  title: "Who's Most Likely To", tag: '3… 2… 1… POINT!',
  start() { mount('mostlikely', "WHO'S MOST LIKELY TO", ''); this.round(); },
  round() {
    const card = Core.draw('mostlikely');
    Core.setTurn(-1); Core.setPassInfo('free');
    const text = card.text.replace(/^who'?s most likely to\s*/i, '');
    const s = stageHTML(`
      <div class="spacer"></div>
      <div class="panel"><span class="cap">WHO'S MOST LIKELY TO…</span><div class="bubble">${esc(text)}</div></div>
      <div class="spacer"></div><div id="ctl"><p class="center muted">On zero, everyone points at the guilty party.</p></div>`);
    Core.onPass(() => { Core.doPass(card, -1); Core.nextRound(); this.round(); });
    Core.setPrimary('Countdown!', async () => {
      Core.setPrimary(null);
      await Core.countdown(3, 'count');
      SFX.play('boing'); vibrate([30, 30, 30]);
      ctl().innerHTML = `<div class="pow">POINT!</div><p class="center muted">Who got the most fingers?</p>
        <div class="who-grid">${Core.players().map((p, i) => `<button data-i="${i}">${esc(p.name)}</button>`).join('')}</div>
        <div class="spacer"></div><button class="btn block ghost" id="tie">It's a tie — skip</button>`;
      $$('.who-grid button').forEach((b) => (b.onclick = async () => {
        SFX.play('tap');
        await Core.penalty({ who: +b.dataset.i, card, reason: 'The people have spoken' });
        Core.nextRound(); this.round();
      }));
      $('#tie').onclick = () => { Core.nextRound(); this.round(); };
    });
  },
};

/* =========================================================
   6b. HOT SEAT QUIZ  — game-show stage
   ========================================================= */
Games.hotseat = {
  title: 'Hot Seat Quiz', tag: 'How well do you know them?', streak: 0,
  start() { mount('hotseat', 'Hot Seat Quiz', ''); this.round(); },
  round() {
    const seat = Core.current(), guesser = Core.partnerOf(seat);
    const card = Core.draw('hotseat');
    Core.setTurn(seat); Core.setPassInfo(passCost(card)); Core.setPrimary(null);
    Core.onPass(() => { Core.doPass(card, seat); Core.nextRound(); Core.nextTurn(); this.round(); });
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
   6c. TWO TRUTHS & A SPICY LIE  — casino felt
   ========================================================= */
Games.twotruths = {
  title: 'Two Truths & a Spicy Lie', tag: 'Read the table.',
  start() { mount('twotruths', 'Two Truths & a Spicy Lie', ''); this.round(); },
  round() {
    const teller = Core.current();
    const card = Core.draw('twotruths');
    Core.setTurn(teller); Core.setPassInfo(passCost(card)); Core.setPrimary(null);
    Core.onPass(() => { Core.doPass(card, teller); Core.nextRound(); Core.nextTurn(); this.round(); });
    SFX.play('chip');
    const suit = rand(['♥', '♦', '♠', '♣']);
    const s = stageHTML(`
      <p class="center muted" style="letter-spacing:.2em;font-size:12px">THE DEALER CALLS</p>
      <h2 class="center" style="font-size:34px;margin:4px 0 16px">${N(teller)}</h2>
      <div class="playing" data-suit="${suit}"><p class="prompt" style="margin:0">${esc(card.text)}</p></div>
      <p class="center muted" style="margin-top:18px">Say three things. Two true, one spicy lie. The table bets on the lie.</p>
      <div class="chips3"><button data-c="1">#1</button><button data-c="2">#2</button><button data-c="3">#3</button></div>
      <p class="center muted" id="bet">Tap the table's bet</p>
      <div id="ctl"></div>`);
    $$('.chips3 button', s).forEach((b) => (b.onclick = () => {
      SFX.play('chip'); $$('.chips3 button').forEach((x) => x.classList.toggle('on', x === b));
      $('#bet').textContent = `Table bets #${b.dataset.c} is the lie`;
      ctl().innerHTML = `<p class="center">${N(teller)}, was #${b.dataset.c} the lie?</p><div class="col">
        <button class="btn block" id="caught">Yes — busted 🃏</button><button class="btn block alt" id="fooled">No — fooled 'em 😈</button></div>`;
      $('#caught').onclick = async () => { SFX.play('wrong'); await Core.penalty({ who: teller, card, reason: 'Caught lying' }); Core.nextRound(); Core.nextTurn(); this.round(); };
      $('#fooled').onclick = async () => {
        SFX.play('win');
        const others = Core.players().map((_, i) => i).filter((i) => i !== teller);
        await Core.penalty({ who: others, card, reason: `${Core.name(teller)} played you` });
        Core.nextRound(); Core.nextTurn(); this.round();
      };
    }));
  },
};

/* =========================================================
   6d. SWAP ROUNDS  — chrome mirror, answer as each other
   ========================================================= */
Games.swap = {
  title: 'Swap Rounds', tag: 'Answer as your partner.',
  start() { mount('swap', 'Swap Rounds', ''); SFX.play('shimmer'); this.round(); },
  round() {
    const me = Core.current(), them = Core.partnerOf(me);
    const card = Core.draw('swap');
    Core.setTurn(me); Core.setPassInfo(passCost(card)); Core.setPrimary(null);
    Core.onPass(() => { Core.doPass(card, me); Core.nextRound(); Core.nextTurn(); this.round(); });
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
