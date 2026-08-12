/**
 * Referral types — seeker A shared a job, seeker B applied via the link,
 * and (eventually) got hired. A earns a wallet credit when B's
 * application hits `hired`. The actual row lives in Postgres (see
 * src/db/schema); this file holds the pure TS types/consts still shared
 * with the service.
 *
 * Lifecycle:
 *   pending  → application created with a ?ref=A on the apply call
 *   hired    → B's application reached `hired`; bonus credited to A
 *   reverted → B's hire was rolled back (rare); bonus debited
 */

export const REFERRAL_STATUSES = ['pending', 'hired', 'reverted'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

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
