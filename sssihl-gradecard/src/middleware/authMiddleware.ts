import { type MiddlewareHandler } from 'hono';
import { verifyJWT } from '../routes/auth.js';
import type { Env } from '../types.js';

export const authMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  // Extract token from HttpOnly cookie
  const cookieHeader = c.req.header('Cookie') ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
  const token = match?.[1];

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload || payload.role !== 'admin') {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
};
