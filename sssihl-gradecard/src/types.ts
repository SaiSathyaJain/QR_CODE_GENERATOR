export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  ADMIN_PASSWORD_HASH: string;
  BASE_URL: string;
}

export interface Student {
  id: string;
  student_name: string;
  regd_no: string;
  programme: string;
  cgpa: number;
  letter_grade: string;
  equivalent_percentage: number;
  qualitative_assessment: string;
  serial_no: string;
  cert_approval_date: string;
  photo_data: string | null;  // base64 data URL
  created_at: string;
  updated_at: string;
}

export interface StudentCreateInput {
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

export interface StudentUpdateInput extends Partial<StudentCreateInput> {
  photo_data?: string | null;
}

export interface PaginatedStudents {
  students: Student[];
  total: number;
  page: number;
  limit: number;
}

export interface ScanLog {
  id: string;
  student_id: string;
  scanned_at: string;
  cf_country: string | null;
  cf_city: string | null;
}

export interface JWTPayload {
  role: 'admin';
  iat?: number;
  exp?: number;
}
