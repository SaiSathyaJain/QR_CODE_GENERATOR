import { Hono } from 'hono';
import { getStudentById, logScan } from '../services/studentService.js';
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

  return new Response(buildGradeCardHTML(student), {
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
    'O': '#eab308',
    'A+': '#22c55e',
    'A': '#16a34a',
    'B+': '#3b82f6',
    'B': '#2563eb',
    'C': '#f59e0b',
    'P': '#8b5cf6',
    'F': '#ef4444',
  };
  return map[grade.toUpperCase()] ?? '#4f46e5';
}

function todayIST(): string {
  return new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function buildGradeCardHTML(s: Student): string {
  const photoSrc = s.photo_data
    ?? 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="140" viewBox="0 0 120 140"><rect width="120" height="140" fill="%23e8eaf6"/><text x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%231a237e" font-size="12">No Photo</text></svg>';

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Grade Card — ${escapeHTML(s.student_name)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
      /* ── Reset & base ── */
      *{box-sizing:border-box;margin:0;padding:0}
      body{
        font-family:'Inter',sans-serif;
        background:linear-gradient(135deg, #e0e7ff 0%, #fefafe 100%);
        color:#1e293b;
        display:flex;
        justify-content:center;
        padding:40px 16px;
        min-height:100vh;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* ── Animations ── */
      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(30px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* ── Card wrapper ── */
      .card{
        background:#fff;
        max-width:780px;
        width:100%;
        border-radius:16px;
        box-shadow:0 25px 50px -12px rgba(15, 23, 42, 0.15), 0 0 0 1px rgba(15,23,42,0.05);
        overflow:hidden;
        position:relative;
        animation: fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      /* ── Watermark ── */
      .card::before{
        content:'SSSIHL';
        position:absolute;
        top:50%;left:50%;
        transform:translate(-50%,-50%) rotate(-30deg);
        font-size:160px;
        font-weight:900;
        color:rgba(238, 242, 255, 0.7);
        pointer-events:none;
        user-select:none;
        white-space:nowrap;
        z-index:0;
      }

      /* ── Header ── */
      .header{
        background:linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
        color:#fff;
        padding:36px 32px;
        text-align:center;
        position:relative;
        z-index:1;
      }
      .header::after {
        content:'';
        position:absolute;
        inset:0;
        background:radial-gradient(circle at top right, rgba(255,255,255,0.1) 0%, transparent 60%);
        pointer-events:none;
      }
      .header-emblem{width:80px;height:80px;margin:0 auto 16px;display:block;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.3));}
      .header h1{font-size:1.35rem;font-weight:700;letter-spacing:0.5px;margin-bottom:6px;text-shadow:0 1px 2px rgba(0,0,0,0.3);}
      .header h2{font-size:0.9rem;font-weight:500;opacity:0.9;letter-spacing:1px;text-transform:uppercase;}
      .divider{height:4px;background:linear-gradient(90deg,transparent,#fcd34d,transparent);margin:20px auto 0;width:50%; border-radius:4px;}

      /* ── Body ── */
      .body{padding:32px 40px;position:relative;z-index:1}

      /* ── Identity row ── */
      .identity{
        display:flex;gap:32px;margin-bottom:32px;align-items:center;
        background:#f8fafc;padding:20px;border-radius:12px;
        border:1px solid #f1f5f9;transition:all 0.3s ease;
      }
      .identity:hover{box-shadow:0 8px 16px -4px rgba(15,23,42,0.05); transform:translateY(-2px);}
      .photo{flex-shrink:0}
      .photo img{
        width:110px;height:140px;object-fit:cover;
        border-radius:8px;
        border:3px solid #fff;
        box-shadow:0 4px 12px rgba(0,0,0,0.1);
      }
      .identity-info{flex:1}
      .info-row{display:flex;gap:12px;margin-bottom:12px;align-items:baseline}
      .info-row:last-child{margin-bottom:0;}
      .info-label{font-size:0.75rem;color:#64748b;font-weight:700;text-transform:uppercase;min-width:110px;letter-spacing:0.5px}
      .info-value{font-size:1.05rem;color:#0f172a;font-weight:600}

      /* ── Section heading ── */
      .section-title{
        font-size:0.75rem;
        text-transform:uppercase;
        letter-spacing:1.5px;
        color:#4338ca;
        font-weight:800;
        border-bottom:2px solid #e0e7ff;
        padding-bottom:8px;
        margin-bottom:20px;
      }

      /* ── Academic grid ── */
      .academic-grid{display:grid;grid-template-columns:repeat(2, 1fr);gap:20px;margin-bottom:32px}
      .metric{
        background:#fff;
        border-radius:12px;
        padding:20px;
        border:1px solid #e2e8f0;
        border-left:4px solid #4f46e5;
        box-shadow:0 2px 4px rgba(0,0,0,0.02);
        transition:all 0.3s ease;
      }
      .metric:hover{
        transform:translateY(-4px);
        box-shadow:0 12px 24px -8px rgba(15,23,42,0.1);
        border-color:#cbd5e1;
      }
      .metric-label{font-size:0.7rem;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.5px;margin-bottom:8px}
      .metric-value{font-size:1.8rem;font-weight:800;color:#1e1b4b;display:flex;align-items:baseline;gap:8px;}
      .metric-sub{font-size:0.85rem;color:#64748b;font-weight:500;}
      .grade-badge{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        padding:6px 16px;
        border-radius:8px;
        color:#fff;
        font-weight:800;
        font-size:1.3rem;
        box-shadow:0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1);
      }

      /* ── Certificate details ── */
      .cert-grid{
        display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:32px;
        background:#f8fafc;padding:20px;border-radius:12px;border:1px solid #f1f5f9;
        transition:all 0.3s ease;
      }
      .cert-grid:hover{box-shadow:0 8px 16px -4px rgba(15,23,42,0.05); transform:translateY(-2px);}
      .cert-item .cert-label{font-size:0.75rem;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.5px}
      .cert-item .cert-value{font-size:1rem;font-weight:600;color:#0f172a;margin-top:6px}

      /* ── Verification ── */
      .verification{
        background:linear-gradient(to right, #f0fdf4, #ffffff);
        border:1px solid #bbf7d0;
        border-left:4px solid #22c55e;
        border-radius:12px;
        padding:16px 20px;
        display:flex;
        align-items:center;
        gap:16px;
        margin-bottom:8px;
        box-shadow:0 4px 6px -1px rgba(0,0,0,0.02);
      }
      .verify-icon{
        background:#dcfce7;
        color:#16a34a;
        width:40px;height:40px;
        border-radius:50%;
        display:flex;
        align-items:center;
        justify-content:center;
        flex-shrink:0;
        box-shadow:0 2px 4px rgba(22,163,74,0.1);
      }
      .verify-text{font-weight:800;color:#166534;font-size:0.95rem;letter-spacing:0.3px;}
      .verify-sub{font-size:0.8rem;color:#15803d;margin-top:2px;font-weight:500;}

      /* ── Footer ── */
      .footer{
        background:#f8fafc;
        border-top:1px solid #e2e8f0;
        padding:24px 40px;
        text-align:center;
        font-size:0.8rem;
        color:#64748b;
        position:relative;
        z-index:1;
        line-height:1.6;
      }
      .footer strong{color:#334155;font-weight:700;}
      .footer a{color:#4338ca;text-decoration:none;font-weight:600;transition:color 0.2s;}
      .footer a:hover{color:#312e81;text-decoration:underline;}

      /* ── Responsive ── */
      @media(max-width:640px){
        .body{padding:24px 20px;}
        .identity{flex-direction:column;align-items:center;text-align:center;padding:16px;}
        .info-row{flex-direction:column;align-items:center;gap:4px;}
        .info-label{min-width:auto;}
        .academic-grid,.cert-grid{grid-template-columns:1fr;}
      }

      /* ── Print ── */
      @media print{
        body{background:#fff;padding:0;}
        .card{box-shadow:none;border-radius:0;max-width:100%;animation:none;border:none;}
        .card::before{display:none;}
        .header{color:#000;background:none;border-bottom:2px solid #333;}
        .header h1,.header h2,.header-emblem circle,.header-emblem text{fill:#333;stroke:#333;}
        .header h1{text-shadow:none;}
        .metric{border-color:#ccc;box-shadow:none;break-inside:avoid;}
        @page{size:A4;margin:20mm}
      }
    </style>
</head>
<body>
<div class="card">

  <!-- Header -->
  <div class="header">
    <svg class="header-emblem" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">
      <circle cx="36" cy="36" r="34" fill="none" stroke="#fcd34d" stroke-width="2"/>
      <text x="36" y="28" text-anchor="middle" fill="#fcd34d" font-size="10" font-weight="bold">SSSIHL</text>
      <text x="36" y="44" text-anchor="middle" fill="#fff" font-size="7">Est. 1981</text>
      <circle cx="36" cy="36" r="22" fill="none" stroke="#fcd34d" stroke-width="1" opacity=".5"/>
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
