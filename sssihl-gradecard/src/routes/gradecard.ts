import { Hono } from 'hono';
import { getStudentById, logScan } from '../services/studentService.js';
import { generateQRDataURL } from '../services/qrService.js';
import { isValidUUID } from '../utils/validation.js';
import type { Env, Student } from '../types.js';

export const gradecardRoutes = new Hono<{ Bindings: Env }>();

// ── 10.1  GET /gradecard/:id ──────────────────────────────────────────────────
gradecardRoutes.get('/:id', async (c) => {
  const { id } = c.req.param();

  if (!isValidUUID(id)) {
    return new Response(notFoundHTML('Invalid grade card ID.'), {
      status: 400,
      headers: htmlHeaders(),
    });
  }

  const student = await getStudentById(c.env.DB, id);
  if (!student) {
    return new Response(notFoundHTML('Grade card not found.'), {
      status: 404,
      headers: htmlHeaders(),
    });
  }

  // Log scan non-blocking
  const cfData = {
    country: c.req.header('cf-ipcountry') ?? undefined,
    city: c.req.header('cf-ipcity') ?? undefined,
  };
  c.executionCtx.waitUntil(logScan(c.env.DB, id, cfData));

  // Generate QR on-the-fly (no R2 needed)
  const qrDataUrl = await generateQRDataURL(c.env.BASE_URL, id);

  return new Response(buildGradeCardHTML(student, qrDataUrl), {
    status: 200,
    headers: {
      ...htmlHeaders(),
      'Cache-Control': 'no-store',
    },
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function htmlHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=UTF-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin',
    'Content-Security-Policy':
      "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:;",
  };
}

function notFoundHTML(message: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Not Found — SSSIHL Grade Card</title>
  <style>
    body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;
         justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;color:#333}
    h1{color:#1a237e}
    p{color:#666}
  </style>
</head>
<body>
  <h1>404</h1>
  <p>${escapeHTML(message)}</p>
  <p>Please contact the Office of Controller of Examinations.</p>
</body>
</html>`;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function gradeColor(grade: string): string {
  const map: Record<string, string> = {
    'O': '#c8a951',
    'A+': '#2e7d32',
    'A': '#388e3c',
    'B+': '#1565c0',
    'B': '#1976d2',
    'C': '#f57f17',
    'P': '#6a1b9a',
    'F': '#c62828',
  };
  return map[grade.toUpperCase()] ?? '#1a237e';
}

function todayIST(): string {
  return new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function buildGradeCardHTML(s: Student, qrDataUrl: string): string {
  const photoSrc = s.photo_data
    ?? 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="140" viewBox="0 0 120 140"><rect width="120" height="140" fill="%23e8eaf6"/><text x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%231a237e" font-size="12">No Photo</text></svg>';

  const qrSrc = qrDataUrl;

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Grade Card — ${escapeHTML(s.student_name)}</title>
  <style>
    /* ── Reset & base ── */
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f2f8;color:#333;
         display:flex;justify-content:center;padding:24px 16px}

    /* ── Card wrapper ── */
    .card{background:#fff;max-width:780px;width:100%;border-radius:8px;
          box-shadow:0 4px 24px rgba(26,35,126,.15);overflow:hidden;
          position:relative}

    /* ── Watermark ── */
    .card::before{content:'SSSIHL';position:absolute;top:50%;left:50%;
      transform:translate(-50%,-50%) rotate(-30deg);font-size:120px;
      font-weight:900;color:rgba(26,35,126,.04);pointer-events:none;
      user-select:none;white-space:nowrap;z-index:0}

    /* ── Header ── */
    .header{background:linear-gradient(135deg,#1a237e 0%,#283593 100%);
            color:#fff;padding:28px 32px;text-align:center;position:relative;z-index:1}
    .header-emblem{width:72px;height:72px;margin:0 auto 12px;display:block}
    .header h1{font-size:1.25rem;font-weight:700;letter-spacing:.5px;margin-bottom:4px}
    .header h2{font-size:.85rem;font-weight:400;opacity:.85;letter-spacing:1px;
               text-transform:uppercase}
    .divider{height:3px;background:linear-gradient(90deg,transparent,#c8a951,transparent);
             margin:14px auto 0;width:60%}

    /* ── Body ── */
    .body{padding:28px 32px;position:relative;z-index:1}

    /* ── Identity row ── */
    .identity{display:flex;gap:24px;margin-bottom:24px}
    .photo{flex-shrink:0}
    .photo img{width:110px;height:130px;object-fit:cover;border-radius:4px;
               border:2px solid #1a237e}
    .identity-info{flex:1}
    .info-row{display:flex;gap:8px;margin-bottom:8px;align-items:baseline}
    .info-label{font-size:.75rem;color:#888;font-weight:600;text-transform:uppercase;
                min-width:130px;letter-spacing:.3px}
    .info-value{font-size:.95rem;color:#111;font-weight:500}

    /* ── Section heading ── */
    .section-title{font-size:.7rem;text-transform:uppercase;letter-spacing:1.5px;
                   color:#1a237e;font-weight:700;border-bottom:1px solid #e8eaf6;
                   padding-bottom:6px;margin-bottom:16px}

    /* ── Academic grid ── */
    .academic-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
    .metric{background:#f5f7ff;border-radius:6px;padding:14px 18px;
            border-left:3px solid #1a237e}
    .metric-label{font-size:.7rem;text-transform:uppercase;color:#888;
                  font-weight:600;letter-spacing:.5px;margin-bottom:4px}
    .metric-value{font-size:1.6rem;font-weight:800;color:#1a237e}
    .metric-sub{font-size:.8rem;color:#555;margin-top:2px}
    .grade-badge{display:inline-block;padding:4px 14px;border-radius:20px;
                 color:#fff;font-weight:700;font-size:1.1rem}

    /* ── Certificate details ── */
    .cert-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
    .cert-item .cert-label{font-size:.7rem;text-transform:uppercase;color:#888;
                           font-weight:600;letter-spacing:.5px}
    .cert-item .cert-value{font-size:.95rem;font-weight:600;color:#111;margin-top:2px}

    /* ── Verification ── */
    .verification{background:#e8f5e9;border:1px solid #a5d6a7;border-radius:6px;
                  padding:14px 18px;display:flex;align-items:center;gap:12px;
                  margin-bottom:24px}
    .verify-icon{color:#2e7d32;font-size:1.5rem;flex-shrink:0}
    .verify-text{font-weight:700;color:#1b5e20;font-size:.9rem}
    .verify-sub{font-size:.75rem;color:#388e3c;margin-top:2px}

    /* ── QR ── */
    .qr-block{text-align:center;margin-bottom:24px}
    .qr-block img{width:120px;height:120px;border:1px solid #e0e0e0;border-radius:4px}
    .qr-label{font-size:.7rem;color:#888;margin-top:6px;text-transform:uppercase;
              letter-spacing:.5px}

    /* ── Footer ── */
    .footer{background:#f5f7ff;border-top:1px solid #e8eaf6;padding:16px 32px;
            text-align:center;font-size:.75rem;color:#888;position:relative;z-index:1}
    .footer strong{color:#1a237e}

    /* ── Responsive ── */
    @media(max-width:580px){
      .identity{flex-direction:column;align-items:center}
      .academic-grid,.cert-grid{grid-template-columns:1fr}
      .info-label{min-width:100px}
    }

    /* ── Print ── */
    @media print{
      body{background:#fff;padding:0}
      .card{box-shadow:none;border-radius:0;max-width:100%}
      .card::before{display:none}
      @page{size:A4;margin:20mm}
    }
  </style>
</head>
<body>
<div class="card">

  <!-- Header -->
  <div class="header">
    <svg class="header-emblem" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">
      <circle cx="36" cy="36" r="34" fill="none" stroke="#c8a951" stroke-width="2"/>
      <text x="36" y="28" text-anchor="middle" fill="#c8a951" font-size="10" font-weight="bold">SSSIHL</text>
      <text x="36" y="44" text-anchor="middle" fill="#fff" font-size="7">Est. 1981</text>
      <circle cx="36" cy="36" r="22" fill="none" stroke="#c8a951" stroke-width="1" opacity=".5"/>
    </svg>
    <h1>Sri Sathya Sai Institute of Higher Learning</h1>
    <h2>Digital Consolidated Grade Card</h2>
    <div class="divider"></div>
  </div>

  <!-- Body -->
  <div class="body">

    <!-- Student Identity -->
    <div class="section-title">Student Identity</div>
    <div class="identity">
      <div class="photo">
        <img src="${escapeHTML(photoSrc)}" alt="Passport photo of ${escapeHTML(s.student_name)}"/>
      </div>
      <div class="identity-info">
        <div class="info-row">
          <span class="info-label">Student Name</span>
          <span class="info-value">${escapeHTML(s.student_name)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Regd. No.</span>
          <span class="info-value">${escapeHTML(s.regd_no)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Programme</span>
          <span class="info-value">${escapeHTML(s.programme)}</span>
        </div>
      </div>
    </div>

    <!-- Academic Performance -->
    <div class="section-title">Academic Performance</div>
    <div class="academic-grid">
      <div class="metric">
        <div class="metric-label">CGPA</div>
        <div class="metric-value">${s.cgpa.toFixed(2)}</div>
        <div class="metric-sub">out of 10.00</div>
      </div>
      <div class="metric">
        <div class="metric-label">Letter Grade</div>
        <div class="metric-value">
          <span class="grade-badge" style="background:${gradeColor(s.letter_grade)}">
            ${escapeHTML(s.letter_grade)}
          </span>
        </div>
      </div>
      <div class="metric">
        <div class="metric-label">Equivalent Percentage</div>
        <div class="metric-value">${s.equivalent_percentage.toFixed(2)}%</div>
      </div>
      <div class="metric">
        <div class="metric-label">Qualitative Assessment</div>
        <div class="metric-value" style="font-size:1.1rem">${escapeHTML(s.qualitative_assessment)}</div>
      </div>
    </div>

    <!-- Certificate Details -->
    <div class="section-title">Certificate Details</div>
    <div class="cert-grid">
      <div class="cert-item">
        <div class="cert-label">Serial No.</div>
        <div class="cert-value">${escapeHTML(s.serial_no)}</div>
      </div>
      <div class="cert-item">
        <div class="cert-label">Certificate Approval Date</div>
        <div class="cert-value">${escapeHTML(formatDate(s.cert_approval_date))}</div>
      </div>
    </div>

    <!-- Verification -->
    <div class="verification">
      <div class="verify-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#2e7d32">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
        </svg>
      </div>
      <div>
        <div class="verify-text">✓ VERIFIED BY SSSIHL</div>
        <div class="verify-sub">Authenticity confirmed — Office of Controller of Examinations</div>
      </div>
    </div>

    ${qrSrc ? `
    <!-- QR Code -->
    <div class="qr-block">
      <img src="${escapeHTML(qrSrc)}" alt="Verification QR Code"/>
      <div class="qr-label">Scan to verify authenticity</div>
    </div>` : ''}

  </div><!-- /body -->

  <!-- Footer -->
  <div class="footer">
    <strong>Office of Controller of Examinations</strong><br/>
    Sri Sathya Sai Institute of Higher Learning<br/>
    Email: <a href="mailto:coeoffice@sssihl.edu.in" style="color:#1a237e">coeoffice@sssihl.edu.in</a><br/>
    <em>Record verified on ${todayIST()} (IST)</em>
  </div>

</div><!-- /card -->
</body>
</html>`;
}
