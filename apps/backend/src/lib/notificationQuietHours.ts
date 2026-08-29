/**
 * Per-user notification quiet hours — a local (IST) hour window during
 * which only SOS pings should land; every other push category is held
 * back. Mirrors the midnight-wrap-safe math the employer-side response
 * quiet-hours setting already uses (see
 * employerResponse.service.ts's isWithinQuietHours) rather than
 * reinventing it.
 */

import { istHour } from '@/modules/employerResponse/employerResponse.service';
import type { NotificationPrefsJson } from '@/db/schema';

export function isInQuietHours(
  quietHours: NotificationPrefsJson['quietHours'] | null | undefined,
  now: Date,
): boolean {
  if (!quietHours) return false;
  const { start, end } = quietHours;
  if (start === end) return false;
  const hour = istHour(now);
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
