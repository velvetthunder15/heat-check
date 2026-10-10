/* Heat Check: one config for game lists, heat and player limits.
   Every game count in the app comes from HC.GAMES. */
const HC = {
  ROTATION_MS: 1200,          // hold ring: one full turn = one heat level
  RAMP_DEFAULT: 5,            // auto-ramp: cards per level
  RAMP_MIN: 3,
  RAMP_MAX: 15,
  FREE_PLAYERS: 4,            // free tier, couples (2 couples) and groups
  GROUP_MIN: 3,
  GROUP_MAX: 12,
  GAMES: [
    { id: 'redflag', mode: 'couples' },
    { id: 'nhie', mode: 'couples' },
    { id: 'charades', mode: 'couples' },
    { id: 'wyr', mode: 'couples' },
    { id: 'hotseat', mode: 'couples' },
    { id: 'swap', mode: 'couples' },
    { id: 'mostlikely', mode: 'group' },
    { id: 'twotruths', mode: 'group' },
  ],
  gamesFor(mode) { return this.GAMES.filter((g) => g.mode === mode).map((g) => g.id); },
  modeOf(id) { const g = this.GAMES.find((x) => x.id === id); return g ? g.mode : null; },
};
window.HC = HC;
