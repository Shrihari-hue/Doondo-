/**
 * Feed ranking for the Short Term / Long Term Home.
 *
 * Two rules, in this order (the product's §16 and §17):
 *   1. Jobs in a trade the worker picked come before jobs that aren't.
 *   2. Within a group, nearest comes first.
 *
 * Nothing is ever dropped — a job outside the worker's preferences sinks
 * to "More jobs" rather than disappearing. A worker who set a narrow
 * preference list should still be able to see what else is out there.
 *
 * Pure functions, no React, no API — so the ordering is testable and the
 * feed components stay about layout.
 */

import { TRADES } from '@/lib/trades';
import type { JobType, PublicJob } from '@/api/types';

/**
 * Which `JobType`s count as short-term vs long-term work.
 *
 * This mapping is what lets the whole work-type feature run on the
 * existing jobs API with no backend change: `jobsApi.nearby()` already
 * accepts a `type` filter, and the seeker's own profile already stores
 * `preferredJobTypes` in exactly this vocabulary.
 *
 *   gig / shift                       → one-off or single-shift work
 *   full_time / part_time / contract  → an ongoing engagement
 *
 * They live here in the pure layer rather than in the store so the
 * ranking rules stay testable under plain node — the store pulls in
 * zustand and expo-secure-store, which this test suite deliberately
 * does not set up mocks for.
 */
export const SHORT_TERM_JOB_TYPES: JobType[] = ['gig', 'shift'];
export const LONG_TERM_JOB_TYPES: JobType[] = ['full_time', 'part_time', 'contract'];

/** How many of the worker's trades headline the Preferred Jobs rail. */
export const PRIMARY_TRADE_COUNT = 4;

/**
 * Does this posting belong to any of `slugs`?
 *
 * Checks the job's tagged skills first (employers who used the trade
 * picker produce exact slugs), then falls back to matching the title
 * against each trade's aliases — which is how a free-text posting like
 * "Need AC repair guy" still lands in an `ac_technician` worker's feed.
 */
export function jobMatchesTrades(job: PublicJob, slugs: readonly string[]): boolean {
  if (slugs.length === 0) return false;
  const wanted = new Set(slugs);

  for (const skill of job.skills ?? []) {
    if (wanted.has(skill.trim().toLowerCase())) return true;
  }

  const haystack = `${job.title} ${job.description ?? ''}`.toLowerCase();
  for (const trade of TRADES) {
    if (!wanted.has(trade.slug)) continue;
    if (haystack.includes(trade.slug.replace(/_/g, ' '))) return true;
    if (trade.label.toLowerCase().split(' —')[0] && haystack.includes(trade.label.toLowerCase().split(' —')[0]!)) {
      return true;
    }
    if (trade.aliases.some((a) => haystack.includes(a))) return true;
  }
  return false;
}

/**
 * Nearest first. Jobs the server didn't give a distance for sort last
 * rather than to the front — an unknown distance is not "0 km away".
 */
export function byNearest(a: PublicJob, b: PublicJob): number {
  const da = a.distanceMeters ?? Number.POSITIVE_INFINITY;
  const db = b.distanceMeters ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  // Stable tiebreak so the list doesn't shuffle between refetches.
  return a.id.localeCompare(b.id);
}

export function isShortTermJob(job: PublicJob): boolean {
  return (SHORT_TERM_JOB_TYPES as readonly string[]).includes(job.type);
}

export interface RankedFeed {
  /** Matches one of the worker's headline trades. The main feed. */
  preferred: PublicJob[];
  /** Matches a trade they picked, but not a headline one. */
  otherPreferences: PublicJob[];
  /** Outside their preferences entirely. Always last. */
  more: PublicJob[];
}

/**
 * Split `jobs` into the three feed sections and sort each nearest-first.
 *
 * `primaryTrades` are the worker's first few picks — the ones shown as
 * chips in the Preferred Jobs rail — so the rail and the section
 * underneath it always agree about what "preferred" means.
 */
export function rankFeed(jobs: PublicJob[], allTrades: readonly string[]): RankedFeed {
  const primary = allTrades.slice(0, PRIMARY_TRADE_COUNT);
  const secondary = allTrades.slice(PRIMARY_TRADE_COUNT);

  const preferred: PublicJob[] = [];
  const otherPreferences: PublicJob[] = [];
  const more: PublicJob[] = [];

  for (const job of jobs) {
    if (jobMatchesTrades(job, primary)) preferred.push(job);
    else if (jobMatchesTrades(job, secondary)) otherPreferences.push(job);
    else more.push(job);
  }

  preferred.sort(byNearest);
  otherPreferences.sort(byNearest);
  more.sort(byNearest);

  return { preferred, otherPreferences, more };
}
