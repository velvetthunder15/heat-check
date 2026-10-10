/* Heat Check: accounts, entitlements, tastes, preferences, stats, payments, admin client.
   UI for all of this lives in account-ui.js. Nothing here is trusted by the server:
   the server decides plan, prices and access (Lv3 cards come from Supabase RLS). */

const GAME_IDS = ['redflag', 'nhie', 'bodypart', 'charades', 'wyr', 'mostlikely', 'hotseat', 'twotruths', 'swap'];
const GAME_OF = (cardGame) => (cardGame === 'rate' ? 'redflag' : cardGame);
const SITE = { contact: '%%CONTACT_EMAIL%%'.startsWith('%%') ? '' : '%%CONTACT_EMAIL%%' };

const Store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};

const loadScript = (src) => new Promise((resolve, reject) => {
  const have = document.querySelector(`script[data-src="${src}"]`);
  if (have) { if (have.dataset.ready) return resolve(); have.addEventListener('load', () => resolve()); have.addEventListener('error', reject); return; }
  const s = document.createElement('script');
  s.src = src; s.async = true; s.dataset.src = src;
  s.onload = () => { s.dataset.ready = '1'; resolve(); };
  s.onerror = () => { s.remove(); reject(new Error('Couldn’t load ' + new URL(src, location.href).host)); };
  document.head.appendChild(s);
});

/* ---------- Public config from /api/config ---------- */
const Cfg = {
  data: null, accounts: false, payments: false, offset: 0,
  async load() {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch('/api/config', { cache: 'no-store', signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok || !(r.headers.get('content-type') || '').includes('application/json')) throw new Error('no backend');
      this.data = await r.json();
      this.offset = (Number(this.data.now) || Date.now()) - Date.now();
      this.accounts = !!(this.data.accounts && this.data.supabaseUrl && this.data.supabaseAnonKey);
      this.payments = this.accounts && !!(this.data.payments && this.data.razorpayKeyId);
    } catch (e) { this.data = null; this.accounts = false; this.payments = false; }
  },
  now() { return Date.now() + this.offset; },
  product(id) { return (this.data && this.data.products && this.data.products[id]) || null; },
  gameOn(id) { return !this.data || !this.data.games || this.data.games[id] !== false; },
};

/* ---------- Supabase client (vendored supabase-js, loaded only when accounts are on) ---------- */
const SB = {
  client: null, _p: null,
  get() {
    if (this.client) return Promise.resolve(this.client);
    if (!Cfg.accounts) return Promise.resolve(null);
    if (!this._p) {
      this._p = loadScript('/js/vendor/supabase-2.117.3.js').then(() => {
        this.client = window.supabase.createClient(Cfg.data.supabaseUrl, Cfg.data.supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'hc_auth' },
        });
        return this.client;
      }).catch((e) => { this._p = null; throw e; });
    }
    return this._p;
  },
};

/* ---------- Small event bus so screens can refresh when account state changes ---------- */
const Bus = {
  fns: new Set(),
  on(fn) { this.fns.add(fn); return () => this.fns.delete(fn); },
  emit(type) { this.fns.forEach((f) => { try { f(type); } catch (e) { console.error(e); } }); },
};

/* ---------- Auth ---------- */
const Auth = {
  user: null, profile: null, ready: false, _pending: null,
  signedIn() { return !!this.user; },
  email() { return (this.user && this.user.email) || (this.profile && this.profile.email) || ''; },
  async init() {
    let c;
    try { c = await SB.get(); } catch (e) { this.ready = true; return; }
    if (!c) { this.ready = true; return; }
    // Never call Supabase inside this callback directly (it can deadlock): defer.
    c.auth.onAuthStateChange((event, session) => {
      setTimeout(() => {
        if (event === 'SIGNED_OUT') return this._clear();
        if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session) return this.onSession(session);
        if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session) this.user = session.user;
        if (event === 'INITIAL_SESSION' && !session) { this.ready = true; Bus.emit('auth'); }
      }, 0);
    });
  },
  onSession(session) {
    if (this.user && this.user.id === session.user.id && this.profile) return Promise.resolve();
    if (this._pending && this._pending.id === session.user.id) return this._pending.p;
    this.user = session.user;
    const p = (async () => {
      await this.refresh();
      await Sync.onLogin();
      await Admin.status();
      await Premium.load();
      this.ready = true;
      Bus.emit('auth');
    })().finally(() => { this._pending = null; });
    this._pending = { id: session.user.id, p };
    return p;
  },
  async refresh() {
    if (!this.user) return;
    const c = await SB.get().catch(() => null);
    if (!c) return;
    for (let i = 0; i < 3; i++) {
      const { data, error } = await c.from('profiles').select('*').eq('id', this.user.id).maybeSingle();
      if (!error && data) { this.profile = data; Bus.emit('profile'); return; }
      await sleep(700); // the profile row is created by a trigger right after signup
    }
  },
  async token() {
    const c = await SB.get(); if (!c) return null;
    const { data } = await c.auth.getSession();
    return (data && data.session && data.session.access_token) || null;
  },
  async verifyCode(email, code) {
    const c = await SB.get();
    const { data, error } = await c.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error || !data || !data.session) throw new Error(error && /expired/i.test(error.message) ? 'That code expired. Get a new one.' : 'That code didn’t work. Check it or get a new one.');
    await this.onSession(data.session);
    return data.session;
  },
  async signOut(scope = 'local') {
    const c = await SB.get();
    try { await Admin.logout(); } catch (e) {}
    if (c) await c.auth.signOut({ scope });
    this._clear();
  },
  _clear() {
    if (!this.user && !this.profile) return;
    this.user = null; this.profile = null; Admin.exp = 0;
    Ent._wasPro = false; Ent._adminWas = false; Ent._expirePending = false; // signing out isn't an expiry
    Premium.clear();
    Bus.emit('auth');
  },
};

/* ---------- Authenticated calls to our own /api ---------- */
const Api = {
  async call(method, path, body) {
    const token = await Auth.token();
    let r;
    try {
      r = await fetch(path, {
        method,
        headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
      });
    } catch (e) { throw Object.assign(new Error('You look offline. Check your connection.'), { code: 'offline' }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.message || 'Something went wrong. Try again.'), { code: j.error, status: r.status });
    return j;
  },
};

/* ---------- Entitlements (display only; the server enforces) ---------- */
const Ent = {
  _wasPro: false, _expirePending: false, _adminWas: false,
  profilePro() {
    const p = Auth.profile; if (!p) return false;
    if (p.plan === 'lifetime') return true;
    return !!p.premium_until && Date.parse(p.premium_until) > Cfg.now();
  },
  pro() { return Admin.active() || this.profilePro(); },
  plan() {
    const p = Auth.profile;
    if (!Auth.signedIn() || !p) return 'guest';
    if (p.plan === 'lifetime') return 'lifetime';
    if (p.premium_until && Date.parse(p.premium_until) > Cfg.now()) return 'pass';
    return 'free';
  },
  passLeft() { const p = Auth.profile; return p && p.premium_until ? Math.max(0, Date.parse(p.premium_until) - Cfg.now()) : 0; },
  unlimitedPlayers() { return this.pro(); },
  inGame() { return !!document.getElementById('stage'); },
  // Called by Core.draw: at expiry the current card finishes, then Lv3 locks here.
  checkExpiry() {
    if (!this._expirePending) return;
    this._expirePending = false;
    Premium.clear();
    setTimeout(() => window.UI && UI.expired(), 450);
  },
  tick() {
    const nowPro = this.pro();
    const admin = Admin.active();
    if (this._wasPro && !nowPro) {
      if (this._adminWas && !admin && !this.profilePro()) {
        Premium.clear(); Core.toast('Admin session ended');
      } else if (this.inGame()) this._expirePending = true;
      else { Premium.clear(); window.UI && UI.expired(); }
      if (Auth.signedIn()) Auth.refresh();
    }
    if (!this._wasPro && nowPro && !Premium.loaded) Premium.load();
    if (this.plan() === 'pass') {
      const left = this.passLeft(), key = 'hc_warned_' + Auth.profile.premium_until;
      if (left > 0 && left <= 15 * 60 * 1000 && !sessionStorage.getItem(key)) { sessionStorage.setItem(key, '1'); window.UI && UI.passWarning(); }
    }
    this._wasPro = nowPro; this._adminWas = admin;
    window.UI && UI.updatePassChip();
  },
};

/* ---------- Lv3 cards: in memory only, never persisted ---------- */
const Premium = {
  cards: [], loaded: false, loading: null,
  async load() {
    if (!Ent.pro()) { this.clear(); return; }
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        let rows;
        if (Admin.active() && !Ent.profilePro()) rows = await Api.call('GET', '/api/admin/cards?active=1');
        else {
          const c = await SB.get();
          const { data, error } = await c.from('premium_cards').select('game,heat,text,optional_dare,extra');
          if (error) throw error;
          rows = data;
        }
        if (!Ent.pro()) return this.clear();
        this.cards = (rows || []).map((r) => ({ ...(r.extra || {}), game: r.game, heat: 3, text: r.text, ...(r.optional_dare ? { optionalDare: r.optional_dare } : {}) }));
        this.loaded = true;
        Bus.emit('premium');
      } catch (e) { console.warn('Lv3 cards not loaded', e && e.message); }
    })().finally(() => { this.loading = null; });
    return this.loading;
  },
  clear() { this.cards = []; this.loaded = false; },
};

/* ---------- One free Lv3 card per game ---------- */
const Taste = {
  pending: null,   // game id whose free hot card plays next
  local() { return Store.get('hc_taste', {}); },
  used(game) { return !!(this.local()[game] || (Auth.profile && Auth.profile.taste_used && Auth.profile.taste_used[game])); },
  usedCount() { return GAME_IDS.filter((g) => this.used(g)).length; },
  card(game) { return Core.cards.find((c) => c.taste && c.game === game) || null; },
  // Marked when the card is shown (drawn), so a reload never gives a second one
  markUsed(game) {
    const l = this.local();
    if (!l[game]) { l[game] = new Date().toISOString(); Store.set('hc_taste', l); }
    if (Auth.signedIn()) this.push({ [game]: l[game] });
  },
  async push(obj) {
    try {
      const c = await SB.get();
      const { data, error } = await c.rpc('add_tastes', { p_tastes: obj });
      if (!error && data && Auth.profile) Auth.profile.taste_used = data;
    } catch (e) {}
  },
};

/* ---------- Haptics switch (wraps navigator.vibrate) ---------- */
(() => {
  try {
    const orig = navigator.vibrate ? navigator.vibrate.bind(navigator) : null;
    if (!orig) return;
    navigator.vibrate = (p) => (Prefs.get().haptics === false ? false : orig(p));
  } catch (e) {}
})();

/* ---------- Preferences (local for guests, synced for accounts) ---------- */
const Prefs = {
  defaults: { maxHeat: 3, mode: 'drink', haptics: true, motion: 'system', savedNames: [], soundPack: 'classic', look: 'ember' },
  get() { return { ...this.defaults, ...Store.get('hc_prefs', {}) }; },
  clean(p) {
    const o = { ...this.defaults, ...p };
    o.maxHeat = [1, 2, 3].includes(+o.maxHeat) ? +o.maxHeat : 3;
    o.mode = ['drink', 'water', 'dare'].includes(o.mode) ? o.mode : 'drink';
    o.haptics = o.haptics !== false;
    o.motion = ['system', 'reduce', 'full'].includes(o.motion) ? o.motion : 'system';
    o.soundPack = ['classic', 'velvet'].includes(o.soundPack) ? o.soundPack : 'classic';
    o.look = ['ember', 'midnight', 'neon'].includes(o.look) ? o.look : 'ember';
    o.savedNames = Array.isArray(o.savedNames) ? [...new Set(o.savedNames.map((n) => String(n).trim().slice(0, 14)).filter(Boolean))].slice(0, 30) : [];
    o.sound = !SFX.muted;
    return o;
  },
  set(patch, { sync = true } = {}) {
    const p = this.clean({ ...this.get(), ...patch });
    Store.set('hc_prefs', p);
    this.apply(p);
    if (sync) this.push();
    return p;
  },
  apply(p = this.get()) {
    const html = document.documentElement;
    if (p.motion === 'system') delete html.dataset.motion; else html.dataset.motion = p.motion;
    const pro = Ent.pro();
    SFX.setPack && SFX.setPack(pro ? p.soundPack : 'classic');
    const app = document.getElementById('app');
    if (app) { if (pro && p.look !== 'ember') app.dataset.look = p.look; else delete app.dataset.look; }
  },
  // Defaults for a new night: max heat and penalty mode
  applyNightDefaults() {
    const p = this.get(), st = Core.S.settings;
    st.maxHeat = p.maxHeat; st.mode = p.mode;
    if (st.startHeat > st.maxHeat) st.startHeat = st.maxHeat;
    Core.save();
  },
  _t: 0,
  push() {
    if (!Auth.signedIn()) return;
    clearTimeout(this._t);
    this._t = setTimeout(async () => {
      try { const c = await SB.get(); await c.from('profiles').update({ preferences: this.get() }).eq('id', Auth.user.id); } catch (e) {}
    }, 700);
  },
};

/* ---------- Light stats ---------- */
const Stats = {
  get() { const s = Store.get('hc_stats', {}); return { sessions: +s.sessions || 0, games: s.games && typeof s.games === 'object' ? s.games : {}, maxHeat: +s.maxHeat || 0 }; },
  save(s) { Store.set('hc_stats', s); this.push(); },
  game(id) { const s = this.get(); s.sessions++; s.games[id] = (s.games[id] || 0) + 1; this.save(s); },
  heat(h) { const s = this.get(); if (h > s.maxHeat) { s.maxHeat = h; this.save(s); } },
  favorite() { const g = this.get().games; let best = null; for (const k of Object.keys(g)) if (!best || g[k] > g[best]) best = k; return best; },
  _t: 0,
  push() {
    if (!Auth.signedIn()) return;
    clearTimeout(this._t);
    this._t = setTimeout(async () => {
      try { const c = await SB.get(); await c.from('profiles').update({ stats: this.get() }).eq('id', Auth.user.id); } catch (e) {}
    }, 1500);
  },
};

/* ---------- First login: merge guest data into the profile (union, never remove) ---------- */
const Sync = {
  async onLogin() {
    const p = Auth.profile; if (!p) return;
    const c = await SB.get();
    // tastes
    const local = Taste.local(), have = p.taste_used || {};
    const add = {}; for (const g of Object.keys(local)) if (GAME_IDS.includes(g) && !have[g]) add[g] = local[g];
    if (Object.keys(add).length) await Taste.push(add);
    // preferences: an account's saved prefs win; an empty account takes this device's
    const remote = p.preferences || {};
    if (Object.keys(remote).length) {
      if (typeof remote.sound === 'boolean' && SFX.setMuted) SFX.setMuted(!remote.sound);
      Store.set('hc_prefs', Prefs.clean({ ...Prefs.get(), ...remote }));
      Prefs.applyNightDefaults();
    } else {
      try { await c.from('profiles').update({ preferences: Prefs.get() }).eq('id', p.id); } catch (e) {}
    }
    Prefs.apply();
    // stats: add this device's guest stats once, then the account is the source of truth
    const flag = 'hc_stats_merged_' + p.id, rs = p.stats || {};
    const remoteStats = { sessions: +rs.sessions || 0, games: rs.games && typeof rs.games === 'object' ? rs.games : {}, maxHeat: +rs.maxHeat || 0 };
    if (!Store.get(flag, false)) {
      const l = Stats.get(), games = { ...remoteStats.games };
      for (const k of Object.keys(l.games)) games[k] = (games[k] || 0) + (+l.games[k] || 0);
      const merged = { sessions: remoteStats.sessions + l.sessions, games, maxHeat: Math.max(remoteStats.maxHeat, l.maxHeat) };
      Store.set('hc_stats', merged); Store.set(flag, true);
      try { await c.from('profiles').update({ stats: merged }).eq('id', p.id); } catch (e) {}
    } else Store.set('hc_stats', remoteStats);
  },
};

/* ---------- Payments: Razorpay Checkout, verified server side ---------- */
const Pay = {
  async buy(productId) {
    if (!Cfg.payments) throw new Error('Payments are switching on soon.');
    const order = await Api.call('POST', '/api/create-order', { product: productId });
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      const rz = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'Heat Check',
        description: order.name + ': flirty party games for couples, 18+',
        prefill: { email: order.email },
        readonly: { email: true },
        theme: { color: '#ff2e63' },
        config: { display: {
          blocks: { upi: { name: 'Pay with UPI', instruments: [{ method: 'upi' }] } },
          sequence: ['block.upi'],
          preferences: { show_default_blocks: true },
        } },
        modal: { ondismiss: () => done({ dismissed: true }), confirm_close: true },
        handler: async (resp) => {
          try {
            const v = await Api.call('POST', '/api/verify-payment', resp);
            await Auth.refresh();
            await Premium.load();
            done({ ok: true, granted: v.granted || v.alreadyGranted });
          } catch (e) {
            // Paid but not confirmed yet: the webhook will grant. Poll the profile for a bit.
            for (let i = 0; i < 8 && !Ent.profilePro(); i++) { await sleep(2500); await Auth.refresh(); }
            if (Ent.profilePro()) { await Premium.load(); done({ ok: true, granted: true }); }
            else done({ error: e, paid: true });
          }
        },
      });
      rz.on('payment.failed', () => { /* Checkout shows its own retry options */ });
      rz.open();
    });
  },
  async receiptRows() {
    const c = await SB.get();
    const { data, error } = await c.from('purchases').select('id,product,amount_inr,currency,status,created_at,paid_at,razorpay_payment_id,razorpay_order_id').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return data || [];
  },
};

/* ---------- Turnstile (email step) ---------- */
const Captcha = {
  async render(el, onToken) {
    const key = Cfg.data && Cfg.data.turnstileSiteKey;
    if (!key) throw new Error('Sign-in check isn’t set up yet.');
    await loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    for (let i = 0; i < 40 && !window.turnstile; i++) await sleep(50);
    return window.turnstile.render(el, {
      sitekey: key, theme: 'dark', size: 'flexible', action: 'otp',
      callback: (t) => onToken(t), 'expired-callback': () => onToken(null), 'error-callback': () => onToken(null),
    });
  },
  reset(id) { try { window.turnstile && window.turnstile.reset(id); } catch (e) {} },
  remove(id) { try { window.turnstile && window.turnstile.remove(id); } catch (e) {} },
};

/* ---------- Admin (hidden; server checks role + signed cookie on every call) ---------- */
const Admin = {
  exp: 0,
  active() { return this.exp > Cfg.now(); },
  isAdminUser() { return !!(Auth.profile && Auth.profile.role === 'admin'); },
  async status() {
    if (!this.isAdminUser() || !Cfg.accounts) return;
    try { const s = await Api.call('GET', '/api/admin/status'); this.exp = s.active ? s.expiresAt : 0; } catch (e) { this.exp = 0; }
  },
  async unlock(password) {
    const r = await Api.call('POST', '/api/admin/unlock', { password });
    this.exp = r.expiresAt;
    await Premium.load();
    Prefs.apply();
    Bus.emit('admin');
  },
  async logout() {
    if (!this.exp) return;
    this.exp = 0;
    try { await Api.call('POST', '/api/admin/logout'); } catch (e) {}
    if (!Ent.profilePro()) Premium.clear();
    Prefs.apply();
    Bus.emit('admin');
  },
  api(method, path, body) {
    return Api.call(method, path, body).catch((e) => { if (e.code === 'admin_locked') { this.exp = 0; Bus.emit('admin'); } throw e; });
  },
};

/* ---------- Start up (called from boot.js) ---------- */
const Account = {
  async start() {
    Prefs.apply();
    await Cfg.load();
    Bus.emit('config');
    if (Cfg.accounts) await Auth.init(); else Auth.ready = true;
    Ent._wasPro = Ent.pro();
    setInterval(() => Ent.tick(), 1000);
    window.addEventListener('online', () => { if (Auth.signedIn()) Auth.refresh().then(() => Premium.load()); });
  },
};

// Expose on window too (other modules feature-check with window.X)
Object.assign(window, { GAME_IDS, GAME_OF, SITE, Store, Cfg, SB, Bus, Auth, Api, Ent, Premium, Taste, Prefs, Stats, Sync, Pay, Captcha, Admin, Account });
