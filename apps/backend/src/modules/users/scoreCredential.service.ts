/**
 * Doondo Score — the shareable, signed credential.
 *
 * The Doondo Score is computed live (see doondoScore.service). This
 * module turns a score into a *portable credential*: a stored record
 * keyed by a short code, plus a QR.
 *
 * The QR encodes a short verification URL (`…/score/verify/AB12CD34`).
 * Keeping the URL short keeps the QR low-density and crisp — far easier
 * to scan than the long signed-token URL it replaced. Any phone camera
 * that scans it opens a Doondo page confirming the score is authentic.
 *
 * One credential per worker: re-issuing ("refresh") keeps the same code
 * and updates the score snapshot, so a QR the worker already shared
 * keeps resolving — to their *current* score. An HMAC signature over the
 * record is the tamper check.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { env } from '@/config/env';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserModel } from './user.model';
import { computeForUser } from './doondoScore.service';
import { ScoreCredentialModel } from './scoreCredential.model';

// qrcode-terminal bundles the battle-tested Kazuhiko Arase QR encoder.
// We use that encoder directly rather than re-implementing QR generation.
interface QrInstance {
  addData(data: string): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}
type QrConstructor = new (typeNumber: number, errorCorrectLevel: number) => QrInstance;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCode = require('qrcode-terminal/vendor/QRCode') as QrConstructor;

/** Credential lifetime — a score snapshot shouldn't circulate forever. */
const CREDENTIAL_TTL_DAYS = 90;

/**
 * Code alphabet — Crockford-style, no ambiguous characters (0/O, 1/I/L),
 * so a worker reading the URL aloud isn't misheard. 8 chars ≈ 30 bits.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const CODE_LENGTH = 8;

/** HMAC secret — dedicated value in prod, falls back to the JWT secret. */
function secret(): string {
  return env.DOONDO_SCORE_SECRET ?? env.JWT_ACCESS_SECRET;
}

/** Deterministic HMAC over the credential fields — the tamper check. */
function sign(parts: {
  code: string;
  userId: string;
  score: number;
  scoreVersion: number;
  expiresAt: Date;
}): string {
  const payload = [
    parts.code,
    parts.userId,
    parts.score,
    parts.scoreVersion,
    parts.expiresAt.getTime(),
  ].join('.');
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

/** A QR code as a module matrix — the mobile draws it as a grid. */
export interface QrMatrix {
  /** Side length in modules. */
  size: number;
  /** modules[row][col] — true = dark module. */
  modules: boolean[][];
}

export interface IssuedCredential {
  /** Short lookup code embedded in the QR URL. */
  code: string;
  /** Public verification URL the QR encodes. */
  verifyUrl: string;
  score: number;
  scoreVersion: number;
  issuedAt: string;
  expiresAt: string;
  qr: QrMatrix;
}

export interface VerifiedCredential {
  valid: boolean;
  userId?: string;
  name?: string;
  score?: number;
  scoreVersion?: number;
  issuedAt?: string;
  expiresAt?: string;
}

/** Encode a string into a QR module matrix (auto version, ECC level M). */
function buildQrMatrix(text: string): QrMatrix {
  const qr = new QRCode(0, 0); // typeNumber 0 = auto-size; ECC 0 = level M
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  const modules: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) row.push(qr.isDark(r, c));
    modules.push(row);
  }
  return { size, modules };
}

/** One random code from the unambiguous alphabet. */
function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    const idx = (bytes[i] ?? 0) % CODE_ALPHABET.length;
    out += CODE_ALPHABET[idx] ?? '';
  }
  return out;
}

/** A code not currently in use (retries on the rare collision). */
async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode(CODE_LENGTH);
    const clash = await ScoreCredentialModel.exists({ code });
    if (!clash) return code;
  }
  // Astronomically unlikely — widen the code rather than fail.
  return randomCode(CODE_LENGTH + 4);
}

/**
 * Issue (or refresh) the worker's score credential. Keeps a stable code
 * across refreshes so a previously-shared QR keeps resolving.
 *
 * Throws `notFound` when the user doesn't exist.
 */
export async function issueCredential(userId: string): Promise<IssuedCredential> {
  const user = await UserModel.findById(userId);
  if (!user) throw errors.notFound('User not found.');

  const score = await computeForUser(userId);

  const existing = await ScoreCredentialModel.findOne({
    userId: new Types.ObjectId(userId),
  });
  const code = existing?.code ?? (await generateUniqueCode());

  const issuedAt = new Date();
  const expiresAt = new Date(
    issuedAt.getTime() + CREDENTIAL_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  const signature = sign({
    code,
    userId,
    score: score.score,
    scoreVersion: score.version,
    expiresAt,
  });

  await ScoreCredentialModel.findOneAndUpdate(
    { userId: new Types.ObjectId(userId) },
    {
      $set: {
        code,
        name: user.name,
        score: score.score,
        scoreVersion: score.version,
        signature,
        issuedAt,
        expiresAt,
      },
    },
    { upsert: true, new: true },
  );

  const verifyUrl = `${env.PUBLIC_BASE_URL}/api/v1/score/verify/${code}`;
  logger.info({ userId, code, score: score.score }, 'doondo score credential issued');

  return {
    code,
    verifyUrl,
    score: score.score,
    scoreVersion: score.version,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    qr: buildQrMatrix(verifyUrl),
  };
}

/**
 * Verify a scanned credential code. Never throws — an unknown, expired,
 * or tampered credential returns `{ valid: false }`.
 */
export async function verifyCredential(code: string): Promise<VerifiedCredential> {
  const record = await ScoreCredentialModel.findOne({ code: code.trim() });
  if (!record) return { valid: false };

  // Expired.
  if (record.expiresAt.getTime() < Date.now()) return { valid: false };

  // Tamper check — recompute the signature over the stored fields.
  const expected = sign({
    code: record.code,
    userId: record.userId.toString(),
    score: record.score,
    scoreVersion: record.scoreVersion,
    expiresAt: record.expiresAt,
  });
  if (expected !== record.signature) return { valid: false };

  return {
    valid: true,
    userId: record.userId.toString(),
    name: record.name,
    score: record.score,
    scoreVersion: record.scoreVersion,
    issuedAt: record.issuedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  };
}
