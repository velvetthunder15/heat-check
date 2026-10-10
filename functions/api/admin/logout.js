// POST /api/admin/logout: drop the admin cookie
import { json, handle } from '../../../lib/http.js';
import { clearAdminCookie } from '../../../lib/admin.js';

export const onRequestPost = handle(async () => json({ ok: true }, 200, { 'Set-Cookie': clearAdminCookie() }));
