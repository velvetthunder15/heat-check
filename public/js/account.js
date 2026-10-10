/* Heat Check: accounts, tiers, limits, paid cards, tastes, preferences, stats, payments, admin client.
   UI for all of this lives in account-ui.js. Nothing here is trusted by the server:
   the server decides plan, prices, limits and access. Spicy and Hot text only ever
   arrives from Supabase (RLS) or the API, is held in memory, and is never persisted. */

const GAME_IDS = HC.GAMES.map((g) => g.id);
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
  // Signing out leaves this phone like a fresh guest: everything the account put here goes.
  // Kept: the 18+ answer and the guest's own Flirty counters (so signing in and out can't reset them).
  wipeDevice(msg) {
    const keep = new Set(['hc_age', 'hc_limits', 'hc_visits', 'hc_visit_counted']);
    try { Object.keys(localStorage).forEach((k) => { if (k.startsWith('hc_') && !keep.has(k)) localStorage.removeItem(k); }); } catch (e) {}
    try { const lit = sessionStorage.getItem('hc_lit'); sessionStorage.clear(); if (lit) sessionStorage.setItem('hc_lit', lit); if (msg) sessionStorage.setItem('hc_flash', msg); } catch (e) {}
    location.replace('/');
  },
  _clear() {
    Taste.drop(); Taste.armed = false;
    if (Core.S && Core.S.heat > 1) { Core.S.heat = 1; Core.S.rampCount = 0; Core.save(); }
    if (!this.user && !this.profile) return;
    this.user = null; this.profile = null; Admin.exp = 0;
    Ent._was = 'guest'; Ent._adminWas = false; Ent._expirePending = false; // signing out isn't an expiry
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

/* ---------- Tiers (display only; the server enforces) ----------
   guest: not signed in. base: signed in, free. lite: Rs 69 for 60 min. premium: Rs 99, lifetime.
   Premium never expires: no expiry check anywhere for it. */
const Ent = {
  _was: 'guest', _expirePending: false, _adminWas: false,
  profileTier() {
    const p = Auth.profile;
    if (!Auth.signedIn() || !p) return 'guest';
    if (p.plan === 'premium') return 'premium';
    if (p.plan === 'lite' && p.premium_until && Date.parse(p.premium_until) > Cfg.now()) return 'lite';
    return 'base';
  },
  tier() { return Admin.active() ? 'premium' : this.profileTier(); },
  plan() { return this.tier(); },
  premium() { return this.tier() === 'premium'; },
  paid() { const t = this.tier(); return t === 'lite' || t === 'premium'; },
  pro() { return this.premium(); },                       // unlimited players, saved names, every look
  liteLeft() { const p = Auth.profile; return this.profileTier() === 'lite' ? Math.max(0, Date.parse(p.premium_until) - Cfg.now()) : 0; },
  unlimitedPlayers() { return this.premium(); },
  inGame() { return !!document.getElementById('stage'); },
  // Called by Core.next: at Lite expiry the current card finishes, then Lite features lock here.
  checkExpiry() {
    if (!this._expirePending) return;
    this._expirePending = false;
    Premium.clear();
    if (Core.S.heat > Core.heatCap()) { Core.S.heat = Core.heatCap(); Core.S.rampCount = 0; Core.save(); }
    setTimeout(() => window.UI && UI.expired(), 450);
  },
  tick() {
    const now = this.tier(), admin = Admin.active();
    if (now !== this._was) {
      const rank = { guest: 0, base: 1, lite: 2, premium: 3 };
      if (rank[now] < rank[this._was] && Auth.signedIn()) {
        if (this._adminWas && !admin) { Premium.clear(); Core.toast('Admin session ended'); this.clampHeat(); }
        else if (this._was === 'lite' && this.inGame()) this._expirePending = true;   // finish the card first
        else { Premium.clear(); this.clampHeat(); if (this._was === 'lite') window.UI && UI.expired(); }
        Auth.refresh();
      }
      if (rank[now] > rank[this._was] || (now === 'lite' && !Premium.loaded)) Premium.load();
      this._was = now;
      Prefs.apply();
      Bus.emit('tier');
    }
    if (now === 'lite') {
      const left = this.liteLeft(), key = 'hc_warned_' + Auth.profile.premium_until;
      if (left > 0 && left <= 5 * 60 * 1000 && !sessionStorage.getItem(key)) { sessionStorage.setItem(key, '1'); window.UI && UI.liteWarning(); }
    }
    this._adminWas = admin;
    window.UI && UI.updatePassChip();
  },
  clampHeat() { if (!this._expirePending && Core.S.heat > Core.heatCap()) { Core.S.heat = Core.heatCap(); Core.S.rampCount = 0; Core.save(); Bus.emit('heat'); } },
};

/* ---------- Paid cards: Spicy (Lite+) and Hot (Premium), in memory only, never persisted ---------- */
const Premium = {
  cards: [], loaded: false, loading: null,
  async load() {
    if (!Ent.paid()) { this.clear(); return; }
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        let rows;
        if (Admin.active() && Ent.profileTier() !== 'premium') rows = await Api.call('GET', '/api/admin/cards?active=1');
        else {
          const c = await SB.get();
          // RLS returns Spicy to Lite and Premium, Hot to Premium only
          const { data, error } = await c.from('premium_cards').select('game,heat,text,optional_dare,extra');
          if (error) throw error;
          rows = data;
        }
        if (!Ent.paid()) return this.clear();
        this.cards = (rows || []).filter((r) => r.heat === 2 || (r.heat === 3 && Ent.premium()))
          .map((r) => ({ ...(r.extra || {}), game: r.game, heat: r.heat, text: r.text, ...(r.optional_dare ? { optionalDare: r.optional_dare } : {}) }));
        this.loaded = true;
        Bus.emit('premium');
      } catch (e) { console.warn('paid cards not loaded', e && e.message); }
    })().finally(() => { this.loading = null; });
    return this.loading;
  },
  clear() { this.cards = []; this.loaded = false; },
};

/* ---------- Hot cards: Premium from memory, Lite one at a time from /api/hot ---------- */
const Cards = {
  _toldUsedUp: {},
  fromRow(c) { return { ...(c.extra || {}), game: c.game, heat: 3, text: c.text, ...(c.optional_dare ? { optionalDare: c.optional_dare } : {}) }; },
  async hot(game) {
    const t = Ent.tier();
    if (t === 'premium') return Core.pick(game, 3);
    if (t !== 'lite') return null;
    if (Limits.hotLeft(game) <= 0) { this.usedUp(game); return null; }
    try {
      const r = await Api.call('POST', '/api/hot', { game, origins: Core.origins(), exclude: (Core.recent[game] || []).slice(-40) });
      Limits.setHot(game, r.used);
      return this.fromRow(r.card);
    } catch (e) {
      if (e.code === 'used_up') { Limits.setHot(game, HC.LIMITS.lite.hot); this.usedUp(game); }
      else if (e.code === 'locked') Auth.refresh();
      else Core.toast(e.code === 'offline' ? 'You look offline. Spicy until you’re back.' : e.message);
      return null;
    }
  },
  // Lite with this game's Hot cards spent: say so once per game, then play on at Spicy
  usedUp(game) {
    if (this._toldUsedUp[game]) return;
    this._toldUsedUp[game] = true;
    Core.toast(`${HC.LIMITS.lite.hot} Hot cards used here. Premium has unlimited.`);
    Bus.emit('heat');
  },
};

/* ---------- Per-game limits and their counters ----------
   Guests: localStorage. Signed in: profiles.stats.limits, written only by the server
   (/api/flirty, /api/hot, /api/taste). Flirty counters reset daily (IST). */
const Limits = {
  window() { return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10); },
  of(tier = Ent.tier()) { return HC.LIMITS[tier]; },
  local() { const l = Store.get('hc_limits', {}); return l && l.window === this.window() ? { window: l.window, flirty: l.flirty || {} } : { window: this.window(), flirty: {} }; },
  remote() { const l = (Auth.profile && Auth.profile.stats && Auth.profile.stats.limits) || {}; return l; },
  flirtyUsed(game) {
    if (Ent.tier() === 'guest') return +this.local().flirty[game] || 0;
    const l = this.remote();
    return l.window === this.window() ? +((l.flirty || {})[game]) || 0 : 0;
  },
  // null = unlimited
  flirtyLeft(game) { const cap = this.of().flirty; return cap == null ? null : Math.max(0, cap - this.flirtyUsed(game)); },
  countFlirty(game) {
    const tier = Ent.tier();
    if (tier === 'guest') { const l = this.local(); l.flirty[game] = (+l.flirty[game] || 0) + 1; Store.set('hc_limits', l); return; }
    if (tier !== 'base') return;
    const p = Auth.profile; p.stats = p.stats || {};
    const l = p.stats.limits = p.stats.limits || {};
    if (l.window !== this.window()) { l.window = this.window(); l.flirty = {}; }
    l.flirty = l.flirty || {}; l.flirty[game] = (+l.flirty[game] || 0) + 1;
    // The server is the source of truth: it counts the same card and refuses past the limit
    Api.call('POST', '/api/flirty', { game }).then((r) => { if (r && r.used != null) l.flirty[game] = Math.max(l.flirty[game], r.used); })
      .catch((e) => { if (e.code === 'flirty_limit') { l.flirty[game] = HC.LIMITS.base.flirty; Core.updateHud(); } });
  },
  hotUsed(game) { const l = this.remote(); return +((l.hot || {})[game]) || 0; },
  hotLeft(game) { const cap = this.of().hot; return cap == null ? null : Math.max(0, cap - this.hotUsed(game)); },
  setHot(game, used) {
    const p = Auth.profile; if (!p) return;
    p.stats = p.stats || {}; const l = p.stats.limits = p.stats.limits || {};
    l.hot = { ...(l.hot || {}), [game]: Math.max(+used || 0, +((l.hot || {})[game]) || 0) };
    Core.updateHud();
  },
  // The quiet line above the card. Never a banner, hidden for Premium.
  line(game) {
    const t = Ent.tier();
    if (t === 'premium') return '';
    if (t === 'lite') return `Hot ${this.hotUsed(game)}/${HC.LIMITS.lite.hot}`;
    const f = `Flirty ${Math.min(this.flirtyUsed(game), HC.LIMITS[t].flirty)}/${HC.LIMITS[t].flirty}`;
    return t === 'base' ? `${f} · Hot ${Taste.used(game) || Taste.showing === game ? 1 : 0}/1` : f;
  },
  // Sign-in: carry this device's guest counters up to the account (never down)
  async sync() {
    const l = this.local(), counts = l.flirty;
    if (!Object.keys(counts).length || Ent.paid()) return;
    try {
      const r = await Api.call('POST', '/api/flirty', { sync: counts });
      const p = Auth.profile; p.stats = p.stats || {};
      p.stats.limits = { ...(p.stats.limits || {}), window: r.window, flirty: r.flirty };
    } catch (e) {}
  },
};

/* ---------- One free Hot card per game (signed-in Base accounts only) ----------
   The card lives on the server. POST /api/taste checks, marks and returns it in one
   SQL call; a second call for the same game is refused. The card is held in memory
   for exactly one draw, then heat is back to what the tier allows. Guests get no taste. */
const Taste = {
  armed: false,     // "Use your free Hot card?" accepted on the home ring: spend it on the next game picked
  _card: null, _game: null,
  showing: null,    // game id while the taste card is on screen (Core.heat() reads 3 for it)
  available() { return Auth.signedIn() && !!Auth.profile && Ent.tier() === 'base'; },
  used(game) { return !!(Auth.profile && Auth.profile.taste_used && Auth.profile.taste_used[game]); },
  usedCount() { return GAME_IDS.filter((g) => this.used(g)).length; },
  unusedAny() { return this.available() && GAME_IDS.some((g) => !this.used(g)); },
  canClaim(game) { return this.available() && !this.used(game); },
  async claim(game) {
    if (!this.canClaim(game)) throw new Error(this.available() ? 'You’ve used this game’s free Hot card.' : 'Sign in for a free Hot card.');
    const r = await Api.call('POST', '/api/taste', { game, origins: Core.origins() });
    if (!r || !r.card) throw new Error('No Hot card came back. Try again.');
    if (Auth.profile) Auth.profile.taste_used = Object.assign({}, Auth.profile.taste_used, { [game]: r.used_at || new Date().toISOString() });
    this._card = { ...Cards.fromRow(r.card), taste: true };
    this._game = game;
    this.armed = false;
    Bus.emit('taste');
    return this._card;
  },
  pendingFor(game) { return !!this._card && this._game === game; },
  take(game) {
    if (!this._card || this._game !== game) return null;
    const c = this._card; this._card = null; this._game = null;
    return c;
  },
  // Called on the draw after the taste card: heat goes back to what the tier allows
  finish() {
    this.showing = null;
    if (Core.S.heat > Core.heatCap()) { Core.S.heat = Core.heatCap(); Core.S.rampCount = 0; }
    Core.save(); Core.updateHud();
    Bus.emit('heat');
  },
  drop() { this._card = null; this._game = null; this.showing = null; },
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
  defaults: { mode: 'drink', timer: HC.TIMER_DEFAULT, hollywood: true, bollywood: true, auto_ramp: true, cards_per_ramp: HC.RAMP_DEFAULT, haptics: true, motion: 'system', savedNames: [], soundPack: 'classic', look: 'ember' },
  get() { return this.clean(Store.get('hc_prefs', {})); },
  clean(p) {
    const o = { ...this.defaults, ...p };
    for (const k of ['maxHeat', 'max_heat', 'startHeat', 'start_heat', 'vibe']) delete o[k]; // retired settings
    o.auto_ramp = o.auto_ramp !== false;
    o.cards_per_ramp = Math.min(HC.RAMP_MAX, Math.max(HC.RAMP_MIN, Math.round(+o.cards_per_ramp || HC.RAMP_DEFAULT)));
    o.mode = ['drink', 'water', 'dare'].includes(o.mode) ? o.mode : 'drink';
    o.timer = HC.TIMER_OPTIONS.includes(+o.timer) ? +o.timer : HC.TIMER_DEFAULT;
    o.hollywood = o.hollywood !== false; o.bollywood = o.bollywood !== false;
    if (!o.hollywood && !o.bollywood) o.hollywood = o.bollywood = true;
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
    // Sounds: Lite and Premium. Looks: Lite gets Midnight, Premium gets every look.
    SFX.setPack && SFX.setPack(Ent.paid() ? p.soundPack : 'classic');
    const app = document.getElementById('app');
    if (app) { if (this.lookOk(p.look) && p.look !== 'ember') app.dataset.look = p.look; else delete app.dataset.look; }
  },
  lookOk(look) { return look === 'ember' || Ent.premium() || (Ent.paid() && look === 'midnight'); },
  // Synced defaults: penalty mode, timer, Hollywood/Bollywood and auto-ramp
  applyNightDefaults() {
    const p = this.get(), st = Core.S.settings;
    st.mode = p.mode; st.autoRamp = p.auto_ramp; st.cardsPerRamp = p.cards_per_ramp;
    st.timer = p.timer;
    if (st.hollywood !== p.hollywood || st.bollywood !== p.bollywood) { st.hollywood = p.hollywood; st.bollywood = p.bollywood; Core.used = {}; Core.recent = {}; }
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
  get() { const s = Store.get('hc_stats', {}); return { sessions: +s.sessions || 0, games: s.games && typeof s.games === 'object' ? s.games : {}, topHeat: +s.topHeat || 0, nights: Array.isArray(s.nights) ? s.nights.slice(-20) : [] }; },
  save(s) { Store.set('hc_stats', s); this.push(); },
  game(id) { const s = this.get(); s.sessions++; s.games[id] = (s.games[id] || 0) + 1; this.save(s); },
  heat(h) { const s = this.get(); if (h > s.topHeat) { s.topHeat = h; this.save(s); } },
  // End Night summaries: the last 20 nights
  night(sum) { const s = this.get(); s.nights = [...s.nights, sum].slice(-20); this.save(s); },
  favorite() { const g = this.get().games; let best = null; for (const k of Object.keys(g)) if (!best || g[k] > g[best]) best = k; return best; },
  _t: 0,
  push() {
    if (!Auth.signedIn()) return;
    clearTimeout(this._t);
    this._t = setTimeout(async () => {
      // save_stats keeps the server-owned limits block untouched
      try { const c = await SB.get(); await c.rpc('save_stats', { p_stats: this.get() }); } catch (e) {}
    }, 1500);
  },
};

/* ---------- First login: merge guest data into the profile (union, never remove) ---------- */
const Sync = {
  async onLogin() {
    const p = Auth.profile; if (!p) return;
    const c = await SB.get();
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
    const remoteStats = { sessions: +rs.sessions || 0, games: rs.games && typeof rs.games === 'object' ? rs.games : {}, topHeat: +rs.topHeat || 0, nights: Array.isArray(rs.nights) ? rs.nights : [] };
    if (!Store.get(flag, false)) {
      const l = Stats.get(), games = { ...remoteStats.games };
      for (const k of Object.keys(l.games)) games[k] = (games[k] || 0) + (+l.games[k] || 0);
      const merged = { sessions: remoteStats.sessions + l.sessions, games, topHeat: Math.max(remoteStats.topHeat, l.topHeat), nights: [...remoteStats.nights, ...l.nights].slice(-20) };
      Store.set('hc_stats', merged); Store.set(flag, true);
      try { await c.rpc('save_stats', { p_stats: merged }); } catch (e) {}
    } else Store.set('hc_stats', remoteStats);
    // limit counters: a guest's Flirty count today carries over to the account
    await Limits.sync();
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
            const want = productId === 'premium' ? ['premium'] : ['lite', 'premium'];
            for (let i = 0; i < 8 && !want.includes(Ent.profileTier()); i++) { await sleep(2500); await Auth.refresh(); }
            if (want.includes(Ent.profileTier())) { await Premium.load(); done({ ok: true, granted: true }); }
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
    if (Ent.profileTier() !== 'premium') { Premium.clear(); Premium.load(); }
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
    Store.del('hc_taste'); Store.del('hc_vibe');   // retired: guests no longer get a taste, and Vibe is gone
    Store.set('hc_prefs', Prefs.get());           // rewrites saved prefs without retired keys
    Prefs.apply();
    await Cfg.load();
    Bus.emit('config');
    if (Cfg.accounts) await Auth.init(); else Auth.ready = true;
    Ent._was = Ent.tier();
    setInterval(() => Ent.tick(), 1000);
    window.addEventListener('online', () => { if (Auth.signedIn()) Auth.refresh().then(() => Premium.load()); });
  },
};

// Expose on window too (other modules feature-check with window.X)
Object.assign(window, { GAME_IDS, SITE, Store, Cfg, SB, Bus, Auth, Api, Ent, Premium, Cards, Limits, Taste, Prefs, Stats, Sync, Pay, Captcha, Admin, Account });
