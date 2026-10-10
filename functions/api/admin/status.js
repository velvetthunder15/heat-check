// GET /api/admin/status: is this admin's unlock cookie still valid?
import { json, handle } from '../../../lib/http.js';
import { requireAdminUser, readAdminCookie } from '../../../lib/admin.js';

export const onRequestGet = handle(async ({ request, env }) => {
  const { user } = await requireAdminUser(request, env);
  const s = await readAdminCookie(request, env, user.id);
  return json({ active: !!s, expiresAt: s ? s.exp * 1000 : null });
});
