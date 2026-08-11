/**
 * Doondo Collect service — worker bank account, collection QRs, and the
 * (stubbed) incoming-payment handler that splits commission into the
 * wallet.
 *
 * Real money movement is gated behind the payment-aggregator provider
 * (see lib/paymentAggregator). With PAYMENT_AGGREGATOR='none' the
 * `recordPayment` entry point is driven by an authenticated
 * "simulate payment" call instead of a PSP webhook, so the whole flow —
 * QR → split → wallet credit → withdrawal — is exercisable in dev.
 */

import { randomBytes } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { buildQrMatrix, type QrMatrix } from '@/lib/qrMatrix';
import { buildCollectionPayload, verifyBankAccount } from '@/lib/paymentAggregator';
import { getDb } from '@/db/client';
import { collectQrs, users, type CollectQrKind } from '@/db/schema';
import { creditQrCollection } from '@/modules/wallet/wallet.service';

// ─── Bank account ─────────────────────────────────────────────────────────

export interface PublicBankAccount {
  holderName: string;
  /** Masked: only the last 4 digits are ever returned. */
  accountNumberMasked: string;
  ifsc: string;
  verified: boolean;
  addedAt: string;
}

function maskAccount(accountNumber: string): string {
  const last4 = accountNumber.slice(-4);
  return `••••${last4}`;
}

export async function getBankAccount(userId: string): Promise<PublicBankAccount | null> {
  const [row] = await getDb()
    .select({ payoutBank: users.payoutBank })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const bank = row?.payoutBank;
  if (!bank) return null;
  return {
    holderName: bank.holderName,
    accountNumberMasked: maskAccount(bank.accountNumber),
    ifsc: bank.ifsc,
    verified: bank.verified,
    addedAt: new Date(bank.addedAt).toISOString(),
  };
}

export async function setBankAccount(
  userId: string,
  input: { holderName: string; accountNumber: string; ifsc: string },
): Promise<PublicBankAccount> {
  const verify = await verifyBankAccount(input);
  const addedAt = new Date();
  await getDb()
    .update(users)
    .set({
      payoutBank: {
        holderName: input.holderName.trim(),
        accountNumber: input.accountNumber.trim(),
        ifsc: input.ifsc.trim().toUpperCase(),
        verified: verify.verified,
        addedAt: addedAt.toISOString(),
      },
    })
    .where(eq(users.id, userId));
  return {
    holderName: input.holderName.trim(),
    accountNumberMasked: maskAccount(input.accountNumber.trim()),
    ifsc: input.ifsc.trim().toUpperCase(),
    verified: verify.verified,
    addedAt: addedAt.toISOString(),
  };
}

export async function removeBankAccount(userId: string): Promise<void> {
  await getDb().update(users).set({ payoutBank: null }).where(eq(users.id, userId));
}

// ─── Collection QRs ─────────────────────────────────────────────────────────

export interface PublicCollectQr {
  ref: string;
  kind: CollectQrKind;
  amountPaise: number | null;
  applicationId: string | null;
  payload: string;
  qr: QrMatrix;
  createdAt: string;
}

export async function createQr(
  userId: string,
  input: { kind: CollectQrKind; amountPaise?: number | null; applicationId?: string | null },
): Promise<PublicCollectQr> {
  const amountPaise =
    input.kind === 'fixed' ? Math.max(1, Math.round(input.amountPaise ?? 0)) : null;
  if (input.kind === 'fixed' && (!amountPaise || amountPaise < 100)) {
    throw errors.validation(null, 'A fixed QR needs an amount of at least ₹1.');
  }

  const ref = randomBytes(9).toString('base64url');
  const { payload } = buildCollectionPayload(ref, amountPaise);

  const [doc] = await getDb()
    .insert(collectQrs)
    .values({
      ownerId: userId,
      kind: input.kind,
      amountPaise,
      applicationId: input.applicationId ?? null,
      ref,
      payload,
    })
    .returning();

  return {
    ref: doc!.ref,
    kind: doc!.kind,
    amountPaise: doc!.amountPaise ?? null,
    applicationId: doc!.applicationId,
    payload: doc!.payload,
    qr: buildQrMatrix(doc!.payload),
    createdAt: doc!.createdAt.toISOString(),
  };
}

export async function listQrs(userId: string): Promise<PublicCollectQr[]> {
  const rows = await getDb()
    .select()
    .from(collectQrs)
    .where(and(eq(collectQrs.ownerId, userId), eq(collectQrs.active, true)))
    .orderBy(desc(collectQrs.createdAt));
  return rows.map((r) => ({
    ref: r.ref,
    kind: r.kind,
    amountPaise: r.amountPaise ?? null,
    applicationId: r.applicationId,
    payload: r.payload,
    qr: buildQrMatrix(r.payload),
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Record an incoming payment against a QR: split commission and credit the
 * worker's wallet net. In production this is called by the PSP webhook; in
 * 'none' mode it's driven by the authenticated simulate-payment endpoint.
 *
 * Returns the gross/fee/net breakdown for a receipt.
 */
export async function recordPayment(input: {
  ref: string;
  amountPaise: number;
  payerName?: string;
}): Promise<{ grossPaise: number; netPaise: number }> {
  const [qr] = await getDb()
    .select()
    .from(collectQrs)
    .where(and(eq(collectQrs.ref, input.ref), eq(collectQrs.active, true)))
    .limit(1);
  if (!qr) throw errors.notFound('QR not found.');

  const gross =
    qr.kind === 'fixed' && qr.amountPaise ? qr.amountPaise : Math.round(input.amountPaise);
  if (!gross || gross < 100) throw errors.validation(null, 'Invalid payment amount.');

  const label = input.payerName ? `Paid by ${input.payerName}` : 'QR payment received';
  const txn = await creditQrCollection({ userId: qr.ownerId, grossPaise: gross, description: label });

  return { grossPaise: gross, netPaise: txn.amount };
}
