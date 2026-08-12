/**
 * profileView.service — write + read helpers for the seeker "12 employers
 * viewed your profile this week" counter. See `profileViews` in
 * src/db/schema/extras.ts for the storage model.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { profileViews } from '@/db/schema';

/** Format a Date as a UTC-day bucket like "2026-05-17". */
function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Record an impression. Idempotent within the same UTC day for a given
 * (seekerId, viewerId) pair — re-loads by the same employer don't bump
 * the counter twice. Self-views (viewer === seeker) are ignored so a
 * seeker never inflates their own number by previewing their profile.
 *
 * Returns `{ isNew: true }` when this is the first view of the day for
 * this pair so the caller can fire a push notification exactly once per
 * employer per day.
 */
export async function recordView(input: {
  seekerId: string;
  viewerId: string;
}): Promise<{ isNew: boolean }> {
  if (input.seekerId === input.viewerId) return { isNew: false };
  const [row] = await getDb()
    .insert(profileViews)
    .values({ seekerId: input.seekerId, viewerId: input.viewerId, day: dayKey() })
    .onConflictDoNothing()
    .returning({ id: profileViews.id });
  return { isNew: Boolean(row) };
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
export async function summarize(seekerId: string): Promise<ProfileViewSummary> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const db = getDb();
  const [v7Row, v30Row, imp7Row] = await Promise.all([
    db
      .select({ n: sql<number>`count(distinct ${profileViews.viewerId})::int` })
      .from(profileViews)
      .where(and(eq(profileViews.seekerId, seekerId), gte(profileViews.createdAt, sevenDaysAgo))),
    db
      .select({ n: sql<number>`count(distinct ${profileViews.viewerId})::int` })
      .from(profileViews)
      .where(and(eq(profileViews.seekerId, seekerId), gte(profileViews.createdAt, thirtyDaysAgo))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(profileViews)
      .where(and(eq(profileViews.seekerId, seekerId), gte(profileViews.createdAt, sevenDaysAgo))),
  ]);

  return {
    viewersLast7Days: v7Row[0]?.n ?? 0,
    viewersLast30Days: v30Row[0]?.n ?? 0,
    impressionsLast7Days: imp7Row[0]?.n ?? 0,
  };
}
