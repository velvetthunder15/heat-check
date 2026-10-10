// POST /api/auth/otp  { email, turnstileToken }
// Turnstile + per-email and per-IP limits, then Supabase Auth emails a 6-digit code.
// The app then calls supabase.auth.verifyOtp({ email, token, type: 'email' }) itself.
import { json, handle, readJson, clientIp, normEmail, requireEnv } from '../../../lib/http.js';
import { limit } from '../../../lib/ratelimit.js';
import { verifyTurnstile } from '../../../lib/turnstile.js';
import { sendOtp } from '../../../lib/supabase.js';

export const onRequestPost = handle(async ({ request, env }) => {
  requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'TURNSTILE_SECRET']);
  const ip = clientIp(request);
  const body = await readJson(request);
  const email = normEmail(body.email);

  await limit(env, 'otp-ip-hour', ip, 20, 3600);
  await verifyTurnstile(env, body.turnstileToken, ip);
  await limit(env, 'otp-email-30s', email, 1, 30);
  await limit(env, 'otp-email-hour', email, 6, 3600);

  await sendOtp(env, email, { createUser: true, ip });
  return json({ ok: true });
});
