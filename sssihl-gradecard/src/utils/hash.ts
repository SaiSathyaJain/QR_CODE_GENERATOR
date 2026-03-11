/**
 * Password hashing using PBKDF2 via Web Crypto API.
 * Native to Cloudflare Workers — no bcrypt binary needed.
 */

const SALT = 'sssihl-grade-card-salt';
const ITERATIONS = 100_000;

async function deriveKey(password: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(SALT),
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
}

export async function hashPassword(password: string): Promise<string> {
  const bits = await deriveKey(password);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

/** Constant-time comparison to prevent timing attacks */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const derivedHash = await hashPassword(password);
  if (derivedHash.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < derivedHash.length; i++) {
    diff |= derivedHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}
