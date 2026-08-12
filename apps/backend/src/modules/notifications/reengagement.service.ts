/**
 * Dormant-user re-engagement sweep — the win-back nudge.
 *
 * Why this exists:
 *   The morning digest keeps *active* users warm. It does nothing for
 *   the user who stopped opening the app three weeks ago — and on a
 *   hiring marketplace, a lapsed user is a lost match on both sides:
 *   a seeker who never sees today's gig, an employer whose job never
 *   gets posted. This sweep is the one deliberate tap on the shoulder:
 *   "it's been a while, here's concretely what you're missing."
 *
 * Who it targets:
 *   A user is "dormant" when they haven't logged in for
 *   REENGAGEMENT_DORMANT_DAYS (default 14). Users who never logged in
 *   after signup fall back to `createdAt` for the same test.
 *
 * How it avoids being a pest:
 *   - Cooldown — a user pushed within REENGAGEMENT_COOLDOWN_DAYS
 *     (default 7) is skipped. At most one nudge per week.
 *   - Attempt cap — after REENGAGEMENT_MAX_ATTEMPTS (default 3)
 *     ignored nudges we stop entirely. The counter resets to 0 on the
 *     next login (auth.service), so a user who returns and lapses
 *     again is eligible for a fresh round.
 *   - Per-user notification prefs are honoured (seekers: `jobs`,
 *     employers: `applications`).
 *
 * Idempotency:
 *   `lastReengagedAt` is stamped after every push. A double-fire of the
 *   cron on the same day re-runs the query, sees `lastReengagedAt` is
 *   recent (not older than the cooldown cutoff), and skips everyone —
 *   so nobody is pushed twice.
 *
 * Content:
 *   The body is concrete, not generic. Seekers hear how many jobs were
 *   posted near them in the last week; employers hear how many workers
 *   joined near them. The count is looked up cheaply (one indexed
 *   count per distinct seeker city, cached for the run; one global count
 *   for employers).
 */

import { and, asc, count, eq, gt, gte, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { env } from '@/config/env';
import { sendReengagementPush } from '@/lib/push';
import { getDb } from '@/db/client';
import { jobs, users } from '@/db/schema';

const BATCH_SIZE = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Window for the "what's new near you" count in the nudge body. Fixed
 * at 7 days — independent of the dormancy threshold; it answers "what
 * has the user missed *recently*", which a week captures well.
 */
const RECENT_WINDOW_DAYS = 7;

export interface ReengagementSummary {
  /** Dormant users fetched and looked at this run. */
  considered: number;
  /** Users actually pushed this run. */
  pushed: number;
  /** Skipped because they opted out of the relevant notification type. */
  skippedOptedOut: number;
  /** Per-user assemble/send failures (sweep continues past them). */
  errors: number;
}

/**
 * Build the title + body for one re-engagement push. Pure and
 * exported so it can be unit-tested without a DB.
 *
 * `count` is the "what's new near you" number — recent jobs for a
 * seeker, recent new workers for an employer. A count of 0 still
 * sends (the user is dormant and worth a nudge); the copy just drops
 * the number and leans on the evergreen truth instead.
 */
export function buildReengagementBody(
  role: 'seeker' | 'employer',
  count: number,
): { title: string; body: string } {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;

  if (role === 'employer') {
    if (n > 0) {
      return {
        title: 'Workers are looking near you',
        body: `${n} new ${n === 1 ? 'worker' : 'workers'} joined near you this week. Post a job and start hiring in minutes.`,
      };
    }
    return {
      title: 'Hire your next worker',
      body: "Workers near you are looking for shifts. It's been a while — post a job and reach them today.",
    };
  }

  // seeker
  if (n > 0) {
    return {
      title: 'New jobs are waiting',
      body: `${n} new ${n === 1 ? 'job' : 'jobs'} posted near you in the last week. It's been a while — your next gig could be one tap away.`,
    };
  }
  return {
    title: 'Your next job is closer than you think',
    body: "New shifts get posted near you every day. It's been a while — come take a look.",
  };
}

/**
 * Run one re-engagement pass. Safe to call from cron or by hand.
 *
 * Paginates the user table by `id` so memory stays flat regardless of
 * table size. Per-user failures are logged and skipped — one corrupt
 * row never aborts the run.
 */
export async function runReengagementSweep(): Promise<ReengagementSummary> {
  const db = getDb();
  const summary: ReengagementSummary = {
    considered: 0,
    pushed: 0,
    skippedOptedOut: 0,
    errors: 0,
  };

  const now = Date.now();
  const dormantCutoff = new Date(now - env.REENGAGEMENT_DORMANT_DAYS * DAY_MS);
  const cooldownCutoff = new Date(now - env.REENGAGEMENT_COOLDOWN_DAYS * DAY_MS);
  const recentCutoff = new Date(now - RECENT_WINDOW_DAYS * DAY_MS);
  const maxAttempts = env.REENGAGEMENT_MAX_ATTEMPTS;

  // ── Content lookups ──────────────────────────────────────────────────
  // Employers all get the same global count; compute it once.
  let newWorkerCount = 0;
  try {
    const [row] = await db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, 'seeker'), eq(users.isActive, true), gte(users.createdAt, recentCutoff)));
    newWorkerCount = row?.n ?? 0;
  } catch (err) {
    logger.warn({ err }, 'reengagement: new-worker count failed; using 0');
  }

  // Seekers get a count for their own city. Cache per city for the run
  // so a city with 500 dormant seekers triggers one query, not 500.
  const cityJobCounts = new Map<string, number>();
  async function jobsNear(city: string | null | undefined): Promise<number> {
    const key = city && city.trim() ? city.trim() : '__any__';
    const cached = cityJobCounts.get(key);
    if (cached !== undefined) return cached;
    let n = 0;
    try {
      const [row] = await db
        .select({ n: count() })
        .from(jobs)
        .where(
          key !== '__any__'
            ? and(eq(jobs.status, 'active'), gte(jobs.createdAt, recentCutoff), eq(jobs.city, key))
            : and(eq(jobs.status, 'active'), gte(jobs.createdAt, recentCutoff)),
        );
      n = row?.n ?? 0;
    } catch (err) {
      logger.warn({ err, city: key }, 'reengagement: job count failed; using 0');
    }
    cityJobCounts.set(key, n);
    return n;
  }

  // ── The sweep ────────────────────────────────────────────────────────
  let lastId: string | null = null;
  while (true) {
    // Dormant: a real last-login older than the cutoff, OR never logged
    // in and the account itself is older than the cutoff.
    const dormantCond = or(
      and(sql`${users.lastLoginAt} IS NOT NULL`, lte(users.lastLoginAt, dormantCutoff)),
      and(sql`${users.lastLoginAt} IS NULL`, lte(users.createdAt, dormantCutoff)),
    );
    // Cooldown: never nudged, or last nudge older than the cooldown.
    const cooldownCond = or(
      sql`${users.lastReengagedAt} IS NULL`,
      lte(users.lastReengagedAt, cooldownCutoff),
    );

    const batch = await db
      .select({ id: users.id, role: users.role, location: users.location, notificationPrefs: users.notificationPrefs })
      .from(users)
      .where(
        and(
          eq(users.isActive, true),
          inArray(users.role, ['seeker', 'employer']),
          lt(users.reengagementAttempts, maxAttempts),
          dormantCond,
          cooldownCond,
          lastId ? gt(users.id, lastId) : undefined,
        ),
      )
      .orderBy(asc(users.id))
      .limit(BATCH_SIZE);
    if (batch.length === 0) break;

    const pushedIds: string[] = [];

    for (const user of batch) {
      summary.considered += 1;
      const userId = user.id;
      const role: 'seeker' | 'employer' =
        user.role === 'employer' ? 'employer' : 'seeker';

      // Honour the per-user opt-out. Seekers gate on `jobs`, employers
      // on `applications` — the closest existing pref to "stuff about
      // hiring". Missing keys default to opted-in.
      const prefs = user.notificationPrefs ?? {};
      const optedIn =
        role === 'employer' ? prefs.applications !== false : prefs.jobs !== false;
      if (!optedIn) {
        summary.skippedOptedOut += 1;
        continue;
      }

      try {
        const cnt =
          role === 'employer'
            ? newWorkerCount
            : await jobsNear(user.location?.city ?? null);
        const { title, body } = buildReengagementBody(role, cnt);
        await sendReengagementPush({ recipientId: userId, role, title, body });
        pushedIds.push(userId);
        summary.pushed += 1;
      } catch (err) {
        summary.errors += 1;
        logger.warn({ err, userId }, 'reengagement: per-user assemble/send failed');
      }
    }

    // Stamp everyone pushed in this batch in one write. `lastReengagedAt`
    // doubles as the cooldown guard and the same-day double-fire guard.
    if (pushedIds.length > 0) {
      try {
        await db
          .update(users)
          .set({ lastReengagedAt: new Date(), reengagementAttempts: sql`${users.reengagementAttempts} + 1` })
          .where(inArray(users.id, pushedIds));
      } catch (err) {
        // If the stamp fails the next run may re-push these users. That's
        // a tolerable failure mode (one extra nudge), so log and move on.
        logger.warn(
          { err, count: pushedIds.length },
          'reengagement: batch stamp failed',
        );
      }
    }

    lastId = batch[batch.length - 1]!.id;
    if (batch.length < BATCH_SIZE) break;
  }

  logger.info(summary, 'reengagement sweep complete');
  return summary;
}
