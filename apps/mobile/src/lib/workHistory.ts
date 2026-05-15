/**
 * Helpers shared by the Resume Builder + Resume Preview screens.
 */

import type { WorkExperience } from '@/api/types';

/**
 * Format a YYYY-MM string as "Apr 2024". Returns the raw input on parse
 * failure so the UI never crashes on a malformed value.
 */
export function formatMonthYear(yyyymm: string): string {
  const m = yyyymm.match(/^(\d{4})-(\d{2})$/);
  if (!m) return yyyymm;
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return yyyymm;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[monthIdx]} ${year}`;
}

/** "Apr 2024 — Present" or "Apr 2024 — Jul 2024". */
export function formatRange(entry: WorkExperience): string {
  const start = formatMonthYear(entry.startDate);
  const end =
    entry.current || !entry.endDate ? 'Present' : formatMonthYear(entry.endDate);
  return `${start} — ${end}`;
}

/**
 * Sort newest-first by startDate. Current jobs always sort to the top.
 * Defensive copy so callers can pass derived state.
 */
export function sortWorkHistory(entries: WorkExperience[]): WorkExperience[] {
  return [...entries].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    if (a.startDate > b.startDate) return -1;
    if (a.startDate < b.startDate) return 1;
    return 0;
  });
}

/**
 * Total months between start and end (or now, when current). Used by the
 * preview to show "2 yr 4 mo" tenure pills.
 */
export function tenureMonths(entry: WorkExperience): number {
  const start = parseYYYYMM(entry.startDate);
  if (!start) return 0;
  const end = entry.current
    ? new Date()
    : entry.endDate
      ? parseYYYYMM(entry.endDate) ?? new Date()
      : new Date();
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  return Math.max(0, months + 1);
}

export function formatTenure(months: number): string {
  if (months < 1) return '<1 mo';
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${years} yr`;
  return `${years} yr ${rem} mo`;
}

function parseYYYYMM(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

/** YYYY-MM for the current month. Used as the default `endDate` value. */
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Suggested Job Alert from work history ──────────────────────────────────

import type { JobType, PublicUser } from '@/api/types';

export interface SuggestedAlert {
  name: string;
  query: string | null;
  city: string | null;
  jobTypes: JobType[];
  urgentOnly: boolean;
}

/**
 * Derive a Job Alert suggestion from the seeker's Resume Builder data.
 *
 * Heuristic: take the seeker's most recent role (current first, else
 * newest by startDate) and use it as both the alert name and the search
 * query. City defaults to the seeker's saved home city. Job types
 * inherit from the seeker's `preferredJobTypes` (empty list = "any").
 *
 * Returns `null` when there's nothing useful to seed from — caller
 * should just hide the suggestion banner.
 */
export function suggestedAlertFromUser(user: PublicUser): SuggestedAlert | null {
  const history = user.workHistory ?? [];
  if (history.length === 0) return null;

  const sorted = sortWorkHistory(history);
  const latest = sorted[0];
  if (!latest || !latest.role.trim()) return null;

  const role = latest.role.trim();
  const city = user.location?.city?.trim() || null;

  // Title-case for the alert name so it reads cleanly in the list.
  const titleCased = role
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');

  return {
    name: city ? `${titleCased} in ${city}` : `${titleCased} jobs`,
    query: role.toLowerCase(),
    city,
    jobTypes: user.preferredJobTypes ?? [],
    urgentOnly: false,
  };
}
