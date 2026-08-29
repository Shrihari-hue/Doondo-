/**
 * push — Expo push notification helper, on the official `expo-server-sdk`.
 *
 * Phase 5 (see DOONDO_PUSH_NOTIFICATIONS_STATUS.md's "Known Gaps"):
 * swapped the raw fetch() calls for the SDK so we get its chunking,
 * validation, and — the actual point — a `receiptId` per ticket so a
 * later sweep can call `getPushNotificationReceiptsAsync` and learn
 * about `DeviceNotRegistered` failures that only surface at delivery
 * time (minutes after the initial send), not just the synchronous
 * ticket errors the previous raw-fetch version could already catch.
 * See `push_receipts` (db/schema/extras.ts) and
 * `pruneDeadTokensFromReceipts` (scheduler/pushReceiptSweep.service.ts)
 * for the weekly cron half of this.
 *
 * Errors are caught and logged here. Callers should always `void` these
 * helpers so a failed push never blocks the request that triggered it.
 *
 * Every push here (except SOS, which bypasses it) also respects the
 * recipient's `notificationPrefs.quietHours` window — see
 * lib/notificationQuietHours.ts — and, for the push kinds push.ts owns
 * the copy for, renders in the recipient's `locale` via pushCopy.ts.
 */

import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import { logger } from './logger';
import { eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { pushReceipts, users, type NotificationPrefsJson } from '@/db/schema';
import * as notifications from '@/modules/notifications/notification.service';
import { isInQuietHours } from './notificationQuietHours';
import { isPushLocale, pushText, PUSH_LOCALE_BCP47, type PushLocale } from './pushCopy';

const expo = new Expo();

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

  const messages: ExpoPushMessage[] = payloads.filter(
    (p) => typeof p.to !== 'string' || Expo.isExpoPushToken(p.to),
  ) as ExpoPushMessage[];
  if (messages.length === 0) return;

  const chunks = expo.chunkPushNotifications(messages);
  const tickets: ExpoPushTicket[] = [];
  for (const chunk of chunks) {
    try {
      tickets.push(...(await expo.sendPushNotificationsAsync(chunk)));
    } catch (err) {
      logger.warn({ err, count: chunk.length }, 'expo push: chunk send failed');
    }
  }

  // Two outcomes worth acting on, both about dead tokens:
  //   1. A ticket errors with DeviceNotRegistered synchronously — prune
  //      right away, same as before the SDK swap.
  //   2. A ticket comes back 'ok' — Expo *accepted* it, but that says
  //      nothing about actual delivery. Its receipt (fetched later, async,
  //      by the weekly sweep) is the only way to learn if delivery itself
  //      failed with DeviceNotRegistered. Persist the ticket id so that
  //      sweep has something to look up.
  const toPrune: string[] = [];
  const ticketRows: { ticketId: string; token: string }[] = [];
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    const token = messages[i]?.to;
    if (!ticket || typeof token !== 'string') continue;
    if (ticket.status === 'error') {
      if (ticket.details?.error === 'DeviceNotRegistered') toPrune.push(token);
    } else if (ticket.status === 'ok' && ticket.id) {
      ticketRows.push({ ticketId: ticket.id, token });
    }
  }

  for (const token of toPrune) {
    pruneDeadToken(token).catch((err) =>
      logger.warn({ err, token }, 'expo push: dead-token prune failed'),
    );
  }
  if (ticketRows.length > 0) {
    getDb()
      .insert(pushReceipts)
      .values(ticketRows)
      .onConflictDoNothing()
      .catch((err) =>
        logger.warn({ err, count: ticketRows.length }, 'expo push: could not queue tickets for receipt sweep'),
      );
  }
}

/** Remove a dead (DeviceNotRegistered) Expo push token from whichever user has it. */
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
  logger.info({ userId: user.id }, 'expo push: pruned dead token');
}

/**
 * Tokens for a push that should respect quiet hours (everything except
 * SOS). Returns `[]` during the recipient's configured quiet-hours
 * window so the caller's `if (tokens.length === 0) return;` guard does
 * the right thing with zero changes at any call site.
 */
async function tokensFor(userId: string): Promise<string[]> {
  const [u] = await getDb()
    .select({ expoPushTokens: users.expoPushTokens, notificationPrefs: users.notificationPrefs })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return [];
  const prefs = u.notificationPrefs as NotificationPrefsJson | null;
  if (isInQuietHours(prefs?.quietHours, new Date())) return [];
  return u.expoPushTokens ?? [];
}

/** SOS is the one category that must land even inside quiet hours. */
async function tokensForBypassingQuietHours(userId: string): Promise<string[]> {
  const [u] = await getDb().select({ expoPushTokens: users.expoPushTokens }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.expoPushTokens ?? [];
}

/** The recipient's locale for the push kinds pushCopy.ts covers. Defaults to English. */
async function localeFor(userId: string): Promise<PushLocale> {
  const [u] = await getDb().select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
  return isPushLocale(u?.locale) ? u!.locale : 'en';
}

/**
 * Bulk sibling of `tokensFor` for the fan-out helpers that load many
 * recipients' tokens in one query rather than per-recipient — filters
 * out any user currently in their quiet-hours window.
 */
async function filterRowsRespectingQuietHours<T extends { notificationPrefs: unknown; expoPushTokens: string[] }>(
  rows: T[],
): Promise<string[]> {
  const now = new Date();
  const tokens: string[] = [];
  for (const row of rows) {
    const prefs = row.notificationPrefs as NotificationPrefsJson | null;
    if (isInQuietHours(prefs?.quietHours, now)) continue;
    if (Array.isArray(row.expoPushTokens)) tokens.push(...row.expoPushTokens);
  }
  return tokens;
}

// ─── Public helpers ─────────────────────────────────────────────────────────

export async function sendApplicationStatusPush(input: {
  recipientId: string;
  status: string;
  jobTitle?: string;
  applicationId: string;
}): Promise<void> {
  const locale = await localeFor(input.recipientId);
  const titleKey = `app_status.title.${input.status}`;
  const title = pushText(titleKey, locale) || pushText('app_status.title.rejected', locale);
  const body = input.jobTitle
    ? pushText('app_status.body.with_job', locale, { job: input.jobTitle })
    : pushText('app_status.body.without_job', locale);

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
        deeplink: { screen: 'Applications', params: { applicationId: input.applicationId } },
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
  const locale = await localeFor(input.recipientId);
  const title = pushText(`interview.title.${input.kind}`, locale);
  const when = input.whenIso
    ? new Date(input.whenIso).toLocaleString(PUSH_LOCALE_BCP47[locale], {
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
        ? pushText('interview.body.cancelled_with_job', locale, { job: input.jobTitle })
        : pushText('interview.body.cancelled_without_job', locale)
      : when
        ? input.jobTitle
          ? pushText('interview.body.when_with_job', locale, { job: input.jobTitle, when })
          : pushText('interview.body.when_without_job', locale, { when })
        : pushText('interview.body.no_when', locale);

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
        deeplink: { screen: 'Applications', params: { applicationId: input.applicationId } },
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

  const matchedUsers = await getDb()
    .select({ expoPushTokens: users.expoPushTokens, notificationPrefs: users.notificationPrefs, locale: users.locale })
    .from(users)
    .where(inArray(users.id, input.recipientIds));

  const now = new Date();
  const payloads: PushPayload[] = [];
  for (const u of matchedUsers) {
    const prefs = u.notificationPrefs as NotificationPrefsJson | null;
    if (isInQuietHours(prefs?.quietHours, now) || !Array.isArray(u.expoPushTokens)) continue;
    const locale = isPushLocale(u.locale) ? u.locale : 'en';
    const title = pushText('new_job.title', locale);
    const body = input.city ? `${input.jobTitle} — ${input.city}` : input.jobTitle;
    for (const to of u.expoPushTokens)
      payloads.push({
        to,
        title,
        body,
        sound: 'default',
        channelId: 'jobs',
        data: {
          type: 'job:new',
          deeplink: { screen: 'JobDetail', params: { jobId: input.jobId } },
          jobId: input.jobId,
        },
      });
  }
  if (payloads.length === 0) return;

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
  const [sender] = await getDb().select({ name: users.name, companyName: users.companyName, role: users.role, photoUrl: users.photoUrl }).from(users).where(eq(users.id, input.senderId)).limit(1);
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
        deeplink: { screen: 'Conversation', params: { conversationId: input.conversationId } },
        conversationId: input.conversationId,
      },
    })),
  );
}

/** Invite to a peer cohort (#7) — targets one invitee at a time. */
export async function sendCohortInvitePush(input: {
  recipientId: string;
  cohortId: string;
  inviterName: string;
  courseTitle: string;
}): Promise<void> {
  const locale = await localeFor(input.recipientId);
  const title = pushText('cohort_invite.title', locale);
  const body = pushText('cohort_invite.body', locale, { name: input.inviterName, course: input.courseTitle });

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'cohort_invite',
    title,
    body,
    deeplink: { screen: 'Cohorts', params: { cohortId: input.cohortId } },
  });

  const tokens = await tokensFor(input.recipientId);
  if (tokens.length === 0) return;
  await sendRaw(
    tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      data: { type: 'cohort:invite', deeplink: { screen: 'Cohorts', params: { cohortId: input.cohortId } }, cohortId: input.cohortId },
    })),
  );
}

/** New message in a cohort group chat — fans out to every other joined member. */
export async function sendCohortMessagePush(input: {
  recipientIds: string[];
  cohortId: string;
  senderName: string;
  body: string;
  cohortName: string;
}): Promise<void> {
  if (input.recipientIds.length === 0) return;
  const title = input.cohortName;
  const truncatedBody =
    input.body.length > 140 ? input.body.slice(0, 140) + '…' : input.body;
  const body = `${input.senderName}: ${truncatedBody}`;

  for (const recipientId of input.recipientIds)
    void notifications.record({
      recipientId,
      kind: 'cohort_message',
      title,
      body,
      deeplink: { screen: 'CohortChat', params: { cohortId: input.cohortId } },
    });

  const matchedUsers = await getDb()
    .select({ expoPushTokens: users.expoPushTokens, notificationPrefs: users.notificationPrefs })
    .from(users)
    .where(inArray(users.id, input.recipientIds));
  const tokens = await filterRowsRespectingQuietHours(matchedUsers);
  if (tokens.length === 0) return;

  const payloads: PushPayload[] = tokens.map((to) => ({
    to,
    title,
    body,
    sound: 'default',
    channelId: 'chat',
    data: { type: 'cohort:message_received', deeplink: { screen: 'CohortChat', params: { cohortId: input.cohortId } }, cohortId: input.cohortId },
  }));
  for (let i = 0; i < payloads.length; i += 100) await sendRaw(payloads.slice(i, i + 100));
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
        deeplink: { screen: 'JobDetail', params: { jobId: input.jobId } },
        jobId: input.jobId,
      },
    })),
  );
}

/**
 * Push + in-app row reminding both sides that an interview is coming
 * up soon (default: 60 minutes ahead). Fires from the scheduler sweep,
 * once per interview, with idempotency enforced via the
 * `Interview.reminderSentAt` field.
 *
 * Deep-links to the seeker's application detail so a tap shows the
 * interview's location / meeting link in context.
 */
export async function sendInterviewReminderPush(input: {
  recipientId: string;
  jobTitle?: string;
  /** Minutes until the interview starts (used in the body copy). */
  minutesUntil: number;
  /** Where to land — "in person at X" or "video — link". */
  locationLine?: string | null;
  applicationId: string;
}): Promise<void> {
  const title = 'Interview soon';
  const headline = input.jobTitle
    ? `${input.jobTitle} — starts in ${input.minutesUntil} min`
    : `Your interview starts in ${input.minutesUntil} min`;
  const body = input.locationLine
    ? `${headline} · ${input.locationLine}`
    : headline;

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'interview_reminder',
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
        type: 'interview:reminder',
        deeplink: { screen: 'Applications', params: { applicationId: input.applicationId } },
        applicationId: input.applicationId,
      },
    })),
  );
}

/**
 * Night-before "confirm you're coming tomorrow" push sent to a hired
 * worker. A tap lands them on their application where one button confirms
 * (or declines) the shift — catching a no-show the evening before instead
 * of at the gate. Idempotency lives on the application's
 * `shiftConfirmation.promptedAt`, set by the sweep before it pushes.
 */
export async function sendShiftConfirmationPush(input: {
  recipientId: string;
  jobTitle?: string;
  /** Human shift time, e.g. "tomorrow 8:00 AM". */
  whenLabel: string;
  applicationId: string;
}): Promise<void> {
  const title = 'Confirm tomorrow’s shift';
  const headline = input.jobTitle
    ? `${input.jobTitle} — ${input.whenLabel}`
    : `Your shift is ${input.whenLabel}`;
  const body = `${headline}. Tap to confirm you’re coming.`;

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'shift_confirmation',
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
        type: 'shift:confirmation',
        deeplink: { screen: 'Applications', params: { applicationId: input.applicationId } },
        applicationId: input.applicationId,
      },
    })),
  );
}

/**
 * Offer made — push to a worker who's just received a time-boxed offer.
 * Lands them on the application where they can accept or decline before
 * the deadline.
 */
export async function sendOfferMadePush(input: {
  recipientId: string;
  applicationId: string;
  expiresAt: Date;
}): Promise<void> {
  const title = 'You’ve got an offer!';
  const body = 'An employer wants to hire you. Tap to accept before it expires.';
  void notifications.record({
    recipientId: input.recipientId,
    kind: 'offer_made',
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
        type: 'offer:made',
        deeplink: { screen: 'Applications', params: { applicationId: input.applicationId } },
        applicationId: input.applicationId,
      },
    })),
  );
}

/** Offer resolved — push to the employer when a worker accepts/declines. */
export async function sendOfferResolvedPush(input: {
  recipientId: string;
  applicationId: string;
  outcome: 'accepted' | 'declined';
}): Promise<void> {
  const accepted = input.outcome === 'accepted';
  const title = accepted ? 'Offer accepted ✓' : 'Offer declined';
  const body = accepted
    ? 'Your candidate accepted — they’re hired.'
    : 'Your candidate declined. Time to line up someone else.';
  void notifications.record({
    recipientId: input.recipientId,
    kind: 'offer_resolved',
    title,
    body,
    deeplink: { screen: 'ApplicantDetail', params: { applicationId: input.applicationId } },
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
        type: 'offer:resolved',
        deeplink: { screen: 'ApplicantDetail', params: { applicationId: input.applicationId } },
        applicationId: input.applicationId,
      },
    })),
  );
}

/**
 * Crew-first shift — push to a saved crew member when an employer they've
 * worked for posts a shift with a head-start window. First dibs before it
 * goes public.
 */
export async function sendCrewShiftPush(input: {
  recipientId: string;
  jobId: string;
  jobTitle?: string;
  employerName?: string;
}): Promise<void> {
  const who = input.employerName ?? 'An employer you know';
  const title = 'First dibs on a shift';
  const body = input.jobTitle
    ? `${who} posted "${input.jobTitle}" — you get it before it goes public.`
    : `${who} posted a shift — you get first dibs before it goes public.`;
  void notifications.record({
    recipientId: input.recipientId,
    kind: 'crew_shift',
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
        type: 'crew:shift',
        deeplink: { screen: 'JobDetail', params: { jobId: input.jobId } },
        jobId: input.jobId,
      },
    })),
  );
}

/**
 * Shift backfilled — push to the employer when a hired worker declines and
 * we've auto-offered the slot to the next candidate. Turns a no-show
 * scramble into a heads-up that a replacement is already in motion.
 */
export async function sendBackfillPush(input: {
  recipientId: string;
  applicationId: string;
  declinedName?: string;
  nextName?: string;
}): Promise<void> {
  const who = input.declinedName ?? 'A hired worker';
  const next = input.nextName ?? 'the next candidate';
  const title = 'Shift backfill in motion';
  const body = `${who} can't make it — we've offered the shift to ${next}.`;
  void notifications.record({
    recipientId: input.recipientId,
    kind: 'shift_backfilled',
    title,
    body,
    deeplink: { screen: 'ApplicantDetail', params: { applicationId: input.applicationId } },
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
        type: 'shift:backfilled',
        deeplink: { screen: 'ApplicantDetail', params: { applicationId: input.applicationId } },
        applicationId: input.applicationId,
      },
    })),
  );
}

/** Worker on the way — push to the employer when the worker sets off. */
export async function sendWorkerOnTheWayPush(input: {
  recipientId: string;
  applicationId: string;
  etaMinutes: number;
  workerName?: string;
}): Promise<void> {
  const who = input.workerName ?? 'Your worker';
  const title = 'On the way';
  const body = `${who} is on the way — about ${input.etaMinutes} min out.`;
  void notifications.record({
    recipientId: input.recipientId,
    kind: 'worker_on_the_way',
    title,
    body,
    deeplink: { screen: 'ApplicantDetail', params: { applicationId: input.applicationId } },
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
        type: 'worker:on_the_way',
        deeplink: { screen: 'ApplicantDetail', params: { applicationId: input.applicationId } },
        applicationId: input.applicationId,
      },
    })),
  );
}

/** Offer countered — push to the employer when the worker proposes a wage. */
export async function sendOfferCounteredPush(input: {
  recipientId: string;
  applicationId: string;
  amountPaise: number;
}): Promise<void> {
  const rupees = Math.round(input.amountPaise / 100).toLocaleString('en-IN');
  const title = 'Wage counter-offer';
  const body = `Your candidate wants ₹${rupees}. Tap to accept or re-offer.`;
  void notifications.record({
    recipientId: input.recipientId,
    kind: 'offer_countered',
    title,
    body,
    deeplink: { screen: 'ApplicantDetail', params: { applicationId: input.applicationId } },
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
        type: 'offer:countered',
        deeplink: { screen: 'ApplicantDetail', params: { applicationId: input.applicationId } },
        applicationId: input.applicationId,
      },
    })),
  );
}

/** Offer expired — push to the employer when a pending offer lapses. */
export async function sendOfferExpiredPush(input: {
  recipientId: string;
  applicationId: string;
}): Promise<void> {
  const title = 'Offer expired';
  const body = 'Your offer lapsed with no reply. Tap to offer someone else.';
  void notifications.record({
    recipientId: input.recipientId,
    kind: 'offer_expired',
    title,
    body,
    deeplink: { screen: 'ApplicantDetail', params: { applicationId: input.applicationId } },
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
        type: 'offer:expired',
        deeplink: { screen: 'ApplicantDetail', params: { applicationId: input.applicationId } },
        applicationId: input.applicationId,
      },
    })),
  );
}

/**
 * Push + in-app row sent to a seeker whose application has been
 * rejected AND for whom we've computed a skill gap. Replaces the
 * generic rejection push so the seeker lands on a forward step
 * instead of a dead end.
 *
 * Copy is intentionally direct ("You were missing X — try this
 * 22-minute course"). Deeplinks straight into CourseDetail so the
 * tap is one screen, not three.
 */
export async function sendSkillGapPush(input: {
  recipientId: string;
  jobTitle?: string;
  missingSkill: string;
  courseId: string;
  courseTitle: string;
  durationMinutes: number;
  applicationId: string;
}): Promise<void> {
  const locale = await localeFor(input.recipientId);
  const title = input.jobTitle
    ? pushText('skill_gap.title.with_job', locale, { job: input.jobTitle })
    : pushText('skill_gap.title.without_job', locale);
  const body = pushText('skill_gap.body', locale, {
    skill: input.missingSkill,
    course: input.courseTitle,
    minutes: input.durationMinutes,
  });

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'skill_gap',
    title,
    body,
    deeplink: { screen: 'CourseDetail', params: { courseId: input.courseId } },
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
        type: 'application:skill_gap',
        deeplink: { screen: 'CourseDetail', params: { courseId: input.courseId } },
        applicationId: input.applicationId,
        courseId: input.courseId,
      },
    })),
  );
}

/**
 * Push + in-app row when the anti-ghost sweep flags an employer for
 * not responding to a seeker's application within the SLA window
 * (default 72h). Sent to the seeker so they know to move on; the
 * employer-side ghost-count is bumped separately by the sweep
 * service.
 */
export async function sendGhostedPush(input: {
  recipientId: string;
  jobTitle?: string;
  employerName?: string;
  hours: number;
  applicationId: string;
}): Promise<void> {
  const locale = await localeFor(input.recipientId);
  const employer = input.employerName ?? pushText('ghosted.default_employer', locale);
  const title = pushText('ghosted.title', locale);
  const body = input.jobTitle
    ? pushText('ghosted.body.with_job', locale, { employer, job: input.jobTitle, hours: input.hours })
    : pushText('ghosted.body.without_job', locale, { employer, hours: input.hours });

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'application_ghosted',
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
        type: 'application:ghosted',
        deeplink: { screen: 'Applications', params: { applicationId: input.applicationId } },
        applicationId: input.applicationId,
      },
    })),
  );
}

/**
 * Morning digest — one daily push per seeker at ~7am local time,
 * containing top jobs, a wage trend, and a single nudge. Body is
 * built by the digest service; this helper just delivers it.
 *
 * Deeplinks to the seeker's Home screen because the digest is meant
 * as a "open the app today" prompt, not a single-job action.
 */
export async function sendMorningDigestPush(input: {
  recipientId: string;
  body: string;
  topJobIds: string[];
}): Promise<void> {
  const title = 'Your morning round-up';

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'morning_digest',
    title,
    body: input.body,
    deeplink: { screen: 'Home' },
  });

  const tokens = await tokensFor(input.recipientId);
  if (tokens.length === 0) return;

  await sendRaw(
    tokens.map((to) => ({
      to,
      title,
      body: input.body,
      sound: 'default',
      channelId: 'jobs',
      data: {
        type: 'morning_digest',
        deeplink: { screen: 'Home' },
        topJobIds: input.topJobIds.slice(0, 5),
      },
    })),
  );
}

/**
 * Re-engagement push — the win-back nudge for a dormant user (no login
 * for ~14 days). Title + body are built by the sweep
 * (`buildReengagementBody`) and differ by role; this helper just routes
 * and sends. Seekers deeplink to Home (their job feed), employers to
 * Posts (their job-management tab).
 */
export async function sendReengagementPush(input: {
  recipientId: string;
  role: 'seeker' | 'employer';
  title: string;
  body: string;
}): Promise<void> {
  const deeplink = {
    screen: input.role === 'employer' ? 'Posts' : 'Home',
  };

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'reengagement',
    title: input.title,
    body: input.body,
    deeplink,
  });

  const tokens = await tokensFor(input.recipientId);
  if (tokens.length === 0) return;

  await sendRaw(
    tokens.map((to) => ({
      to,
      title: input.title,
      body: input.body,
      sound: 'default',
      channelId: 'jobs',
      data: {
        type: 'reengagement',
        deeplink,
      },
    })),
  );
}

/**
 * Streak milestone push — celebratory ping when the seeker crosses
 * 3 / 7 / 14 / 30 consecutive days of an activity (apply, course,
 * shift). Brief, warm, no CTA — the goal is the dopamine, not a
 * routing change.
 */
export async function sendStreakMilestonePush(input: {
  recipientId: string;
  kind: 'apply' | 'course' | 'shift';
  days: number;
}): Promise<void> {
  const locale = await localeFor(input.recipientId);
  const kindWord = pushText(`streak.kind.${input.kind}`, locale);
  const verb = pushText(`streak.verb.${input.kind}`, locale);
  const title = pushText('streak.title', locale, { days: input.days, kind: kindWord });
  const body = pushText('streak.body', locale, { days: input.days, verb });

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'streak_milestone',
    title,
    body,
    deeplink: { screen: 'Profile' },
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
        type: 'streak:milestone',
        deeplink: { screen: 'Profile' },
        kind: input.kind,
        days: input.days,
      },
    })),
  );
}

/**
 * Referral bonus push — fired when a worker the seeker referred gets
 * hired and the bonus has been credited to their wallet. Deeplinks to
 * the earnings ledger so the seeker can verify the credit.
 */
export async function sendReferralBonusPush(input: {
  recipientId: string;
  refereeName: string;
  bonusPaise: number;
}): Promise<void> {
  const locale = await localeFor(input.recipientId);
  const rupees = Math.round(input.bonusPaise / 100);
  const title = pushText('referral.title', locale, { amount: rupees });
  const body = pushText('referral.body', locale, { name: input.refereeName });

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'referral_bonus',
    title,
    body,
    deeplink: { screen: 'MyEarnings' },
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
        type: 'referral:bonus',
        deeplink: { screen: 'MyEarnings' },
        bonusPaise: input.bonusPaise,
      },
    })),
  );
}

/**
 * "Hired near you" push — social-proof signal sent to verified
 * seekers within a few km when someone gets hired. Drops the hired
 * worker's full name to keep them anonymous; uses a first name only,
 * plus the trade, plus the area.
 */
export async function sendHiredNearbyPush(input: {
  recipientId: string;
  hiredFirstName: string;
  jobTitle: string;
  area: string | null;
}): Promise<void> {
  const locale = await localeFor(input.recipientId);
  const title = pushText('hired_nearby.title', locale);
  const body = input.area
    ? pushText('hired_nearby.body.with_area', locale, { name: input.hiredFirstName, job: input.jobTitle, area: input.area })
    : pushText('hired_nearby.body.without_area', locale, { name: input.hiredFirstName, job: input.jobTitle });

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'hired_nearby',
    title,
    body,
    deeplink: { screen: 'Home' },
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
        type: 'hired:nearby',
        deeplink: { screen: 'Home' },
      },
    })),
  );
}

/**
 * SOS alert push — high-urgency notification to a Trust Circle contact
 * or a nearby verified peer when someone triggers SOS.
 *
 * Body intentionally short and exact. Tap deeplinks to the Sos screen
 * so the responder can see the alert details + the sender's last
 * known location. Channel `applications` is reused for now — SDK 54
 * notification channels are limited and a separate `safety` channel
 * adds little value over the existing high-priority default.
 */
export async function sendSosAlertPush(input: {
  recipientId: string;
  fromName: string;
  /** "family" / "friend" / "employer" / "peer" — drives the copy. */
  relationship: string;
  alertId: string;
  locationLink: string | null;
}): Promise<void> {
  const locale = await localeFor(input.recipientId);
  const relationshipKey = `sos.relationship.${input.relationship}`;
  const relationship = pushText(relationshipKey, locale) || input.relationship;
  const title = pushText('sos.title', locale);
  const body = input.locationLink
    ? pushText('sos.body.with_location', locale, { name: input.fromName, relationship, link: input.locationLink })
    : pushText('sos.body.without_location', locale, { name: input.fromName, relationship });

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'sos_alert',
    title,
    body,
    deeplink: { screen: 'Sos', params: { alertId: input.alertId } },
  });

  // SOS is the one category that must land even inside the recipient's
  // configured quiet hours — see notificationQuietHours.ts.
  const tokens = await tokensForBypassingQuietHours(input.recipientId);
  if (tokens.length === 0) return;

  await sendRaw(
    tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      channelId: 'applications',
      data: {
        type: 'sos:alert',
        deeplink: { screen: 'Sos', params: { alertId: input.alertId } },
        alertId: input.alertId,
        fromName: input.fromName,
        relationship: input.relationship,
      },
    })),
  );
}

/**
 * Shift check-in / check-out push to the OTHER side. The seeker
 * arriving on-site pushes the employer ("Priya checked in at 09:12"),
 * and check-out pushes them again ("Priya checked out at 17:30").
 *
 * Lets the employer know without opening the app — particularly
 * useful when the employer is running 3 sites at once and wants a
 * passive ping when each worker shows up.
 */
export async function sendShiftCheckinPush(input: {
  recipientId: string;
  /** Who did the check-in/out (usually the seeker's name). */
  actorName: string;
  kind: 'check_in' | 'check_out';
  jobTitle?: string;
  applicationId: string;
}): Promise<void> {
  const title = input.kind === 'check_in' ? 'Worker checked in' : 'Worker checked out';
  const body = input.jobTitle
    ? `${input.actorName} ${input.kind === 'check_in' ? 'checked in' : 'checked out'} on "${input.jobTitle}"`
    : `${input.actorName} ${input.kind === 'check_in' ? 'checked in' : 'checked out'}`;

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'shift_checkin',
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
        type: input.kind === 'check_in' ? 'shift:check_in' : 'shift:check_out',
        deeplink: { screen: 'Applications', params: { applicationId: input.applicationId } },
        applicationId: input.applicationId,
      },
    })),
  );
}

/**
 * Trust Circle shift ping — tells a worker's vouched contacts that
 * they've started or ended a shift. The accountability / safety-net
 * use case of the Trust Circle: a family member knows the worker
 * arrived safely and left on time.
 *
 * Sent only to Trust Circle contacts who are themselves Doondo users
 * (push only, no SMS) and only when the worker has opted in via
 * `shareShiftsWithCircle`.
 */
export async function sendTrustCircleShiftPush(input: {
  recipientId: string;
  workerFirstName: string;
  kind: 'check_in' | 'check_out';
  jobTitle?: string;
}): Promise<void> {
  const started = input.kind === 'check_in';
  const title = started ? 'Shift started' : 'Shift ended';
  const verb = started ? 'started a shift' : 'ended their shift';
  const body = input.jobTitle
    ? `${input.workerFirstName} ${verb} — ${input.jobTitle}.`
    : `${input.workerFirstName} ${verb}.`;

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'shift_checkin',
    title,
    body,
    deeplink: { screen: 'Home' },
  });

  const tokens = await tokensFor(input.recipientId);
  if (tokens.length === 0) return;

  await sendRaw(
    tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      channelId: 'default',
      data: {
        type: started ? 'trust_circle:shift_start' : 'trust_circle:shift_end',
        deeplink: { screen: 'Home' },
      },
    })),
  );
}

/**
 * Reassurance push to a trust-circle contact when a worker confirms they
 * reached home safely after a shift. The positive bookend to the shift
 * pings — "they're home, all good".
 */
export async function sendHomeSafeCirclePush(input: {
  recipientId: string;
  workerFirstName: string;
}): Promise<void> {
  const title = 'Home safe';
  const body = `${input.workerFirstName} reached home safely.`;

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'reached_home_safe',
    title,
    body,
    deeplink: { screen: 'Home' },
  });

  const tokens = await tokensFor(input.recipientId);
  if (tokens.length === 0) return;

  await sendRaw(
    tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      channelId: 'default',
      data: { type: 'trust_circle:home_safe', deeplink: { screen: 'Home' } },
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
  const locale = await localeFor(input.recipientId);
  const title = pushText('rating.title', locale);
  const body = input.jobTitle
    ? pushText('rating.body.with_job', locale, { name: input.reviewerName, score: input.score, job: input.jobTitle })
    : pushText('rating.body.without_job', locale, { name: input.reviewerName, score: input.score });

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
      data: { type: 'rating:received', deeplink: { screen: 'Ratings' } },
    })),
  );
}

/**
 * Hire celebration push for the worker themself. This is the emotional
 * "you got the job" moment, but still routes into a useful screen so
 * the user can move immediately into next steps.
 */
export async function sendHireCelebrationPush(input: {
  recipientId: string;
  applicationId: string;
  jobTitle?: string;
  employerName?: string | null;
}): Promise<void> {
  const locale = await localeFor(input.recipientId);
  const title = input.jobTitle
    ? pushText('hire_celebration.title.with_job', locale, { job: input.jobTitle })
    : pushText('hire_celebration.title.without_job', locale);
  const body = input.employerName
    ? pushText('hire_celebration.body.with_employer', locale, { employer: input.employerName })
    : pushText('hire_celebration.body.without_employer', locale);

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'hire_celebration',
    title,
    body,
    deeplink: { screen: 'MyApplications' },
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
        type: 'hire:celebration',
        deeplink: { screen: 'MyApplications' },
        applicationId: input.applicationId,
      },
    })),
  );
}

/**
 * Profile viewed — push to a seeker when an employer views their profile
 * for the first time on a given day. Deduplication (one push per
 * employer per day) is enforced upstream by `recordView` returning
 * `isNew`; this helper should only be called when `isNew === true`.
 *
 * The employer's name is shown in the body so the seeker knows it's a
 * real company looking — not a generic "someone" ping. The deeplink
 * sends them to their own Profile screen where the "X viewed your
 * profile this week" card lives.
 */
export async function sendProfileViewPush(input: {
  seekerId: string;
  viewerName: string;
}): Promise<void> {
  const title = 'Someone viewed your profile';
  const body = `${input.viewerName} just checked out your profile.`;

  void notifications.record({
    recipientId: input.seekerId,
    kind: 'profile_viewed',
    title,
    body,
    deeplink: { screen: 'Profile' },
  });

  const tokens = await tokensFor(input.seekerId);
  if (tokens.length === 0) return;

  await sendRaw(
    tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      channelId: 'jobs',
      data: {
        type: 'profile:viewed',
        deeplink: { screen: 'Profile' },
      },
    })),
  );
}

/**
 * Trust Circle hire ping — a quiet proud update to matched Doondo
 * contacts when someone in their circle gets hired.
 */
export async function sendTrustCircleHirePush(input: {
  recipientId: string;
  workerFirstName: string;
  jobTitle?: string;
  employerName?: string | null;
}): Promise<void> {
  const title = `${input.workerFirstName} got hired`;
  const body = input.jobTitle
    ? input.employerName
      ? `${input.workerFirstName} was hired as ${input.jobTitle} with ${input.employerName}.`
      : `${input.workerFirstName} was hired as ${input.jobTitle}.`
    : `${input.workerFirstName} landed a new job.`;

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'hire_celebration',
    title,
    body,
    deeplink: { screen: 'Home' },
  });

  const tokens = await tokensFor(input.recipientId);
  if (tokens.length === 0) return;

  await sendRaw(
    tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      channelId: 'default',
      data: {
        type: 'trust_circle:hire',
        deeplink: { screen: 'Home' },
      },
    })),
  );
}

/**
 * Fan-out push when a seeker posts a full open shift (a named-wage
 * availability beacon — see availability.service.ts). `recipientIds` is
 * the list of employer user ids near the shift; the caller decides who's
 * eligible. Mirrors sendNewJobPush's shape exactly, reversed direction.
 */
export async function sendOpenShiftPush(input: {
  recipientIds: string[];
  seekerId: string;
  seekerFirstName: string;
  trade: string | null;
  wageAmount: number;
  wagePeriod: string;
  city?: string | null;
}): Promise<void> {
  if (input.recipientIds.length === 0) return;

  const matchedUsers = await getDb()
    .select({ expoPushTokens: users.expoPushTokens, notificationPrefs: users.notificationPrefs })
    .from(users)
    .where(inArray(users.id, input.recipientIds));
  const tokens = await filterRowsRespectingQuietHours(matchedUsers);
  if (tokens.length === 0) return;

  const periodShort: Record<string, string> = { hour: '/hr', day: '/day', week: '/wk', month: '/mo', fixed: '' };
  const wage = `₹${input.wageAmount}${periodShort[input.wagePeriod] ?? ''}`;
  const title = input.trade ? `${input.trade} worker available now` : 'A worker is available now';
  const body = input.city
    ? `${input.seekerFirstName} wants ${wage} — ${input.city}`
    : `${input.seekerFirstName} wants ${wage}`;

  const payloads: PushPayload[] = tokens.map((to) => ({
    to,
    title,
    body,
    sound: 'default',
    channelId: 'jobs',
    data: {
      type: 'open_shift:posted',
      deeplink: { screen: 'AvailableWorkers' },
      seekerId: input.seekerId,
    },
  }));

  for (let i = 0; i < payloads.length; i += 100) {
    await sendRaw(payloads.slice(i, i + 100));
  }
}

/** A mentee booked, or either side cancelled, a bookable mentor session slot. */
export async function sendMentorSessionPush(input: {
  recipientId: string;
  kind: 'booked' | 'cancelled';
  counterpartName: string;
  scheduledForIso: string;
}): Promise<void> {
  const locale = await localeFor(input.recipientId);
  const when = new Date(input.scheduledForIso).toLocaleString(PUSH_LOCALE_BCP47[locale], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  const title = pushText(`mentor_session.title.${input.kind}`, locale);
  const body = pushText(`mentor_session.body.${input.kind}`, locale, { name: input.counterpartName, when });

  void notifications.record({
    recipientId: input.recipientId,
    kind: input.kind === 'booked' ? 'mentor_session_booked' : 'mentor_session_cancelled',
    title,
    body,
    deeplink: { screen: 'MentorSessions' },
  });

  const tokens = await tokensFor(input.recipientId);
  if (tokens.length === 0) return;

  await sendRaw(
    tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      channelId: 'default',
      data: {
        type: `mentor_session:${input.kind}`,
        deeplink: { screen: 'MentorSessions' },
      },
    })),
  );
}
