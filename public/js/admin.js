/* Heat Check v20.4: private stats page (/admin). Read-only.
   Uses the app's own Supabase session (same device, storage key hc_auth): a signed-in account with
   profiles.role = 'admin' can view it. No password here; grants and card edits stay behind the admin unlock.
   Opening it marks this device hc_notrack, so the owner's own play is left out of the stats. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const main = $('#admMain');
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n) => Number(n || 0).toLocaleString('en-IN');
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 + '%' : '0%');
  const GAME = { redflag: 'Red Flag / Green Flag', nhie: 'Never Have I Ever', charades: 'Strip Charades', wyr: 'Would You Rather', hotseat: 'Hot Seat Quiz', swap: 'Swap Rounds', mostlikely: 'Most Likely To', twotruths: 'Two Truths & a Lie' };
  const HEAT = ['', 'Flirty', 'Spicy', 'HOT'];
  const PLAN = { base: 'Free', lite: 'Lite', premium: 'Premium', guest: 'Guest' };
  const COUNTRY = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { return null; } })();
  const cname = (c) => { if (!c || c === '??' || c === 'XX' || c === 'T1') return c === 'T1' ? 'Tor' : 'Unknown'; try { return (COUNTRY && COUNTRY.of(c)) || c; } catch (e) { return c; } };
  const fmtDT = (v) => { if (!v) return 'never'; const d = new Date(v); return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
  const fmtD = (v) => { if (!v) return ''; const d = new Date(v + (String(v).length === 10 ? 'T00:00:00+05:30' : '')); return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }); };
  let days = 30, client = null, data = null;

  const msg = (html) => { main.innerHTML = `<section class="pf-card adm-msg-card">${html}</section>`; };

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
  }
  async function getClient() {
    if (client) return client;
    const cfg = await fetch('/api/config', { credentials: 'same-origin' }).then((r) => r.json());
    if (!cfg.accounts) throw new Error('Accounts are off on this deploy.');
    await loadScript('/js/vendor/supabase-2.117.3.js');
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'hc_auth' } });
    return client;
  }

  async function load() {
    main.setAttribute('aria-busy', 'true');
    try {
      const c = await getClient();
      const { data: s } = await c.auth.getSession();
      const token = s && s.session && s.session.access_token;
      if (!token) return msg('<h2>Sign in first</h2><p class="muted">Open Heat Check on this device, sign in with your admin email (profile, Sign in), then come back to this page.</p><a class="btn block" href="/">Open Heat Check</a>');
      const r = await fetch('/api/admin/analytics?days=' + days, { headers: { Authorization: 'Bearer ' + token }, credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (r.status === 403) return msg(`<h2>Not an admin account</h2><p class="muted">${esc(s.session.user.email)} can’t see stats.</p><a class="btn block ghost" href="/">Back to the games</a>`);
      if (!r.ok) return msg(`<h2>Couldn’t load stats</h2><p class="muted">${esc(j.message || 'Try again in a moment.')}</p><button class="btn block" id="admRetry">Try again</button>`), ($('#admRetry').onclick = load);
      try { localStorage.setItem('hc_notrack', '1'); } catch (e) {}
      data = j;
      $('#admSub').textContent = `${s.session.user.email} · updated ${fmtDT(j.generated_at)} IST`;
      render(j);
    } catch (e) {
      msg(`<h2>Couldn’t load stats</h2><p class="muted">${esc(e.message || 'Network error.')}</p><button class="btn block" id="admRetry">Try again</button>`);
      const b = $('#admRetry'); if (b) b.onclick = load;
    } finally { main.removeAttribute('aria-busy'); }
  }

  // ---------- pieces ----------
  const tile = (n, label, sub) => `<div class="adm-tile"><b>${n}</b><span>${esc(label)}</span>${sub ? `<i>${sub}</i>` : ''}</div>`;
  const card = (title, body, cls = '') => `<section class="pf-card adm-card ${cls}"><h3>${esc(title)}</h3>${body}</section>`;
  const empty = (t = 'Nothing yet.') => `<p class="note adm-empty">${esc(t)}</p>`;
  function bars(list, label = (x) => x.k) {
    if (!list || !list.length) return empty();
    const max = Math.max(...list.map((x) => x.n), 1);
    return `<ul class="adm-bars">${list.map((x) => `<li><span class="adm-bk">${esc(label(x))}</span><span class="adm-bt"><i style="width:${Math.max(2, (x.n / max) * 100)}%"></i></span><b>${nf(x.n)}</b></li>`).join('')}</ul>`;
  }
  function chart(byDay) {
    const max = Math.max(...byDay.map((d) => d.visitors), 1);
    const step = byDay.length > 45 ? 14 : byDay.length > 14 ? 7 : 1;
    const cols = byDay.map((d, i) => {
      const h = (d.visitors / max) * 100;
      const tip = `${fmtD(d.day)}: ${d.visitors} visitors, ${d.cards} cards, ${d.signups} signups${d.bots ? `, ${d.bots} bots filtered` : ''}`;
      const lab = (byDay.length - 1 - i) % step === 0 ? `<em>${esc(fmtD(d.day))}</em>` : '';
      return `<div class="adm-col" title="${esc(tip)}" tabindex="0" aria-label="${esc(tip)}"><i style="height:${h}%">${d.visitors ? `<s>${d.visitors}</s>` : ''}</i>${lab}</div>`;
    }).join('');
    return `<div class="adm-chart" style="--n:${byDay.length}">${cols}</div>`;
  }
  function split(obj, keys, names) {
    const tot = keys.reduce((a, k) => a + (obj[k] || 0), 0);
    if (!tot) return empty();
    return `<div class="adm-split">${keys.map((k, i) => obj[k] ? `<i class="s${i}" style="flex:${obj[k]}"></i>` : '').join('')}</div>
      <ul class="adm-legend">${keys.map((k, i) => `<li><i class="s${i}"></i>${esc(names[k] || k)} <b>${nf(obj[k] || 0)}</b> <span>${pct(obj[k] || 0, tot)}</span></li>`).join('')}</ul>`;
  }

  function render(d) {
    const t = d.totals, f = d.funnel, a = d.accounts, p = d.purchases;
    const paidLive = p.by_status.filter((r) => r.mode === 'live' && r.status === 'paid').reduce((x, r) => x + r.n, 0);
    const paidTest = p.by_status.filter((r) => r.mode !== 'live' && r.status === 'paid').reduce((x, r) => x + r.n, 0);
    const live = p.by_status.some((r) => r.mode === 'live');

    const kpis = `<div class="adm-tiles">
      ${tile(nf(t.today_visitors), 'visitors today')}
      ${tile(nf(t.visitor_days), `visitors, last ${d.days} days`, 'unique per day, bots out')}
      ${tile(nf(t.cards_dealt), 'cards dealt', `${nf(t.game_starts)} game starts`)}
      ${tile(nf(a.new_in_window), 'new accounts', `${nf(a.total)} total`)}
      ${tile(inr(p.revenue_live_inr), 'live revenue', `${paidLive} paid${live ? '' : ' · no live orders yet'}`)}
      ${tile(inr(p.revenue_test_inr), 'test revenue', `<span class="adm-mode test">TEST</span> ${paidTest} paid`)}
    </div>`;

    const daily = card('Real visitors by day (IST)', chart(d.by_day) + `<p class="note">Unique daily visitors. Bots (${nf(t.bot_visitors)}) and your own devices (${nf(t.internal_events)} events) are left out.</p>`, 'wide');

    const funnelRows = [
      ['Visitors', f.visitors], ['Saw the paywall', f.paywall_view], ['Started checkout', f.checkout_start], ['Paid', f.purchase_paid],
    ];
    const fmax = Math.max(f.visitors, 1);
    const funnel = card('Paywall funnel', `<ol class="adm-funnel">${funnelRows.map(([l, n], i) => `<li><span>${l}</span><span class="adm-bt"><i style="width:${Math.max(2, (n / fmax) * 100)}%"></i></span><b>${nf(n)}</b><em>${i ? pct(n, funnelRows[i - 1][1]) : ''}</em></li>`).join('')}</ol>
      <p class="note">Unique visitors per day. ${nf(f.paywall_views)} paywall views, ${nf(f.checkouts)} checkouts, ${nf(f.signups)} signups and ${nf(f.sign_ins)} sign-ins tracked.</p>`);

    const g = d.games || [];
    const games = card('Games', g.length ? `<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Game</th><th>Starts</th><th>Cards</th><th>Players</th><th>Heat mix</th></tr></thead><tbody>
      ${g.map((r) => { const tot = r.h1 + r.h2 + r.h3 || 1; return `<tr><td>${esc(GAME[r.game] || r.game)}</td><td>${nf(r.starts)}</td><td>${nf(r.cards)}</td><td>${nf(r.players)}</td>
        <td><div class="adm-split mini" title="Flirty ${r.h1}, Spicy ${r.h2}, ${HEAT[3]} ${r.h3}">${r.h1 ? `<i class="s0" style="flex:${r.h1 / tot}"></i>` : ''}${r.h2 ? `<i class="s1" style="flex:${r.h2 / tot}"></i>` : ''}${r.h3 ? `<i class="s2" style="flex:${r.h3 / tot}"></i>` : ''}</div></td></tr>`; }).join('')}
      </tbody></table></div><p class="note">Sorted by cards dealt. Players = unique visitors per day who played it.</p>` : empty('No games played yet.'), 'wide');

    const heat = card('Heat mix (cards dealt)', split({ flirty: d.heat_mix.flirty, spicy: d.heat_mix.spicy, hot: d.heat_mix.hot }, ['flirty', 'spicy', 'hot'], { flirty: 'Flirty', spicy: 'Spicy', hot: HEAT[3] }) + `<p class="note">${nf(d.heat_mix.changes)} heat changes.</p>`);
    const devices = card('Phone vs desktop', split(d.devices, ['phone', 'desktop', 'tablet'], { phone: 'Phone', desktop: 'Desktop', tablet: 'Tablet' }));
    const tiers = card('Visitors by plan', split(d.tiers, ['guest', 'base', 'lite', 'premium'], PLAN));
    const countries = card('Countries', bars(d.countries, (x) => cname(x.k)));
    const cities = card('Cities', bars(d.cities));
    const refs = card('Referrers', bars(d.referrers, (x) => (x.k === 'direct' ? 'Direct / app' : x.k)));
    const utm = d.utm && d.utm.length ? card('Campaign tags (utm)', bars(d.utm)) : '';

    const accts = card(`Accounts (${nf(a.total)})`, `<div class="adm-table-wrap"><table class="adm-table adm-stack"><thead><tr><th>Email</th><th>Plan</th><th>Joined</th><th>Last sign-in</th></tr></thead><tbody>
      ${a.list.map((r) => `<tr><td class="adm-email">${esc(r.email)}${r.role === 'admin' ? ' <span class="adm-mode admin">ADMIN</span>' : ''}</td><td class="adm-plan"><span class="plan-badge ${esc(r.plan)}">${esc(PLAN[r.plan] || r.plan)}</span></td><td data-l="Joined">${esc(fmtDT(r.joined))}</td><td data-l="Last sign-in">${esc(fmtDT(r.last_sign_in))}</td></tr>`).join('') || '<tr><td colspan="4">No accounts yet.</td></tr>'}
      </tbody></table></div>`, 'wide full');

    const st = p.by_status;
    const purchases = card('Purchases', `<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Mode</th><th>Product</th><th>Status</th><th>Orders</th><th>Amount</th></tr></thead><tbody>
      ${st.map((r) => `<tr><td><span class="adm-mode ${r.mode}">${r.mode.toUpperCase()}</span></td><td>${esc(PLAN[r.product] || r.product)}</td><td><span class="adm-st ${esc(r.status)}">${esc(r.status)}</span></td><td>${nf(r.n)}</td><td>${inr(r.inr)}</td></tr>`).join('') || '<tr><td colspan="5">No orders yet.</td></tr>'}
      </tbody></table></div>
      <p class="note">TEST = made with Razorpay test keys, no real money. Revenue counts paid orders only. Created = checkout opened but never paid.</p>
      ${p.recent.length ? `<details class="adm-more"><summary>Last ${p.recent.length} orders</summary><div class="adm-table-wrap"><table class="adm-table adm-stack adm-orders"><thead><tr><th>When</th><th>Email</th><th>Product</th><th>Status</th><th>Amount</th></tr></thead><tbody>
        ${p.recent.map((r) => `<tr><td data-l="When">${esc(fmtDT(r.at))}</td><td class="adm-email">${esc(r.email || 'deleted account')}</td><td>${esc(PLAN[r.product] || r.product)} <span class="adm-mode ${r.mode}">${r.mode.toUpperCase()}</span></td><td><span class="adm-st ${esc(r.status)}">${esc(r.status)}</span></td><td>${inr(r.inr)}</td></tr>`).join('')}
      </tbody></table></div></details>` : ''}`, 'wide full');

    main.innerHTML = kpis + `<div class="adm-grid">${daily}${funnel}${heat}${games}${countries}${refs}${devices}${tiers}${cities}${utm}${accts}${purchases}</div>
      <p class="note adm-foot">First-party stats, no cookies. Visitors are a daily-rotating anonymous hash, so “visitors” over a range adds up each day’s uniques. This device is marked as yours and isn’t counted.</p>`;
  }

  document.querySelectorAll('[data-days]').forEach((b) => (b.onclick = () => {
    days = Number(b.dataset.days);
    document.querySelectorAll('[data-days]').forEach((x) => x.classList.toggle('on', x === b));
    load();
  }));
  $('#admRefresh').onclick = load;
  load();
})();
