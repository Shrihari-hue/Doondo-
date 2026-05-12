/**
 * Auth endpoints — strongly-typed wrappers around apiRequest.
 *
 * Components never call apiRequest directly for auth; they use these.
 */

import { apiRequest } from './client';
import type { AuthSuccess, PublicUser, TokenPair, UserRole } from './types';

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  /**
   * Required at signup so we have a recovery channel for password reset.
   * The backend rejects registrations without it.
   */
  phone: string;
  /** Seeker-only: solo applicant or team. Carried from RolePicker. */
  workType?: 'solo' | 'team';
  /** Required when workType === 'team'. Numeric, 2..50. */
  teamSize?: number;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ForgotPasswordResponse {
  /** Canonical E.164 phone the OTP was sent to. */
  phone: string;
  /** ISO timestamp — the OTP is no longer valid past this. */
  expiresAt: string;
}

export interface VerifyResetCodeResponse {
  /** Short-lived JWT to pass to resetPassword. */
  resetToken: string;
  /** TTL hint ("15m") so the UI can show a countdown if desired. */
  expiresIn: string;
}

export const authApi = {
  register: (body: RegisterPayload) =>
    apiRequest<AuthSuccess>('/auth/register', {
      method: 'POST',
      body,
      auth: false,
    }),

  login: (body: LoginPayload) =>
    apiRequest<AuthSuccess>('/auth/login', {
      method: 'POST',
      body,
      auth: false,
    }),

  refresh: (refreshToken: string) =>
    apiRequest<{ tokens: TokenPair }>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      auth: false,
    }),

  logout: (refreshToken: string) =>
    apiRequest<{ success: boolean }>('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
      auth: false,
    }),

  me: () => apiRequest<{ user: PublicUser }>('/auth/me'),

  // ─── Password reset ────────────────────────────────────────────────────
  // Three-step flow. Each is unauthenticated; the resetToken acts as the
  // capability the user carries between steps two and three.

  forgotPassword: (phone: string) =>
    apiRequest<ForgotPasswordResponse>('/auth/forgot-password', {
      method: 'POST',
      body: { phone },
      auth: false,
    }),

  verifyResetCode: (phone: string, code: string) =>
    apiRequest<VerifyResetCodeResponse>('/auth/verify-reset-code', {
      method: 'POST',
      body: { phone, code },
      auth: false,
    }),

  resetPassword: (resetToken: string, newPassword: string) =>
    apiRequest<{ success: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: { resetToken, newPassword },
      auth: false,
    }),
};
