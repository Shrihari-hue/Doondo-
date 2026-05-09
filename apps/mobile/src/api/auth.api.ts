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
  phone?: string;
  /** Seeker-only: solo applicant or team. Carried from RolePicker. */
  workType?: 'solo' | 'team';
  /** Required when workType === 'team'. Numeric, 2..50. */
  teamSize?: number;
}

export interface LoginPayload {
  email: string;
  password: string;
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
};
