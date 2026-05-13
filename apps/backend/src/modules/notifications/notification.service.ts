/**
 * Notifications service.
 *
 * `record(...)` is called from other modules whenever they fire a push.
 * It writes the in-app row so the bell sees the same event the push did.
 * Failure to record never breaks the caller — we log and move on.
 *
 * Mobile reads:
 *   - list({recipientId, limit, before}) — paginated feed
 *   - unreadCount(recipientId) — bell badge
 *   - markRead(notificationId, recipientId) — single
 *   - markAllRead(recipientId)
 */

import { Types } from 'mongoose';
import {
  NotificationModel,
  type NotificationKind,
  type PublicNotification,
} from './notification.model';
import { logger } from '@/lib/logger';

interface RecordInput {
  recipientId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  deeplink?: { screen: string; params?: Record<string, unknown> };
  imageUrl?: string | null;
}

/**
 * Persist a notification row. Best-effort — caller should never await this
 * if the user-facing action is more important than the notification record.
 */
export async function record(input: RecordInput): Promise<void> {
  try {
    await NotificationModel.create({
      recipientId: new Types.ObjectId(input.recipientId),
      kind: input.kind,
      title: input.title,
      body: input.body,
      deeplink: input.deeplink ?? null,
      imageUrl: input.imageUrl ?? null,
      readAt: null,
    });
  } catch (err) {
    logger.warn({ err, recipientId: input.recipientId, kind: input.kind }, 'notification record failed');
  }
}

interface ListInput {
  recipientId: string;
  limit?: number;
  before?: string; // ISO date string for cursor pagination
}

export async function list(input: ListInput): Promise<{
  notifications: PublicNotification[];
  nextCursor: string | null;
}> {
  const limit = Math.min(input.limit ?? 20, 50);

  const filter: Record<string, unknown> = {
    recipientId: new Types.ObjectId(input.recipientId),
  };
  if (input.before) {
    filter.createdAt = { $lt: new Date(input.before) };
  }

  const rows = await NotificationModel.find(filter).sort({ createdAt: -1 }).limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && page.length > 0
    ? page[page.length - 1]!.createdAt.toISOString()
    : null;

  return {
    notifications: page.map((n) => n.toPublicJSON()),
    nextCursor,
  };
}

export async function unreadCount(recipientId: string): Promise<number> {
  return NotificationModel.countDocuments({
    recipientId: new Types.ObjectId(recipientId),
    readAt: null,
  });
}

export async function markRead(notificationId: string, recipientId: string): Promise<void> {
  await NotificationModel.updateOne(
    {
      _id: new Types.ObjectId(notificationId),
      recipientId: new Types.ObjectId(recipientId),
      readAt: null,
    },
    { $set: { readAt: new Date() } },
  );
}

export async function markAllRead(recipientId: string): Promise<{ updated: number }> {
  const result = await NotificationModel.updateMany(
    {
      recipientId: new Types.ObjectId(recipientId),
      readAt: null,
    },
    { $set: { readAt: new Date() } },
  );
  return { updated: result.modifiedCount };
}
