#!/usr/bin/env node
// Card pipeline: content/*.json -> lint -> dist/cards.json (Lv1 Flirty ONLY) and,
// with --seed, supabase/seed/premium_cards.sql (Lv2 Spicy + Lv3 Hot + the taste cards).
// Spicy and Hot are paid: their text never reaches the client bundle. The build refuses to write it.
// Also checks that public/js/config.js mirrors lib/games.js and lib/limits.js.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GAMES } from '../lib/games.js';
import { LIMITS } from '../lib/limits.js';

const root = new URL('..', import.meta.url).pathname;
const errors = [];
const fail = (m) => errors.push(m);

// Group cards: no couple wording at all
const BANNED_GROUP = [/\bpartner/i, /\bboyfriend/i, /\bgirlfriend/i, /\bhusband/i, /\bwife\b/i, /\bwives\b/i, /\bbabe\b/i, /each other/i, /your other half/i, /you two/i];
// Red Flag trait cards and Never Have I Ever: external, never about the couple playing
const BANNED_EXTERNAL = [/your partner/i, /\bus\b/i, /each other/i, /you two/i];
// Famous-couple / dating-show scenarios: about other people, not the players
const BANNED_SCENARIO = [...BANNED_GROUP, /\byour date\b/i];
const BANNED_NHIE = [...BANNED_EXTERNAL, ...BANNED_GROUP, /\bwe\b/i];
const MIN_PER_LEVEL = { redflag: 30, nhie: 30, charades: 30, mostlikely: 30, twotruths: 30 };
const MIN_TRAITS = 30;
const CHARADE_CATS = ['Movie', 'TV Show', 'Song'];
const ORIGINS = ['Hollywood', 'Bollywood', 'Global'];

// The app's lists must match the server's
const appCfg = readFileSync(join(root, 'public/js/config.js'), 'utf8');
const appGames = [...appCfg.matchAll(/\{ id: '(\w+)', mode: '(\w+)' \}/g)].map((m) => `${m[1]}:${m[2]}`).join(',');
if (appGames !== GAMES.map((g) => `${g.id}:${g.mode}`).join(',')) fail('public/js/config.js GAMES differs from lib/games.js');
const limBlock = /LIMITS:\s*(\{[\s\S]*?\}),\s*\/\/ LIMITS_END/.exec(appCfg);
let appLimits = null;
try { appLimits = limBlock && Function(`return (${limBlock[1]})`)(); } catch (e) { appLimits = null; }
if (!appLimits || JSON.stringify(appLimits) !== JSON.stringify(LIMITS)) fail('public/js/config.js LIMITS differs from lib/limits.js');

const all = [];
const files = readdirSync(join(root, 'content')).filter((f) => f.endsWith('.json'));
for (const g of GAMES) if (!files.includes(g.id + '.json')) fail(`content/${g.id}.json missing`);
for (const f of files) {
  const id = f.replace('.json', '');
  const game = GAMES.find((g) => g.id === id);
  if (!game) { fail(`content/${f}: not a game in lib/games.js`); continue; }
  const cards = JSON.parse(readFileSync(join(root, 'content', f), 'utf8'));
  const seen = new Set();
  const per = { 1: 0, 2: 0, 3: 0 };
  let tastes = 0, traits = 0;
  for (const c of cards) {
    const where = `${f} "${String(c.text).slice(0, 50)}"`;
    if (c.game !== id) fail(`${where}: game is ${c.game}`);
    if (![1, 2, 3].includes(c.heat)) fail(`${where}: bad heat`);
    else per[c.heat]++;
    if (!c.text || typeof c.text !== 'string') { fail(`${where}: no text`); continue; }
    const blob = [c.text, c.optionalDare, c.a, c.b].filter(Boolean).join(' ');
    if (/[\u2014\u2013]/.test(blob)) fail(`${where}: em/en dash`);
    if (seen.has(c.text.toLowerCase())) fail(`${where}: duplicate`);
    seen.add(c.text.toLowerCase());
    if (c.origin != null && !ORIGINS.includes(c.origin)) fail(`${where}: origin must be Hollywood / Bollywood / Global`);
    if (c.kind != null && !(id === 'redflag' && c.kind === 'trait')) fail(`${where}: unknown kind ${c.kind}`);
    if (c.taste) { tastes++; if (c.heat !== 3) fail(`${where}: taste card must be Lv3`); }
    if (game.mode === 'group') {
      for (const re of BANNED_GROUP) if (re.test(blob)) fail(`${where}: group card uses ${re}`);
      if (c.optionalDare) fail(`${where}: group cards have no dares`);
    }
    if (id === 'redflag') {
      if (c.kind === 'trait') {
        traits++;
        for (const re of BANNED_EXTERNAL) if (re.test(c.text)) fail(`${where}: trait card uses ${re}`);
        if (!/\?$/.test(c.text)) fail(`${where}: trait card must be a question`);
      } else for (const re of BANNED_SCENARIO) if (re.test(c.text)) fail(`${where}: scenario uses ${re}`);
    }
    if (id === 'nhie') {
      for (const re of BANNED_NHIE) if (re.test(c.text)) fail(`${where}: statement uses ${re}`);
      if (!/^Never have I ever /.test(c.text)) fail(`${where}: must start "Never have I ever"`);
    }
    if (id === 'charades') {
      if (!CHARADE_CATS.includes(c.category)) fail(`${where}: category must be Movie / TV Show / Song`);
      if (!ORIGINS.includes(c.origin)) fail(`${where}: charades need an origin`);
      if (c.optionalDare) fail(`${where}: charades have no dares`);
    }
    if (game.mode === 'couples' && id !== 'charades' && c.heat >= 2 && !c.optionalDare) fail(`${where}: Spicy/Hot couples cards need a dare (dares-only mode)`);
  }
  for (const h of [1, 2, 3]) if (MIN_PER_LEVEL[id] && per[h] < MIN_PER_LEVEL[id]) fail(`${f}: only ${per[h]} Lv${h} cards (need ${MIN_PER_LEVEL[id]})`);
  if (id === 'redflag') {
    if (traits < MIN_TRAITS) fail(`${f}: only ${traits} trait cards (need ${MIN_TRAITS})`);
    for (const h of [1, 2, 3]) if (!cards.some((c) => c.kind === 'trait' && c.heat === h)) fail(`${f}: no Lv${h} trait cards`);
  }
  if (tastes !== 1) fail(`${f}: needs exactly one taste card (has ${tastes})`);
  all.push(...cards);
}

if (errors.length) {
  console.error('Card lint failed:\n  ' + errors.join('\n  '));
  process.exit(1);
}

// Client deck: Flirty only. Belt and braces: refuse to write anything paid.
const client = all.filter((c) => c.heat === 1 && !c.taste).map(({ taste, ...c }) => c);
if (client.some((c) => c.heat !== 1 || c.taste)) { console.error('refusing to ship Spicy/Hot to the client'); process.exit(1); }
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (out) writeFileSync(out, JSON.stringify(client));

if (process.argv.includes('--seed')) {
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const rows = all.filter((c) => c.heat >= 2).map((c) => {
    const extra = {};
    for (const k of ['a', 'b', 'category', 'origin', 'kind']) if (c[k] != null) extra[k] = c[k];
    return `  (${q(c.game)}, ${c.heat}, ${q(c.text)}, ${c.optionalDare ? q(c.optionalDare) : 'null'}, ${q(JSON.stringify(extra))}::jsonb, ${c.taste ? 'true' : 'false'})`;
  });
  const sql = `-- Heat Check: paid cards, Lv2 Spicy and Lv3 Hot, served only by the server.\n-- Generated by tools/cards.mjs --seed from content/*.json. Do not edit by hand.\n-- Run after the migrations. Safe to re-run: existing cards are updated in place.\n\ninsert into public.premium_cards (game, heat, text, optional_dare, extra, is_taste)\nvalues\n${rows.join(',\n')}\non conflict (game, text) do update set heat = excluded.heat, is_taste = excluded.is_taste, extra = excluded.extra, optional_dare = excluded.optional_dare, active = true;\n`;
  writeFileSync(join(root, 'supabase/seed/premium_cards.sql'), sql);
}
const counts = GAMES.map((g) => `${g.id} ${all.filter((c) => c.game === g.id).length}`).join(', ');
console.log(`cards ok: ${client.length} client (Flirty), ${all.filter((c) => c.heat >= 2).length} Spicy/Hot server-only [${counts}]`);
