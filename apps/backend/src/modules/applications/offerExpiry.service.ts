/** UUID-native offer expiry scheduler. */
import { and, eq, inArray, lte } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { applications } from '@/db/schema';
import { logger } from '@/lib/logger';
import { sendOfferExpiredPush } from '@/lib/push';
export interface OfferExpirySweepSummary {
  considered: number;
  expired: number;
  errors: number;
}
const BATCH_LIMIT = 300;
export async function runOfferExpirySweep(): Promise<OfferExpirySweepSummary> {
  const now = new Date(),
    db = getDb();
  const candidates = await db
    .select()
    .from(applications)
    .where(and(eq(applications.offerStatus, 'pending'), lte(applications.offerExpiresAt, now)))
    .limit(BATCH_LIMIT);
  const summary = { considered: candidates.length, expired: 0, errors: 0 };
  if (!candidates.length) return summary;
  const changed = await db
    .update(applications)
    .set({ offerStatus: 'expired' })
    .where(
      and(
        inArray(
          applications.id,
          candidates.map((a) => a.id),
        ),
        eq(applications.offerStatus, 'pending'),
        lte(applications.offerExpiresAt, now),
      ),
    )
    .returning({ id: applications.id });
  summary.expired = changed.length;
  const changedIds = new Set(changed.map((r) => r.id));
  for (const app of candidates)
    if (changedIds.has(app.id))
      void sendOfferExpiredPush({ recipientId: app.employerId, applicationId: app.id }).catch(
        (err) => {
          summary.errors++;
          logger.warn({ err, applicationId: app.id }, 'offer expiry: employer push failed');
        },
      );
  logger.info(summary, 'offer expiry sweep complete');
  return summary;
}
