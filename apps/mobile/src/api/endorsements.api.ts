/**
 * Endorsements API — employers vouch for seekers per-trade. The
 * verified-trade badge surfaces on profile + applicant cards when
 * an endorsement count crosses the backend threshold.
 */

import { apiRequest } from './client';

export interface TradeEndorsementSummary {
  /** Trade slug (lowercased). */
  trade: string;
  count: number;
  /** True when count >= the backend threshold (currently 3). */
  verified: boolean;
}

export interface PublicEndorsement {
  id: string;
  endorserId: string;
  endorserName: string;
  endorserCompanyName: string | null;
  seekerId: string;
  trade: string;
  applicationId: string | null;
  createdAt: string;
}

export interface PhotoVerificationSummary {
  photoIndex: number;
  count: number;
}

export const endorsementsApi = {
  /** Per-trade endorsement counts for a seeker. Public. */
  listForSeeker: (seekerId: string) =>
    apiRequest<{ endorsements: TradeEndorsementSummary[] }>(
      `/seekers/${seekerId}/endorsements`,
    ),

  /** Employer endorses a seeker for a specific trade. */
  endorse: (
    seekerId: string,
    body: { trade: string; applicationId?: string },
  ) =>
    apiRequest<{ endorsement: PublicEndorsement }>(
      `/seekers/${seekerId}/endorse`,
      { method: 'POST', body },
    ),

  /** Per-photo verification counts for a seeker. Public. */
  listPhotoVerifications: (seekerId: string) =>
    apiRequest<{ verifications: PhotoVerificationSummary[] }>(
      `/seekers/${seekerId}/photo-verifications`,
    ),

  /** Employer verifies a specific work photo on the seeker's profile. */
  verifyPhoto: (
    seekerId: string,
    body: { photoIndex: number; applicationId?: string },
  ) =>
    apiRequest<{ verification: { id: string; photoIndex: number } }>(
      `/seekers/${seekerId}/verify-photo`,
      { method: 'POST', body },
    ),
};
