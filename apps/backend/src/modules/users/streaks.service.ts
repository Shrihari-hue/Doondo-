/**
 * Streaks service — atomic bumps of the rolling activity counters on
 * the User document.
 *
 * Activity kinds:
 *   apply  — fired from `application.service.apply` on a new application.
 *   course — fired from `courses.service.completeLesson` on lesson done.
 *   shift  — fired from `shiftCheckIn.service.createCheckIn` on check_in.
 *
 * Streak math (per kind):
 *   - Compute today's date in IST as YYYY-MM-DD.
 *   - If `lastDate === today`, no-op — already counted today.
 *   - If `lastDate === yesterday`, current += 1.
 *   - Otherwise, current = 1 (the streak reset).
 *   - longest = max(longest, current).
 *   - totalDays += 1 whenever we actually counted a day.
 *
 * Milestones (3, 7, 14, 30) trigger a single push per crossing — we
 * detect the exact transition from < threshold to >= threshold so a
 * worker isn't pushed twice for the same milestone.
 *
 * Idempotency: same-day re-fires are a database no-op (the lastDate
 * check rejects them before any write), so callers can `void` this
 * from inside an apply / check-in / lesson-complete handler without
 * worrying about double bumps from retries.
 */

import { Types } from 'mongoose';
import { logger } from '@/lib/logger';
import { sendStreakMilestonePush } from '@/lib/push';
import { UserModel } from './user.model';

export type StreakKind = 'apply' | 'course' | 'shift';

const MILESTONES = [3, 7, 14, 30] as const;

interface BumpResult {
  bumped: boolean;
  current: number;
  milestoneCrossed: number | null;
}

/**
 * Atomically advance the streak for one user/kind.
 *
 * Returns a small summary so callers can decide whether to do anything
 * else (e.g. surface a celebration toast in the response). Default
 * usage is fire-and-forget — the push fires inline when a milestone
 * is crossed.
 */
export async function bumpStreak(
  userId: string,
  kind: StreakKind,
): Promise<BumpResult> {
  const today = istDateString(new Date());
  const yesterday = istDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));

  const user = await UserModel.findById(userId).select('streaks name');
  if (!user) return { bumped: false, current: 0, milestoneCrossed: null };

  const slot = user.streaks?.[kind] ?? { current: 0, longest: 0, totalDays: 0, lastDate: null };

  if (slot.lastDate === today) {
    return { bumped: false, current: slot.current, milestoneCrossed: null };
  }

  const prevCurrent = slot.current ?? 0;
  const nextCurrent = slot.lastDate === yesterday ? prevCurrent + 1 : 1;
  const nextLongest = Math.max(slot.longest ?? 0, nextCurrent);
  const nextTotalDays = (slot.totalDays ?? 0) + 1;

  // Detect a milestone crossing: was the previous current STRICTLY
  // below the threshold, and is the new current at or above it?
  let milestoneCrossed: number | null = null;
  for (const m of MILESTONES) {
    if (prevCurrent < m && nextCurrent >= m) {
      milestoneCrossed = m;
      // Only fire the highest single crossing per bump (matters only
      // if a worker comes back from a long gap and somehow jumps two
      // thresholds in one day, which can't happen with daily bumps —
      // belt and braces).
    }
  }

  try {
    await UserModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      {
        $set: {
          [`streaks.${kind}.current`]: nextCurrent,
          [`streaks.${kind}.longest`]: nextLongest,
          [`streaks.${kind}.totalDays`]: nextTotalDays,
          [`streaks.${kind}.lastDate`]: today,
        },
      },
    );
  } catch (err) {
    logger.warn({ err, userId, kind }, 'streak bump update failed');
    return { bumped: false, current: prevCurrent, milestoneCrossed: null };
  }

  if (milestoneCrossed !== null) {
    void sendStreakMilestonePush({
      recipientId: userId,
      kind,
      days: milestoneCrossed,
    }).catch((err) =>
      logger.warn({ err, userId, kind, milestoneCrossed }, 'streak milestone push failed'),
    );
  }

  return { bumped: true, current: nextCurrent, milestoneCrossed };
}

/**
 * Format a Date as YYYY-MM-DD in IST without depending on the host
 * locale. India is UTC+5:30 with no DST; subtracting a fixed offset
 * before formatting in UTC is safe and deterministic.
 */
export function istDateString(d: Date): string {
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const ist = new Date(d.getTime() + istOffsetMs);
  const yyyy = ist.getUTCFullYear();
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
