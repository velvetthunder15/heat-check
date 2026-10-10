#!/usr/bin/env node
// Build: copies public/ to dist/ and stamps SITE_URL (and CONTACT_EMAIL) into the
// files that need absolute URLs: canonical/og tags, manifest, robots, sitemap.
// Runs on Cloudflare Pages (and Vercel) with no npm dependencies.
//   SITE_URL=https://heatcheck.app node tools/build.mjs
import { cpSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = join(root, 'public');
const out = join(root, 'dist');

// SITE_URL from wrangler.toml [vars], so the build and the Functions share one value
function tomlSiteUrl() {
  try {
    const m = /^\s*SITE_URL\s*=\s*"([^"]+)"/m.exec(readFileSync(join(root, 'wrangler.toml'), 'utf8'));
    return m ? m[1] : '';
  } catch (e) { return ''; }
}

function pickSiteUrl() {
  const e = process.env;
  const raw = e.SITE_URL
    || (e.VERCEL ? (e.VERCEL_PROJECT_PRODUCTION_URL ? `https://${e.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://heat-check-sage.vercel.app') : '')
    || tomlSiteUrl()
    || e.CF_PAGES_URL
    || 'https://heat-check-sage.vercel.app';
  const u = new URL(raw);
  if (u.protocol !== 'https:' && u.hostname !== 'localhost') throw new Error('SITE_URL must be https');
  return u.origin;
}

const SITE_URL = pickSiteUrl();
const CONTACT_EMAIL = (process.env.CONTACT_EMAIL || '').trim();
if (CONTACT_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(CONTACT_EMAIL)) throw new Error('CONTACT_EMAIL looks wrong');

rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });

const STAMP = new Set(['.html', '.webmanifest', '.txt', '.xml', '.json', '.js']);
const contactHtml = CONTACT_EMAIL ? `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>` : 'our support email (being set up, check back soon)';
let stamped = 0;
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!STAMP.has(extname(name))) continue;
    if (p.includes(join('js', 'vendor'))) continue;
    const before = readFileSync(p, 'utf8');
    const after = before
      .replaceAll('%%SITE_URL%%', SITE_URL)
      .replaceAll('%%CONTACT_EMAIL%%', CONTACT_EMAIL)
      .replaceAll('%%CONTACT_HTML%%', contactHtml);
    if (after !== before) { writeFileSync(p, after); stamped++; }
  }
})(out);

console.log(`built dist/ for ${SITE_URL} (${stamped} files stamped${CONTACT_EMAIL ? '' : ', no CONTACT_EMAIL yet'})`);
