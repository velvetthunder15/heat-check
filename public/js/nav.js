/* Heat Check: back navigation for full-screen views (Settings, We're all in, games, End Night, under-18).
   Each sub-view owns one real history entry, so the browser / Android back gesture and the
   on-screen chevron take the same path: popstate -> the view's own onBack (Settings saves) ->
   home with the reverse transition. Going back never resets the game, the roster or settings. */
const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const Nav = {
  _onBack: null,
  _silent: 0,
  _tabbed: false,
  view() { return (history.state && history.state.hc) || 'home'; },
  init() {
    // v14: we restore scroll ourselves (home where you left it, every other screen at the top).
    // The browser's own restore landed late, after the transition, and made home jump.
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}
    try { history.replaceState({ hc: 'home' }, ''); } catch (e) {}
    window.addEventListener('popstate', (e) => this.pop(e));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-back]')) return;
      e.preventDefault(); window.SFX && SFX.play('tap'); this.back();
    });
    // how focus last moved: Tab (keyboard) or a pointer press. :focus-visible can't tell, it flips on any key.
    document.addEventListener('pointerdown', () => { this._tabbed = false; }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Tab') this._tabbed = true; }, true);
    document.addEventListener('keydown', (e) => this.key(e));
  },
  /* v19.4 desktop keyboard. In a game: Space / Enter / ArrowRight = the main button (the HOT gate's
     "Deal it" first), so limits and paywalls run exactly as for a tap. Escape: close the open sheet,
     else the screen's own back control. Never while typing, never over a game dialog (penalty, ask,
     hand-off) or a countdown. The press sound comes from audio.js like any keyboard activation. */
  key(e) {
    try {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
      const k = e.key, nextKey = k === ' ' || k === 'Spacebar' || k === 'Enter' || k === 'ArrowRight';
      if (!nextKey && k !== 'Escape') return;
      const typing = (el) => !!(el && el.closest && el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
      if (typing(e.target) || typing(document.activeElement)) return;
      const root = document.getElementById('app'); if (!root || document.getElementById('pause')) return;
      const wraps = root.querySelectorAll('.modal-wrap'), wrap = wraps[wraps.length - 1];
      const shown = (el) => !!(el && !el.closest('[hidden]') && (typeof el.checkVisibility !== 'function' || el.checkVisibility()));
      if (k === 'Escape') {
        if (e.repeat) return;
        if (wrap) {
          // account sheets close like a tap on their backdrop or ✕; game dialogs need an answer, so they stay
          const x = [...wrap.querySelectorAll('[data-close]')].find(shown);
          if (x) { e.preventDefault(); x.click(); }
          else if (wrap.classList.contains('acct-wrap')) { e.preventDefault(); wrap.click(); }
          return;
        }
        if (root.querySelector('.countdown') || this.view() === 'home') return;
        e.preventDefault();
        const b = [...root.querySelectorAll('[data-back], [data-nav="home"]')].find(shown);
        if (b) b.click(); else this.back();
        return;
      }
      if (e.repeat || wrap || root.querySelector('.countdown') || this.view() !== 'game' || !window.Core || !Core.game) return;
      const a = document.activeElement;
      if (k !== 'ArrowRight' && a && a !== document.body && a !== root && a.matches && a.matches('button, a[href], [role="button"], [tabindex]')) {
        // a control the keyboard moved to keeps its own Space / Enter; one the mouse left focused does not
        if (this._tabbed) return;
        a.blur();
      }
      const btn = [document.getElementById('dgGo'), root.querySelector('.controls .primary')].find((b) => shown(b) && !b.disabled);
      if (!btn) return;
      e.preventDefault();
      btn.click();
    } catch (err) {}
  },
  // The shared back control: top-left chevron, 44px target (styles in nav.css)
  button(label = 'Back') { return `<button class="nav-back" data-back aria-label="${label}">${CHEVRON}</button>`; },
  // Entering a sub-view: one history entry per stack of sub-views (Settings -> game replaces, never piles up)
  enter(view, onBack) {
    try { if (this.view() === 'home') history.pushState({ hc: view }, ''); else history.replaceState({ hc: view }, ''); } catch (e) {}
    this._onBack = onBack || null;
    document.documentElement.dataset.view = view;
  },
  // Code went home on its own (Let's play, New night, the game's ←): drop our entry without re-rendering
  leave() {
    document.documentElement.dataset.view = 'home';
    this._onBack = null;
    if (this.view() !== 'home') { this._silent++; history.back(); }
  },
  back() { if (this.view() === 'home') return; history.back(); },
  // Runs a render with the shared transition: forward on enter, reverse on back
  go(render, dir = 'fwd') { if (window.Motion && Motion.navigate) Motion.navigate(render, { dir }); else render(); },
  pop() {
    if (this._silent) { this._silent--; return; }
    const cb = this._onBack; this._onBack = null;
    document.documentElement.dataset.view = 'home';
    try { cb && cb(); } catch (e) { console.error(e); }
    if (cb && cb.handled) return;
    const adult = localStorage.getItem('hc_age') === 'yes';
    this.go(() => (adult ? App.home() : App.ageGate()), 'back');
  },
};
window.Nav = Nav;
