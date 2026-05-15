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
