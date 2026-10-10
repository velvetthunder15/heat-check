// The game list, shared by the server and the build. The app keeps the same list in
// public/js/config.js; tools/cards.mjs fails the build if the two ever disagree.
export const GAMES = [
  { id: 'redflag', mode: 'couples' },
  { id: 'nhie', mode: 'couples' },
  { id: 'charades', mode: 'couples' },
  { id: 'wyr', mode: 'couples' },
  { id: 'hotseat', mode: 'couples' },
  { id: 'swap', mode: 'couples' },
  { id: 'mostlikely', mode: 'group' },
  { id: 'twotruths', mode: 'group' },
];
export const GAME_IDS = GAMES.map((g) => g.id);
export const isGame = (id) => GAME_IDS.includes(id);
