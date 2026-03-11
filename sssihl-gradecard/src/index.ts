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

// ── 404 fallback ─────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
