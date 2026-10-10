// Per-game limits for each tier. The server enforces these; public/js/config.js
// mirrors them for display and tools/cards.mjs fails the build if the two differ.
// null = unlimited.
export const LIMITS = {
  guest:   { flirty: 5, spicy: 0, hot: 0, taste: 0 },
  base:    { flirty: 5, spicy: 0, hot: 0, taste: 1 },
  lite:    { flirty: null, spicy: null, hot: 3, taste: 0 },
  premium: { flirty: null, spicy: null, hot: null, taste: 0 },
};

// Flirty counters reset daily, at midnight India time.
export function limitWindow(now = Date.now()) {
  return new Date(now + 330 * 60 * 1000).toISOString().slice(0, 10);
}
