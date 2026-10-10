// GET  /api/admin/games              -> [{ id, enabled }]
// POST /api/admin/games { id, enabled }
import { json, handle, readJson, HttpError } from '../../../lib/http.js';
import { requireAdmin } from '../../../lib/admin.js';
import { rest } from '../../../lib/supabase.js';

import { GAME_IDS } from '../../../lib/games.js';

const IDS = new Set(GAME_IDS);

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  return json(await rest(env, 'games?select=id,mode,enabled,sort&order=sort.asc'));
});

export const onRequestPost = handle(async ({ request, env }) => {
  const { user } = await requireAdmin(request, env);
  const b = await readJson(request);
  if (!IDS.has(b.id) || typeof b.enabled !== 'boolean') throw new HttpError(400, 'bad_request', 'Invalid game.');
  const rows = await rest(env, `games?id=eq.${b.id}`, { method: 'PATCH', prefer: 'return=representation', body: { enabled: b.enabled } });
  await rest(env, 'admin_actions', { method: 'POST', prefer: 'return=minimal', body: { actor_id: user.id, action: b.enabled ? 'game_on' : 'game_off', target: b.id } });
  return json(rows && rows[0]);
});
