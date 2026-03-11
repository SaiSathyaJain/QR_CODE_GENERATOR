import { Hono } from 'hono';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  insertStudent,
  getStudentById,
  getAllStudents,
  updateStudent,
  deleteStudent,
} from '../services/studentService.js';
import { generateAndStoreQR } from '../services/qrService.js';
import { uploadFile, deleteFile, photoKey, qrKey } from '../services/storageService.js';
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
  return c.json(result);
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

  // Insert student record first (to get the UUID)
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

  // Handle photo upload
  let photoR2Key: string | null = null;
  const photoFile = formData.get('photo') as File | null;
  if (photoFile && photoFile.size > 0) {
    if (!isAllowedImageType(photoFile.type)) {
      return c.json({ error: 'Photo must be JPEG, PNG, or WebP' }, 400);
    }
    if (!isValidFileSize(photoFile.size)) {
      return c.json({ error: 'Photo must be ≤ 5 MB' }, 400);
    }
    const ext = photoFile.type.split('/')[1].replace('jpeg', 'jpg');
    photoR2Key = photoKey(student.id, ext);
    const buf = await photoFile.arrayBuffer();
    await uploadFile(c.env.STORAGE, photoR2Key, buf, photoFile.type);
  }

  // Generate QR code
  const qrR2Key = await generateAndStoreQR(c.env, student.id);

  // Update record with R2 keys
  const updated = await updateStudent(c.env.DB, student.id, {
    photo_r2_key: photoR2Key,
    qr_r2_key: qrR2Key,
  });

  return c.json(updated, 201);
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
      return c.json({ error: 'Photo must be ≤ 5 MB' }, 400);
    }
    // Delete old photo from R2
    if (existing.photo_r2_key) {
      await deleteFile(c.env.STORAGE, existing.photo_r2_key);
    }
    const ext = photoFile.type.split('/')[1].replace('jpeg', 'jpg');
    const newPhotoKey = photoKey(id, ext);
    const buf = await photoFile.arrayBuffer();
    await uploadFile(c.env.STORAGE, newPhotoKey, buf, photoFile.type);
    updateData.photo_r2_key = newPhotoKey;
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

  // Delete R2 objects
  await Promise.all([
    student.photo_r2_key ? deleteFile(c.env.STORAGE, student.photo_r2_key) : Promise.resolve(),
    student.qr_r2_key ? deleteFile(c.env.STORAGE, student.qr_r2_key) : Promise.resolve(),
  ]);

  await deleteStudent(c.env.DB, id);
  return c.json({ ok: true });
});

// ── 9.6  GET /api/admin/students/:id/qr ──────────────────────────────────────
adminRoutes.get('/students/:id/qr', async (c) => {
  const { id } = c.req.param();
  if (!isValidUUID(id)) return c.json({ error: 'Invalid ID' }, 400);

  const student = await getStudentById(c.env.DB, id);
  if (!student || !student.qr_r2_key) return c.json({ error: 'QR not found' }, 404);

  const obj = await c.env.STORAGE.get(student.qr_r2_key);
  if (!obj) return c.json({ error: 'QR not found in storage' }, 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${student.regd_no}_qr.png"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
