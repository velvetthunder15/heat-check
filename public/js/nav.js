/* Heat Check: back navigation for full-screen views (Settings, We're all in, games, End Night, under-18).
   Each sub-view owns one real history entry, so the browser / Android back gesture and the
   on-screen chevron take the same path: popstate -> the view's own onBack (Settings saves) ->
   home with the reverse transition. Going back never resets the game, the roster or settings. */
const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const Nav = {
  _onBack: null,
  _silent: 0,
  view() { return (history.state && history.state.hc) || 'home'; },
  init() {
    try { history.replaceState({ hc: 'home' }, ''); } catch (e) {}
    window.addEventListener('popstate', (e) => this.pop(e));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-back]')) return;
      e.preventDefault(); window.SFX && SFX.play('tap'); this.back();
    });
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
