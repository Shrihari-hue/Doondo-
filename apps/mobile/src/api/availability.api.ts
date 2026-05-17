/**
 * Availability API — the seeker's "I'm available right now" beacon and
 * the employer's nearby-workers lookup that feeds off it.
 */

import { apiRequest } from './client';
import type { JobType } from './types';

/**
 * Recurring beacon window — "every Mon/Wed/Fri 7am-10am". When set, the
 * employer matcher treats the seeker as live whenever now() falls
 * inside today's pattern window, even past `until` for one-shot beacons.
 */
export interface RecurringPattern {
  /** Days of week (0=Sun..6=Sat). */
  days: number[];
  /** HH:MM in 24h. */
  startTime: string;
  /** HH:MM in 24h. */
  endTime: string;
}

export interface PublicAvailability {
  id: string;
  seekerId: string;
  tradesAvailable: string[];
  jobTypes: JobType[];
  location: {
    city: string | null;
    area: string | null;
    coordinates: [number, number];
  };
  /** ISO8601 — beacon auto-expires at this time, TTL-deleted by the backend. */
  until: string;
  /** Weekly recurring window, when the seeker has standing availability. */
  recurringPattern: RecurringPattern | null;
  note: string | null;
  createdAt: string;
}

export interface PublishAvailabilityPayload {
  /** How long the beacon stays live — 15..480 minutes. */
  durationMinutes: number;
  lat: number;
  lng: number;
  city?: string | null;
  area?: string | null;
  tradesAvailable?: string[];
  jobTypes?: JobType[];
  note?: string | null;
  /**
   * Optional weekly recurring window. When set, the beacon stays in the
   * index for 30 days and the seeker is "live now" only inside the
   * pattern window. Null = one-shot beacon (the legacy v1 shape).
   */
  recurringPattern?: RecurringPattern | null;
}

export interface NearbyAvailability extends PublicAvailability {
  distanceMeters: number;
  seeker: {
    id: string;
    name: string;
    photoUrl: string | null;
    skills: string[];
    isVerified: boolean;
    phone: string | null;
    rating: { avg: number; count: number } | null;
  };
}

export interface NearbyAvailabilitiesParams {
  lat: number;
  lng: number;
  radius?: number;
  trade?: string;
  type?: JobType;
  limit?: number;
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export const availabilityApi = {
  getMine: () =>
    apiRequest<{ availability: PublicAvailability | null }>('/me/availability'),

  publish: (body: PublishAvailabilityPayload) =>
    apiRequest<{ availability: PublicAvailability }>('/me/availability', {
      method: 'POST',
      body,
    }),

  withdraw: () =>
    apiRequest<{ withdrawn: true }>('/me/availability', { method: 'DELETE' }),

  nearby: (p: NearbyAvailabilitiesParams) =>
    apiRequest<{ availabilities: NearbyAvailability[] }>(
      `/availabilities/nearby${qs({
        lat: p.lat,
        lng: p.lng,
        radius: p.radius,
        trade: p.trade,
        type: p.type,
        limit: p.limit,
      })}`,
    ),
};
