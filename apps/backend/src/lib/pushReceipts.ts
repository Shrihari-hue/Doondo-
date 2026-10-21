/**
 * Expo push tickets → receipts → dead-token pruning.
 *
 * Every successful send returns a ticket id per message. Expo publishes the
 * final delivery receipt for that ticket ~15 min later. We store tickets,
 * sweep receipts on a cron, and remove tokens Expo reports as
 * `DeviceNotRegistered` (app uninstalled / token rotated) so user token
 * arrays don't grow forever.
 */

import { Schema, model, type Model } from 'mongoose';
import { logger } from './logger';
import { UserModel } from '@/modules/users/user.model';

const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

interface PushTicket {
  ticketId: string;
  token: string;
  createdAt: Date;
}

const schema = new Schema<PushTicket, Model<PushTicket>>({
  ticketId: { type: String, required: true, unique: true },
  token: { type: String, required: true },
  // Receipts expire on Expo's side after ~24h; drop our copy after 2 days.
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 48 },
});

export const PushTicketModel = model<PushTicket, Model<PushTicket>>('PushTicket', schema);

/** Remove dead tokens from whichever users hold them. */
export async function pruneTokens(tokens: string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  const res = await UserModel.updateMany(
    { expoPushTokens: { $in: tokens } },
    { $pull: { expoPushTokens: { $in: tokens } } },
  );
  logger.info({ count: tokens.length, users: res.modifiedCount }, 'push: pruned dead tokens');
  return tokens.length;
}

export interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Handle the ticket array from a /push/send response. `tokens[i]` is the
 * token message i was sent to.
 */
export async function recordTickets(tickets: ExpoTicket[], tokens: string[]): Promise<void> {
  const dead: string[] = [];
  const keep: PushTicket[] = [];
  tickets.forEach((t, i) => {
    const token = tokens[i];
    if (!token) return;
    if (t.status === 'ok' && t.id) keep.push({ ticketId: t.id, token, createdAt: new Date() });
    else if (t.details?.error === 'DeviceNotRegistered') dead.push(token);
  });
  if (keep.length > 0) {
    await PushTicketModel.insertMany(keep, { ordered: false }).catch(() => undefined);
  }
  if (dead.length > 0) await pruneTokens(dead);
}

/** Cron task: read receipts for tickets older than 15 minutes. */
export async function runPushReceiptSweep(): Promise<{ checked: number; pruned: number }> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const tickets = await PushTicketModel.find({ createdAt: { $lte: cutoff } }).limit(5000).lean();
  let pruned = 0;
  for (let i = 0; i < tickets.length; i += 1000) {
    const chunk = tickets.slice(i, i + 1000);
    try {
      const res = await fetch(RECEIPTS_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: chunk.map((t) => t.ticketId) }),
      });
      if (!res.ok) {
        logger.warn({ status: res.status }, 'push receipts: non-2xx');
        continue;
      }
      const json = (await res.json()) as { data?: Record<string, ExpoTicket> };
      const receipts = json.data ?? {};
      const dead = chunk
        .filter((t) => receipts[t.ticketId]?.details?.error === 'DeviceNotRegistered')
        .map((t) => t.token);
      const errors = Object.values(receipts).filter((r) => r.status === 'error' && r.details?.error !== 'DeviceNotRegistered');
      if (errors.length > 0) {
        logger.warn({ count: errors.length, sample: errors[0]?.details?.error }, 'push receipts: delivery errors');
      }
      pruned += await pruneTokens([...new Set(dead)]);
      // Receipts not yet available stay for the next sweep; the rest are done.
      const done = chunk.filter((t) => receipts[t.ticketId]).map((t) => t.ticketId);
      await PushTicketModel.deleteMany({ ticketId: { $in: done } });
    } catch (err) {
      logger.warn({ err }, 'push receipts: sweep chunk failed');
    }
  }
  logger.info({ checked: tickets.length, pruned }, 'push receipts sweep complete');
  return { checked: tickets.length, pruned };
}
