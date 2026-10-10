// GET /api/export-data: everything we hold about the signed-in user, as JSON.
import { json, handle, requireEnv } from '../../lib/http.js';
import { requireUser, getProfile, rest, adminGetUser } from '../../lib/supabase.js';
import { limit } from '../../lib/ratelimit.js';

export const onRequestGet = handle(async ({ request, env }) => {
  requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']);
  const { user } = await requireUser(request, env);
  await limit(env, 'export-user', user.id, 10, 3600);
  const [profile, purchases, authUser] = await Promise.all([
    getProfile(env, user.id),
    rest(env, `purchases?user_id=eq.${encodeURIComponent(user.id)}&select=id,product,razorpay_order_id,razorpay_payment_id,amount_inr,currency,status,created_at,paid_at&order=created_at.desc`),
    adminGetUser(env, user.id),
  ]);
  const data = {
    exported_at: new Date().toISOString(),
    app: 'Heat Check',
    account: {
      id: user.id,
      email: user.email,
      created_at: authUser ? authUser.created_at : null,
      last_sign_in_at: authUser ? authUser.last_sign_in_at : null,
    },
    profile: profile ? {
      plan: profile.plan,
      premium_until: profile.premium_until,
      created_at: profile.created_at,
      taste_used: profile.taste_used,
      preferences: profile.preferences,
      stats: profile.stats,
    } : null,
    purchases: purchases || [],
  };
  return json(data, 200, { 'Content-Disposition': 'attachment; filename="heat-check-my-data.json"' });
});
