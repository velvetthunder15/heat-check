// GET /api/admin/analytics?days=30: the private stats page (/admin).
// Read-only, so a signed-in admin (profiles.role = 'admin', Supabase session) is enough:
// no admin password here. Grants, card edits and game switches still need the unlock cookie.
import { json, handle, clientIp } from '../../../lib/http.js';
import { requireAdminUser } from '../../../lib/admin.js';
import { limit } from '../../../lib/ratelimit.js';
import { rpc } from '../../../lib/supabase.js';

export const onRequestGet = handle(async ({ request, env, waitUntil }) => {
  await limit(env, 'admin-ip', clientIp(request), 120, 300);
  await requireAdminUser(request, env);
  const n = Number(new URL(request.url).searchParams.get('days')) || 30;
  const days = Math.max(1, Math.min(365, Math.round(n)));
  const data = await rpc(env, 'admin_analytics', { p_days: days });
  // Now and then, drop events older than 400 days
  if (Math.random() < 0.05) {
    const p = rpc(env, 'prune_analytics', {}).catch(() => {});
    if (waitUntil) waitUntil(p);
  }
  return json(data);
});
