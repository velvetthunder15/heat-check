// POST /api/event: first-party error beacon from the app. Logs a trimmed line, stores nothing.
import { handle, readJson, clientIp } from '../../lib/http.js';
import { limit } from '../../lib/ratelimit.js';

export const onRequestPost = handle(async ({ request, env }) => {
  if (env.RATE_KV) await limit(env, 'event', clientIp(request), 30, 300);
  const body = await readJson(request, 2048).catch(() => ({}));
  const type = String(body.type || '').slice(0, 20);
  const data = String(body.data || '').replace(/[\r\n]+/g, ' ').slice(0, 300);
  const path = String(body.path || '').slice(0, 80);
  console.log('client-event', type, path, data);
  return new Response(null, { status: 204 });
});
