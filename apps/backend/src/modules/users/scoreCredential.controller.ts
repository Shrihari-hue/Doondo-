/**
 * Doondo Score credential — HTTP layer.
 *
 *   POST /me/score-credential   (auth)   → issue a signed credential + QR
 *   GET  /score/verify/:token   (public) → verify a scanned credential
 *
 * The verify route is content-negotiated: a phone camera / browser gets
 * a human-readable HTML verification page; an API client that asks for
 * JSON gets the structured result.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import {
  issueCredential,
  verifyCredential,
  type VerifiedCredential,
} from './scoreCredential.service';

/** POST /me/score-credential — mint a credential for the caller. */
export async function issue(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const credential = await issueCredential(req.user.id);
    res.json({ ok: true, data: { credential }, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

/** GET /score/verify/:code — public verification of a scanned QR. */
export async function verify(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const code = req.params.code ?? '';
    const result = await verifyCredential(code);
    const status = result.valid ? 200 : 404;

    // Browsers / phone cameras get a page; explicit JSON clients get data.
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
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Render the standalone verification page. No framework, no external
 * assets — it must render instantly for someone who just scanned a QR.
 */
function renderVerifyPage(result: VerifiedCredential): string {
  const brand = '#2563EB';

  const body = result.valid
    ? `
      <div class="badge ok">✓ Authentic Doondo Score</div>
      <div class="score" style="color:${brand}">${result.score ?? '—'}<span class="out">/100</span></div>
      <div class="name">${escapeHtml(result.name ?? 'Doondo worker')}</div>
      <div class="meta">
        <div><span>Issued</span><strong>${formatDate(result.issuedAt)}</strong></div>
        <div><span>Valid until</span><strong>${formatDate(result.expiresAt)}</strong></div>
      </div>
      <p class="note">This Doondo Score credential is genuine and has not been
      modified. The score is a worker's verified employability number,
      built from ratings, hires, endorsements and identity verification.</p>`
    : `
      <div class="badge bad">✕ Could not be verified</div>
      <p class="note">This link is not a valid Doondo Score credential. It may
      have been mistyped, modified, or expired. Ask the worker to share a
      fresh QR code from their Doondo app.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Doondo Score — Verification</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:#F5F8FC;color:#0F172A;min-height:100vh;display:flex;
    align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border-radius:20px;max-width:380px;width:100%;
    padding:32px 26px;box-shadow:0 8px 30px rgba(15,23,42,.08);text-align:center}
  .wordmark{font-size:20px;font-weight:800;color:${brand};letter-spacing:-.5px;
    margin-bottom:20px}
  .badge{display:inline-block;font-size:13px;font-weight:700;border-radius:999px;
    padding:7px 14px;margin-bottom:18px}
  .badge.ok{background:#D1FAE5;color:#047857}
  .badge.bad{background:#FEE2E2;color:#B91C1C}
  .score{font-size:64px;font-weight:800;line-height:1}
  .score .out{font-size:22px;font-weight:600;color:#94A3B8}
  .name{font-size:18px;font-weight:600;margin-top:6px}
  .meta{display:flex;gap:12px;margin:22px 0 6px}
  .meta div{flex:1;background:#F1F5F9;border-radius:12px;padding:12px 8px}
  .meta span{display:block;font-size:11px;color:#64748B;margin-bottom:3px}
  .meta strong{font-size:14px}
  .note{font-size:13px;line-height:1.55;color:#475569;margin-top:16px}
  .foot{margin-top:22px;font-size:11px;color:#94A3B8}
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
