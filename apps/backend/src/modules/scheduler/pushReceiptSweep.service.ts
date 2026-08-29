/**
 * Push receipt sweep — the "Dead-token pruning" half of the push
 * notification "Known Gaps" (DOONDO_PUSH_NOTIFICATIONS_STATUS.md).
 *
 * `lib/push.ts`'s sendRaw already prunes a token the instant Expo's
 * SEND-time ticket errors with DeviceNotRegistered, but a ticket can
 * also come back 'ok' (Expo accepted it) and STILL fail at actual
 * delivery a few minutes later — the only way to learn that is Expo's
 * separate `getPushNotificationReceiptsAsync` endpoint, looked up by
 * the ticket id `sendRaw` already persisted to `push_receipts`.
 *
 * Runs weekly (PUSH_RECEIPT_SWEEP_CRON) rather than on the tighter
 * ~15-minute cadence Expo's own docs suggest for receipt-checking,
 * per this session's explicit "weekly cron" scope — dead tokens are a
 * hygiene concern (an uninstalled app still burning a send slot), not
 * a user-facing latency one, so a wider window is an acceptable
 * trade-off for one fewer scheduled task.
 */

import { eq, lt, sql } from 'drizzle-orm';
import { Expo } from 'expo-server-sdk';
import { getDb } from '@/db/client';
import { pushReceipts, users } from '@/db/schema';
import { logger } from '@/lib/logger';

const expo = new Expo();
/** Receipts older than this are past Expo's retention window — drop them unprocessed rather than querying for a receipt that will never arrive. */
const MAX_RECEIPT_AGE_DAYS = 7;

async function pruneDeadToken(token: string): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select({ id: users.id, expoPushTokens: users.expoPushTokens })
    .from(users)
    .where(sql`${token} = ANY(${users.expoPushTokens})`)
    .limit(1);
  if (!user) return;
  await db
    .update(users)
    .set({ expoPushTokens: user.expoPushTokens.filter((t) => t !== token) })
    .where(eq(users.id, user.id));
  logger.info({ userId: user.id }, 'push receipt sweep: pruned dead token');
}

export async function runPushReceiptSweep(): Promise<{ checked: number; pruned: number }> {
  const db = getDb();

  // Anything too old to still have a fetchable receipt — drop without
  // querying, so the table doesn't accumulate unprocessable rows.
  const staleCutoff = new Date(Date.now() - MAX_RECEIPT_AGE_DAYS * 24 * 60 * 60 * 1000);
  await db.delete(pushReceipts).where(lt(pushReceipts.createdAt, staleCutoff));

  const rows = await db.select().from(pushReceipts);
  if (rows.length === 0) {
    logger.info('push receipt sweep: nothing queued');
    return { checked: 0, pruned: 0 };
  }

  const byTicketId = new Map(rows.map((r) => [r.ticketId, r.token]));
  const chunks = expo.chunkPushNotificationReceiptIds([...byTicketId.keys()]);

  let pruned = 0;
  const processedTicketIds: string[] = [];
  for (const chunk of chunks) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      for (const ticketId of chunk) {
        const receipt = receipts[ticketId];
        if (!receipt) continue; // not ready yet — leave it queued for next run
        processedTicketIds.push(ticketId);
        if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
          const token = byTicketId.get(ticketId);
          if (token) {
            await pruneDeadToken(token);
            pruned++;
          }
        }
      }
    } catch (err) {
      logger.warn({ err, count: chunk.length }, 'push receipt sweep: chunk fetch failed');
    }
  }

  if (processedTicketIds.length > 0) {
    await db.delete(pushReceipts).where(sql`${pushReceipts.ticketId} = ANY(${processedTicketIds})`);
  }

  logger.info({ checked: rows.length, processed: processedTicketIds.length, pruned }, 'push receipt sweep complete');
  return { checked: rows.length, pruned };
}
