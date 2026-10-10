/* Heat Check: start-up. Loads last so every module (and the motion hooks) is in place first.
   The app paints immediately in guest mode; accounts load in the background. */
App.init();
Account.start().catch((e) => console.warn('account start', e && e.message));
