# SSSIHL Digital Consolidated Grade Card — QR Code System
## Claude Code Development To-Do (Cloudflare Stack)

> **Project:** QR Code Generator for SSSIHL Digital Consolidated Grade Cards  
> **Institution:** Sri Sathya Sai Institute of Higher Learning  
> **Stack:** Cloudflare Workers · Cloudflare D1 (SQLite) · Cloudflare R2 (file storage) · Cloudflare Pages · Hono.js

---

## Architecture Overview

```
Browser / QR Scanner
        │
        ▼
┌─────────────────────────────────────────────┐
│           Cloudflare Edge Network           │
│                                             │
│  ┌──────────────┐    ┌────────────────────┐ │
│  │   CF Pages   │    │    CF Workers      │ │
│  │  (Admin UI   │───▶│  (API / Routing)   │ │
│  │  & Grade     │    │   Hono.js router   │ │
│  │  Card UI)    │    └────────┬───────────┘ │
│  └──────────────┘             │             │
│                      ┌────────┴──────────┐  │
│                      │                   │  │
│               ┌──────▼──────┐   ┌────────▼─┐│
│               │  CF D1 DB   │   │  CF R2   ││
│               │  (student   │   │ (photos  ││
│               │   records)  │   │  + QRs)  ││
│               └─────────────┘   └──────────┘│
└─────────────────────────────────────────────┘
```

**Why this stack:**
- **Cloudflare Workers** — runs API logic at the edge, zero cold starts, global
- **Cloudflare D1** — SQLite-compatible, serverless database, native Workers binding
- **Cloudflare R2** — S3-compatible object storage for photos & QR PNGs, zero egress fees
- **Cloudflare Pages** — hosts the admin UI and grade card HTML (static + Worker Functions)
- **Hono.js** — ultra-lightweight web framework built for CF Workers

---

## Phase 1 — Project Scaffolding & Setup

- [ ] **1.1** Install Wrangler CLI globally
  ```bash
  npm install -g wrangler
  wrangler login
  ```
- [ ] **1.2** Create the project using Hono + Workers template
  ```bash
  npm create cloudflare@latest sssihl-gradecard -- --template=hono
  cd sssihl-gradecard
  ```
- [ ] **1.3** Install additional dependencies
  ```bash
  npm install hono jose uuid
  npm install qrcode
  npm install --save-dev @cloudflare/workers-types wrangler
  ```
- [ ] **1.4** Final folder structure:
  ```
  sssihl-gradecard/
  ├── wrangler.toml                  # Cloudflare config (D1, R2, bindings, routes)
  ├── package.json
  ├── tsconfig.json
  ├── .dev.vars                      # Local secrets (never commit)
  ├── .gitignore
  │
  ├── src/
  │   ├── index.ts                   # Hono app entry point, route registration
  │   ├── types.ts                   # TypeScript types (Env bindings, Student, etc.)
  │   │
  │   ├── routes/
  │   │   ├── auth.ts                # POST /api/admin/login, POST /api/admin/logout
  │   │   ├── admin.ts               # CRUD routes — protected by JWT middleware
  │   │   └── gradecard.ts           # GET /gradecard/:id — public route
  │   │
  │   ├── middleware/
  │   │   ├── authMiddleware.ts      # Verify JWT from Authorization header / cookie
  │   │   └── corsMiddleware.ts      # CORS config for Pages <-> Workers
  │   │
  │   ├── services/
  │   │   ├── qrService.ts           # Generate QR code buffer, upload to R2
  │   │   ├── storageService.ts      # R2 upload/delete helpers
  │   │   └── studentService.ts      # D1 query helpers (insert, get, update, delete)
  │   │
  │   └── utils/
  │       ├── hash.ts                # PBKDF2 password hashing via SubtleCrypto
  │       └── validation.ts          # Input validation helpers
  │
  ├── frontend/                      # Static frontend (served via CF Pages)
  │   ├── admin/
  │   │   ├── login.html
  │   │   ├── dashboard.html
  │   │   └── upload.html
  │   └── gradecard/
  │       └── view.html
  │
  └── migrations/
      └── 0001_initial.sql           # D1 database migration file
  ```
- [ ] **1.5** Set up `.gitignore`:
  ```
  node_modules/
  .dev.vars
  dist/
  .wrangler/
  ```

---

## Phase 2 — Cloudflare Configuration (`wrangler.toml`)

- [ ] **2.1** Write `wrangler.toml`:
  ```toml
  name = "sssihl-gradecard"
  main = "src/index.ts"
  compatibility_date = "2024-11-01"
  compatibility_flags = ["nodejs_compat"]

  [[d1_databases]]
  binding = "DB"
  database_name = "sssihl-gradecard-db"
  database_id = "<YOUR_D1_DATABASE_ID>"

  [[r2_buckets]]
  binding = "STORAGE"
  bucket_name = "sssihl-gradecard-storage"

  [vars]
  BASE_URL = "https://gradecard.sssihl.edu.in"
  ENVIRONMENT = "production"

  # Secrets (set via wrangler secret put):
  # JWT_SECRET
  # ADMIN_PASSWORD_HASH
  ```
- [ ] **2.2** Create D1 database:
  ```bash
  wrangler d1 create sssihl-gradecard-db
  # Copy database_id into wrangler.toml
  ```
- [ ] **2.3** Create R2 bucket:
  ```bash
  wrangler r2 bucket create sssihl-gradecard-storage
  ```
- [ ] **2.4** Set production secrets:
  ```bash
  wrangler secret put JWT_SECRET
  wrangler secret put ADMIN_PASSWORD_HASH
  ```
- [ ] **2.5** Set local dev secrets in `.dev.vars`:
  ```
  JWT_SECRET=local_dev_secret_min_32_chars
  ADMIN_PASSWORD_HASH=<generated_hash>
  ```

---

## Phase 3 — D1 Database Schema & Migrations

- [ ] **3.1** Write `migrations/0001_initial.sql`:
  ```sql
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
      photo_r2_key           TEXT,
      qr_r2_key              TEXT,
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
  ```
- [ ] **3.2** Apply migration locally:
  ```bash
  wrangler d1 migrations apply sssihl-gradecard-db --local
  ```
- [ ] **3.3** Apply migration to production:
  ```bash
  wrangler d1 migrations apply sssihl-gradecard-db --remote
  ```

---

## Phase 4 — TypeScript Types (`src/types.ts`)

- [ ] **4.1** Define `Env` interface with all CF bindings:
  ```typescript
  export interface Env {
    DB: D1Database;
    STORAGE: R2Bucket;
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
    photo_r2_key: string | null;
    qr_r2_key: string | null;
    created_at: string;
    updated_at: string;
  }
  ```

---

## Phase 5 — R2 Storage Service (`src/services/storageService.ts`)

- [ ] **5.1** Write helper functions:
  - `uploadFile(bucket, key, data, contentType)` — R2 put object
  - `deleteFile(bucket, key)` — R2 delete object
- [ ] **5.2** R2 key naming conventions:
  - Photos: `photos/<studentId>.<ext>`
  - QR Codes: `qrcodes/<studentId>.png`
- [ ] **5.3** Add Worker proxy route `GET /assets/:key+`:
  - Streams R2 object to response (keeps bucket private)
  - Sets correct `Content-Type` header
  - Sets `Cache-Control: public, max-age=86400`

---

## Phase 6 — QR Code Generation Service (`src/services/qrService.ts`)

- [ ] **6.1** Use `qrcode` npm package (requires `nodejs_compat` flag)
- [ ] **6.2** Function: `generateAndStoreQR(env, studentId)`:
  - Encodes URL: `${env.BASE_URL}/gradecard/${studentId}`
  - Generates PNG as a Buffer
  - Uploads to R2 with key `qrcodes/${studentId}.png`
  - Returns R2 key string
- [ ] **6.3** QR options:
  ```typescript
  {
    errorCorrectionLevel: 'H',   // 30% damage tolerance
    type: 'image/png',
    width: 400,
    margin: 2,
    color: { dark: '#1a237e', light: '#ffffff' }
  }
  ```
- [ ] **6.4** Call QR generation after every successful `insertStudent`

---

## Phase 7 — Authentication (JWT + HttpOnly Cookie)

> CF Workers are stateless — server-side sessions don't work. Use JWT.

- [ ] **7.1** Write `src/utils/hash.ts` using Web Crypto API (native in Workers):
  - `hashPassword(password)` — PBKDF2 + SHA-256, returns base64 hash string
  - `verifyPassword(password, hash)` — constant-time comparison
- [ ] **7.2** JWT helpers using `jose`:
  - `signJWT(payload, secret, expiresIn)` — HS256 signed token
  - `verifyJWT(token, secret)` — verify and decode
- [ ] **7.3** `POST /api/admin/login`:
  1. Validate credentials against `ADMIN_PASSWORD_HASH`
  2. Sign JWT `{ role: 'admin' }`, 8h expiry
  3. Set `HttpOnly; Secure; SameSite=Strict` cookie
- [ ] **7.4** `POST /api/admin/logout`: clear the auth cookie
- [ ] **7.5** `authMiddleware.ts`: extract cookie → verify JWT → attach to context → 401 if invalid

---

## Phase 8 — Student Service (`src/services/studentService.ts`)

- [ ] **8.1** All queries use **D1 prepared statements** (parameterized, no string interpolation):
  ```typescript
  const student = await db
    .prepare('SELECT * FROM students WHERE id = ?')
    .bind(id)
    .first<Student>();
  ```
- [ ] **8.2** Implement:
  - `insertStudent(db, data)` → returns created `Student`
  - `getStudentById(db, id)` → returns `Student | null`
  - `getAllStudents(db, page, limit)` → returns `{ students[], total }`
  - `updateStudent(db, id, data)` → returns updated `Student`
  - `deleteStudent(db, id)` → void
  - `logScan(db, studentId, cfData)` → fire-and-forget

---

## Phase 9 — Admin API Routes (`src/routes/admin.ts`)

All routes behind `authMiddleware`.

- [ ] **9.1** `GET  /api/admin/students` — paginated student list (JSON)
- [ ] **9.2** `POST /api/admin/students` — create student:
  1. Parse `multipart/form-data`
  2. Validate all fields
  3. Upload photo → R2
  4. Insert record → D1
  5. Generate QR → R2
  6. Update D1 with `photo_r2_key` + `qr_r2_key`
  7. Return created student JSON
- [ ] **9.3** `GET  /api/admin/students/:id` — fetch one student
- [ ] **9.4** `PUT  /api/admin/students/:id` — update (swap R2 photo if new one uploaded)
- [ ] **9.5** `DELETE /api/admin/students/:id` — delete D1 record + both R2 objects
- [ ] **9.6** `GET  /api/admin/students/:id/qr` — stream QR PNG from R2 as file download

---

## Phase 10 — Public Grade Card Route (`src/routes/gradecard.ts`)

- [ ] **10.1** `GET /gradecard/:id`:
  1. Validate UUID format (return 400 if invalid)
  2. Query D1 for student
  3. If not found → return styled 404 HTML
  4. Log scan via `ctx.waitUntil(logScan(...))` — non-blocking
  5. Inject student data into HTML template string
  6. Return `text/html` response
- [ ] **10.2** Set `Cache-Control: no-store` — grade cards must always be fresh
- [ ] **10.3** Route is fully **public** — no auth required

---

## Phase 11 — Grade Card HTML Template

Server-side rendered as a template string inside the Worker. All CSS inlined.

- [ ] **11.1** **Header:**
  - SSSIHL emblem (inline SVG or base64 PNG)
  - "Sri Sathya Sai Institute of Higher Learning"
  - "DIGITAL CONSOLIDATED GRADE CARD"
  - Gold decorative divider
- [ ] **11.2** **Student Identity (two-column):**
  - Left: Passport photo via `/assets/photos/<key>` (graceful fallback if missing)
  - Right: Student Name, Regd. No., Programme — labeled data rows
- [ ] **11.3** **Academic Performance:**
  - CGPA — large display typography
  - Letter Grade — color-coded badge chip (O=gold, A+=green, etc.)
  - Equivalent Percentage
  - Qualitative Assessment — styled highlight
- [ ] **11.4** **Certificate Details:**
  - Serial No.
  - Certificate Approval Date (formatted: DD Month YYYY)
- [ ] **11.5** **Verification Block:**
  - `✓ VERIFIED BY SSSIHL` — green badge with inline SVG shield icon
  - Subtle watermark seal behind card body
- [ ] **11.6** **Footer:**
  - Office of Controller of Examinations
  - Email: coeoffice@sssihl.edu.in
  - *Record verified on [current date, IST]*
- [ ] **11.7** Mobile-first responsive layout (QR scanned on phones)
- [ ] **11.8** `@media print` CSS — clean A4 output, no browser chrome
- [ ] **11.9** Color scheme: deep navy `#1a237e` + gold `#c8a951` + white

---

## Phase 12 — Admin Frontend (`frontend/`)

Hosted on Cloudflare Pages. Communicates with Worker API via `fetch`.

### `login.html`
- [ ] **12.1** SSSIHL logo + "Grade Card Management Portal"
- [ ] **12.2** `POST /api/admin/login` on submit → redirect to dashboard
- [ ] **12.3** Show error on failed login

### `dashboard.html`
- [ ] **12.4** Fetch `GET /api/admin/students` on page load
- [ ] **12.5** Student table: Thumbnail | Name | Regd. No. | CGPA | Grade | QR Preview | Actions
- [ ] **12.6** Search bar (client-side filter), pagination
- [ ] **12.7** "Add New Student" → `upload.html`
- [ ] **12.8** Delete with confirmation → `DELETE /api/admin/students/:id`
- [ ] **12.9** Download QR button → `GET /api/admin/students/:id/qr`
- [ ] **12.10** Logout → `POST /api/admin/logout`

### `upload.html`
- [ ] **12.11** Form sections: Student Details, Academic Performance, Certificate Details, Passport Photo upload
- [ ] **12.12** Live photo preview before upload
- [ ] **12.13** Submit as `multipart/form-data` → `POST /api/admin/students`
- [ ] **12.14** On success: show generated QR code preview + download button
- [ ] **12.15** Edit mode: pre-fill from API, submit to `PUT /api/admin/students/:id`
- [ ] **12.16** Client-side validation (required fields, CGPA 0–10, file type/size)

---

## Phase 13 — Deploy to Cloudflare

- [ ] **13.1** Deploy Worker:
  ```bash
  wrangler deploy
  ```
- [ ] **13.2** Deploy admin frontend to Pages:
  ```bash
  wrangler pages deploy frontend --project-name=sssihl-gradecard-admin
  ```
- [ ] **13.3** Configure custom domains in CF dashboard:
  - Worker: `gradecard-api.sssihl.edu.in`
  - Pages: `gradecard-admin.sssihl.edu.in`
- [ ] **13.4** Update `BASE_URL` in `wrangler.toml` and re-deploy
- [ ] **13.5** Update CORS in `corsMiddleware.ts` to allow only the Pages domain
- [ ] **13.6** Verify D1 + R2 bindings are live:
  ```bash
  wrangler d1 info sssihl-gradecard-db
  wrangler r2 bucket list
  ```

---

## Phase 14 — Security Hardening

- [ ] **14.1** JWT in `HttpOnly; Secure; SameSite=Strict` cookie — never exposed to JS
- [ ] **14.2** All `/api/admin/*` routes behind `authMiddleware`
- [ ] **14.3** R2 bucket set to **private** — no direct public access
- [ ] **14.4** All D1 queries use prepared statements — no SQL injection possible
- [ ] **14.5** UUID format validation on all `:id` route params
- [ ] **14.6** Rate-limit `/api/admin/login` using Cloudflare WAF custom rule
- [ ] **14.7** Add `Content-Security-Policy` header to grade card HTML
- [ ] **14.8** Validate file type and size server-side (not just client-side)
- [ ] **14.9** Add `Referrer-Policy: strict-origin` and `X-Content-Type-Options: nosniff`

---

## Phase 15 — Testing

- [ ] **15.1** Local dev:
  ```bash
  wrangler dev --local
  ```
- [ ] **15.2** Test login / logout cycle
- [ ] **15.3** Test full upload → D1 write → R2 upload → QR generation
- [ ] **15.4** Scan QR code → confirm grade card loads with all correct data
- [ ] **15.5** Test grade card on mobile viewport
- [ ] **15.6** Test edit and delete (verify R2 objects are cleaned up)
- [ ] **15.7** Test `/gradecard/<invalid-uuid>` → clean 404 page
- [ ] **15.8** Test print layout (`Ctrl+P`)
- [ ] **15.9** Query D1 directly to verify DB state:
  ```bash
  wrangler d1 execute sssihl-gradecard-db --command="SELECT * FROM students"
  ```

---

## Build Order

```
Phase 1 (Scaffold)
  → Phase 2 (wrangler.toml + CF resources)
  → Phase 3 (D1 Schema)
  → Phase 4 (Types)
  → Phase 5 (R2 Storage Service)
  → Phase 6 (QR Service)
  → Phase 7 (JWT Auth)
  → Phase 8 (Student Service / D1 queries)
  → Phase 9 (Admin API routes)
  → Phase 10 + 11 (Grade Card route + HTML template)
  → Phase 12 (Admin Frontend)
  → Phase 13 (Deploy)
  → Phase 14 (Security)
  → Phase 15 (Testing)
```

---

## Key Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Runtime | Cloudflare Workers + Hono.js | Edge-native, zero cold starts, global PoPs |
| Database | Cloudflare D1 | Native Workers binding, SQLite-compatible, serverless |
| File Storage | Cloudflare R2 | Zero egress fees, native binding, S3-compatible |
| Auth | JWT in HttpOnly cookie | Workers are stateless — server sessions don't exist |
| Password Hash | Web Crypto API (PBKDF2) | Native to Workers — no bcrypt binary needed |
| QR Content | URL to grade card page | Small QR, page updatable server-side without reprinting |
| Grade Card Render | SSR template string in Worker | Single edge roundtrip, no JS required on client |
| Frontend Hosting | Cloudflare Pages | Free CDN, integrates natively with Workers |
| R2 Access Pattern | Proxied via Worker route | Bucket stays private, no direct URL exposure |

---

## Useful Wrangler Commands Reference

```bash
# Local dev (simulates D1 + R2 locally)
wrangler dev --local

# DB migrations
wrangler d1 migrations apply sssihl-gradecard-db --local
wrangler d1 migrations apply sssihl-gradecard-db --remote

# Query D1 directly
wrangler d1 execute sssihl-gradecard-db --command="SELECT * FROM students"

# R2 operations
wrangler r2 object list sssihl-gradecard-storage

# Secrets
wrangler secret put JWT_SECRET
wrangler secret put ADMIN_PASSWORD_HASH
wrangler secret list

# Deploy
wrangler deploy
wrangler pages deploy frontend --project-name=sssihl-gradecard-admin

# Live logs
wrangler tail
```

---

## Important Notes

- `nodejs_compat` flag in `wrangler.toml` is **required** for the `qrcode` package to work in Workers
- `BASE_URL` must be the **final production domain** before generating any QR codes — printed QR URLs cannot be changed after distribution
- D1 free tier: 5 GB storage, 5M reads/day, 100k writes/day — well within institutional needs
- R2 free tier: 10 GB storage, 1M Class A ops/month — sufficient for photos + QR PNGs
- Workers free tier: 100k requests/day — more than enough for institutional verification traffic
- Keep R2 bucket **private** at all times — photos should only be accessible through the Worker proxy
