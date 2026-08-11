/**
 * ShiftCheckIn types — durable record of a worker arriving at (or leaving)
 * a hired job site. The actual row lives in Postgres (see
 * src/db/schema/applications.ts); this file holds the pure TS types/consts
 * still shared across routes and the service.
 */

export const SHIFT_CHECKIN_KINDS = ['check_in', 'check_out'] as const;
export type ShiftCheckInKind = (typeof SHIFT_CHECKIN_KINDS)[number];

export interface PublicShiftCheckIn {
  id: string;
  applicationId: string;
  seekerId: string;
  employerId: string;
  jobId: string;
  kind: ShiftCheckInKind;
  /** Selfie URL — present only when the caller is the seeker or the employer on this application. */
  selfieUrl: string | null;
  location: { lat: number; lng: number };
  distanceFromJobMeters: number | null;
  timestamp: string;
  createdAt: string;
}
