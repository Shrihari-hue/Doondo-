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
      deeplink: { screen: 'JobDetail', params: { jobId: input.jobId } },
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
        deeplink: { screen: 'Conversation', params: { conversationId: input.conversationId } },
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
  const title = input.jobTitle
    ? `Update on "${input.jobTitle}"`
    : 'Application update';
  const body = `Missing: ${input.missingSkill}. ${input.courseTitle} (${input.durationMinutes} min) can close the gap.`;

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
  const title = 'No reply yet';
  const body = input.jobTitle
    ? `${input.employerName ?? 'The employer'} hasn't replied to your "${input.jobTitle}" application in ${input.hours} hours.`
    : `${input.employerName ?? 'The employer'} hasn't replied in ${input.hours} hours.`;

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
  const verb =
    input.kind === 'apply'
      ? 'applying'
      : input.kind === 'course'
        ? 'learning'
        : 'showing up';
  const title = `${input.days}-day ${input.kind} streak 🔥`;
  const body = `Nice work — ${input.days} days of ${verb} in a row.`;

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
  const rupees = Math.round(input.bonusPaise / 100);
  const title = `+₹${rupees} referral bonus`;
  const body = `${input.refereeName} got hired through your share. Bonus credited to your wallet.`;

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
  const where = input.area ? ` in ${input.area}` : ' nearby';
  const title = 'Hired near you';
  const body = `${input.hiredFirstName} was just hired as ${input.jobTitle}${where}.`;

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
  const title = '🚨 SOS — needs help';
  const body = input.locationLink
    ? `${input.fromName} (${input.relationship}) triggered SOS. Location: ${input.locationLink}`
    : `${input.fromName} (${input.relationship}) triggered SOS. Location unavailable — please call.`;

  void notifications.record({
    recipientId: input.recipientId,
    kind: 'sos_alert',
    title,
    body,
    deeplink: { screen: 'Sos', params: { alertId: input.alertId } },
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
      data: { type: 'rating:received', deeplink: { screen: 'Ratings' } },
    })),
  );
}
