import { Hono } from 'hono';
import { SignJWT, jwtVerify, type JWTPayload as JosePayload } from 'jose';
import { verifyPassword } from '../utils/hash.js';
import type { Env, JWTPayload } from '../types.js';

const COOKIE_NAME = 'auth_token';
const TOKEN_EXPIRY = '8h';

// ── JWT helpers ──────────────────────────────────────────────────────────────

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signJWT(payload: JWTPayload, secret: string): Promise<string> {
  return new SignJWT(payload as unknown as JosePayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(secretKey(secret));
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret));
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

export const authRoutes = new Hono<{ Bindings: Env }>();

/** POST /api/admin/login */
authRoutes.post('/login', async (c) => {
  const body = await c.req.json<{ password: string }>();
  if (!body.password) {
    return c.json({ error: 'Password required' }, 400);
  }

  const valid = await verifyPassword(body.password, c.env.ADMIN_PASSWORD_HASH);
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = await signJWT({ role: 'admin' }, c.env.JWT_SECRET);

  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=28800`
  );

  return c.json({ ok: true });
});

/** POST /api/admin/logout */
authRoutes.post('/logout', (c) => {
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`
  );
  return c.json({ ok: true });
});
