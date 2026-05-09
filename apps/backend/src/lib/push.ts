/**
 * push — minimal Expo push notification helper.
 *
 * Posts to https://exp.host/--/api/v2/push/send. We avoid the official
 * `expo-server-sdk` for now so we don't add a dep — the API is tiny and
 * stable, and we don't yet need batching/receipts. Phase 5 swaps to the
 * official SDK when receipts + topic-rules become useful.
 *
 * Errors are caught and logged here. Callers should always `void` these
 * helpers so a failed push never blocks the request that triggered it.
 */

import { logger } from './logger';
import { UserModel } from '@/modules/users/user.model';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushPayload {
  to: string | string[];
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  /** Channel for Android notification grouping. */
  channelId?: string;
}

async function sendRaw(payloads: PushPayload[]): Promise<void> {
  if (payloads.length === 0) return;
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payloads),
    });
    if (!res.ok) {
      logger.warn(
        { status: res.status, count: payloads.length },
        'expo push: non-2xx response',
      );
      return;
    }
    // We don't read the response body — receipts are a Phase 5 concern.
  } catch (err) {
    logger.warn({ err, count: payloads.length }, 'expo push: send failed');
  }
}

async function tokensFor(userId: string): Promise<string[]> {
  const u = await UserModel.findById(userId).select('expoPushTokens').lean();
  return Array.isArray(u?.expoPushTokens) ? u!.expoPushTokens : [];
}

// ─── Public helpers ─────────────────────────────────────────────────────────

export async function sendApplicationStatusPush(input: {
  recipientId: string;
  status: string;
  jobTitle?: string;
  applicationId: string;
}): Promise<void> {
  const tokens = await tokensFor(input.recipientId);
  if (tokens.length === 0) return;

  const titleMap: Record<string, string> = {
    viewed: 'Your application was viewed',
    shortlisted: 'You were shortlisted',
    hired: 'You got the job',
    rejected: 'Application update',
  };
  const title = titleMap[input.status] ?? 'Application update';
  const body = input.jobTitle
    ? `Update on "${input.jobTitle}" — status: ${input.status}.`
    : `Your application status changed to ${input.status}.`;

  await sendRaw(
    tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      channelId: 'applications',
      data: {
        type: 'application:status_changed',
        applicationId: input.applicationId,
        status: input.status,
      },
    })),
  );
}

export async function sendChatMessagePush(input: {
  recipientId: string;
  senderId: string;
  body: string;
  conversationId: string;
}): Promise<void> {
  const tokens = await tokensFor(input.recipientId);
  if (tokens.length === 0) return;

  // Use sender's display name as the title — feels native, lets the
  // recipient know who messaged before they open the app.
  const sender = await UserModel.findById(input.senderId)
    .select('name companyName role')
    .lean();
  const title =
    sender?.role === 'employer'
      ? (sender?.companyName ?? sender?.name ?? 'New message')
      : (sender?.name ?? 'New message');

  await sendRaw(
    tokens.map((to) => ({
      to,
      title,
      body: input.body.length > 140 ? input.body.slice(0, 140) + '…' : input.body,
      sound: 'default',
      channelId: 'chat',
      data: {
        type: 'chat:message_received',
        conversationId: input.conversationId,
      },
    })),
  );
}
