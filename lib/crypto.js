// Web Crypto helpers (Workers runtime: no Node crypto).

const enc = new TextEncoder();

export function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function b64ToBytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function bytesToB64url(buf) {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function hmacSha256(secret, message) {
  return crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(message));
}

export async function hmacHex(secret, message) {
  return toHex(await hmacSha256(secret, message));
}

export async function hmacB64url(secret, message) {
  return bytesToB64url(await hmacSha256(secret, message));
}

// Constant-time comparison. Always walks the longer input so timing
// doesn't reveal where (or whether) the strings differ.
export function timingSafeEqualBytes(a, b) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (i < a.length ? a[i] : 0) ^ (i < b.length ? b[i] : 0);
  return diff === 0;
}

export function timingSafeEqual(a, b) {
  return timingSafeEqualBytes(enc.encode(String(a)), enc.encode(String(b)));
}

// ADMIN_PASSWORD_HASH format (made by tools/hash-admin-password.mjs):
//   pbkdf2_sha256$<iterations>$<salt base64>$<hash base64>
// Cloudflare Workers cap PBKDF2 at 100,000 iterations, so that's what we use.
export const PBKDF2_MAX_ITERATIONS = 100000;

export async function pbkdf2Verify(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') throw new Error('ADMIN_PASSWORD_HASH has the wrong format');
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > PBKDF2_MAX_ITERATIONS) {
    throw new Error('ADMIN_PASSWORD_HASH iterations must be between 10000 and 100000');
  }
  const salt = b64ToBytes(parts[2]);
  const expected = b64ToBytes(parts[3]);
  if (salt.length < 16 || expected.length < 32) throw new Error('ADMIN_PASSWORD_HASH salt or hash too short');
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, expected.length * 8);
  return timingSafeEqualBytes(new Uint8Array(bits), expected);
}
