/**
 * Morning digest — one daily push per active seeker.
 *
 * Why a daily push:
 *   The hardest moment in any blue-collar hiring app is the second day.
 *   Day 1, the user signs up; day 2, they forget the app exists. A
 *   well-built morning digest puts Doondo in front of the worker
 *   alongside their chai, with concrete jobs they'd actually take and
 *   one nudge that moves them forward.
 *
 * Build strategy:
 *   - Pull active seekers in batches (no global query — paginate by _id).
 *   - For each seeker, lean on the existing `recommendFor` service so
 *     digest content matches the seeker's "Recommended for you" rail.
 *   - Pick a single nudge per seeker from a small ordered list
 *     (verification > resume > availability) so they always know the
 *     #1 thing to do next.
 *   - Send via `sendMorningDigestPush` which writes the in-app row +
 *     fires Expo push.
 *
 * Idempotency:
 *   We compare `lastDigestSentAt` to "today in IST" before sending so a
 *   double-fire of the cron (rare but possible during deploys) doesn't
 *   double-push.
 */

import { Types } from 'mongoose';
import { logger } from '@/lib/logger';
import { sendMorningDigestPush } from '@/lib/push';
import { UserModel } from '@/modules/users/user.model';

const BATCH_SIZE = 200;

interface DigestSummary {
  seekersConsidered: number;
  seekersPushed: number;
  seekersSkippedAlreadyDone: number;
  seekersSkippedNoContent: number;
  errors: number;
}

/**
 * Build the digest body for one seeker. Returns null when there's not
 * enough material to send a worthwhile push (no recommendations AND no
 * nudge). The caller skips the push in that case rather than firing an
 * empty "open Doondo" notification.
 */
export async function assembleForUser(
  seekerId: string,
): Promise<{ body: string; topJobIds: string[] } | null> {
  const { recommendFor } = await import('@/modules/jobs/recommendations.service');
  const ranked = await recommendFor(seekerId, { limit: 5 });

  const user = await UserModel.findById(seekerId).select(
    'name skills isVerified resumeUploadedAt workHistory availability lastDigestSentAt',
  );
  if (!user) return null;

  // Nudge picker — first one that applies wins. Designed so that
  // finishing earlier nudges naturally moves the worker to the next
  // step rather than dead-ending.
  const nudge = pickNudge(user);

  // Top-line: how many active jobs are worth their attention today.
  const liveCount = ranked.length;

  // Compose. Keep under 120 chars because Android notification body
  // truncates and the most actionable part has to come first.
  let body: string;
  if (liveCount > 0) {
    const headline = ranked[0]!;
    const headlineTitle = (headline.title ?? 'a new job').slice(0, 40);
    body = liveCount === 1
      ? `1 match today: ${headlineTitle}. ${nudge}`
      : `${liveCount} matches today, starting with ${headlineTitle}. ${nudge}`;
  } else if (nudge) {
    body = nudge;
  } else {
    return null;
  }

  return {
    body: body.length > 200 ? body.slice(0, 197) + '…' : body,
    topJobIds: ranked.map((r) => r.id),
  };
}

function pickNudge(user: {
  isVerified?: boolean;
  resumeUploadedAt?: Date | null;
  workHistory?: Array<unknown> | null;
  availability?: string | null;
  skills?: string[];
}): string {
  if (!user.isVerified) {
    return 'Complete verification — verified workers get 3x more replies.';
  }
  if (!user.resumeUploadedAt && (user.workHistory ?? []).length === 0) {
    return 'Add your work history — employers reach out 2x more when they see experience.';
  }
  if (!user.availability) {
    return "Set your availability so we can match you to today's gigs.";
  }
  if (!user.skills || user.skills.length === 0) {
    return 'Add skills to your profile so we can show you the right jobs.';
  }
  return 'Tap to see what changed overnight.';
}

/**
 * Iterate every seeker, build their digest, send it. Skips seekers who
 * have no recommendations AND no nudge (rare but possible — fully
 * onboarded seekers in a city with no active jobs).
 *
 * Resilient to per-user failure: a single user's lookup error logs and
 * continues; the cron isn't going to give up the run because one user
 * has a corrupt document.
 */
export async function runMorningDigest(): Promise<DigestSummary> {
  const summary: DigestSummary = {
    seekersConsidered: 0,
    seekersPushed: 0,
    seekersSkippedAlreadyDone: 0,
    seekersSkippedNoContent: 0,
    errors: 0,
  };

  // "Today in IST" boundary — once a seeker's been pushed today, skip
  // them. Default to IST since that's the primary user base; tune via
  // env later if/when we go international.
  const todayMidnightUtc = todayMidnightIstAsUtc();

  let lastId: Types.ObjectId | null = null;
  // Paginate by _id to avoid loading the whole user table into memory.
  while (true) {
    const q: Record<string, unknown> = { role: 'seeker', isActive: true };
    if (lastId) q._id = { $gt: lastId };

    const batch = await UserModel.find(q)
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .select('_id lastDigestSentAt notificationPrefs');
    if (batch.length === 0) break;

    for (const user of batch) {
      summary.seekersConsidered += 1;
      const userId = (user._id as Types.ObjectId).toString();

      // Honor per-user pref. The schema has `jobs?: boolean` which
      // defaults true; we treat false as "opted out".
      const wantsJobs = user.notificationPrefs?.jobs !== false;
      if (!wantsJobs) {
        summary.seekersSkippedNoContent += 1;
        continue;
      }

      // Idempotency — skip if we've already sent today.
      if (user.lastDigestSentAt && user.lastDigestSentAt >= todayMidnightUtc) {
        summary.seekersSkippedAlreadyDone += 1;
        continue;
      }

      try {
        const payload = await assembleForUser(userId);
        if (!payload) {
          summary.seekersSkippedNoContent += 1;
          continue;
        }
        await sendMorningDigestPush({
          recipientId: userId,
          body: payload.body,
          topJobIds: payload.topJobIds,
        });
        // Mark sent — separate update to avoid blocking the push.
        UserModel.updateOne(
          { _id: user._id },
          { $set: { lastDigestSentAt: new Date() } },
        )
          .exec()
          .catch((err) =>
            logger.warn({ err, userId }, 'lastDigestSentAt update failed'),
          );
        summary.seekersPushed += 1;
      } catch (err) {
        summary.errors += 1;
        logger.warn({ err, userId }, 'digest: per-user assemble/send failed');
      }
    }

    lastId = batch[batch.length - 1]!._id as Types.ObjectId;
    if (batch.length < BATCH_SIZE) break;
  }

  logger.info(summary, 'morning digest complete');
  return summary;
}

/**
 * Return today's midnight in IST, expressed as a UTC Date object.
 * Used for the "already sent today" idempotency check. IST is UTC+5:30
 * with no DST shifts — safe to subtract a fixed offset.
 */
function todayMidnightIstAsUtc(): Date {
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const nowIst = new Date(Date.now() + istOffsetMs);
  // Floor to start of IST day, then back-shift to UTC.
  nowIst.setUTCHours(0, 0, 0, 0);
  return new Date(nowIst.getTime() - istOffsetMs);
}
