/**
 * Referrals API — the seeker's own referral history + summary.
 */

import { apiRequest } from './client';

export type ReferralStatus = 'pending' | 'hired' | 'reverted';

export interface PublicReferral {
  id: string;
  referrerId: string;
  refereeId: string;
  jobId: string;
  applicationId: string | null;
  status: ReferralStatus;
  bonusPaise: number | null;
  hiredAt: string | null;
  createdAt: string;
}

export interface ReferralSummary {
  total: number;
  hired: number;
  totalBonusPaise: number;
}

export const referralsApi = {
  myReferrals: () =>
    apiRequest<{ referrals: PublicReferral[]; summary: ReferralSummary }>(
      '/me/referrals',
    ),
};
