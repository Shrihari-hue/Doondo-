/**
 * Employer profile detail — the trust card a seeker pulls up before
 * deciding to apply. Backed by GET /api/v1/employers/:id.
 */

import { apiRequest } from './client';
import type { PublicJob, PublicUser } from './types';

export interface EmployerStats {
  /** Total jobs the employer has ever posted. */
  jobsCount: number;
  /** Currently active jobs. */
  activeJobsCount: number;
  /** Applications this employer has marked as 'hired'. */
  hiresCount: number;
  /** Total applications this employer has received (all statuses). */
  totalApplications: number;
  /** Applications the anti-ghost sweep flagged as unanswered past the SLA. */
  ghostedCount: number;
  /**
   * Fraction of applications left to ghost (0..1). Null when the
   * employer has fewer than 5 applications — not enough data to judge.
   */
  ghostRate: number | null;
}

export interface EmployerProfile {
  employer: PublicUser;
  stats: EmployerStats;
  /** Newest 5 active jobs, sorted by createdAt desc. */
  recentJobs: PublicJob[];
}

export const employersApi = {
  getProfile: (id: string) =>
    apiRequest<EmployerProfile>(`/employers/${id}`),
};
