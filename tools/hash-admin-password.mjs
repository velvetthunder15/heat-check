#!/usr/bin/env node
// Makes the value for the ADMIN_PASSWORD_HASH secret.
//   node tools/hash-admin-password.mjs
// Type the password when asked (it isn't echoed or saved anywhere).
// Output: pbkdf2_sha256$100000$<salt>$<hash>   (100,000 is the Cloudflare Workers PBKDF2 maximum)
import { webcrypto as crypto } from 'node:crypto';
import readline from 'node:readline';

const ITERATIONS = 100000;

function ask(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

const pw = process.env.ADMIN_PASSWORD || (await ask('Admin password: '));
if (!pw || pw.length < 12) { console.error('Use at least 12 characters.'); process.exit(1); }
if (!process.env.ADMIN_PASSWORD) {
  const again = await ask('Again: ');
  if (again !== pw) { console.error('They don’t match.'); process.exit(1); }
}
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
const b64 = (u) => Buffer.from(u).toString('base64');
console.log(`pbkdf2_sha256$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`);
