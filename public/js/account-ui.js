/* Heat Check: account screens. Sign-in (email OTP), the paywall (Lite and Premium plan cards),
   the home pass banner and Lite warnings, limit and lock moments, the in-game heat selector,
   profile, receipts, account deletion and the hidden admin panel.
   Every sheet is appended inside #app so it inherits the current theme. */

const TEASER = {
  redflag: 'Steamier scenarios. Harder verdicts.',
  nhie: 'The confessions get a lot less innocent.',
  charades: 'Titles you’d never act out for your parents.',
  wyr: 'Choices that turn into dares on the spot.',
  hotseat: 'Questions you’ll want to answer up close.',
  swap: 'Say it as them. Do it as you.',
  mostlikely: 'The wild ones. Everyone already knows who.',
  twotruths: 'Wild-night topics. Good luck keeping a straight face.',
};
const GAME_SHORT = { redflag: 'Flags', nhie: 'Never', charades: 'Charades', wyr: 'Rather', hotseat: 'Hot Seat', swap: 'Swap', mostlikely: 'Likely', twotruths: '2 Truths' };
const GAME_ICON = { redflag: '🚩', nhie: '🥤', charades: '🎭', wyr: '⚔️', hotseat: '💺', swap: '🔁', mostlikely: '👉', twotruths: '🃏' };
const PLAN_LABEL = { guest: 'Guest', base: 'Free', lite: 'Lite', premium: 'Premium' };

/* One icon set for every plan row, perk and lock: bold strokes, 24px grid */
const ICONS = {
  flame: '<path d="M12 2.8c1.2 3.2 4.6 4.9 4.6 9.3a4.6 4.6 0 0 1-9.2 0c0-1.9.9-3.1 1.8-4 .2 1.7 1.1 2.6 2 2.8C11 8.2 11 5.4 12 2.8z"/><path d="M9.6 16.8a2.4 2.4 0 0 0 4.8 0"/>',
  heat: '<path d="M8 21c-2.2-1.4-3.5-3.6-3.5-6.2 0-4 3.6-5.6 4.5-9.8 1.6 1.4 2.4 3 2.4 4.8 1.2-.8 1.9-2 2.1-3.4 2.6 2.2 4 4.8 4 8.4 0 2.6-1.3 4.8-3.5 6.2"/><path d="M12 21v-5M9.5 18.5 12 16l2.5 2.5"/>',
  infinity: '<path d="M7.2 8.4a3.6 3.6 0 1 0 0 7.2c2.6 0 4.2-3.6 4.8-3.6s2.2 3.6 4.8 3.6a3.6 3.6 0 1 0 0-7.2c-2.6 0-4.2 3.6-4.8 3.6S9.8 8.4 7.2 8.4z"/>',
  group: '<circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.2" r="2.5"/><path d="M3.2 19.5c.8-3.2 3.1-4.8 5.8-4.8s5 1.6 5.8 4.8M15.2 14.6c2.4.2 4.2 1.7 4.8 4.6"/>',
  bookmark: '<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',
  music: '<path d="M9 18V6l10-2.2v12"/><circle cx="6.8" cy="18" r="2.4"/><circle cx="16.8" cy="15.8" r="2.4"/>',
  sparkle: '<path d="M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  sync: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
};
const icon = (k) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;
const perkList = (items) => `<ul class="perk-list">${items.map(([k, t]) => `<li>${icon(k)}<span>${esc(t)}</span></li>`).join('')}</ul>`;
const GUEST_PERKS = [['flame', 'Free Hot card per game'], ['sync', 'Sync your progress'], ['bag', 'Buy Lite or Premium']];
// Paywall rows: Lite shows its first three, the fourth (Premium's) dimmed. Premium shows all four of its own.
const LITE_ROWS = [['flame', 'Flirty and Spicy, unlimited', true], ['heat', '3 Hot cards per game', true], ['music', 'Themes and sounds', true], ['infinity', 'Unlimited Hot', false]];
const PREMIUM_ROWS = [['infinity', 'Unlimited Hot, every game', true], ['group', 'Unlimited players', true], ['bookmark', 'Saved player names', true], ['sparkle', 'All themes unlocked', true]];

const fmtDate = (iso, time = true) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', time ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
};
const fmtLeft = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h >= 1 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(ss).padStart(2, '0')}`;
};
// "42 min left" on the banner: whole minutes, rounded up
const fmtMin = (ms) => { const m = Math.ceil(Math.max(0, ms) / 60000); return m <= 1 ? (ms > 0 ? '1 min left' : 'ending') : `${m} min left`; };
const rupees = (v) => '₹' + (Number(v) % 1 ? Number(v).toFixed(2) : String(Number(v)));

const UI = {
  /* ---------- sheet primitive ---------- */
  sheet(html, { full = false, cls = '', dismiss = true, onClose } = {}) {
    const wrap = document.createElement('div');
    wrap.className = `modal-wrap acct-wrap ${full ? 'full' : ''} ${cls}`;
    wrap.innerHTML = full
      ? `<div class="sheet-full" role="dialog" aria-modal="true">${html}</div>`
      : `<div class="modal acct-sheet" role="dialog" aria-modal="true">${html}</div>`;
    document.getElementById('app').appendChild(wrap);
    let closed = false;
    const close = () => { if (closed) return; closed = true; wrap.remove(); onClose && onClose(); };
    wrap.addEventListener('click', (e) => {
      if ((dismiss && e.target === wrap) || e.target.closest('[data-close]')) { SFX.play('tap'); close(); }
    });
    const first = wrap.querySelector('input:not([type=hidden])');
    if (first && !full) setTimeout(() => first.focus({ preventScroll: true }), 260);
    return { el: wrap, close, get closed() { return closed; } };
  },
  err(el, msg) { if (!el) return; el.textContent = msg || ''; el.hidden = !msg; if (msg) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); } },
  /* Loading state: the button keeps its exact size; the label crossfades to a spinner. */
  busy(btn, on) {
    if (!btn) return;
    if (on) {
      if (btn.classList.contains('is-loading')) return;
      const r = btn.getBoundingClientRect();
      if (r.width) btn.style.width = r.width + 'px';
      if (!btn.querySelector(':scope > .btn-label')) btn.innerHTML = `<span class="btn-label">${btn.innerHTML}</span>`;
      if (!btn.querySelector(':scope > .btn-spin')) btn.insertAdjacentHTML('beforeend', '<span class="btn-spin" aria-hidden="true"></span>');
      btn.classList.add('is-loading'); btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    } else {
      btn.classList.remove('is-loading'); btn.disabled = false; btn.removeAttribute('aria-busy');
      setTimeout(() => { if (!btn.classList.contains('is-loading')) btn.style.width = ''; }, 220);
    }
  },

  /* ---------- 6-digit code boxes ---------- */
  codeBoxes(host, onComplete) {
    host.innerHTML = `<div class="otp" role="group" aria-label="6-digit code">${Array.from({ length: 6 }, (_, i) =>
      `<input class="otp-box" inputmode="numeric" pattern="[0-9]*" maxlength="1" ${i === 0 ? 'autocomplete="one-time-code"' : 'autocomplete="off"'} aria-label="Digit ${i + 1}">`).join('')}</div>`;
    const boxes = $$('.otp-box', host);
    const value = () => boxes.map((b) => b.value).join('');
    const fill = (digits, from = 0) => {
      digits.split('').slice(0, 6 - from).forEach((d, k) => { boxes[from + k].value = d; });
      const next = boxes.find((b) => !b.value);
      (next || boxes[5]).focus();
      if (value().length === 6) onComplete(value());
    };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        const d = b.value.replace(/\D/g, '');
        if (d.length > 1) { b.value = ''; fill(d, i); return; }  // autofill drops the whole code in one box
        b.value = d;
        if (d && i < 5) boxes[i + 1].focus();
        if (value().length === 6) onComplete(value());
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].value = ''; boxes[i - 1].focus(); e.preventDefault(); }
        if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
        if (e.key === 'ArrowRight' && i < 5) boxes[i + 1].focus();
      });
      b.addEventListener('paste', (e) => {
        const d = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
        if (!d) return;
        e.preventDefault(); fill(d.slice(0, 6), 0);
      });
      b.addEventListener('focus', () => b.select());
    });
    return {
      value,
      clear() { boxes.forEach((b) => (b.value = '')); boxes[0].focus(); },
      focus() { (boxes.find((b) => !b.value) || boxes[0]).focus(); },
      disable(on) { boxes.forEach((b) => (b.disabled = on)); },
      shake() { host.classList.remove('shake'); void host.offsetWidth; host.classList.add('shake'); },
    };
  },

  /* ---------- Sign in: email, then a 6-digit code ---------- */
  signIn({ then, reason } = {}) {
    if (!Cfg.accounts) {
      return this.sheet(`<h2>Accounts are almost here</h2><p class="muted">Sign-in, Lite and Premium are switching on soon. Everything free still works, no account needed.</p>
        <button class="btn block ghost" data-close style="margin-top:12px">Got it</button>`);
    }
    if (Auth.signedIn()) { then && then(); return null; }
    const s = this.sheet(`
      <div class="si-step" data-step="email">
        <h2>Sign in with email</h2>
        <p class="muted">${esc(reason || 'No passwords. We email you a 6-digit code.')}</p>
        <label class="sr-only" for="siEmail">Email</label>
        <input class="input" id="siEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" enterkeyhint="send">
        <div class="ts-box" id="tsBox"></div>
        <p class="form-err" id="siErr" role="alert" hidden></p>
        <button class="btn block" id="siSend" disabled>Email me a code</button>
        <p class="note center" style="margin-top:12px">By signing in you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>
      </div>
      <div class="si-step" data-step="code" hidden>
        <h2>Check your email</h2>
        <p class="muted">We sent a 6-digit code to <b id="siTo"></b>.</p>
        <div id="siCode"></div>
        <p class="form-err" id="siErr2" role="alert" hidden></p>
        <div class="row si-row"><button class="btn ghost sm" id="siResend" disabled>Resend in 30s</button><button class="btn ghost sm" id="siBack">Different email</button></div>
        <div class="ts-box" id="tsBox2"></div>
      </div>`, { cls: 'si' });
    const el = s.el;
    let token = null, email = '', tsId = null, tsId2 = null, token2 = null, timer = 0, left = 0, tries = 0, verifying = false;
    const emailIn = $('#siEmail', el), send = $('#siSend', el), err = $('#siErr', el), err2 = $('#siErr2', el), resend = $('#siResend', el);
    const valid = () => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailIn.value.trim());
    const refresh = () => { send.disabled = !(valid() && token); };
    emailIn.addEventListener('input', refresh);
    emailIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !send.disabled) send.click(); });
    Captcha.render($('#tsBox', el), (t) => { token = t; refresh(); }).then((id) => { tsId = id; }).catch((e) => this.err(err, e.message));

    const startTimer = () => {
      left = 30; clearInterval(timer);
      const draw = () => { resend.textContent = left > 0 ? `Resend in ${left}s` : 'Resend code'; resend.disabled = left > 0 || !token2; };
      draw();
      timer = setInterval(() => { left--; draw(); if (left <= 0) clearInterval(timer); }, 1000);
      resend._draw = draw;
    };
    const request = async (tok) => {
      const r = await fetch('/api/auth/otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, turnstileToken: tok }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || 'Couldn’t send the code. Try again.');
    };
    const code = this.codeBoxes($('#siCode', el), async (v) => {
      if (verifying) return;
      verifying = true; this.err(err2, ''); code.disable(true);
      try {
        await Auth.verifyCode(email, v);
        clearInterval(timer); s.close();
        Core.toast('You’re in');
        then && then();
      } catch (e) {
        tries++;
        code.disable(false); code.shake();
        if (tries >= 5) { this.err(err2, 'Too many tries. Get a new code.'); code.disable(true); }
        else { this.err(err2, e.message); code.clear(); }
      } finally { verifying = false; }
    });
    send.onclick = async () => {
      email = emailIn.value.trim().toLowerCase();
      this.err(err, ''); this.busy(send, true, 'Sending…');
      try {
        await request(token);
        $('[data-step=email]', el).hidden = true; $('[data-step=code]', el).hidden = false;
        $('#siTo', el).textContent = email;
        startTimer(); code.focus();
        Captcha.remove(tsId); tsId = null;
        Captcha.render($('#tsBox2', el), (t) => { token2 = t; resend._draw && resend._draw(); }).then((id) => { tsId2 = id; }).catch(() => {});
      } catch (e) {
        this.err(err, e.message); token = null; Captcha.reset(tsId); refresh();
      } finally { this.busy(send, false); refresh(); }
    };
    resend.onclick = async () => {
      this.err(err2, ''); this.busy(resend, true, 'Sending…');
      try { await request(token2); tries = 0; code.disable(false); code.clear(); Core.toast('New code sent'); }
      catch (e) { this.err(err2, e.message); }
      finally { this.busy(resend, false); token2 = null; Captcha.reset(tsId2); startTimer(); }
    };
    $('#siBack', el).onclick = () => {
      clearInterval(timer); tries = 0;
      $('[data-step=code]', el).hidden = true; $('[data-step=email]', el).hidden = false;
      Captcha.remove(tsId2); tsId2 = null; token = null; refresh();
      Captcha.render($('#tsBox', el), (t) => { token = t; refresh(); }).then((id) => { tsId = id; }).catch(() => {});
      emailIn.focus();
    };
    return s;
  },

  /* ---------- Plan cards: Lite (gold) and Premium (icy titanium), side by side ---------- */
  plans(host, { game = null, reason = null, onDone } = {}) {
    if (!host) return;
    const tier = Ent.tier();
    const lite = Cfg.product('lite'), prem = Cfg.product('premium');
    if (!Cfg.payments || !lite || !prem) { host.innerHTML = '<p class="pw-soon">Lite and Premium are switching on soon. Everything free still works.</p>'; return; }
    const rows = (list) => `<ul class="plan-rows">${list.map(([k, t, on]) => `<li class="${on ? '' : 'off'}">${icon(on ? k : 'lock')}<span>${esc(t)}</span></li>`).join('')}</ul>`;
    const liteActive = tier === 'lite';
    host.innerHTML = `<div class="plans">
      <button class="plan lite" data-buy="lite" ${tier === 'premium' ? 'disabled' : ''}>
        <span class="plan-sheen" aria-hidden="true"></span>
        <span class="plan-pick ghost" aria-hidden="true">Most picked</span>
        <span class="plan-name">Lite</span>
        <span class="plan-price">${esc(lite.display)}</span>
        <span class="plan-term">${liteActive ? 'adds 1 more hour' : 'for 1 hour'}</span>
        ${rows(LITE_ROWS)}
        <span class="plan-cta">${liteActive ? '+1 hour' : 'Get Lite'}</span>
      </button>
      <button class="plan premium" data-buy="premium">
        <span class="plan-sheen" aria-hidden="true"></span>
        <span class="plan-pick">Most picked</span>
        <span class="plan-name">Premium</span>
        <span class="plan-price">${esc(prem.display)}</span>
        <span class="plan-term">one-time, forever</span>
        ${rows(PREMIUM_ROWS)}
        <span class="plan-cta">Get Premium</span>
      </button>
    </div><p class="form-err" role="alert" hidden></p>`;
    const err = $('.form-err', host);
    $$('[data-buy]', host).forEach((b) => (b.onclick = async () => {
      const product = b.dataset.buy;
      SFX.play('tap');
      if (Ent.tier() === 'premium') return Core.toast('You already have Premium.');
      if (!Auth.signedIn()) {
        // Guests sign in with an email code first, then come straight back to the paywall
        $$('.acct-wrap.pw-wrap').forEach((w) => w.remove());
        return this.signIn({ reason: 'Sign in first so your purchase stays with your account. No passwords, just a code.', then: () => this.paywall({ game, reason }) });
      }
      this.err(err, '');
      $$('[data-buy]', host).forEach((x) => (x.disabled = true));
      b.classList.add('loading');
      try {
        const r = await Pay.buy(product);
        if (r.ok) { onDone && onDone(); this.success(product); return; }
        if (r.paid) this.err(err, 'Payment received. Unlocking can take a minute: check your profile shortly.');
        else if (r.error) this.err(err, r.error.message);
      } catch (e) {
        if (e.code === 'already_premium') { await Auth.refresh(); onDone && onDone(); Core.toast('You already have Premium.'); this.refreshScreens(); return; }
        this.err(err, e.message);
      } finally {
        b.classList.remove('loading');
        $$('[data-buy]', host).forEach((x) => (x.disabled = x.dataset.buy === 'lite' && Ent.tier() === 'premium'));
      }
    }));
  },

  /* ---------- Paywall (streaming style): wherever a locked thing is tapped ---------- */
  paywall({ game = null, reason = null } = {}) {
    if (Ent.tier() === 'premium') { Core.toast('You already have Premium. Everything’s open.'); return null; }
    const sub = reason === 'players' ? `Up to ${HC.FREE_PLAYERS} people on this plan. Premium brings the whole group.`
      : reason === 'look' ? 'Lite opens Midnight and the Velvet sounds. Premium opens every look.'
        : game && TEASER[game] ? `${Games[game] ? Games[game].title + ': ' : ''}${TEASER[game]}` : 'Flirty stays free. Lite and Premium open up the rest.';
    const s = this.sheet(`
      <div class="pw">
        <h2>Turn up the heat</h2>
        <p class="muted">${esc(sub)}</p>
        <div id="pwPlans"></div>
        ${game && Taste.canClaim(game) && document.getElementById('stage') ? '<button class="btn block ghost sm" id="pwTaste" style="margin-top:12px">Or use your free Hot card</button>' : ''}
        <p class="form-err" id="pwErr" role="alert" hidden></p>
        <p class="note center pw-foot">${Auth.signedIn() ? '' : '<button class="linkish" id="pwRestore">Already bought? Restore purchase</button><br>'}
          UPI, cards and more via Razorpay. <a href="/terms">Terms</a> · <a href="/refund">Refunds</a></p>
        <button class="btn block ghost sm" data-close>Not now</button>
      </div>`, { cls: 'pw-wrap' });
    const el = s.el, err = $('#pwErr', el);
    this.plans($('#pwPlans', el), { game, reason, onDone: () => s.close() });
    const tasteBtn = $('#pwTaste', el);
    if (tasteBtn) tasteBtn.onclick = async () => {
      this.busy(tasteBtn, true);
      try { await Taste.claim(game); s.close(); Core.toast('Your free Hot card is up next'); this.resume(); }
      catch (e) { this.busy(tasteBtn, false); this.err(err, e.message); }
    };
    const restore = $('#pwRestore', el);
    if (restore) restore.onclick = () => { s.close(); this.signIn({ reason: 'Sign in with the email you bought with. Your purchase comes back with it.', then: () => this.afterRestore() }); };
    return s;
  },

  /* ---------- A game hit this tier's limit: a soft sheet, never mid-card ---------- */
  _again: null,
  resume() { const f = this._again; this._again = null; if (f && document.getElementById('stage')) f(); },
  limitReached(game, again) {
    this._again = again || null;
    const tier = Ent.tier(), title = Games[game] ? Games[game].title : 'This game';
    const cap = HC.LIMITS[tier] && HC.LIMITS[tier].flirty;
    // The table under the sheet: a quiet lock panel where the card was
    const st = document.getElementById('stage');
    if (st) {
      st.innerHTML = `<div class="lock-panel">${icon('lock')}<h2>That’s ${cap} Flirty cards</h2>
        <p class="muted">${esc(title)} is done for today on ${tier === 'guest' ? 'guest play' : 'the free plan'}. More tomorrow, or unlock it now.</p>
        <button class="btn" data-act="unlockmore">Unlock more</button></div>`;
      Core.setPrimary(null); Core.onSkip(null);
      $('[data-act="unlockmore"]', st).onclick = () => this.limitReached(game, again);
    }
    const tasteNow = tier === 'base' && Taste.canClaim(game);
    const s = this.sheet(`
      <div class="pw lim">
        <h2>${tasteNow ? 'Use your free Hot card?' : 'Unlock more'}</h2>
        <p class="muted">${tier === 'guest' ? `That’s ${cap} Flirty cards in ${esc(title)} today. Sign in for a free Hot card, or unlock everything.`
          : tasteNow ? `That’s ${cap} Flirty cards in ${esc(title)} today. This game’s free Hot card is still waiting.`
            : `That’s ${cap} Flirty cards and your free Hot card in ${esc(title)} today.`}</p>
        ${tier === 'guest' ? '<button class="btn block" id="limSignIn">Sign in for a free Hot card</button>' : ''}
        ${tasteNow ? '<button class="btn block" id="limTaste">Play my free Hot card</button>' : ''}
        <div id="limPlans"></div>
        <p class="form-err" id="limErr" role="alert" hidden></p>
        <button class="btn block ghost sm" data-close>Not now</button>
      </div>`, { cls: 'pw-wrap' });
    const el = s.el;
    this.plans($('#limPlans', el), { game, onDone: () => { s.close(); this.resume(); } });
    const si = $('#limSignIn', el);
    if (si) si.onclick = () => { s.close(); this.signIn({ reason: 'Sign in and every game gives you one free Hot card.', then: () => { Intro.refresh(); this.resume(); } }); };
    const tb = $('#limTaste', el);
    if (tb) tb.onclick = async () => {
      this.busy(tb, true);
      try { await Taste.claim(game); s.close(); this.resume(); }
      catch (e) { this.busy(tb, false); this.err($('#limErr', el), e.message); }
    };
    return s;
  },

  /* ---------- Lock messages: shared by the home ring and the in-game heat selector ---------- */
  lockInfo(level, game = Core.game) {
    const tier = Ent.tier();
    if (level <= Core.levelCap(game)) return null;
    if (level === 2) return { text: 'Spicy needs Lite or Premium.', act: 'plans' };
    if (tier === 'guest') return { text: 'Sign in for a free Hot card', act: 'signin' };
    if (tier === 'base') {
      const unused = game ? Taste.canClaim(game) : Taste.unusedAny();
      return unused ? { text: 'Use your free Hot card?', act: 'taste' } : { text: 'Hot is locked. Lite or Premium unlocks it.', act: 'plans' };
    }
    if (tier === 'lite') return { text: `${HC.LIMITS.lite.hot} Hot cards used here. Premium has unlimited.`, act: 'premium' };
    return null;
  },
  lockActions(info) {
    if (!info) return '';
    if (info.act === 'signin') return '<button class="linkish" data-lock="signin">Sign in</button>';
    if (info.act === 'taste') return '<button class="linkish" data-lock="taste">Use it</button>';
    if (info.act === 'premium') return '<button class="mini-plan premium" data-lock="premium">Premium</button>';
    return '<button class="mini-plan lite" data-lock="lite">Lite</button><button class="mini-plan premium" data-lock="premium">Premium</button>';
  },
  async lockAct(kind, game, done) {
    if (kind === 'signin') return this.signIn({ reason: 'Sign in and every game gives you one free Hot card.', then: () => { Intro.refresh(); done && done(); } });
    if (kind === 'taste') {
      if (game) { try { await Taste.claim(game); Core.toast('Your free Hot card is up next'); done && done(); } catch (e) { Core.toast(e.message); } return; }
      Taste.armed = true; done && done(); return;
    }
    return this.paywall({ game });
  },

  /* ---------- In-game heat selector (tap the heat chip) ---------- */
  heatSheet(game) {
    const cur = Core.heat();
    const s = this.sheet(`<h2>Heat</h2><p class="muted">Changing it resets the auto-ramp counter.</p>
      <div class="heat-rows">${[1, 2, 3].map((h) => {
        const lock = this.lockInfo(h, game);
        return `<div class="heat-row h${h} ${lock ? 'locked' : ''} ${cur === h ? 'on' : ''}">
          <button class="hr-main" data-h="${h}" ${lock ? 'aria-disabled="true"' : ''}><b>${HEAT[h].name}</b><span>${ptsWord(pts(h))} penalty</span>${lock ? icon('lock') : ''}</button>
          ${lock ? `<div class="hr-lock"><span>${esc(lock.text)}</span>${this.lockActions(lock)}</div>` : ''}</div>`;
      }).join('')}</div>
      <button class="btn block ghost sm" data-close style="margin-top:12px">Done</button>`, { cls: 'heat-sheet' });
    s.el.addEventListener('click', (e) => {
      const lb = e.target.closest('[data-lock]');
      if (lb) { s.close(); return this.lockAct(lb.dataset.lock, game); }
      const b = e.target.closest('[data-h]'); if (!b) return;
      const h = +b.dataset.h;
      if (this.lockInfo(h, game)) { const row = b.closest('.heat-row'); row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); vibrate([30, 30, 30]); return; }
      SFX.play('tap'); Core.setHeat(h); Core.toast(`${ptsLabel(h)}. Next card.`); s.close();
    });
    return s;
  },

  async afterRestore() {
    await Auth.refresh(); await Premium.load();
    const t = Ent.profileTier();
    Core.toast(t === 'premium' ? 'Premium restored' : t === 'lite' ? 'Lite restored' : 'No active purchase on this account');
    this.refreshScreens();
  },

  success(product) {
    const until = Auth.profile && Auth.profile.premium_until;
    const o = document.createElement('div');
    o.className = 'pw-success ' + product; o.setAttribute('role', 'status');
    o.innerHTML = `<div class="pw-burst"></div><div class="pw-ok"><div class="pw-check" aria-hidden="true"></div>
      <h2>You’re in.</h2><p>${product === 'premium' ? 'Premium is yours. Every card, every game. Forever.' : `Lite runs until ${esc(new Date(until).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }))}.`}</p>
      <button class="btn" data-ok>Let’s go</button></div>`;
    document.getElementById('app').appendChild(o);
    vibrate([30, 40, 60, 40, 90]); SFX.play('win');
    const r = o.querySelector('.pw-ok').getBoundingClientRect();
    window.Motion && Motion.embers && Motion.embers(3, r.left + r.width / 2, r.top + 40);
    const close = () => { if (o.classList.contains('out')) return; o.classList.add('out'); setTimeout(() => { o.remove(); this.resume(); }, 260); };
    o.addEventListener('click', close);
    setTimeout(close, 4200);
    Prefs.apply();
    this.refreshScreens();
  },

  refreshScreens() {
    Intro.refresh();
    if ($('.hud')) Core.updateHud();
    const prof = $('.acct-wrap.profile'); if (prof) this.profile({ replace: prof });
  },

  /* ---------- Home pass banner (exact plan + time left) and the in-game chip ---------- */
  passState() {
    if (Admin.active()) return { cls: 'admin', text: `Admin · ${fmtLeft(Admin.exp - Cfg.now())}`, act: 'admin' };
    const t = Ent.profileTier();
    if (t === 'premium') return { cls: 'premium', text: 'Premium · Lifetime', act: 'profile' };
    if (t === 'lite') { const left = Ent.liteLeft(); return { cls: 'lite' + (left <= 5 * 60 * 1000 ? ' warn' : ''), text: `Lite · ${fmtMin(left)}`, act: 'profile' }; }
    return { cls: 'none', text: 'No pass active', act: 'paywall' };
  },
  updatePassChip() {
    const st = this.passState();
    const slot = document.getElementById('passBanner');
    if (slot) {
      const html = `<button class="pass-banner ${st.cls}" data-act="${st.act}"><span class="pb-sheen" aria-hidden="true"></span>${st.cls === 'premium' ? `<span class="pb-ico" aria-hidden="true">${icon('infinity')}</span>` : ''}<span class="pb-text">${esc(st.text)}</span>${st.cls === 'premium' ? '<span class="pb-tag">All open</span>' : ''}${st.cls === 'none' ? '<span class="pb-go">See plans</span>' : ''}${st.cls.includes('warn') ? '<span class="pb-warn">Ends soon</span>' : ''}</button>`;
      if (slot.dataset.k !== st.cls + '|' + st.text) { slot.dataset.k = st.cls + '|' + st.text; slot.innerHTML = html; }
    }
    // In a game: a small chip only while a Lite or admin clock is running
    const hudTop = $('.hud-top');
    if (hudTop) {
      const show = st.cls.startsWith('lite') || st.cls === 'admin';
      let c = $('#passChipHud');
      if (!show) { if (c) c.remove(); }
      else if (!c) { const b = document.createElement('button'); b.id = 'passChipHud'; b.className = 'pass-chip ' + st.cls; b.dataset.act = st.act; b.textContent = st.text; hudTop.insertBefore(b, hudTop.lastElementChild); }
      else { c.textContent = st.text; c.className = 'pass-chip ' + st.cls; }
    }
  },

  account() { return this.profile(); },

  // 5 minutes of Lite left: a soft chip, not a sheet
  liteWarning() {
    if ($('.lite-warn')) return;
    const chip = document.createElement('div');
    chip.className = 'lite-warn'; chip.setAttribute('role', 'status');
    chip.innerHTML = `<span>5 minutes of Lite left.</span><button class="linkish" data-act="paywall">Keep going</button><button class="hc-x" aria-label="Dismiss">✕</button>`;
    document.getElementById('app').appendChild(chip);
    const close = () => { chip.classList.add('out'); setTimeout(() => chip.remove(), 240); };
    const t = setTimeout(close, 8000);
    chip.addEventListener('click', (e) => { if (e.target.closest('button')) { clearTimeout(t); close(); } });
  },

  // Lite ran out. The card on screen was allowed to finish first.
  expired() {
    if ($('.acct-wrap.expired')) return;
    const s = this.sheet(`<h2>Lite’s up</h2><p class="muted">Spicy and Hot are locked again. Flirty is still on the table.</p>
      <div id="exPlans"></div><button class="btn block ghost sm" data-close>Stay at Flirty</button>`, { cls: 'expired pw-wrap' });
    this.plans($('#exPlans', s.el), { onDone: () => s.close() });
    this.refreshScreens();
  },

  /* ---------- Profile (full screen) ---------- */
  profile({ replace } = {}) {
    const signed = Auth.signedIn() && Auth.profile;
    const html = `
      <div class="sf-head"><h1>${signed ? 'Profile' : 'You'}</h1><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="sf-body">${signed ? this.profileSignedIn() : this.profileGuest()}</div>`;
    let s;
    if (replace) { replace.querySelector('.sheet-full').innerHTML = html; s = { el: replace, close: () => replace.remove() }; }
    else s = this.sheet(html, { full: true, cls: 'profile' });
    this.bindProfile(s);
    return s;
  },

  // Signed-in only: one icon per game, count from config (couples + groups)
  tasteTracker() {
    const left = GAME_IDS.filter((g) => !Taste.used(g)).length;
    return `<div class="taste-grid">${GAME_IDS.map((g) => {
      const used = Taste.used(g);
      return `<div class="taste ${used ? 'used' : ''}" title="${esc(Games[g].title)}"><span class="ti">${GAME_ICON[g] || '🔥'}</span><span class="tn">${esc(GAME_SHORT[g] || g)}</span><span class="ts">${used ? 'Used' : 'Free'}</span></div>`;
    }).join('')}</div><p class="note">${Ent.paid() ? 'Your plan has Hot already, so these can wait.' : `${left} of ${GAME_IDS.length} free Hot cards left.`}</p>`;
  },

  profileGuest() {
    return `
      <section class="pf-card pf-hero guest">
        <div class="pf-ring dim" aria-hidden="true"><span>Guest</span></div>
        <button class="btn block pf-cta" id="pfSignIn">Sign in</button>
        ${perkList(GUEST_PERKS)}
      </section>
      ${this.supportBlock()}`;
  },

  supportBlock() {
    return `<section class="pf-card"><h3>Support</h3>
      <p class="muted">${SITE.contact ? `Email us: <a href="mailto:${esc(SITE.contact)}">${esc(SITE.contact)}</a>` : 'Support email is on its way.'}</p>
      <nav class="legal" style="justify-content:flex-start"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/refund">Refund policy</a></nav></section>`;
  },

  profileSignedIn() {
    const p = Auth.profile, tier = Ent.profileTier(), prefs = Prefs.get(), st = Stats.get();
    const fav = Stats.favorite(), lastNight = st.nights[st.nights.length - 1];
    const plan = tier === 'premium'
      ? `<div class="pro-active"><span class="plan-badge premium">Premium · Lifetime</span><p class="muted" id="pfPremDate">Every card, every game. No expiry.</p></div>`
      : tier === 'lite'
        ? `<div class="pro-active"><span class="plan-badge lite">Lite</span><div class="pf-count" id="pfLeft">${fmtLeft(Ent.liteLeft())}</div>
           <p class="muted">left · ends ${esc(fmtDate(p.premium_until))}</p>
           ${Cfg.payments && Cfg.product('premium') ? `<button class="btn block pf-up" data-pfbuy="premium">Upgrade to Premium · ${esc(Cfg.product('premium').display)}</button>` : ''}</div>`
        : '<div id="pfPlans"></div>';
    const seg = (key, opts, cur, locked) => `<div class="seg ${locked ? 'locked' : ''}" data-pref="${key}">${opts.map(([v, l, lk]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''} ${lk ? 'lk' : ''}">${l}</button>`).join('')}</div>`;
    const sw = (key, on, label, note) => `<div class="toggle"><div><b>${label}</b>${note ? `<div class="note">${note}</div>` : ''}</div><button class="switch ${on ? 'on' : ''}" data-prefsw="${key}" aria-label="${label}"></button></div>`;
    const paid = Ent.paid(), prem = Ent.premium();
    return `
      <section class="pf-card pf-hero">
        <div class="pf-ring glow" aria-hidden="true"><span>${esc((Auth.email()[0] || '?').toUpperCase())}</span></div>
        <div class="pf-email">${esc(Auth.email())}</div>
        <div class="row" style="justify-content:center;gap:8px"><span class="plan-badge ${tier}">${tier === 'premium' ? 'Premium · Lifetime' : PLAN_LABEL[tier]}</span><span class="note">Member since ${esc(fmtDate(p.created_at, false))}</span></div>
      </section>
      <section class="pf-card"><h3>${tier === 'base' ? 'Plans' : 'Your plan'}</h3>${plan}</section>
      <section class="pf-card"><h3>Free Hot cards</h3>${this.tasteTracker()}</section>
      <section class="pf-card"><h3>Purchase history</h3><div id="pfPurchases"><p class="note">Digging out your receipts…</p></div>
        <p class="note"><a href="/refund">Need a refund?</a></p></section>
      <section class="pf-card"><h3>Preferences</h3>
        <div class="field"><label>Timer</label>${seg('timer', HC.TIMER_OPTIONS.map((n) => [n, n + 's']), prefs.timer)}</div>
        ${sw('hollywood', prefs.hollywood, 'Hollywood', 'Movies, shows and famous couples.')}
        ${sw('bollywood', prefs.bollywood, 'Bollywood', 'Films, songs and famous couples.')}
        ${sw('auto_ramp', prefs.auto_ramp, 'Auto-ramp', 'Heat climbs a level every few cards.')}
        <div class="field"><label>Cards per ramp</label><div class="stepper"><button class="icon-btn" data-cpr="-1" aria-label="Fewer">−</button><b id="pfCpr">${prefs.cards_per_ramp}</b><button class="icon-btn" data-cpr="1" aria-label="More">+</button></div></div>
        <div class="field"><label>Penalties</label>${seg('mode', [['drink', '🍸 Drinks'], ['water', '💧 No alcohol'], ['dare', '🎲 Dares']], prefs.mode)}</div>
        ${sw('sound', !SFX.muted, 'Sound')}
        ${sw('haptics', prefs.haptics, 'Haptics')}
        <div class="field"><label>Reduced motion</label>${seg('motion', [['system', 'Phone setting'], ['reduce', 'On'], ['full', 'Off']], prefs.motion)}</div>
        <div class="field"><label>Sound pack ${paid ? '' : '<span class="pro-tag">Lite</span>'}</label>${seg('soundPack', [['classic', 'Classic'], ['velvet', 'Velvet', !paid]], paid ? prefs.soundPack : 'classic')}</div>
        <div class="field"><label>Home look ${prem ? '' : '<span class="pro-tag">Premium</span>'}</label>${seg('look', [['ember', 'Ember'], ['midnight', 'Midnight', !paid], ['neon', 'Neon', !prem]], Prefs.lookOk(prefs.look) ? prefs.look : 'ember')}</div>
        <div class="field"><label>Saved player names ${prem ? '' : '<span class="pro-tag">Premium</span>'}</label>
          ${prem ? `<div class="chips-row" id="pfNames">${prefs.savedNames.length ? prefs.savedNames.map((n) => `<button class="chip" data-delname="${esc(n)}">${esc(n)} ✕</button>`).join('') : '<span class="note">Names you play with get saved here.</span>'}</div>
            <div class="row" style="margin-top:8px"><input class="input" id="pfNameIn" maxlength="14" placeholder="Add a name"><button class="btn sm" id="pfNameAdd">Add</button></div>`
            : '<button class="btn ghost sm" data-act="paywall">Unlock saved names</button>'}
        </div>
        <p class="note">Synced to your account.</p>
      </section>
      <section class="pf-card"><h3>Your stats</h3>
        <div class="pf-stats"><div><b>${st.sessions}</b><span>games played</span></div>
          <div><b>${st.nights.length}</b><span>nights wrapped</span></div>
          <div><b>${fav ? esc(Games[fav] ? Games[fav].title : fav) : 'None yet'}</b><span>favorite game</span></div>
          <div><b>${st.topHeat ? HEAT[st.topHeat].name : 'None yet'}</b><span>highest heat</span></div>
          ${lastNight ? `<div><b>${lastNight.total}</b><span>points, last night</span></div>` : ''}</div>
      </section>
      <section class="pf-card"><h3>Data and security</h3>
        <div class="col">
          <button class="btn block ghost sm" id="pfRestore">Restore purchase</button>
          <button class="btn block ghost sm" id="pfExport">Export my data</button>
          <button class="btn block ghost sm" id="pfOut">Sign out</button>
          <button class="btn block ghost sm" id="pfOutAll">Sign out of all devices</button>
          <button class="btn block ghost sm danger" id="pfDelete">Delete account</button>
        </div>
      </section>
      ${this.supportBlock()}`;
  },

  bindProfile(s) {
    const el = s.el;
    const on = (sel, fn) => { const b = $(sel, el); if (b) b.onclick = fn; };
    on('#pfSignIn', () => { s.close(); this.signIn({ then: () => this.profile() }); });
    this.plans($('#pfPlans', el), { onDone: () => this.refreshScreens() });
    $$('[data-pfbuy]', el).forEach((b) => (b.onclick = async () => {
      this.busy(b, true);
      try {
        const r = await Pay.buy(b.dataset.pfbuy);
        if (r.ok) { this.success(b.dataset.pfbuy); return; }
        if (r.error) Core.toast(r.error.message);
      } catch (e) { Core.toast(e.code === 'already_premium' ? 'You already have Premium.' : e.message); }
      this.busy(b, false);
    }));
    on('#pfRestore', async () => { await this.afterRestore(); });
    on('#pfOut', async () => { s.close(); await Auth.signOut(); Core.toast('Signed out'); this.refreshScreens(); });
    on('#pfOutAll', async () => {
      const ok = await Core.ask('Sign out everywhere?', 'Every phone signed in to this account gets signed out.', [{ label: 'Sign out everywhere', value: 1 }, { label: 'Cancel', value: 0, cls: 'ghost' }]);
      if (!ok) return;
      s.close(); await Auth.signOut('global'); Core.toast('Signed out on every device'); this.refreshScreens();
    });
    on('#pfExport', async () => {
      try {
        const token = await Auth.token();
        const r = await fetch('/api/export-data', { headers: { Authorization: 'Bearer ' + token } });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Couldn’t export right now.');
        const blob = await r.blob(), url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'heat-check-my-data.json'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (e) { Core.toast(e.message); }
    });
    on('#pfDelete', () => this.deleteAccount());
    if (Auth.signedIn() && Auth.profile) {
      if (Ent.profileTier() === 'lite') {
        const t = setInterval(() => { const l = $('#pfLeft', el); if (!l || !el.isConnected) return clearInterval(t); l.textContent = fmtLeft(Ent.liteLeft()); }, 1000);
      }
      this.loadPurchases(el);
    }
    // preferences
    $$('[data-pref]', el).forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const k = g.dataset.pref, v = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
      if (b.classList.contains('lk')) return this.paywall({ reason: k === 'look' ? 'look' : null });
      $$('button', g).forEach((x) => x.classList.toggle('on', x === b)); SFX.play('tap');
      Prefs.set({ [k]: v });
      if (k === 'mode' || k === 'timer') Prefs.applyNightDefaults();
    }));
    $$('[data-prefsw]', el).forEach((b) => (b.onclick = () => {
      const k = b.dataset.prefsw;
      if (k === 'sound') { SFX.setMuted(!SFX.muted); b.classList.toggle('on', !SFX.muted); Prefs.set({}); }
      if (k === 'haptics') { const v = !Prefs.get().haptics; Prefs.set({ haptics: v }); b.classList.toggle('on', v); if (v) vibrate(20); }
      if (k === 'auto_ramp') { const v = !Prefs.get().auto_ramp; Prefs.set({ auto_ramp: v }); Prefs.applyNightDefaults(); Core.S.rampCount = 0; Core.save(); b.classList.toggle('on', v); }
      if (k === 'hollywood' || k === 'bollywood') {
        const v = !Prefs.get()[k];
        if (!Core.setOrigin(k, v)) { Core.toast('Keep at least one of Hollywood or Bollywood on'); return; }
        Prefs.set({ [k]: v }); b.classList.toggle('on', v);
      }
      SFX.play('tap');
    }));
    $$('[data-cpr]', el).forEach((b) => (b.onclick = () => {
      const v = Math.min(HC.RAMP_MAX, Math.max(HC.RAMP_MIN, Prefs.get().cards_per_ramp + +b.dataset.cpr));
      Prefs.set({ cards_per_ramp: v }); Prefs.applyNightDefaults(); Core.S.rampCount = 0; Core.save();
      $('#pfCpr', el).textContent = v; SFX.play('tap');
    }));
    const nameIn = $('#pfNameIn', el);
    on('#pfNameAdd', () => { const n = nameIn.value.trim(); if (!n) return; Prefs.set({ savedNames: [...Prefs.get().savedNames, n] }); this.profile({ replace: el }); });
    $$('[data-delname]', el).forEach((b) => (b.onclick = () => { Prefs.set({ savedNames: Prefs.get().savedNames.filter((x) => x !== b.dataset.delname) }); this.profile({ replace: el }); }));
  },

  async loadPurchases(el) {
    const host = $('#pfPurchases', el); if (!host) return;
    try {
      const rows = await Pay.receiptRows();
      const shown = rows.filter((r) => r.status !== 'created');
      const prem = rows.find((r) => r.product === 'premium' && r.status === 'paid');
      const pd = $('#pfPremDate', el); if (pd && prem) pd.textContent = `Bought ${fmtDate(prem.paid_at || prem.created_at, false)}. Every card, every game. No expiry.`;
      if (!shown.length) { host.innerHTML = '<p class="note">No receipts yet. Suspiciously innocent.</p>'; return; }
      host.innerHTML = `<ul class="pf-purchases">${shown.map((r, i) => `<li>
        <div><b>${r.product === 'premium' ? 'Premium' : 'Lite'}</b><span class="note">${esc(fmtDate(r.paid_at || r.created_at))}</span></div>
        <div class="pp-right"><b>${rupees(r.amount_inr)}</b><span class="pp-status ${esc(r.status)}">${r.status === 'paid' ? 'Paid' : 'Failed'}</span>
        ${r.razorpay_payment_id ? `<span class="note">…${esc(r.razorpay_payment_id.slice(-6))}</span>` : ''}</div>
        ${r.status === 'paid' ? `<button class="btn ghost sm" data-receipt="${i}">Receipt</button>` : ''}</li>`).join('')}</ul>`;
      $$('[data-receipt]', host).forEach((b) => (b.onclick = () => this.receipt(shown[+b.dataset.receipt])));
    } catch (e) { host.innerHTML = '<p class="note">Couldn’t load purchases. Check your connection.</p>'; }
  },

  receipt(r) {
    const o = document.createElement('div');
    o.className = 'receipt-wrap';
    o.innerHTML = `<div class="receipt" role="dialog" aria-label="Receipt">
      <div class="rc-head"><div><div class="rc-brand">Heat Check</div><div class="rc-sub">Flirty party games for couples, 18+</div></div><div class="rc-title">Receipt</div></div>
      <table class="rc-table">
        <tr><th>Receipt no.</th><td>HC-${esc(r.id.slice(0, 8).toUpperCase())}</td></tr>
        <tr><th>Date</th><td>${esc(fmtDate(r.paid_at || r.created_at))}</td></tr>
        <tr><th>Billed to</th><td>${esc(Auth.email())}</td></tr>
        <tr><th>Item</th><td>${r.product === 'premium' ? 'Heat Check Premium (one-time, lifetime)' : 'Heat Check Lite (1 hour)'}</td></tr>
        <tr><th>Amount</th><td>${rupees(r.amount_inr)} ${esc(r.currency || 'INR')}</td></tr>
        <tr><th>Status</th><td>Paid</td></tr>
        <tr><th>Payment ID</th><td>${esc(r.razorpay_payment_id || '')}</td></tr>
        <tr><th>Order ID</th><td>${esc(r.razorpay_order_id || '')}</td></tr>
      </table>
      <p class="rc-note">Paid via Razorpay. This is a payment receipt, not a tax invoice.${SITE.contact ? ` Questions: ${esc(SITE.contact)}` : ''}</p>
      <div class="rc-actions"><button class="btn" data-print>Save as PDF / Print</button><button class="btn ghost" data-x>Close</button></div></div>`;
    document.getElementById('app').appendChild(o);
    o.querySelector('[data-x]').onclick = () => o.remove();
    o.querySelector('[data-print]').onclick = () => {
      document.body.classList.add('printing');
      const after = () => { document.body.classList.remove('printing'); removeEventListener('afterprint', after); };
      addEventListener('afterprint', after);
      window.print();
      setTimeout(after, 1500);
    };
  },

  deleteAccount() {
    const s = this.sheet(`
      <div data-step="warn"><h2>Delete your account?</h2>
        <p class="muted">Your profile, preferences, stats and free hot card history are deleted. Purchase records are kept without your name or email, because the law says we keep payment records. Lite or Premium access ends.</p>
        <p class="form-err" id="daErr" role="alert" hidden></p>
        <div class="col"><button class="btn block danger-solid" id="daStart">Email me a code to confirm</button><button class="btn block ghost" data-close>Keep my account</button></div></div>
      <div data-step="code" hidden><h2>Enter the code</h2><p class="muted">We emailed a 6-digit code to <b>${esc(Auth.email())}</b>.</p>
        <div id="daCode"></div><p class="form-err" id="daErr2" role="alert" hidden></p>
        <button class="btn block ghost" data-close>Cancel</button></div>`, { cls: 'delete' });
    const el = s.el;
    $('#daStart', el).onclick = async (e) => {
      this.busy(e.currentTarget, true, 'Sending…');
      try {
        await Api.call('POST', '/api/delete-account', { step: 'start' });
        $('[data-step=warn]', el).hidden = true; $('[data-step=code]', el).hidden = false;
        code.focus();
      } catch (err) { this.err($('#daErr', el), err.message); }
      finally { this.busy($('#daStart', el), false); }
    };
    let busy = false;
    const code = this.codeBoxes($('#daCode', el), async (v) => {
      if (busy) return; busy = true; code.disable(true);
      try {
        await Api.call('POST', '/api/delete-account', { step: 'confirm', code: v });
        s.close(); $$('.acct-wrap').forEach((w) => w.remove());
        try { const c = await SB.get(); await c.auth.signOut({ scope: 'local' }); } catch (err) {}
        Auth._clear();
        Store.del('hc_prefs'); Store.del('hc_stats');
        Core.toast('Account deleted');
        App.home();
      } catch (err) { this.err($('#daErr2', el), err.message); code.disable(false); code.clear(); }
      finally { busy = false; }
    });
  },

  /* ---------- Hidden admin ---------- */
  adminEntry() {
    if (Admin.active()) return this.admin();
    const s = this.sheet(`<h2>Admin</h2><p class="muted">Password, please.</p>
      <input class="input" id="adPw" type="password" autocomplete="current-password" maxlength="256">
      <p class="form-err" id="adErr" role="alert" hidden></p>
      <button class="btn block" id="adGo" style="margin-top:12px">Unlock</button>
      <button class="btn block ghost sm" data-close style="margin-top:8px">Cancel</button>`, { cls: 'admin-unlock' });
    const pw = $('#adPw', s.el), go = $('#adGo', s.el);
    const submit = async () => {
      if (!pw.value) return;
      this.busy(go, true, 'Checking…');
      try { await Admin.unlock(pw.value); pw.value = ''; s.close(); Core.toast('Admin unlocked for 30 minutes'); this.refreshScreens(); this.admin(); }
      catch (e) { pw.value = ''; this.err($('#adErr', s.el), e.message); }
      finally { this.busy(go, false); }
    };
    go.onclick = submit;
    pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  },

  admin() {
    if (!Admin.active()) return this.adminEntry();
    const s = this.sheet(`
      <div class="sf-head"><h1>Admin</h1><div class="row"><button class="btn ghost sm" id="adExit">Lock</button><button class="icon-btn" data-close aria-label="Close">✕</button></div></div>
      <div class="sf-body">
        <section class="pf-card"><h3>Numbers</h3><div class="pf-stats ad-stats" id="adStats"><p class="note">Counting…</p></div></section>
        <section class="pf-card"><h3>Grant or revoke</h3>
          <input class="input" id="adEmail" type="email" placeholder="their@email.com" autocapitalize="off">
          <div class="row ad-row"><button class="btn sm" data-grant="grant_lite">+ Lite (1 hour)</button><button class="btn sm alt" data-grant="grant_premium">+ Premium</button><button class="btn sm ghost" data-grant="revoke">Revoke</button></div>
          <p class="note" id="adGrantMsg"></p></section>
        <section class="pf-card"><h3>Games</h3><div id="adGames"><p class="note">Loading…</p></div></section>
        <section class="pf-card"><h3>Paid cards</h3>
          <div class="row ad-row"><select class="input" id="adGame">${GAME_IDS.map((g) => `<option value="${g}">${esc(Games[g].title)}</option>`).join('')}</select>
            <select class="input" id="adHeat"><option value="3">Hot</option><option value="2">Spicy</option></select>
            <button class="btn sm" id="adNew">+ New</button></div>
          <div id="adForm"></div><div id="adCards"><p class="note">Loading…</p></div></section>
      </div>`, { full: true, cls: 'admin' });
    const el = s.el;
    $('#adExit', el).onclick = async () => { await Admin.logout(); s.close(); Core.toast('Admin locked'); this.refreshScreens(); };
    const fail = (e) => { Core.toast(e.message); if (e.code === 'admin_locked') s.close(); };
    // stats
    Admin.api('GET', '/api/admin/stats').then((st) => {
      const tiles = [['signups', 'signups'], ['signups_7d', 'new this week'], ['lite_sales', 'Lite sold'], ['premium_sales', 'Premium sold'], ['revenue_inr', 'revenue'], ['active_lite', 'Lite live now'], ['premium_members', 'Premium members']];
      $('#adStats', el).innerHTML = tiles.map(([k, l]) => `<div><b>${k === 'revenue_inr' ? rupees(st[k] || 0) : esc(String(st[k] ?? 0))}</b><span>${l}</span></div>`).join('');
    }).catch(fail);
    // grants
    $$('[data-grant]', el).forEach((b) => (b.onclick = async () => {
      const email = $('#adEmail', el).value.trim(), msg = $('#adGrantMsg', el);
      if (!email) return;
      this.busy(b, true, '…');
      try {
        const r = await Admin.api('POST', '/api/admin/grant', { email, action: b.dataset.grant });
        msg.textContent = `${r.email}: ${r.plan}${r.premium_until && r.plan === 'lite' ? ' until ' + fmtDate(r.premium_until) : ''}`;
      } catch (e) { msg.textContent = e.message; }
      finally { this.busy(b, false); }
    }));
    // games
    const loadGames = () => Admin.api('GET', '/api/admin/games').then((rows) => {
      $('#adGames', el).innerHTML = rows.map((g) => `<div class="toggle"><div><b>${esc(Games[g.id] ? Games[g.id].title : g.id)}</b></div><button class="switch ${g.enabled ? 'on' : ''}" data-gid="${esc(g.id)}" aria-label="Toggle ${esc(g.id)}"></button></div>`).join('');
      $$('[data-gid]', el).forEach((b) => (b.onclick = async () => {
        const enabled = !b.classList.contains('on');
        try { await Admin.api('POST', '/api/admin/games', { id: b.dataset.gid, enabled }); b.classList.toggle('on', enabled); if (Cfg.data && Cfg.data.games) Cfg.data.games[b.dataset.gid] = enabled; }
        catch (e) { fail(e); }
      }));
    }).catch(fail);
    loadGames();
    // cards
    const CATS = ['Movie', 'TV Show', 'Song'], ORIGINS = ['Hollywood', 'Bollywood', 'Global'];
    let cards = [];
    const form = (c) => {
      const g = $('#adGame', el).value, x = (c && c.extra) || {}, heat = c ? c.heat : +$('#adHeat', el).value;
      $('#adForm', el).innerHTML = `<div class="ad-form">
        <textarea class="input" id="cfText" rows="3" maxlength="400" placeholder="Card text">${c ? esc(c.text) : ''}</textarea>
        ${HC.modeOf(g) === 'couples' && g !== 'charades' ? `<textarea class="input" id="cfDare" rows="2" maxlength="400" placeholder="Optional dare">${c && c.optional_dare ? esc(c.optional_dare) : ''}</textarea>` : ''}
        ${g === 'wyr' ? `<input class="input" id="cfA" maxlength="200" placeholder="Option A" value="${esc(x.a || '')}"><input class="input" id="cfB" maxlength="200" placeholder="Option B" value="${esc(x.b || '')}">` : ''}
        ${g === 'charades' ? `<select class="input" id="cfCat">${CATS.map((z) => `<option ${x.category === z ? 'selected' : ''}>${z}</option>`).join('')}</select>` : ''}
        <select class="input" id="cfOrigin"><option value="">No origin tag</option>${ORIGINS.map((z) => `<option ${x.origin === z ? 'selected' : ''}>${z}</option>`).join('')}</select>
        ${g === 'redflag' ? `<div class="toggle"><div><b>Trait question</b><div class="note">A normal red or green vote question.</div></div><button class="switch ${x.kind === 'trait' ? 'on' : ''}" id="cfTrait" aria-label="Trait card"></button></div>` : ''}
        <p class="note">${heat === 2 ? 'Spicy: Lite and Premium.' : 'Hot: Premium, Lite (3 per game), free Hot card.'}</p>
        ${heat === 3 ? `<div class="toggle"><div><b>Free Hot card (taste)</b><div class="note">Only one per game is used. Served by /api/taste only.</div></div><button class="switch ${c && c.is_taste ? 'on' : ''}" id="cfTaste" aria-label="Taste card"></button></div>` : ''}
        <div class="toggle"><div><b>Active</b></div><button class="switch ${!c || c.active ? 'on' : ''}" id="cfActive" aria-label="Active"></button></div>
        <div class="row ad-row"><button class="btn sm" id="cfSave">${c ? 'Save' : 'Add card'}</button><button class="btn sm ghost" id="cfCancel">Cancel</button></div>
        <p class="note" id="cfMsg"></p></div>`;
      $('#cfActive', el).onclick = (e) => e.currentTarget.classList.toggle('on');
      $$('#cfTaste, #cfTrait', el).forEach((b) => (b.onclick = (e) => e.currentTarget.classList.toggle('on')));
      $('#cfCancel', el).onclick = () => ($('#adForm', el).innerHTML = '');
      $('#cfSave', el).onclick = async (e) => {
        const origin = $('#cfOrigin', el).value || undefined;
        const extra = g === 'wyr' ? { a: $('#cfA', el).value, b: $('#cfB', el).value } : g === 'charades' ? { category: $('#cfCat', el).value, origin } : { origin, kind: $('#cfTrait', el) && $('#cfTrait', el).classList.contains('on') ? 'trait' : undefined };
        const dareEl = $('#cfDare', el);
        this.busy(e.currentTarget, true, 'Saving…');
        try {
          await Admin.api('POST', '/api/admin/cards', { id: c ? c.id : undefined, game: g, heat, text: $('#cfText', el).value, optional_dare: dareEl ? dareEl.value : '', extra, active: $('#cfActive', el).classList.contains('on'), is_taste: !!($('#cfTaste', el) && $('#cfTaste', el).classList.contains('on')) });
          $('#adForm', el).innerHTML = ''; loadCards(); Premium.loaded = false; Premium.load();
          Core.toast(c ? 'Card saved' : 'Card added');
        } catch (err) { $('#cfMsg', el).textContent = err.message; this.busy($('#cfSave', el), false); }
      };
    };
    const loadCards = () => {
      const g = $('#adGame', el).value;
      $('#adCards', el).innerHTML = '<p class="note">Loading…</p>';
      Admin.api('GET', '/api/admin/cards?game=' + encodeURIComponent(g) + '&heat=' + $('#adHeat', el).value).then((rows) => {
        cards = rows;
        $('#adCards', el).innerHTML = rows.length ? `<ul class="ad-cards">${rows.map((c, i) => `<li class="${c.active ? '' : 'off'}"><span>${c.is_taste ? '<b class="pro-tag">Taste</b> ' : ''}${esc(c.text)}</span><button class="btn ghost sm" data-edit="${i}">Edit</button></li>`).join('')}</ul>` : '<p class="note">No cards at this heat for this game yet.</p>';
        $$('[data-edit]', el).forEach((b) => (b.onclick = () => { form(cards[+b.dataset.edit]); $('#adForm', el).scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
      }).catch(fail);
    };
    $('#adGame', el).onchange = $('#adHeat', el).onchange = () => { $('#adForm', el).innerHTML = ''; loadCards(); };
    $('#adNew', el).onclick = () => form(null);
    loadCards();
  },
};


/* Admin pass chip opens the panel */
document.addEventListener('click', (e) => { const a = e.target.closest('[data-act="admin"]'); if (a) UI.admin(); });

Object.assign(window, { UI });
