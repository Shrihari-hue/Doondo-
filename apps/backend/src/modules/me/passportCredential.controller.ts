/**
 * Skill Passport credential — HTTP layer. Mirrors scoreCredential.controller
 * exactly (content-negotiated verify route, same envelope shapes).
 *
 *   POST /me/passport-credential   (auth)   → issue a signed credential + QR
 *   GET  /passport/verify/:code    (public) → verify a scanned credential
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import {
  issuePassportCredential,
  verifyPassportCredential,
  type VerifiedPassportCredential,
} from './passportCredential.service';

/** POST /me/passport-credential — mint a credential for the caller. */
export async function issue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const credential = await issuePassportCredential(req.user.id);
    res.json({ ok: true, data: { credential }, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

/** GET /passport/verify/:code — public verification of a scanned QR. */
export async function verify(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const code = req.params.code ?? '';
    const result = await verifyPassportCredential(code);
    const status = result.valid ? 200 : 404;

    if (req.accepts(['html', 'json']) === 'json') {
      res.status(status).json({ ok: result.valid, data: result, requestId: req.id });
    } else {
      res.status(status).type('html').send(renderVerifyPage(result));
    }
  } catch (err) {
    next(err);
  }
}

// ─── HTML verification page ─────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "kitchen_helper" -> "Kitchen Helper". */
function titleCaseSkill(slug: string): string {
  return slug
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Render the standalone verification page. No framework, no external
 * assets — it must render instantly for someone who just scanned a QR.
 */
function renderVerifyPage(result: VerifiedPassportCredential): string {
  const brand = '#2563EB';

  const skillChips = (result.skills ?? [])
    .slice(0, 12)
    .map(
      (s) =>
        `<span class="chip${s.verified ? ' verified' : ''}">${s.verified ? '✓ ' : ''}${escapeHtml(titleCaseSkill(s.slug))}</span>`,
    )
    .join('');

  const body = result.valid
    ? `
      <div class="badge ok">✓ Authentic Skill Passport</div>
      <div class="name">${escapeHtml(result.name ?? 'Doondo worker')}</div>
      <div class="score" style="color:${brand}">${result.score ?? '—'}<span class="out">/100 Doondo Score</span></div>
      <div class="meta">
        <div><span>Jobs completed</span><strong>${result.jobsCompleted ?? 0}</strong></div>
        <div><span>Verified skills</span><strong>${result.verifiedSkillCount ?? 0}</strong></div>
        <div><span>Rating</span><strong>${result.ratingsCount ? `${(result.ratingsAvg ?? 0).toFixed(1)} ★` : '—'}</strong></div>
      </div>
      ${skillChips ? `<div class="chips">${skillChips}</div>` : ''}
      <div class="foot-meta">Member since ${formatDate(result.memberSince)} · Issued ${formatDate(result.issuedAt)} · Valid until ${formatDate(result.expiresAt)}</div>
      <p class="note">This Skill Passport is genuine and has not been
      modified — it reflects this worker's verified skills, completed
      jobs, and ratings on Doondo.</p>`
    : `
      <div class="badge bad">✕ Could not be verified</div>
      <p class="note">This link is not a valid Doondo Skill Passport. It may
      have been mistyped, modified, or expired. Ask the worker to share a
      fresh QR code from their Doondo app.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Doondo Skill Passport — Verification</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:#F5F8FC;color:#0F172A;min-height:100vh;display:flex;
    align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border-radius:20px;max-width:420px;width:100%;
    padding:32px 26px;box-shadow:0 8px 30px rgba(15,23,42,.08);text-align:center}
  .wordmark{font-size:20px;font-weight:800;color:${brand};letter-spacing:-.5px;
    margin-bottom:20px}
  .badge{display:inline-block;font-size:13px;font-weight:700;border-radius:999px;
    padding:7px 14px;margin-bottom:14px}
  .badge.ok{background:#D1FAE5;color:#047857}
  .badge.bad{background:#FEE2E2;color:#B91C1C}
  .name{font-size:18px;font-weight:700;margin-top:2px}
  .score{font-size:36px;font-weight:800;line-height:1;margin-top:8px}
  .score .out{font-size:13px;font-weight:600;color:#94A3B8;margin-left:4px}
  .meta{display:flex;gap:10px;margin:20px 0 6px}
  .meta div{flex:1;background:#F1F5F9;border-radius:12px;padding:10px 6px}
  .meta span{display:block;font-size:10px;color:#64748B;margin-bottom:3px}
  .meta strong{font-size:14px}
  .chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:14px}
  .chip{font-size:11px;font-weight:600;color:#475569;background:#F1F5F9;
    border-radius:999px;padding:5px 10px}
  .chip.verified{color:#047857;background:#D1FAE5}
  .foot-meta{font-size:10px;color:#94A3B8;margin-top:16px}
  .note{font-size:13px;line-height:1.55;color:#475569;margin-top:14px}
  .foot{margin-top:18px;font-size:11px;color:#94A3B8}
</style>
</head>
<body>
  <div class="card">
    <div class="wordmark">Doondo</div>
    ${body}
    <div class="foot">Verified by Doondo · doondo.app</div>
  </div>
</body>
</html>`;
}
