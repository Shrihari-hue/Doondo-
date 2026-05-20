/**
 * calendar — drop an interview into the worker's device calendar.
 *
 * "Calendar hold" half of the interview-scheduler feature: the seeker
 * gets a 1-hour reminder push from the backend, but a real calendar
 * event means the interview also shows up in whatever calendar app
 * they (or their family) already check.
 *
 * Cross-platform notes:
 *   - iOS exposes `getDefaultCalendarAsync()`.
 *   - Android has no default-calendar API; we pick the first writable
 *     calendar (`allowsModifications`), preferring one owned by the
 *     user's primary account.
 *
 * All entry points lazy-import `expo-calendar` so the native module
 * doesn't load until the user actually taps "Add to calendar".
 */

import { Platform } from 'react-native';

export interface CalendarEventInput {
  title: string;
  startDate: Date;
  /** Defaults to startDate + 45 min when omitted. */
  endDate?: Date;
  location?: string | null;
  notes?: string | null;
}

export type AddToCalendarResult =
  | { ok: true; eventId: string }
  | { ok: false; reason: 'permission_denied' | 'no_calendar' | 'failed' };

/**
 * Add an event to the device calendar. Requests permission on first
 * use. Returns a discriminated result so the caller can show the
 * right toast without a try/catch.
 */
export async function addEventToCalendar(
  input: CalendarEventInput,
): Promise<AddToCalendarResult> {
  try {
    const Calendar = await import('expo-calendar');

    const perm = await Calendar.requestCalendarPermissionsAsync();
    if (!perm.granted) {
      return { ok: false, reason: 'permission_denied' };
    }

    const calendarId = await resolveWritableCalendarId(Calendar);
    if (!calendarId) {
      return { ok: false, reason: 'no_calendar' };
    }

    const endDate =
      input.endDate ?? new Date(input.startDate.getTime() + 45 * 60 * 1000);

    const eventId = await Calendar.createEventAsync(calendarId, {
      title: input.title,
      startDate: input.startDate,
      endDate,
      location: input.location ?? undefined,
      notes: input.notes ?? undefined,
      // One reminder 60 min ahead, mirroring the backend push lead time.
      alarms: [{ relativeOffset: -60 }],
    });

    return { ok: true, eventId };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Resolve a calendar id we're allowed to write to.
 *
 * iOS: the OS default calendar.
 * Android: the first modifiable calendar, preferring an `owner`
 * access level over a merely-writable shared calendar.
 */
async function resolveWritableCalendarId(
  Calendar: typeof import('expo-calendar'),
): Promise<string | null> {
  if (Platform.OS === 'ios') {
    try {
      const def = await Calendar.getDefaultCalendarAsync();
      if (def?.id) return def.id;
    } catch {
      // Fall through to the generic scan below.
    }
  }

  const calendars = await Calendar.getCalendarsAsync(
    Calendar.EntityTypes.EVENT,
  );
  const writable = calendars.filter((c) => c.allowsModifications);
  if (writable.length === 0) return null;

  // Prefer an owner-level calendar; fall back to the first writable one.
  const owned = writable.find(
    (c) => c.accessLevel === Calendar.CalendarAccessLevel.OWNER,
  );
  return (owned ?? writable[0]!).id;
}
