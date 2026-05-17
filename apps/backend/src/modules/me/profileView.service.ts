/**
 * profileView.service — write + read helpers for the seeker "12 employers
 * viewed your profile this week" counter. See profileView.model.ts for
 * the storage model.
 */

import { Types } from 'mongoose';
import { ProfileViewModel } from './profileView.model';

/** Format a Date as a UTC-day bucket like "2026-05-17". */
function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Record an impression. Idempotent within the same UTC day for a given
 * (seekerId, viewerId) pair — re-loads by the same employer don't bump
 * the counter twice. Self-views (viewer === seeker) are ignored so a
 * seeker never inflates their own number by previewing their profile.
 */
export async function recordView(input: {
  seekerId: string | Types.ObjectId;
  viewerId: string | Types.ObjectId;
}): Promise<void> {
  const sid = new Types.ObjectId(input.seekerId);
  const vid = new Types.ObjectId(input.viewerId);
  if (sid.equals(vid)) return;
  try {
    await ProfileViewModel.updateOne(
      { seekerId: sid, viewerId: vid, day: dayKey() },
      { $setOnInsert: { seekerId: sid, viewerId: vid, day: dayKey() } },
      { upsert: true },
    );
  } catch {
    // Best-effort — duplicate-key races collapse to a no-op, which is
    // the intent (one view per day per pair).
  }
}

export interface ProfileViewSummary {
  /** Distinct viewers in the last 7 days. */
  viewersLast7Days: number;
  /** Distinct viewers in the last 30 days. */
  viewersLast30Days: number;
  /** Total impressions in the last 7 days (sums repeat-day collapses). */
  impressionsLast7Days: number;
}

/**
 * Summarise views for the seeker's own dashboard card. Always operates
 * on the seeker's own id — endpoint is /me/profile-views.
 */
export async function summarize(
  seekerId: string | Types.ObjectId,
): Promise<ProfileViewSummary> {
  const sid = new Types.ObjectId(seekerId);
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [v7Agg, v30Agg, imp7] = await Promise.all([
    ProfileViewModel.aggregate([
      { $match: { seekerId: sid, createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: '$viewerId' } },
      { $count: 'n' },
    ]),
    ProfileViewModel.aggregate([
      { $match: { seekerId: sid, createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: '$viewerId' } },
      { $count: 'n' },
    ]),
    ProfileViewModel.countDocuments({
      seekerId: sid,
      createdAt: { $gte: sevenDaysAgo },
    }),
  ]);

  return {
    viewersLast7Days: (v7Agg[0]?.n as number | undefined) ?? 0,
    viewersLast30Days: (v30Agg[0]?.n as number | undefined) ?? 0,
    impressionsLast7Days: imp7,
  };
}
