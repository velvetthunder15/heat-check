// POST /api/admin/grant  { email, action: 'grant_pass' | 'grant_lifetime' | 'revoke' }
import { json, handle, readJson, HttpError, normEmail } from '../../../lib/http.js';
import { requireAdmin } from '../../../lib/admin.js';
import { rpc } from '../../../lib/supabase.js';
import { PRODUCTS } from '../../../lib/pricing.js';

const ACTIONS = new Set(['grant_pass', 'grant_lifetime', 'revoke']);
const REASONS = { no_such_user: 'No account with that email.', already_lifetime: 'They already have Lifetime.', bad_action: 'Unknown action.' };

export const onRequestPost = handle(async ({ request, env }) => {
  const { user } = await requireAdmin(request, env);
  const b = await readJson(request);
  const email = normEmail(b.email);
  if (!ACTIONS.has(b.action)) throw new HttpError(400, 'bad_action', 'Unknown action.');
  const r = await rpc(env, 'admin_set_entitlement', { p_actor: user.id, p_email: email, p_action: b.action, p_pass_hours: PRODUCTS.pass.hours });
  if (!r || !r.ok) throw new HttpError(400, (r && r.reason) || 'failed', REASONS[r && r.reason] || 'Couldn’t update that account.');
  return json(r);
});
