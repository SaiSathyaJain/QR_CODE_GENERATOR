import { Hono } from 'hono';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  insertStudent,
  getStudentById,
  getAllStudents,
  updateStudent,
  deleteStudent,
} from '../services/studentService.js';
import { generateQRDataURL } from '../services/qrService.js';
import {
  isValidUUID,
  validateStudentInput,
  isAllowedImageType,
  isValidFileSize,
} from '../utils/validation.js';
import type { Env } from '../types.js';

export const adminRoutes = new Hono<{ Bindings: Env }>();

// Apply auth middleware to all admin routes
adminRoutes.use('/*', authMiddleware);

// ── 9.1  GET /api/admin/students ─────────────────────────────────────────────
adminRoutes.get('/students', async (c) => {
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 20)));
  const result = await getAllStudents(c.env.DB, page, limit);

  // Strip photo_data blob from list — replace with boolean flag
  const students = result.students.map(({ photo_data, ...rest }) => ({
    ...rest,
    has_photo: !!photo_data,
  }));
  return c.json({ ...result, students });
});

// ── 9.2  POST /api/admin/students ────────────────────────────────────────────
adminRoutes.post('/students', async (c) => {
  const formData = await c.req.formData();

  const fields: Record<string, unknown> = {
    student_name: formData.get('student_name'),
    regd_no: formData.get('regd_no'),
    programme: formData.get('programme'),
    cgpa: Number(formData.get('cgpa')),
    letter_grade: formData.get('letter_grade'),
    equivalent_percentage: Number(formData.get('equivalent_percentage')),
    qualitative_assessment: formData.get('qualitative_assessment'),
    serial_no: formData.get('serial_no'),
    cert_approval_date: formData.get('cert_approval_date'),
  };

  const errors = validateStudentInput(fields);
  if (errors.length > 0) return c.json({ errors }, 400);

  // Handle photo — convert to base64 data URL before insert
  let photoData: string | null = null;
  const photoFile = formData.get('photo') as File | null;
  if (photoFile && photoFile.size > 0) {
    if (!isAllowedImageType(photoFile.type)) {
      return c.json({ error: 'Photo must be JPEG, PNG, or WebP' }, 400);
    }
    if (!isValidFileSize(photoFile.size)) {
      return c.json({ error: 'Photo must be ≤ 200 KB' }, 400);
    }
    const buf = await photoFile.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    photoData = `data:${photoFile.type};base64,${b64}`;
  }

  // Insert student record
  const student = await insertStudent(c.env.DB, {
    student_name: fields.student_name as string,
    regd_no: fields.regd_no as string,
    programme: fields.programme as string,
    cgpa: fields.cgpa as number,
    letter_grade: fields.letter_grade as string,
    equivalent_percentage: fields.equivalent_percentage as number,
    qualitative_assessment: fields.qualitative_assessment as string,
    serial_no: fields.serial_no as string,
    cert_approval_date: fields.cert_approval_date as string,
  });

  // Store photo_data if provided
  if (photoData !== null) {
    await updateStudent(c.env.DB, student.id, { photo_data: photoData });
  }

  // Generate QR data URL and attach to response (not stored — generated on each grade card view)
  const qrDataUrl = await generateQRDataURL(c.env.BASE_URL, student.id);

  return c.json({ ...student, photo_data: photoData, qr_data_url: qrDataUrl }, 201);
});

// ── 9.3  GET /api/admin/students/:id ─────────────────────────────────────────
adminRoutes.get('/students/:id', async (c) => {
  const { id } = c.req.param();
  if (!isValidUUID(id)) return c.json({ error: 'Invalid ID' }, 400);

  const student = await getStudentById(c.env.DB, id);
  if (!student) return c.json({ error: 'Not found' }, 404);
  return c.json(student);
});

// ── 9.4  PUT /api/admin/students/:id ─────────────────────────────────────────
adminRoutes.put('/students/:id', async (c) => {
  const { id } = c.req.param();
  if (!isValidUUID(id)) return c.json({ error: 'Invalid ID' }, 400);

  const existing = await getStudentById(c.env.DB, id);
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const formData = await c.req.formData();
  const updateData: Record<string, unknown> = {};

  const textFields = [
    'student_name', 'regd_no', 'programme', 'letter_grade',
    'qualitative_assessment', 'serial_no', 'cert_approval_date',
  ] as const;
  for (const f of textFields) {
    const val = formData.get(f);
    if (val !== null) updateData[f] = val;
  }
  const cgpa = formData.get('cgpa');
  if (cgpa !== null) updateData.cgpa = Number(cgpa);
  const pct = formData.get('equivalent_percentage');
  if (pct !== null) updateData.equivalent_percentage = Number(pct);

  // Handle new photo
  const photoFile = formData.get('photo') as File | null;
  if (photoFile && photoFile.size > 0) {
    if (!isAllowedImageType(photoFile.type)) {
      return c.json({ error: 'Photo must be JPEG, PNG, or WebP' }, 400);
    }
    if (!isValidFileSize(photoFile.size)) {
      return c.json({ error: 'Photo must be ≤ 200 KB' }, 400);
    }
    const buf = await photoFile.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    updateData.photo_data = `data:${photoFile.type};base64,${b64}`;
  }

  const updated = await updateStudent(c.env.DB, id, updateData);
  return c.json(updated);
});

// ── 9.5  DELETE /api/admin/students/:id ──────────────────────────────────────
adminRoutes.delete('/students/:id', async (c) => {
  const { id } = c.req.param();
  if (!isValidUUID(id)) return c.json({ error: 'Invalid ID' }, 400);

  const student = await getStudentById(c.env.DB, id);
  if (!student) return c.json({ error: 'Not found' }, 404);

  await deleteStudent(c.env.DB, id);
  return c.json({ ok: true });
});

// ── 9.6a GET /api/admin/students/:id/photo ───────────────────────────────────
// Serves the base64 photo from D1 as an image response
adminRoutes.get('/students/:id/photo', async (c) => {
  const { id } = c.req.param();
  if (!isValidUUID(id)) return c.json({ error: 'Invalid ID' }, 400);

  const student = await getStudentById(c.env.DB, id);
  if (!student || !student.photo_data) return c.json({ error: 'Photo not found' }, 404);

  // photo_data is "data:<mime>;base64,<b64>"
  const [header, b64] = student.photo_data.split(',');
  const mime = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return new Response(bytes, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

// ── 9.6  GET /api/admin/students/:id/qr ──────────────────────────────────────
// Generates QR on-the-fly and streams it as a downloadable PNG
adminRoutes.get('/students/:id/qr', async (c) => {
  const { id } = c.req.param();
  if (!isValidUUID(id)) return c.json({ error: 'Invalid ID' }, 400);

  const student = await getStudentById(c.env.DB, id);
  if (!student) return c.json({ error: 'Not found' }, 404);

  const dataUrl = await generateQRDataURL(c.env.BASE_URL, id);
  // dataUrl = "data:image/png;base64,<b64>"
  const b64 = dataUrl.split(',')[1];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${student.regd_no}_qr.png"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
