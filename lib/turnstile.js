// Cloudflare Turnstile server-side check
import { HttpError, requireEnv } from './http.js';

export async function verifyTurnstile(env, token, ip) {
  requireEnv(env, ['TURNSTILE_SECRET']);
  if (!token || typeof token !== 'string' || token.length > 2048) {
    throw new HttpError(400, 'captcha_required', 'Finish the quick check first.');
  }
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    console.error('turnstile failed', (data['error-codes'] || []).join(','));
    throw new HttpError(400, 'captcha_failed', 'The quick check didn’t pass. Try again.');
  }
}
