/**
 * Shift check-in endpoints — record the worker arriving at / leaving
 * a job site. The selfie data URL is sent in the body (base64 image
 * data URL) along with the device's current coordinates.
 *
 * Both endpoints require the seeker to be the hired party on the
 * application. The list endpoint is readable by either side.
 */

import { apiRequest } from './client';
import type { PublicShiftCheckIn } from './types';

export interface CheckInPayload {
  selfieDataUrl: string;
  lat: number;
  lng: number;
  /** Optional client-side timestamp; defaults to server time. */
  timestamp?: string;
}

export const shiftCheckInApi = {
  checkIn: (applicationId: string, body: CheckInPayload) =>
    apiRequest<{ checkIn: PublicShiftCheckIn }>(
      `/applications/${applicationId}/check-in`,
      { method: 'POST', body },
    ),

  checkOut: (applicationId: string, body: CheckInPayload) =>
    apiRequest<{ checkIn: PublicShiftCheckIn }>(
      `/applications/${applicationId}/check-out`,
      { method: 'POST', body },
    ),

  list: (applicationId: string) =>
    apiRequest<{ checkIns: PublicShiftCheckIn[] }>(
      `/applications/${applicationId}/check-ins`,
    ),
};
