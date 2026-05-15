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
