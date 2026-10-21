/**
 * One-shot backfill: credit workers' earnings ledgers for UPI payments
 * that were marked paid before the wage-credit fix (2026-10-21).
 *
 * Before the fix, the hire flow pre-created a `hire_payment` wallet row
 * and the unique (userId, applicationId, hire_payment) index silently
 * swallowed every later UPI payment's credit. This replays every `paid`
 * PaymentIntent through `creditWagePayment`, which is idempotent per
 * payment ref — safe to run more than once.
 *
 * Usage:  pnpm --filter @doondo/backend backfill:wage-credits
 */

import './env-loader';
import { connectDb, disconnectDb } from '@/config/db';
import { logger } from '@/lib/logger';
import { PaymentIntentModel } from '@/modules/payments/payment.model';
import { creditWagePayment } from '@/modules/wallet/wallet.service';

async function main(): Promise<void> {
  await connectDb();
  const cursor = PaymentIntentModel.find({ status: 'paid' }).sort({ paidAt: 1 }).cursor();
  let n = 0;
  for await (const p of cursor) {
    await creditWagePayment({
      userId: p.seekerId.toString(),
      applicationId: p.applicationId ? p.applicationId.toString() : null,
      amountPaise: p.amountPaise,
      paymentRef: p.ref,
      paidAt: p.paidAt ?? p.updatedAt,
      method: p.upiUri.startsWith('offline:') ? p.upiUri.slice(8) : 'UPI',
    });
    n++;
  }
  logger.info({ processed: n }, 'wage credit backfill complete');
  await disconnectDb();
}

main().catch(async (err) => {
  logger.error({ err }, 'wage credit backfill failed');
  await disconnectDb().catch(() => {});
  process.exit(1);
});
