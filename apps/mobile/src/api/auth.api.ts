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
  /**
   * Optional — required only when this email holds multiple accounts
   * (one per role) on the server. The first login call goes out without
   * `role`; if the server responds with `needsRoleChoice`, the UI shows
   * a picker and re-calls login with the chosen role.
   */
  role?: UserRole;
}

/**
 * Server response when login is ambiguous: the email has more than one
 * account (e.g. a seeker AND an employer account on the same email) and
 * we don't know which one the user means yet. The client renders a
 * picker and re-submits with `role` set.
 */
export interface LoginNeedsRoleChoice {
  needsRoleChoice: true;
  availableRoles: UserRole[];
}

export type LoginResponse = AuthSuccess | LoginNeedsRoleChoice;

/** Type guard for the disambiguation branch of LoginResponse. */
export function isLoginRoleChoice(
  res: LoginResponse,
): res is LoginNeedsRoleChoice {
  return (res as LoginNeedsRoleChoice).needsRoleChoice === true;
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
    apiRequest<LoginResponse>('/auth/login', {
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
