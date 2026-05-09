/**
 * Verification — phone OTP + selfie capture flow.
 *
 * Three-step state machine on the backend:
 *   startPhone  → sends OTP, returns canonical phone + expiresAt
 *   verifyPhone → confirms OTP, marks status='pending'
 *   uploadSelfie → completes verification, marks status='verified'
 *
 * Errors map to typed ApiErrorCode values from ./types so callers can
 * branch on them deterministically (wrong code, expired, exhausted,
 * already verified, etc).
 */

import { apiRequest } from './client';
import type { PublicUser } from './types';

export interface StartPhoneResponse {
  /** Canonical E.164 phone the OTP was sent to (the user may have typed bare digits). */
  phone: string;
  /** ISO timestamp; the OTP is no longer valid after this. */
  expiresAt: string;
}

export const verificationApi = {
  /** Read the current verification state — used to refresh after restart. */
  getStatus: () =>
    apiRequest<{ user: PublicUser }>(`/verification/status`, { method: 'GET' }),

  /** Step 1: send an OTP to a phone number. */
  startPhone: (phone: string) =>
    apiRequest<StartPhoneResponse>(`/verification/phone/start`, {
      method: 'POST',
      body: { phone },
    }),

  /** Step 2: confirm the 6-digit code. Returns the updated user record. */
  verifyPhone: (phone: string, code: string) =>
    apiRequest<{ user: PublicUser }>(`/verification/phone/verify`, {
      method: 'POST',
      body: { phone, code },
    }),

  /**
   * Step 3: upload the selfie (base64 data URL). On success the user comes
   * back with isVerified=true.
   */
  uploadSelfie: (selfieUrl: string) =>
    apiRequest<{ user: PublicUser }>(`/verification/selfie`, {
      method: 'POST',
      body: { selfieUrl },
    }),
};
