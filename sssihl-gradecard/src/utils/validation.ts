const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface StudentFormData {
  student_name: string;
  regd_no: string;
  programme: string;
  cgpa: number;
  letter_grade: string;
  equivalent_percentage: number;
  qualitative_assessment: string;
  serial_no: string;
  cert_approval_date: string;
}

export function validateStudentInput(data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  const requiredText = ['student_name', 'regd_no', 'programme', 'letter_grade',
    'qualitative_assessment', 'serial_no', 'cert_approval_date'] as const;
  for (const field of requiredText) {
    if (!data[field] || typeof data[field] !== 'string' || !(data[field] as string).trim()) {
      errors.push({ field, message: `${field} is required` });
    }
  }

  const cgpa = Number(data.cgpa);
  if (isNaN(cgpa) || cgpa < 0 || cgpa > 10) {
    errors.push({ field: 'cgpa', message: 'CGPA must be between 0 and 10' });
  }

  const pct = Number(data.equivalent_percentage);
  if (isNaN(pct) || pct < 0 || pct > 100) {
    errors.push({ field: 'equivalent_percentage', message: 'Equivalent percentage must be 0–100' });
  }

  return errors;
}

export function isAllowedImageType(contentType: string): boolean {
  return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(contentType);
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
export function isValidFileSize(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_PHOTO_BYTES;
}
