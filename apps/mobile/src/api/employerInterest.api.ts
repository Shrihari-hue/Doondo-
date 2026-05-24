/**
 * Employer-interest API — the worker→employer inbound-interest flow.
 *
 * A worker on an employer's public profile can raise a standing "I'd
 * like to work for you" signal even when that employer has no live job.
 * The employer sees the inbound list in their Find-workers surface.
 */

import { apiRequest } from './client';

export type EmployerInterestStatus = 'pending' | 'viewed' | 'archived';

export interface EmployerInterest {
  id: string;
  status: EmployerInterestStatus;
  message: string | null;
  seekerId: string;
  employerId: string;
  viewedAt: string | null;
  createdAt: string;
  /** Present on the employer's inbound-list view. */
  seeker?: {
    id: string;
    name: string;
    photoUrl: string | null;
    isVerified: boolean;
    skills: string[];
    rating: { avg: number; count: number } | null;
  };
}

export const employerInterestApi = {
  /** Worker raises (or refreshes) interest in an employer. */
  express: (employerId: string, message?: string | null) =>
    apiRequest<{ interest: EmployerInterest }>(
      `/employers/${employerId}/interest`,
      { method: 'POST', body: { message: message ?? null } },
    ),

  /** Worker withdraws their interest. */
  withdraw: (employerId: string) =>
    apiRequest<{ withdrawn: true }>(`/employers/${employerId}/interest`, {
      method: 'DELETE',
    }),

  /** Worker checks whether they've already expressed interest. */
  mine: (employerId: string) =>
    apiRequest<{ interest: EmployerInterest | null }>(
      `/employers/${employerId}/interest/mine`,
    ),

  /** Employer — the inbound list of interested workers. */
  listForEmployer: (status?: EmployerInterestStatus) =>
    apiRequest<{ interests: EmployerInterest[] }>(
      `/me/interested-workers${status ? `?status=${status}` : ''}`,
    ),

  /** Employer marks one interest row as seen. */
  markViewed: (id: string) =>
    apiRequest<{ interest: EmployerInterest }>(
      `/me/interested-workers/${id}/viewed`,
      { method: 'POST' },
    ),

  /** Employer clears one interest row from their active list. */
  archive: (id: string) =>
    apiRequest<{ interest: EmployerInterest }>(
      `/me/interested-workers/${id}/archive`,
      { method: 'POST' },
    ),
};
