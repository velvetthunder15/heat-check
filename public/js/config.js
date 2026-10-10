/* Heat Check: one config for games, heat, timers, tiers, penalties and taunts.
   Every game count in the app comes from HC.GAMES. LIMITS mirrors lib/limits.js
   (the server enforces those); tools/cards.mjs fails the build if they differ. */
const HC = {
  ROTATION_MS: 1200,          // hold ring: one full turn = one heat level
  RAMP_DEFAULT: 5,            // auto-ramp: cards per level
  RAMP_MIN: 3,
  RAMP_MAX: 15,
  TIMER_OPTIONS: [15, 30, 45, 60],   // seconds, every timed mode reads Core.timerSecs()
  TIMER_DEFAULT: 60,
  FREE_PLAYERS: 4,            // guest, Base and Lite: up to 4 people. Premium: unlimited
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
  // Per game. null = unlimited. LIMITS_START
  LIMITS: {
    guest:   { flirty: 5, spicy: 0, hot: 0, taste: 0 },
    base:    { flirty: 5, spicy: 0, hot: 0, taste: 1 },
    lite:    { flirty: null, spicy: null, hot: 3, taste: 0 },
    premium: { flirty: null, spicy: null, hot: null, taste: 0 },
  },
  // LIMITS_END
  LIMIT_RESET: 'daily',       // Flirty counters (guest/Base) reset at midnight IST
  PENALTY_PTS: { 1: 1, 2: 2, 3: 3 },
  CHICKEN_PER_ROUND: 1,       // Chicken Out uses per player per round (one lap of turns)
  ORIGINS: ['Hollywood', 'Bollywood'],
  // End Night: the couple's combined penalty points pick one line at random from its range
  TAUNTS: [
    { min: 0, max: 5, lines: [
      'Gentle souls. Did you two even break a sweat?',
      'So polite. Somebody check if you were playing the same game.',
      'Sweet, careful, barely singed. Next time, live a little.',
    ] },
    { min: 6, max: 10, lines: [
      'Warmed up nicely. The night clearly wanted more.',
      'A little flushed, a little smug. Good start, you two.',
      'Officially toasty. The ring saw that.',
    ] },
    { min: 11, max: 20, lines: [
      'A certified menace. Nobody in this room is innocent.',
      'Trouble, the pair of you. Lovely, lovely trouble.',
      'That scoreboard has seen things. Behave. Or don’t.',
    ] },
    { min: 21, max: null, lines: [
      'A beautiful disaster. Hydrate and call it a legend.',
      'Absolute chaos, best possible way. Somebody open a window.',
      'Disaster level: iconic. Tonight goes in the history books.',
    ] },
  ],
  gamesFor(mode) { return this.GAMES.filter((g) => g.mode === mode).map((g) => g.id); },
  modeOf(id) { const g = this.GAMES.find((x) => x.id === id); return g ? g.mode : null; },
  taunt(points) {
    const r = this.TAUNTS.find((t) => points >= t.min && (t.max == null || points <= t.max)) || this.TAUNTS[this.TAUNTS.length - 1];
    return r.lines[Math.floor(Math.random() * r.lines.length)];
  },
};
window.HC = HC;
