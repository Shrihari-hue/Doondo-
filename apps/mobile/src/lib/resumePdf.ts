/**
 * Resume → PDF.
 *
 * Uses expo-print's `printToFileAsync` to render an HTML template into
 * a PDF on the device, then expo-sharing's `shareAsync` to hand it to
 * WhatsApp / Mail / Drive / etc. Both packages are loaded defensively
 * via require() so a build without expo-print still falls back
 * gracefully to the plain-text share path the screen already has.
 *
 * The template is intentionally minimal — a single A4 page with a
 * blue header strip, name + contact, then plain sections. Optimised
 * to look clean when forwarded on WhatsApp at 70% zoom, which is how
 * most recipients will read it.
 */

import * as Sharing from 'expo-sharing';
import type {
  Education,
  PublicUser,
  WorkExperience,
} from '@/api/types';
import type { PublicCourseSummary } from '@/api/courses.api';
import { formatRange, sortWorkHistory } from './workHistory';
import { prettifySkill } from './trades';

export interface ResumePdfInput {
  user: PublicUser;
  badges: PublicCourseSummary[];
}

export interface ResumePdfResult {
  ok: true;
  uri: string;
}

export interface ResumePdfFailure {
  ok: false;
  reason: 'unsupported' | 'failed';
  message: string;
}

/**
 * Generate the PDF and immediately open the share sheet. Returns a
 * result object the caller can branch on (success vs. unsupported vs.
 * actual failure) so the UI can fall back without UI flicker.
 */
export async function shareResumePdf(
  input: ResumePdfInput,
): Promise<ResumePdfResult | ResumePdfFailure> {
  // expo-print is optional — fall back gracefully when not installed.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let Print: typeof import('expo-print') | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Print = require('expo-print') as typeof import('expo-print');
  } catch {
    return {
      ok: false,
      reason: 'unsupported',
      message: "PDF export needs the expo-print package — falling back to plain text.",
    };
  }
  if (!Print?.printToFileAsync) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'PDF export not supported on this device.',
    };
  }

  try {
    const html = renderResumeHtml(input);
    const { uri } = await Print.printToFileAsync({
      html,
      width: 595, // A4 width at 72dpi
      height: 842, // A4 height at 72dpi
      base64: false,
    });
    if (!(await Sharing.isAvailableAsync())) {
      return {
        ok: false,
        reason: 'failed',
        message: 'Sharing is not available on this device.',
      };
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${input.user.name} — Resume`,
      UTI: 'com.adobe.pdf',
    });
    return { ok: true, uri };
  } catch (err) {
    return {
      ok: false,
      reason: 'failed',
      message: err instanceof Error ? err.message : 'Could not generate PDF.',
    };
  }
}

// ─── HTML template ──────────────────────────────────────────────────────────

function renderResumeHtml(input: ResumePdfInput): string {
  const { user, badges } = input;
  const entries = sortWorkHistory(user.workHistory ?? []);
  const education = user.education ?? [];
  const skills = user.skills ?? [];
  const contactParts: string[] = [];
  if (user.phone) contactParts.push(escapeHtml(user.phone));
  contactParts.push(escapeHtml(user.email));
  if (user.location?.city) {
    contactParts.push(
      user.location.area
        ? escapeHtml(`${user.location.area}, ${user.location.city}`)
        : escapeHtml(user.location.city),
    );
  }

  const expectedSalary = user.expectedSalary
    ? renderSalary(user.expectedSalary)
    : null;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(user.name)} — Resume</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #0F172A;
      margin: 0;
      padding: 0;
      font-size: 12px;
      line-height: 1.5;
    }
    .hero {
      background: linear-gradient(135deg, #1D4ED8, #2563EB);
      color: #FFFFFF;
      padding: 32px 36px 28px;
    }
    .hero h1 {
      font-size: 26px;
      margin: 0 0 6px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }
    .hero .contact {
      font-size: 11px;
      color: rgba(255,255,255,0.88);
      margin-bottom: 4px;
    }
    .hero .meta {
      font-size: 11px;
      color: rgba(255,255,255,0.78);
    }
    .body {
      padding: 24px 36px 32px;
    }
    .section {
      margin-bottom: 22px;
    }
    .section h2 {
      font-size: 10px;
      letter-spacing: 1.4px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      margin: 0 0 8px;
    }
    .row {
      margin-bottom: 12px;
    }
    .row .title {
      font-size: 13px;
      font-weight: 700;
      color: #0F172A;
    }
    .row .sub {
      font-size: 12px;
      color: #475569;
    }
    .row .meta {
      font-size: 11px;
      color: #94A3B8;
      margin-top: 2px;
    }
    .row .body {
      font-size: 12px;
      color: #475569;
      margin-top: 4px;
      padding: 0;
      line-height: 1.5;
    }
    .pillrow { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill {
      display: inline-block;
      background: #EFF6FF;
      color: #1E40AF;
      font-size: 10px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      border: 0.5px solid #BFDBFE;
    }
    .badge {
      background: #FEF3C7;
      color: #78350F;
      border-color: #FDE68A;
    }
    .footer {
      margin-top: 18px;
      font-size: 10px;
      color: #94A3B8;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="hero">
    <h1>${escapeHtml(user.name)}</h1>
    <div class="contact">${contactParts.join(' · ')}</div>
    <div class="meta">
      ${user.experienceYears != null ? `${user.experienceYears} ${user.experienceYears === 1 ? 'year' : 'years'} of experience` : ''}
      ${user.rating ? `· ★ ${user.rating.avg.toFixed(1)} (${user.rating.count} reviews)` : ''}
      ${expectedSalary ? `· Expected ${expectedSalary}` : ''}
    </div>
  </div>
  <div class="body">
    ${
      user.bio
        ? `<div class="section">
            <h2>About</h2>
            <p>${escapeHtml(user.bio)}</p>
          </div>`
        : ''
    }
    ${
      skills.length > 0
        ? `<div class="section">
            <h2>Skills</h2>
            <div class="pillrow">
              ${skills.map((s) => `<span class="pill">${escapeHtml(prettifySkill(s))}</span>`).join('')}
            </div>
          </div>`
        : ''
    }
    ${
      entries.length > 0
        ? `<div class="section">
            <h2>Experience</h2>
            ${entries.map((e) => renderExperience(e)).join('')}
          </div>`
        : ''
    }
    ${
      education.length > 0
        ? `<div class="section">
            <h2>Education</h2>
            ${education.map((e) => renderEducation(e)).join('')}
          </div>`
        : ''
    }
    ${
      badges.length > 0
        ? `<div class="section">
            <h2>Course Badges</h2>
            <div class="pillrow">
              ${badges.map((b) => `<span class="pill badge">🏅 ${escapeHtml(b.title)}</span>`).join('')}
            </div>
          </div>`
        : ''
    }
    <div class="footer">Generated with Doondo · doondo.app</div>
  </div>
</body>
</html>`;
}

function renderExperience(e: WorkExperience): string {
  return `
    <div class="row">
      <div class="title">${escapeHtml(e.role)}</div>
      <div class="sub">${escapeHtml(e.company)}</div>
      <div class="meta">${escapeHtml(formatRange(e))}</div>
      ${e.description ? `<div class="body">${escapeHtml(e.description)}</div>` : ''}
    </div>`;
}

function renderEducation(e: Education): string {
  const subtitle = e.fieldOfStudy
    ? `${e.institution} · ${e.fieldOfStudy}`
    : e.institution;
  const range = `${e.startYear} — ${e.current ? 'Present' : e.endYear ?? '—'}`;
  return `
    <div class="row">
      <div class="title">${escapeHtml(e.degree)}</div>
      <div class="sub">${escapeHtml(subtitle)}</div>
      <div class="meta">${escapeHtml(range)}</div>
    </div>`;
}

function renderSalary(s: NonNullable<PublicUser['expectedSalary']>): string {
  const period =
    s.period === 'hour'
      ? '/hr'
      : s.period === 'day'
        ? '/day'
        : s.period === 'week'
          ? '/wk'
          : s.period === 'month'
            ? '/mo'
            : ' (one-time)';
  const min = Math.round(s.amount / 100);
  const max = s.amountMax ? Math.round(s.amountMax / 100) : null;
  const amountStr = max && max > min ? `₹${min.toLocaleString()}–${max.toLocaleString()}` : `₹${min.toLocaleString()}`;
  return `${amountStr}${period}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
