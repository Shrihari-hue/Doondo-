/**
 * Skill Passport — signed, QR-shareable credential.
 *
 * Same pattern as the Doondo Score credential (users/scoreCredential.*):
 * a stored snapshot keyed by a short code, HMAC-signed for tamper checks,
 * with a QR that opens a public verification page. The snapshot lists each
 * skill with HOW it was verified (employer endorsements, passed trade
 * test), plus identity verification, jobs completed and rating.
 *
 * One credential per worker; refreshing keeps the code so shared QRs keep
 * resolving to the latest snapshot. Valid 90 days.
 */

import { createHash, createHmac } from 'node:crypto';
import { Schema, model, type Model, Types } from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import { env } from '@/config/env';
import { errors } from '@/lib/errors';
import { UserModel } from '@/modules/users/user.model';
import { buildQrMatrix, randomCode, type QrMatrix } from '@/modules/users/scoreCredential.service';
import { getSkillPassportForSeeker } from './skillPassport.service';

const TTL_DAYS = 90;

interface SnapshotSkill {
  slug: string;
  verified: boolean;
  endorsementCount: number;
  tested: boolean;
}

interface Snapshot {
  skills: SnapshotSkill[];
  tests: string[];
  isIdentityVerified: boolean;
  jobsCompleted: number;
  ratingAvg: number | null;
  ratingCount: number;
  score: number;
  memberSince: string;
}

interface PassportCredentialDoc {
  userId: Types.ObjectId;
  code: string;
  name: string;
  snapshot: Snapshot;
  signature: string;
  issuedAt: Date;
  expiresAt: Date;
}

const schema = new Schema<PassportCredentialDoc, Model<PassportCredentialDoc>>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true, maxlength: 120 },
    snapshot: { type: Schema.Types.Mixed, required: true },
    signature: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export const PassportCredentialModel = model<PassportCredentialDoc, Model<PassportCredentialDoc>>('PassportCredential', schema);

function secret(): string {
  return env.DOONDO_SCORE_SECRET ?? env.JWT_ACCESS_SECRET;
}

function sign(code: string, userId: string, snapshot: Snapshot, expiresAt: Date): string {
  const digest = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return createHmac('sha256', secret()).update(['passport', code, userId, digest, expiresAt.getTime()].join('.')).digest('hex');
}

export interface IssuedPassportCredential {
  code: string;
  verifyUrl: string;
  issuedAt: string;
  expiresAt: string;
  skillsVerified: number;
  qr: QrMatrix;
}

export async function issuePassportCredential(userId: string): Promise<IssuedPassportCredential> {
  const user = await UserModel.findById(userId).select('name role');
  if (!user) throw errors.notFound('User not found.');
  const p = await getSkillPassportForSeeker(userId);
  const snapshot: Snapshot = {
    skills: p.skills.map((s) => ({ slug: s.slug, verified: s.verified, endorsementCount: s.endorsementCount, tested: s.tested })),
    tests: p.skillTests.map((t) => t.title),
    isIdentityVerified: p.isIdentityVerified,
    jobsCompleted: p.jobsCompleted,
    ratingAvg: p.ratings.avg,
    ratingCount: p.ratings.count,
    score: p.score,
    memberSince: p.memberSince,
  };
  const existing = await PassportCredentialModel.findOne({ userId: new Types.ObjectId(userId) }).select('code').lean();
  let code = existing?.code;
  if (!code) {
    for (let i = 0; i < 5 && !code; i++) {
      const c = `P${randomCode(8)}`;
      if (!(await PassportCredentialModel.exists({ code: c }))) code = c;
    }
    code ??= `P${randomCode(12)}`;
  }
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000);
  const signature = sign(code, userId, snapshot, expiresAt);
  await PassportCredentialModel.updateOne(
    { userId: new Types.ObjectId(userId) },
    { $set: { code, name: user.name, snapshot, signature, issuedAt, expiresAt } },
    { upsert: true },
  );
  const verifyUrl = `${env.PUBLIC_BASE_URL}/api/v1/passport/verify/${code}`;
  return {
    code,
    verifyUrl,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    skillsVerified: snapshot.skills.filter((s) => s.verified).length,
    qr: buildQrMatrix(verifyUrl),
  };
}

export async function verifyPassportCredential(code: string): Promise<
  { valid: false } | { valid: true; name: string; snapshot: Snapshot; issuedAt: string; expiresAt: string }
> {
  const r = await PassportCredentialModel.findOne({ code: code.trim().toUpperCase() }).lean();
  if (!r || r.expiresAt.getTime() < Date.now()) return { valid: false };
  if (sign(r.code, r.userId.toString(), r.snapshot, r.expiresAt) !== r.signature) return { valid: false };
  return { valid: true, name: r.name, snapshot: r.snapshot, issuedAt: r.issuedAt.toISOString(), expiresAt: r.expiresAt.toISOString() };
}

// ─── HTTP ───────────────────────────────────────────────────────────────────

export async function issueHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const credential = await issuePassportCredential(req.user.id);
    res.json({ ok: true, data: { credential }, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const pretty = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export async function verifyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await verifyPassportCredential(req.params.code ?? '');
    const status = result.valid ? 200 : 404;
    if (req.accepts(['html', 'json']) === 'json') {
      res.status(status).json({ ok: result.valid, data: result, requestId: req.id });
      return;
    }
    const body = result.valid
      ? `<div class="badge ok">✓ Authentic Doondo Skill Passport</div>
         <div class="name">${esc(result.name)}</div>
         <div class="sub">Doondo Score ${result.snapshot.score}/100 · ${result.snapshot.jobsCompleted} jobs done${result.snapshot.ratingAvg ? ` · ★ ${result.snapshot.ratingAvg.toFixed(1)} (${result.snapshot.ratingCount})` : ''}${result.snapshot.isIdentityVerified ? ' · ID verified' : ''}</div>
         <ul>${result.snapshot.skills.map((s) => `<li><b>${esc(pretty(s.slug))}</b><span>${s.verified ? [s.tested ? 'Trade test passed' : '', s.endorsementCount ? `${s.endorsementCount} employer endorsement${s.endorsementCount > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') : 'Self-reported'}</span></li>`).join('')}</ul>
         <div class="meta">Issued ${fmt(result.issuedAt)} · valid until ${fmt(result.expiresAt)}</div>`
      : `<div class="badge bad">✕ Could not be verified</div><p class="note">This link isn't a valid Doondo Skill Passport. It may be mistyped, modified or expired. Ask the worker for a fresh QR.</p>`;
    res.status(status).type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><title>Doondo Skill Passport — Verification</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#F5F8FC;color:#0F172A;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#fff;border-radius:20px;max-width:420px;width:100%;padding:28px 24px;box-shadow:0 8px 30px rgba(15,23,42,.08)}.wordmark{font-size:20px;font-weight:800;color:#2563EB;margin-bottom:16px}
.badge{display:inline-block;font-size:13px;font-weight:700;border-radius:999px;padding:7px 14px;margin-bottom:14px}.ok{background:#D1FAE5;color:#047857}.bad{background:#FEE2E2;color:#B91C1C}
.name{font-size:22px;font-weight:700}.sub{font-size:13px;color:#475569;margin:6px 0 16px}ul{list-style:none}li{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid #E2E8F0;font-size:14px}li span{color:#64748B;font-size:12px;text-align:right}
.meta,.note{font-size:12px;color:#64748B;margin-top:16px;line-height:1.5}</style></head><body><div class="card"><div class="wordmark">Doondo</div>${body}</div></body></html>`);
  } catch (err) {
    next(err);
  }
}
