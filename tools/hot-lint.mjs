// Fails the build if a UI string names the top heat level as "Hot"/"hot" instead of
// going through the formatter (HC.HOT / HEAT[3].name in the app, lib/heat.js on the server).
// Whole word only: shot, photo, hotel, hotseat, .hot, t-hot, /api/hot, 'hot' ids never match.
// Literal phrases that aren't the heat level (hot seat, hot tub, hot chocolate) are allowed.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== 'vendor') walk(p); } else if (['.js', '.mjs', '.html'].includes(extname(n))) files.push(p); } };
['public', 'functions', 'lib'].forEach((d) => walk(join(root, d)));
const TERM = /(?<![\w./\-#$])(Hot|hot)(?![\w:(\-_])/g;
const ID = /^['"`]hot['"`]$/; // the lowercase id 'hot' on its own is data, not copy
const LITERAL = /^(Hot|hot)\s+(seat|Seat|tub|chocolate|to Handle)/;
const bad = [];
for (const f of files) {
  let s = readFileSync(f, 'utf8');
  s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  s.split('\n').forEach((line, i) => {
    const code = line.replace(/(^|[\s;{}(),])\/\/.*$/, '$1');
    for (const m of code.matchAll(TERM)) {
      if (LITERAL.test(code.slice(m.index))) continue;
      if (ID.test(code.slice(m.index - 1, m.index + 4))) continue;
      bad.push(`${f.replace(root, '')}:${i + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
}
// The two copies of the formatter must agree
const cfg = readFileSync(join(root, 'public/js/config.js'), 'utf8').match(/HOT:\s*'([^']+)'/);
const lib = readFileSync(join(root, 'lib/heat.js'), 'utf8').match(/HOT\s*=\s*'([^']+)'/);
if (!cfg || !lib || cfg[1] !== lib[1] || cfg[1] !== 'HOT') bad.push('HC.HOT and lib/heat.js HOT must both be "HOT"');
if (bad.length) { console.error('HOT lint: write the heat level through HC.HOT / HEAT[3].name / lib/heat.js:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`HOT lint ok (${files.length} files)`);
