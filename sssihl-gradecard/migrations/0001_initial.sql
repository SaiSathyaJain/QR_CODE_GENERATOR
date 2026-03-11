CREATE TABLE IF NOT EXISTS students (
    id                     TEXT PRIMARY KEY,
    student_name           TEXT NOT NULL,
    regd_no                TEXT NOT NULL UNIQUE,
    programme              TEXT NOT NULL,
    cgpa                   REAL NOT NULL,
    letter_grade           TEXT NOT NULL,
    equivalent_percentage  REAL NOT NULL,
    qualitative_assessment TEXT NOT NULL,
    serial_no              TEXT NOT NULL,
    cert_approval_date     TEXT NOT NULL,
    photo_data             TEXT,           -- base64 data URL (no R2 needed)
    created_at             TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at             TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS scan_logs (
    id          TEXT PRIMARY KEY,
    student_id  TEXT NOT NULL,
    scanned_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    cf_country  TEXT,
    cf_city     TEXT,
    FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX IF NOT EXISTS idx_students_regd_no ON students(regd_no);
CREATE INDEX IF NOT EXISTS idx_scan_logs_student_id ON scan_logs(student_id);
