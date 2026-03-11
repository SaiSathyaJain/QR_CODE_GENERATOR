import { v4 as uuidv4 } from 'uuid';
import type { Student, StudentCreateInput, StudentUpdateInput, PaginatedStudents } from '../types.js';

// ── Insert ────────────────────────────────────────────────────────────────────

export async function insertStudent(
  db: D1Database,
  data: StudentCreateInput
): Promise<Student> {
  const id = uuidv4();
  await db
    .prepare(
      `INSERT INTO students
         (id, student_name, regd_no, programme, cgpa, letter_grade,
          equivalent_percentage, qualitative_assessment, serial_no, cert_approval_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.student_name,
      data.regd_no,
      data.programme,
      data.cgpa,
      data.letter_grade,
      data.equivalent_percentage,
      data.qualitative_assessment,
      data.serial_no,
      data.cert_approval_date
    )
    .run();

  return getStudentById(db, id) as Promise<Student>;
}

// ── Get one ───────────────────────────────────────────────────────────────────

export async function getStudentById(
  db: D1Database,
  id: string
): Promise<Student | null> {
  return db
    .prepare('SELECT * FROM students WHERE id = ?')
    .bind(id)
    .first<Student>();
}

// ── Get all (paginated) ───────────────────────────────────────────────────────

export async function getAllStudents(
  db: D1Database,
  page = 1,
  limit = 20
): Promise<PaginatedStudents> {
  const offset = (page - 1) * limit;

  const [countRow, rows] = await Promise.all([
    db.prepare('SELECT COUNT(*) as total FROM students').first<{ total: number }>(),
    db
      .prepare('SELECT * FROM students ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .bind(limit, offset)
      .all<Student>(),
  ]);

  return {
    students: rows.results,
    total: countRow?.total ?? 0,
    page,
    limit,
  };
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateStudent(
  db: D1Database,
  id: string,
  data: StudentUpdateInput
): Promise<Student | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return getStudentById(db, id);

  fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
  values.push(id);

  await db
    .prepare(`UPDATE students SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return getStudentById(db, id);
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteStudent(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM students WHERE id = ?').bind(id).run();
}

// ── Scan log (fire-and-forget) ────────────────────────────────────────────────

export async function logScan(
  db: D1Database,
  studentId: string,
  cfData: { country?: string; city?: string }
): Promise<void> {
  const id = uuidv4();
  await db
    .prepare(
      'INSERT INTO scan_logs (id, student_id, cf_country, cf_city) VALUES (?, ?, ?, ?)'
    )
    .bind(id, studentId, cfData.country ?? null, cfData.city ?? null)
    .run();
}
