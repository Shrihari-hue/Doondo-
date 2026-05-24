/**
 * Festival service — resolves which festival (if any) is relevant to a
 * given worker right now.
 *
 * "Relevant" means two things:
 *   - the date is inside a festival window, and
 *   - the festival is either national, or regional to the worker's city.
 *
 * It also returns the next upcoming festival within ~12 days so the
 * mobile banner can show a countdown ("Diwali in 3 days").
 *
 * Dates are evaluated in IST — festivals are an India-wide concern and
 * the server may run in UTC.
 */

import { UserModel } from '@/modules/users/user.model';
import { FESTIVALS, type FestivalConfig } from './festival.config';

/** The festival shape sent to the mobile client. */
export interface PublicFestival {
  id: string;
  name: string;
  emoji: string;
  accent: string;
  accentSoft: string;
  trades: string[];
}

export interface FestivalState {
  /** The festival active today for this worker, or null. */
  active: PublicFestival | null;
  /** The next festival starting within ~12 days, for the countdown. */
  upcoming: { festival: PublicFestival; daysUntil: number } | null;
}

/** Today's date as ISO yyyy-mm-dd, in IST (UTC+5:30). */
function todayInIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

/** Whole days between two ISO yyyy-mm-dd dates (to − from). */
function daysBetween(fromISO: string, toISO: string): number {
  const ms = Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function toPublic(f: FestivalConfig): PublicFestival {
  return {
    id: f.id,
    name: f.name,
    emoji: f.emoji,
    accent: f.accent,
    accentSoft: f.accentSoft,
    trades: f.trades,
  };
}

/**
 * Does this worker's city make the festival relevant? National
 * festivals (empty `regions`) always match; a regional festival matches
 * only when the worker's city overlaps one of its region keywords.
 */
function isRelevant(city: string | null, festival: FestivalConfig): boolean {
  if (festival.regions.length === 0) return true;
  if (!city) return false;
  const c = city.trim().toLowerCase();
  if (!c) return false;
  return festival.regions.some((r) => c.includes(r) || r.includes(c));
}

/**
 * The festival state for one worker — what's active and what's coming
 * up, filtered to festivals relevant to their region.
 */
export async function getFestivalStateForUser(
  userId: string,
): Promise<FestivalState> {
  const user = await UserModel.findById(userId).select('location').lean();
  const city =
    (user?.location && (user.location as { city?: string | null }).city) || null;

  const today = todayInIST();
  let active: PublicFestival | null = null;
  let upcoming: { festival: PublicFestival; daysUntil: number } | null = null;

  for (const festival of FESTIVALS) {
    if (!isRelevant(city, festival)) continue;
    for (const w of festival.windows) {
      if (today >= w.start && today <= w.end) {
        active = toPublic(festival);
      } else if (w.start > today) {
        const daysUntil = daysBetween(today, w.start);
        if (daysUntil >= 0 && daysUntil <= 12) {
          if (!upcoming || daysUntil < upcoming.daysUntil) {
            upcoming = { festival: toPublic(festival), daysUntil };
          }
        }
      }
    }
  }

  return { active, upcoming };
}
