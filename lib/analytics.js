// First-party usage stats (v20.4). No cookies, no raw IP, no email, no user id.
// The visitor id is sha256(ip | user agent | IST date | server secret), so it changes every day
// and can't be turned back into an IP. Bots are kept but flagged; link-preview fetchers are dropped.
import { isGame } from './games.js';

export const EVENT_TYPES = ['visit', 'game_start', 'card_dealt', 'heat_change', 'paywall_view', 'checkout_start', 'purchase_paid', 'signup', 'sign_in'];
export const TIERS = ['guest', 'base', 'lite', 'premium'];
export const MAX_BATCH = 40;

// Chat apps and social sites that fetch a link to build its preview card
const PREVIEW_RE = /(facebookexternalhit|facebookcatalog|meta-externalagent|WhatsApp|TelegramBot|Twitterbot|Slackbot|Slack-ImgProxy|Discordbot|LinkedInBot|SkypeUriPreview|Pinterest|redditbot|Applebot|iMessage|vkShare|Embedly|Iframely|Snapchat|Viber|LINE\/|Mastodon|Bluesky|Google-PageRenderer|Googlebot-Image)/i;
const BOT_RE = /(bot\b|bot\/|crawl|spider|slurp|HeadlessChrome|PhantomJS|Lighthouse|PageSpeed|GTmetrix|Pingdom|UptimeRobot|StatusCake|curl\/|wget|python-|python\/|aiohttp|httpx|axios|node-fetch|undici|Go-http-client|okhttp|Java\/|libwww|scrapy|puppeteer|playwright|selenium|Chrome-Lighthouse|AhrefsBot|SemrushBot|MJ12bot|DotBot|PetalBot|Bytespider|GPTBot|ClaudeBot|CCBot|PerplexityBot|Amazonbot|YandexBot|bingbot|DuckDuckBot|Baiduspider|Sogou|Exabot|ia_archiver)/i;

export function isPreviewFetcher(ua) { return PREVIEW_RE.test(String(ua || '')); }

// Cloudflare bot signals when the plan has them (botManagement is Enterprise / Bot Management only), else the UA
export function isBot(ua, cf) {
  const s = String(ua || '');
  if (!s || s.length < 20) return true;
  const bm = cf && cf.botManagement;
  if (bm) {
    if (bm.verifiedBot) return true;
    if (typeof bm.score === 'number' && bm.score > 0 && bm.score < 30) return true;
  }
  if (cf && cf.verifiedBotCategory) return true;
  return BOT_RE.test(s);
}

export function deviceClass(ua) {
  const s = String(ua || '');
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone|Opera Mini|IEMobile/i.test(s)) return 'phone';
  return 'desktop';
}

// Host part of the referrer only, lower case, without www. Our own hosts become null (internal navigation).
export function refHost(ref, ownHosts = []) {
  if (!ref) return null;
  let h;
  try { h = new URL(String(ref)).hostname.toLowerCase(); } catch (e) { return null; }
  h = h.replace(/^www\./, '').replace(/^m\./, '').replace(/^l\./, '').replace(/^lm\./, '');
  if (!h || ownHosts.some((o) => h === o || h.endsWith('.' + o))) return null;
  // Collapse the usual app wrappers
  if (h === 't.co') return 'x.com';
  if (/(^|\.)instagram\.com$/.test(h)) return 'instagram.com';
  if (/(^|\.)facebook\.com$/.test(h)) return 'facebook.com';
  if (/^(google\.[a-z.]+|android-app)$/.test(h)) return 'google';
  return h.slice(0, 100);
}

const clean = (v, n) => {
  const s = String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9._\- ]/g, '').slice(0, n);
  return s || null;
};

export function istDay(now = Date.now()) {
  return new Date(now + 5.5 * 3600e3).toISOString().slice(0, 10);
}

export async function visitorHash(ip, ua, day, secret) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}|${ua}|${day}|${secret}`));
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Turns one client batch into DB rows. Unknown types and bad fields are dropped quietly.
export function toRows(body, ctx) {
  const list = Array.isArray(body && body.e) ? body.e.slice(0, MAX_BATCH) : [];
  const utm = (body && body.utm) || {};
  const internal = !!(body && body.i);
  const rows = [];
  for (const ev of list) {
    if (!ev || typeof ev !== 'object') continue;
    const type = String(ev.t || '');
    if (!EVENT_TYPES.includes(type)) continue;
    const game = ev.g && isGame(String(ev.g)) ? String(ev.g) : null;
    const heat = [1, 2, 3].includes(Number(ev.h)) ? Number(ev.h) : null;
    const tier = TIERS.includes(String(ev.tier)) ? String(ev.tier) : null;
    const product = ev.p === 'lite' || ev.p === 'premium' ? ev.p : null;
    const visit = type === 'visit';
    rows.push({
      type, game, heat, tier, product,
      country: ctx.country, city: ctx.city, device: ctx.device,
      ref_host: visit ? ctx.refHost : null,
      utm_source: visit ? clean(utm.s, 60) : null,
      utm_medium: visit ? clean(utm.m, 60) : null,
      utm_campaign: visit ? clean(utm.c, 60) : null,
      visitor: ctx.visitor, is_bot: ctx.isBot, internal,
    });
  }
  return rows;
}
