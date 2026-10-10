// GET /api/admin/stats: signup and purchase counts
import { json, handle } from '../../../lib/http.js';
import { requireAdmin } from '../../../lib/admin.js';
import { rpc } from '../../../lib/supabase.js';

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(request, env);
  return json(await rpc(env, 'admin_stats', {}));
});
