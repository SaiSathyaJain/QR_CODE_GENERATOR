import { Hono } from 'hono';
import { corsMiddleware } from './middleware/corsMiddleware.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { gradecardRoutes } from './routes/gradecard.js';
import type { Env } from './types.js';

const app = new Hono<{ Bindings: Env }>();

// ── Global middleware ────────────────────────────────────────────────────────
app.use('/*', corsMiddleware);

// ── Auth routes ──────────────────────────────────────────────────────────────
app.route('/api/admin', authRoutes);

// ── Admin API routes (protected) ─────────────────────────────────────────────
app.route('/api/admin', adminRoutes);

// ── Public grade card routes ──────────────────────────────────────────────────
app.route('/gradecard', gradecardRoutes);

// ── R2 asset proxy (photos + QR codes) ───────────────────────────────────────
// Streams R2 objects — keeps the bucket private (5.3)
app.get('/assets/:key{.+}', async (c) => {
  const key = c.req.param('key');
  const obj = await c.env.STORAGE.get(key);

  if (!obj) {
    return c.json({ error: 'Not found' }, 404);
  }

  const contentType = obj.httpMetadata?.contentType ?? 'application/octet-stream';

  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

// ── 404 fallback ─────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
