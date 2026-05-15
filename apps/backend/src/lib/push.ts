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
import * as notifications from '@/modules/notifications/notification.service';

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

  // In-app feed row — independent of push delivery.
  void notifications.record({
    recipientId: input.recipientId,
    kind: 'application_status',
    title,
    body,
    deeplink: { screen: 'Applications', params: { applicationId: input.applicationId } },
  });

  const tokens = await tokensFor(input.recipientId);
  if (tokens.length === 0) return;

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

/**
 * Push notification for interview scheduling events.
 *
 * `kind` controls the copy:
 *   'scheduled'   → "Interview scheduled" — employer first sets one
 *   'rescheduled' → "Interview rescheduled" — employer changes it
 *   'cancelled'   → "Interview cancelled" — employer cancelled
 */
export async function sendInterviewPush(input: {
  recipientId: string;
  kind: 'scheduled' | 'rescheduled' | 'cancelled';
  jobTitle?: string;
  whenIso?: string;
  applicationId: string;
}): Promise<void> {
  const titleMap = {
    scheduled: 'Interview scheduled',
    rescheduled: 'Interview rescheduled',
    cancelled: 'Interview cancelled',
  };
  const title = titleMap[input.kind];
  const when = input.whenIso
    ? new Date(input.whenIso).toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;
  const body =
    input.kind === 'cancelled'
      ? input.jobTitle
        ? `Your interview for "${input.jobTitle}" was cancelled.`
        : 'Your interview was cancelled.'
      : when
        ? input.jobTitle
          ? `${input.jobTitle} — ${when}`
          : `Interview ${when}`
        : 'Open Doondo for details.';

  const kindToRecordKind = {
    scheduled: 'interview_scheduled',
    rescheduled: 'interview_rescheduled',
    cancelled: 'interview_cancelled',
  } as const;

  void notifications.record({
    recipientId: input.recipientId,
    kind: kindToRecordKind[input.kind],
    title,
    body,
    deeplink: { screen: 'Applications', params: { applicationId: input.applicationId } },
  });

  const tokens = await tokensFor(input.recipientId);
  if (tokens.length === 0) return;

  await sendRaw(
    tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      channelId: 'applications',
      data: {
        type: `interview:${input.kind}`,
        applicationId: input.applicationId,
      },
    })),
  );
}

/**
 * Fan-out push when an employer posts a new job.
 *
 * `recipientIds` is the list of seeker user IDs to notify. The caller
 * (job.service.createJob) decides who's eligible — typically active
 * seekers within a few km of the job location whose preferences match.
 *
 * Tokens are loaded in one query and the Expo payload array is chunked
 * into batches of 100 (Expo's documented per-request cap).
 */
export async function sendNewJobPush(input: {
  recipientIds: string[];
  jobId: string;
  jobTitle: string;
  city?: string | null;
}): Promise<void> {
  if (input.recipientIds.length === 0) return;

  const users = await UserModel.find({ _id: { $in: input.recipientIds } })
    .select('expoPushTokens')
    .lean();

  const tokens: string[] = [];
  for (const u of users) {
    if (Array.isArray(u.expoPushTokens)) tokens.push(...u.expoPushTokens);
  }
  if (tokens.length === 0) return;

  const title = 'New job near you';
  const body = input.city
    ? `${input.jobTitle} — ${input.city}`
    : input.jobTitle;

  const payloads: PushPayload[] = tokens.map((to) => ({
    to,
    title,
    body,
    sound: 'default',
    channelId: 'jobs',
    data: {
      type: 'job:new',
      jobId: input.jobId,
    },
  }));

  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < payloads.length; i += 100) {
    await sendRaw(payloads.slice(i, i + 100));
  }
}

export async function sendChatMessagePush(input: {
  recipientId: string;
  senderId: string;
  body: string;
  conversationId: string;
}): Promise<void> {
  // Use sender's display name as the title — feels native, lets the
  // recipient know who messaged before they open the app.
  const sender = await UserModel.findById(input.senderId)
    .select('name companyName role photoUrl')
    .lean();
  const title =
    sender?.role === 'employer'
      ? (sender?.companyName ?? sender?.name ?? 'New message')
      : (sender?.name ?? 'New message');

  const truncatedBody =
    input.body.length > 140 ? input.body.slice(0, 140) + '…' : input.body;

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'new_message',
    title,
    body: truncatedBody,
    deeplink: { screen: 'Conversation', params: { conversationId: input.conversationId } },
    imageUrl: sender?.photoUrl ?? null,
  });

  const tokens = await tokensFor(input.recipientId);
  if (tokens.length === 0) return;

  await sendRaw(
    tokens.map((to) => ({
      to,
      title,
      body: truncatedBody,
      sound: 'default',
      channelId: 'chat',
      data: {
        type: 'chat:message_received',
        conversationId: input.conversationId,
      },
    })),
  );
}

/**
 * Push + in-app row when a freshly-posted job matches one of the seeker's
 * saved Job Alerts. Targets a single seeker (not a fan-out) because the
 * alert matcher iterates per seeker. Deep-links straight to JobDetail so
 * a tap takes them right to the posting.
 */
export async function sendJobAlertMatchPush(input: {
  recipientId: string;
  alertName: string;
  jobId: string;
  jobTitle: string;
  city?: string | null;
}): Promise<void> {
  const title = `New match — ${input.alertName}`;
  const body = input.city
    ? `${input.jobTitle} — ${input.city}`
    : input.jobTitle;

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'job_alert_match',
    title,
    body,
    deeplink: { screen: 'JobDetail', params: { jobId: input.jobId } },
  });

  const tokens = await tokensFor(input.recipientId);
  if (tokens.length === 0) return;

  await sendRaw(
    tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      channelId: 'jobs',
      data: {
        type: 'job_alert:match',
        jobId: input.jobId,
      },
    })),
  );
}

/**
 * Push + in-app row when someone is rated. The push module fires this from
 * the ratings service after a successful create.
 */
export async function sendRatingReceivedPush(input: {
  recipientId: string;
  reviewerName: string;
  score: number;
  jobTitle?: string;
}): Promise<void> {
  const title = 'You got a new rating';
  const body = input.jobTitle
    ? `${input.reviewerName} rated you ${input.score}/5 for "${input.jobTitle}"`
    : `${input.reviewerName} rated you ${input.score}/5`;

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'rating_received',
    title,
    body,
    deeplink: { screen: 'Ratings' },
  });

  const tokens = await tokensFor(input.recipientId);
  if (tokens.length === 0) return;

  await sendRaw(
    tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      channelId: 'ratings',
      data: { type: 'rating:received' },
    })),
  );
}
