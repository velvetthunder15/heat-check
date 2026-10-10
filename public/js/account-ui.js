/* Heat Check: account screens. Sign-in (email OTP), paywall, pass chip and warnings,
   the Lv3 lock moments, profile, receipts, account deletion and the hidden admin panel.
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
const PLAN_LABEL = { guest: 'Guest', free: 'Free', pass: 'Date Night Pass', lifetime: 'Lifetime' };
const PRO_PERKS = [['flame', 'Hot on every game'], ['people', 'Unlimited players'], ['tag', 'Saved player names'], ['note', 'Themes & sounds']];
const GUEST_PERKS = [['flame', '1 free Hot card per game'], ['sync', 'Sync your settings'], ['bag', 'Buy & restore Pro'], ['chart', 'Keep your stats']];
const ICONS = {
  flame: '<path d="M12 3c1 3 4 4.5 4 8.5A4 4 0 0 1 8 11.5c0-1.6.8-2.6 1.6-3.4.2 1.5 1 2.2 1.7 2.4C11 8 11 5.5 12 3z"/><path d="M9.5 16.5a2.5 2.5 0 0 0 5 0"/>',
  people: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5M15 14.6c2.3.2 4 1.6 4.6 4.4"/>',
  tag: '<path d="M4 4h7l9 9-7 7-9-9z"/><circle cx="8" cy="8" r="1.5"/>',
  note: '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>',
  sync: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;
const perkList = (items) => `<ul class="perk-list">${items.map(([k, t]) => `<li>${icon(k)}<span>${esc(t)}</span></li>`).join('')}</ul>`;

const fmtDate = (iso, time = true) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', time ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
};
const fmtLeft = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h >= 1 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(ss).padStart(2, '0')}`;
};
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
      return this.sheet(`<h2>Accounts are almost here</h2><p class="muted">Sign-in and Pro are switching on soon. Everything free still works, no account needed.</p>
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

  /* ---------- Paywall ---------- */
  paywall({ game = null, reason = null } = {}) {
    const plan = Ent.plan();
    if (plan === 'lifetime') { Core.toast('You’ve already got everything'); return null; }
    const pass = Cfg.product('pass'), life = Cfg.product('lifetime');
    const passActive = plan === 'pass';
    const sub = reason === 'players' ? `Free plays up to ${HC.FREE_PLAYERS} people. Pro brings the whole group.`
      : game && TEASER[game] ? `${Games[game] ? Games[game].title + ': ' : ''}${TEASER[game]}` : 'Lv1 and Lv2 stay free forever. Pro opens up the rest.';
    const canBuy = Cfg.payments && pass && life;
    const s = this.sheet(`
      <div class="pw">
        <h2>Turn up the heat</h2>
        <p class="muted">${esc(sub)}</p>
        ${perkList(PRO_PERKS)}
        ${canBuy ? `<div class="pw-options">
          <button class="pw-opt" data-buy="pass">
            <span class="pw-name">${passActive ? '+4 hours' : 'Date Night Pass'}</span>
            <span class="pw-price">${esc(pass.display)}</span>
            <span class="pw-desc">${passActive ? 'Adds 4 hours to your pass' : '4 hours of everything'}</span>
          </button>
          <button class="pw-opt best" data-buy="lifetime">
            <span class="pw-name">Pro Lifetime</span>
            <span class="pw-price">${esc(life.display)}</span>
            <span class="pw-desc">Pay once. Keep it forever.</span>
          </button>
        </div>` : '<p class="pw-soon">Pro is switching on soon. Everything free still works.</p>'}
        ${game && Taste.canClaim(game) && document.getElementById('stage') ? '<button class="btn block ghost sm" id="pwTaste" style="margin-top:12px">Or use your free Hot card</button>' : ''}
        <p class="form-err" id="pwErr" role="alert" hidden></p>
        <p class="note center pw-foot">${Auth.signedIn() ? '' : '<button class="linkish" id="pwRestore">Already bought? Restore purchase</button><br>'}
          UPI, cards and more via Razorpay. <a href="/terms">Terms</a> · <a href="/refund">Refunds</a></p>
        <button class="btn block ghost sm" data-close>Not now</button>
      </div>`, { cls: 'pw-wrap' });
    const el = s.el, err = $('#pwErr', el);
    const tasteBtn = $('#pwTaste', el);
    if (tasteBtn) tasteBtn.onclick = async () => {
      this.busy(tasteBtn, true);
      try { await Taste.claim(game); s.close(); Core.toast('Your free Hot card is up next'); }
      catch (e) { this.busy(tasteBtn, false); this.err(err, e.message); }
    };
    const restore = $('#pwRestore', el);
    if (restore) restore.onclick = () => { s.close(); this.signIn({ reason: 'Sign in with the email you bought with. Your purchase comes back with it.', then: () => this.afterRestore() }); };
    $$('[data-buy]', el).forEach((b) => (b.onclick = async () => {
      const product = b.dataset.buy;
      SFX.play('tap');
      if (!Auth.signedIn()) {
        s.close();
        return this.signIn({ reason: 'Sign in first so your purchase stays with your account. No passwords, just a code.', then: () => this.paywall({ game, reason }) });
      }
      this.err(err, '');
      $$('[data-buy]', el).forEach((x) => (x.disabled = true));
      b.classList.add('loading');
      try {
        const r = await Pay.buy(product);
        if (r.ok) { s.close(); this.success(product); return; }
        if (r.paid) this.err(err, 'Payment received. Unlocking can take a minute: pull up your profile shortly.');
        else if (r.error) this.err(err, r.error.message);
      } catch (e) {
        if (e.code === 'already_lifetime') { await Auth.refresh(); s.close(); Core.toast('You’ve already got Lifetime'); return; }
        this.err(err, e.message);
      } finally {
        b.classList.remove('loading');
        $$('[data-buy]', el).forEach((x) => (x.disabled = false));
      }
    }));
    return s;
  },

  async afterRestore() {
    await Auth.refresh(); await Premium.load();
    const plan = Ent.plan();
    Core.toast(plan === 'lifetime' ? 'Lifetime restored' : plan === 'pass' ? 'Pass restored' : 'No purchase on this account yet');
    this.refreshScreens();
  },

  success(product) {
    const until = Auth.profile && Auth.profile.premium_until;
    const o = document.createElement('div');
    o.className = 'pw-success'; o.setAttribute('role', 'status');
    o.innerHTML = `<div class="pw-burst"></div><div class="pw-ok"><div class="pw-check" aria-hidden="true"></div>
      <h2>You’re in.</h2><p>${product === 'lifetime' ? 'Lv3 is open on every game. Forever.' : `Lv3 is open until ${esc(new Date(until).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }))}.`}</p>
      <button class="btn" data-ok>Let’s go</button></div>`;
    document.getElementById('app').appendChild(o);
    vibrate([30, 40, 60, 40, 90]); SFX.play('win');
    const r = o.querySelector('.pw-ok').getBoundingClientRect();
    window.Motion && Motion.embers && Motion.embers(3, r.left + r.width / 2, r.top + 40);
    const close = () => { o.classList.add('out'); setTimeout(() => o.remove(), 260); };
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

  /* ---------- Pass chip, warnings, expiry ---------- */
  updatePassChip() {
    const plan = Ent.plan(), admin = Admin.active();
    const text = admin ? `Admin · ${fmtLeft(Admin.exp - Cfg.now())}` : plan === 'pass' ? `Pass · ${fmtLeft(Ent.passLeft())}` : '';
    const homeSlot = document.getElementById('passChipSlot');
    if (homeSlot) {
      let c = homeSlot.firstElementChild;
      if (!text) homeSlot.innerHTML = '';
      else if (!c) homeSlot.innerHTML = `<button class="pass-chip" data-act="${admin ? 'admin' : 'account'}">${esc(text)}</button>`;
      else c.textContent = text;
    }
    const hudTop = $('.hud-top');
    if (hudTop) {
      let c = $('#passChipHud');
      if (!text) { if (c) c.remove(); }
      else if (!c) { const b = document.createElement('button'); b.id = 'passChipHud'; b.className = 'pass-chip'; b.dataset.act = admin ? 'admin' : 'account'; b.textContent = text; hudTop.insertBefore(b, hudTop.lastElementChild); }
      else c.textContent = text;
    }
  },

  account() {
    if (!Auth.signedIn()) return this.profile();
    const plan = Ent.plan();
    const s = this.sheet(`<h2>Your account</h2>
      <div class="acct-mini">
        <div><span class="lbl">Email</span><b>${esc(Auth.email())}</b></div>
        <div><span class="lbl">Plan</span><b>${PLAN_LABEL[plan]}</b></div>
        ${plan === 'pass' ? `<div><span class="lbl">Time left</span><b id="amLeft">${fmtLeft(Ent.passLeft())}</b></div>` : ''}
      </div>
      <div class="col" style="margin-top:14px">
        ${plan === 'pass' ? '<button class="btn block" id="amMore">+4 hours</button>' : ''}
        <button class="btn block ghost" id="amProfile">Open profile</button>
        <button class="btn block ghost" id="amOut">Sign out</button>
      </div>`);
    const t = setInterval(() => { const l = $('#amLeft', s.el); if (!l || s.closed) return clearInterval(t); l.textContent = fmtLeft(Ent.passLeft()); }, 1000);
    const more = $('#amMore', s.el); if (more) more.onclick = () => { s.close(); this.paywall(); };
    $('#amProfile', s.el).onclick = () => { s.close(); this.profile(); };
    $('#amOut', s.el).onclick = async () => { s.close(); await Auth.signOut(); Core.toast('Signed out'); this.refreshScreens(); };
  },

  passWarning() {
    const pass = Cfg.product('pass');
    const s = this.sheet(`<h2>15 minutes left</h2><p class="muted">Plenty of time to get into trouble. Want 4 more hours?</p>
      <div class="col" style="margin-top:12px">
        ${Cfg.payments && pass ? `<button class="btn block" id="pwMore">+4 hours · ${esc(pass.display)}</button>` : ''}
        <button class="btn block ghost" data-close>Not now</button></div>`);
    const b = $('#pwMore', s.el); if (b) b.onclick = () => { s.close(); this.paywall(); };
  },

  expired() {
    if ($('.acct-wrap.expired')) return;
    const pass = Cfg.product('pass'), life = Cfg.product('lifetime');
    const s = this.sheet(`<h2>Pass’s up</h2><p class="muted">Lv3 is locked again. Spicy is still very much on the table.</p>
      <div class="col" style="margin-top:12px">
        ${Cfg.payments && pass ? `<button class="btn block" data-buy="pass">Another pass · ${esc(pass.display)}</button>` : ''}
        ${Cfg.payments && life ? `<button class="btn block alt" data-buy="lifetime">Go Lifetime · ${esc(life.display)}</button>` : ''}
        <button class="btn block ghost" data-close>Stay at Spicy</button></div>`, { cls: 'expired' });
    $$('[data-buy]', s.el).forEach((b) => (b.onclick = () => { s.close(); this.paywall(); }));
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
    }).join('')}</div><p class="note">${Ent.pro() ? 'Pro has every Hot card, so these can wait.' : `${left} of ${GAME_IDS.length} free Hot cards left.`}</p>`;
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
    const p = Auth.profile, plan = Ent.plan(), prefs = Prefs.get(), st = Stats.get(), pro = Ent.pro();
    const fav = Stats.favorite();
    const pass = Cfg.product('pass');
    const life = Cfg.product('lifetime');
    const status = plan === 'lifetime'
      ? `<div class="pro-active"><span class="plan-badge life">Lifetime</span><b>Pro active</b><p class="muted" id="pfLifeDate">Thanks for backing Heat Check.</p></div>`
      : plan === 'pass'
        ? `<div class="pro-active"><span class="plan-badge pass">Date Night Pass</span><b>Pro active</b><div class="pf-count" id="pfLeft">${fmtLeft(Ent.passLeft())}</div>
           <p class="muted">Ends ${esc(fmtDate(p.premium_until))}</p>
           ${Cfg.payments && pass ? `<button class="btn block ghost sm" id="pfMore">+4 hours · ${esc(pass.display)}</button>` : ''}</div>`
        : `${perkList(PRO_PERKS)}
           ${Cfg.payments && pass && life ? `<div class="pf-buy"><button class="btn" data-pfbuy="pass">Pass · ${esc(pass.display)}</button><button class="btn alt best" data-pfbuy="lifetime">Lifetime · ${esc(life.display)}</button></div>` : '<p class="pw-soon">Pro is switching on soon.</p>'}`;
    const seg = (key, opts, cur, locked) => `<div class="seg ${locked ? 'locked' : ''}" data-pref="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const sw = (key, on, label, note) => `<div class="toggle"><div><b>${label}</b>${note ? `<div class="note">${note}</div>` : ''}</div><button class="switch ${on ? 'on' : ''}" data-prefsw="${key}" aria-label="${label}"></button></div>`;
    return `
      <section class="pf-card pf-hero">
        <div class="pf-ring glow" aria-hidden="true"><span>${esc((Auth.email()[0] || '?').toUpperCase())}</span></div>
        <div class="pf-email">${esc(Auth.email())}</div>
        <div class="row" style="justify-content:center;gap:8px"><span class="plan-badge ${plan === 'lifetime' ? 'life' : plan === 'pass' ? 'pass' : ''}">${PLAN_LABEL[plan]}</span><span class="note">Member since ${esc(fmtDate(p.created_at, false))}</span></div>
      </section>
      <section class="pf-card"><h3>${pro ? 'Your plan' : 'Go Pro'}</h3>${status}</section>
      <section class="pf-card"><h3>Free Hot cards</h3>${this.tasteTracker()}</section>
      <section class="pf-card"><h3>Purchase history</h3><div id="pfPurchases"><p class="note">Digging out your receipts…</p></div>
        <p class="note"><a href="/refund">Need a refund?</a></p></section>
      <section class="pf-card"><h3>Preferences</h3>
        ${sw('auto_ramp', prefs.auto_ramp, 'Auto-ramp', 'Heat climbs a level every few cards.')}
        <div class="field"><label>Cards per ramp</label><div class="stepper"><button class="icon-btn" data-cpr="-1" aria-label="Fewer">−</button><b id="pfCpr">${prefs.cards_per_ramp}</b><button class="icon-btn" data-cpr="1" aria-label="More">+</button></div></div>
        <div class="field"><label>Penalties</label>${seg('mode', [['drink', '🍸 Drinks'], ['water', '💧 No alcohol'], ['dare', '🎲 Dares']], prefs.mode)}</div>
        ${sw('sound', !SFX.muted, 'Sound')}
        ${sw('haptics', prefs.haptics, 'Haptics')}
        <div class="field"><label>Motion</label>${seg('motion', [['system', 'Phone setting'], ['reduce', 'Reduced'], ['full', 'Full']], prefs.motion)}</div>
        <div class="field"><label>Sound pack ${pro ? '' : '<span class="pro-tag">Pro</span>'}</label>${seg('soundPack', [['classic', 'Classic'], ['velvet', 'Velvet']], pro ? prefs.soundPack : 'classic', !pro)}</div>
        <div class="field"><label>Home look ${pro ? '' : '<span class="pro-tag">Pro</span>'}</label>${seg('look', [['ember', 'Ember'], ['midnight', 'Midnight'], ['neon', 'Neon']], pro ? prefs.look : 'ember', !pro)}</div>
        <div class="field"><label>Saved player names ${pro ? '' : '<span class="pro-tag">Pro</span>'}</label>
          ${pro ? `<div class="chips-row" id="pfNames">${prefs.savedNames.length ? prefs.savedNames.map((n) => `<button class="chip" data-delname="${esc(n)}">${esc(n)} ✕</button>`).join('') : '<span class="note">Names you play with get saved here.</span>'}</div>
            <div class="row" style="margin-top:8px"><input class="input" id="pfNameIn" maxlength="14" placeholder="Add a name"><button class="btn sm" id="pfNameAdd">Add</button></div>`
            : '<button class="btn ghost sm" data-act="paywall">Unlock saved names</button>'}
        </div>
        <p class="note">Synced to your account.</p>
      </section>
      <section class="pf-card"><h3>Your stats</h3>
        <div class="pf-stats"><div><b>${st.sessions}</b><span>games played</span></div>
          <div><b>${fav ? esc(Games[fav] ? Games[fav].title : fav) : 'None yet'}</b><span>favorite game</span></div>
          <div><b>${st.topHeat ? `Lv${st.topHeat} ${HEAT[st.topHeat].name}` : 'None yet'}</b><span>highest heat</span></div></div>
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
    $$('[data-pfbuy]', el).forEach((b) => (b.onclick = async () => {
      this.busy(b, true);
      try {
        const r = await Pay.buy(b.dataset.pfbuy);
        if (r.ok) { s.close(); this.success(b.dataset.pfbuy); return; }
        if (r.error) Core.toast(r.error.message);
      } catch (e) { Core.toast(e.message); }
      this.busy(b, false);
    }));
    on('#pfMore', () => this.paywall());
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
      if (Ent.plan() === 'pass') {
        const t = setInterval(() => { const l = $('#pfLeft', el); if (!l || !el.isConnected) return clearInterval(t); l.textContent = fmtLeft(Ent.passLeft()); }, 1000);
      }
      this.loadPurchases(el);
    }
    // preferences
    $$('[data-pref]', el).forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (g.classList.contains('locked')) return this.paywall();
      const k = g.dataset.pref, v = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
      $$('button', g).forEach((x) => x.classList.toggle('on', x === b)); SFX.play('tap');
      Prefs.set({ [k]: v });
      if (k === 'mode') Prefs.applyNightDefaults();
    }));
    $$('[data-prefsw]', el).forEach((b) => (b.onclick = () => {
      const k = b.dataset.prefsw;
      if (k === 'sound') { SFX.setMuted(!SFX.muted); b.classList.toggle('on', !SFX.muted); Prefs.set({}); }
      if (k === 'haptics') { const v = !Prefs.get().haptics; Prefs.set({ haptics: v }); b.classList.toggle('on', v); if (v) vibrate(20); }
      if (k === 'auto_ramp') { const v = !Prefs.get().auto_ramp; Prefs.set({ auto_ramp: v }); Prefs.applyNightDefaults(); Core.S.rampCount = 0; Core.save(); b.classList.toggle('on', v); }
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
      const life = rows.find((r) => r.product === 'lifetime' && r.status === 'paid');
      const ld = $('#pfLifeDate', el); if (ld && life) ld.textContent = `Bought ${fmtDate(life.paid_at || life.created_at, false)}. Thanks for backing Heat Check.`;
      if (!shown.length) { host.innerHTML = '<p class="note">No receipts yet. Suspiciously innocent.</p>'; return; }
      host.innerHTML = `<ul class="pf-purchases">${shown.map((r, i) => `<li>
        <div><b>${r.product === 'lifetime' ? 'Pro Lifetime' : 'Date Night Pass'}</b><span class="note">${esc(fmtDate(r.paid_at || r.created_at))}</span></div>
        <div class="pp-right"><b>${rupees(r.amount_inr)}</b><span class="pp-status ${esc(r.status)}">${r.status === 'paid' ? 'Paid' : 'Failed'}</span>
        ${r.razorpay_payment_id ? `<span class="note">…${esc(r.razorpay_payment_id.slice(-6))}</span>` : ''}</div>
        ${r.status === 'paid' ? `<button class="btn ghost sm" data-receipt="${i}">Download receipt</button>` : ''}</li>`).join('')}</ul>`;
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
        <tr><th>Item</th><td>${r.product === 'lifetime' ? 'Heat Check Pro Lifetime (one-time)' : 'Heat Check Date Night Pass (4 hours)'}</td></tr>
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
        <p class="muted">Your profile, preferences, stats and free hot card history are deleted. Purchase records are kept without your name or email, because the law says we keep payment records. Any Pro access ends.</p>
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
          <div class="row ad-row"><button class="btn sm" data-grant="grant_pass">+ Pass</button><button class="btn sm alt" data-grant="grant_lifetime">+ Lifetime</button><button class="btn sm ghost" data-grant="revoke">Revoke</button></div>
          <p class="note" id="adGrantMsg"></p></section>
        <section class="pf-card"><h3>Games</h3><div id="adGames"><p class="note">Loading…</p></div></section>
        <section class="pf-card"><h3>Lv3 cards</h3>
          <div class="row ad-row"><select class="input" id="adGame">${GAME_IDS.map((g) => `<option value="${g}">${esc(Games[g].title)}</option>`).join('')}</select>
            <button class="btn sm" id="adNew">+ New</button></div>
          <div id="adForm"></div><div id="adCards"><p class="note">Loading…</p></div></section>
      </div>`, { full: true, cls: 'admin' });
    const el = s.el;
    $('#adExit', el).onclick = async () => { await Admin.logout(); s.close(); Core.toast('Admin locked'); this.refreshScreens(); };
    const fail = (e) => { Core.toast(e.message); if (e.code === 'admin_locked') s.close(); };
    // stats
    Admin.api('GET', '/api/admin/stats').then((st) => {
      const tiles = [['signups', 'signups'], ['signups_7d', 'new this week'], ['pass_sales', 'passes sold'], ['lifetime_sales', 'lifetimes sold'], ['revenue_inr', 'revenue'], ['active_passes', 'passes live now']];
      $('#adStats', el).innerHTML = tiles.map(([k, l]) => `<div><b>${k === 'revenue_inr' ? rupees(st[k] || 0) : esc(String(st[k] ?? 0))}</b><span>${l}</span></div>`).join('');
    }).catch(fail);
    // grants
    $$('[data-grant]', el).forEach((b) => (b.onclick = async () => {
      const email = $('#adEmail', el).value.trim(), msg = $('#adGrantMsg', el);
      if (!email) return;
      this.busy(b, true, '…');
      try {
        const r = await Admin.api('POST', '/api/admin/grant', { email, action: b.dataset.grant });
        msg.textContent = `${r.email}: ${r.plan}${r.premium_until && r.plan === 'pass' ? ' until ' + fmtDate(r.premium_until) : ''}`;
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
      const g = $('#adGame', el).value, x = (c && c.extra) || {};
      $('#adForm', el).innerHTML = `<div class="ad-form">
        <textarea class="input" id="cfText" rows="3" maxlength="400" placeholder="Card text">${c ? esc(c.text) : ''}</textarea>
        ${HC.modeOf(g) === 'couples' && g !== 'charades' ? `<textarea class="input" id="cfDare" rows="2" maxlength="400" placeholder="Optional dare">${c && c.optional_dare ? esc(c.optional_dare) : ''}</textarea>` : ''}
        ${g === 'wyr' ? `<input class="input" id="cfA" maxlength="200" placeholder="Option A" value="${esc(x.a || '')}"><input class="input" id="cfB" maxlength="200" placeholder="Option B" value="${esc(x.b || '')}">` : ''}
        ${g === 'charades' ? `<select class="input" id="cfCat">${CATS.map((z) => `<option ${x.category === z ? 'selected' : ''}>${z}</option>`).join('')}</select><select class="input" id="cfOrigin">${ORIGINS.map((z) => `<option ${x.origin === z ? 'selected' : ''}>${z}</option>`).join('')}</select>` : ''}
        <div class="toggle"><div><b>Free Hot card (taste)</b><div class="note">Only one per game is used. Served by /api/taste only.</div></div><button class="switch ${c && c.is_taste ? 'on' : ''}" id="cfTaste" aria-label="Taste card"></button></div>
        <div class="toggle"><div><b>Active</b></div><button class="switch ${!c || c.active ? 'on' : ''}" id="cfActive" aria-label="Active"></button></div>
        <div class="row ad-row"><button class="btn sm" id="cfSave">${c ? 'Save' : 'Add card'}</button><button class="btn sm ghost" id="cfCancel">Cancel</button></div>
        <p class="note" id="cfMsg"></p></div>`;
      $('#cfActive', el).onclick = (e) => e.currentTarget.classList.toggle('on');
      $('#cfTaste', el).onclick = (e) => e.currentTarget.classList.toggle('on');
      $('#cfCancel', el).onclick = () => ($('#adForm', el).innerHTML = '');
      $('#cfSave', el).onclick = async (e) => {
        const extra = g === 'wyr' ? { a: $('#cfA', el).value, b: $('#cfB', el).value } : g === 'charades' ? { category: $('#cfCat', el).value, origin: $('#cfOrigin', el).value } : {};
        const dareEl = $('#cfDare', el);
        this.busy(e.currentTarget, true, 'Saving…');
        try {
          await Admin.api('POST', '/api/admin/cards', { id: c ? c.id : undefined, game: g, text: $('#cfText', el).value, optional_dare: dareEl ? dareEl.value : '', extra, active: $('#cfActive', el).classList.contains('on'), is_taste: $('#cfTaste', el).classList.contains('on') });
          $('#adForm', el).innerHTML = ''; loadCards(); Premium.loaded = false; Premium.load();
          Core.toast(c ? 'Card saved' : 'Card added');
        } catch (err) { $('#cfMsg', el).textContent = err.message; this.busy($('#cfSave', el), false); }
      };
    };
    const loadCards = () => {
      const g = $('#adGame', el).value;
      $('#adCards', el).innerHTML = '<p class="note">Loading…</p>';
      Admin.api('GET', '/api/admin/cards?game=' + encodeURIComponent(g)).then((rows) => {
        cards = rows;
        $('#adCards', el).innerHTML = rows.length ? `<ul class="ad-cards">${rows.map((c, i) => `<li class="${c.active ? '' : 'off'}"><span>${c.is_taste ? '<b class="pro-tag">Taste</b> ' : ''}${esc(c.text)}</span><button class="btn ghost sm" data-edit="${i}">Edit</button></li>`).join('')}</ul>` : '<p class="note">No Lv3 cards for this game yet.</p>';
        $$('[data-edit]', el).forEach((b) => (b.onclick = () => { form(cards[+b.dataset.edit]); $('#adForm', el).scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
      }).catch(fail);
    };
    $('#adGame', el).onchange = () => { $('#adForm', el).innerHTML = ''; loadCards(); };
    $('#adNew', el).onclick = () => form(null);
    loadCards();
  },
};

/* ---------- Hot is locked: a quiet chip, at most once per session. Never nags. ---------- */
const Lock = {
  rampLocked(game) {
    try { if (sessionStorage.getItem('hc_hotchip')) return; sessionStorage.setItem('hc_hotchip', '1'); } catch (e) {}
    const chip = document.createElement('div');
    chip.className = 'hot-chip'; chip.setAttribute('role', 'status');
    const action = !Auth.signedIn() ? '<button class="linkish" data-hc="signin">Sign in to try Hot</button>'
      : Taste.canClaim(game) ? '<button class="linkish" data-hc="taste">Use your free Hot card?</button>'
      : '<button class="linkish" data-act="paywall">Unlock</button>';
    chip.innerHTML = `<span aria-hidden="true">🔒</span> Hot is locked. ${action}<button class="hc-x" aria-label="Dismiss">✕</button>`;
    document.getElementById('app').appendChild(chip);
    const close = () => { chip.classList.add('out'); setTimeout(() => chip.remove(), 240); };
    const t = setTimeout(close, 6000);
    chip.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      clearTimeout(t); close();
      if (b.dataset.hc === 'signin') UI.signIn({ reason: 'Sign in and every game gives you one free Hot card.' });
      if (b.dataset.hc === 'taste') { try { await Taste.claim(game); Core.toast('Your free Hot card is up next'); } catch (err) { Core.toast(err.message); } }
    });
  },
};

/* HUD: once this game's free Hot card is spent (and no Pro), say so plainly with a way out */
(() => {
  const orig = Core.updateHud.bind(Core);
  Core.updateHud = function () {
    orig();
    const hud = $('.hud'); if (!hud) return;
    const game = Core.game;
    let strip = $('.hot-lock', hud);
    const show = game && !Ent.pro() && Auth.signedIn() && Taste.used(game) && !Taste.showing && !Taste.pendingFor(game);
    if (!show) { if (strip) strip.remove(); return; }
    if (!strip) {
      strip = document.createElement('div');
      strip.className = 'hot-lock';
      strip.innerHTML = '<span class="hl-badge" aria-hidden="true">🔒</span><span class="hl-text">Still at Spicy. Hot is locked.</span><button class="linkish" data-act="paywall">Unlock</button>';
      const heat = $('.heat', hud); heat ? heat.after(strip) : hud.appendChild(strip);
    }
  };
})();

/* Admin pass chip opens the panel */
document.addEventListener('click', (e) => { const a = e.target.closest('[data-act="admin"]'); if (a) UI.admin(); });

Object.assign(window, { UI, Lock });
