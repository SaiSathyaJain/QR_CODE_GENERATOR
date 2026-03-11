import { type MiddlewareHandler } from 'hono';
import type { Env } from '../types.js';

/**
 * CORS middleware — only allows the Cloudflare Pages admin domain.
 * Update ALLOWED_ORIGIN after Pages deployment.
 */
const ALLOWED_ORIGIN = 'https://sssihl-gradecard-admin.pages.dev';

export const corsMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const origin = c.req.header('Origin') ?? '';

  // Allow same-origin and the Pages admin domain
  const allowed = origin === ALLOWED_ORIGIN || origin === '';

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowed ? origin : '',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  await next();

  if (allowed && origin) {
    c.res.headers.set('Access-Control-Allow-Origin', origin);
    c.res.headers.set('Access-Control-Allow-Credentials', 'true');
  }
};
