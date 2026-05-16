/**
 * Contact-reveal API — gated phone-number lookup behind the one-tap
 * call buttons.
 *
 * The backend only returns a phone number after a real signal of
 * mutual interest exists (an Application either way, or an active
 * Availability beacon).
 */

import { apiRequest } from './client';

export interface RevealedContact {
  userId: string;
  /** Display name (companyName for employers, name for seekers). */
  name: string;
  /** May be null if the other party never set a phone. */
  phone: string | null;
}

export const contactApi = {
  /** Seeker → employer phone for a specific job. Requires an Application. */
  revealEmployer: (jobId: string) =>
    apiRequest<{ contact: RevealedContact }>(`/jobs/${jobId}/contact`),

  /** Employer → seeker phone. Requires Application OR active Availability. */
  revealSeeker: (seekerId: string) =>
    apiRequest<{ contact: RevealedContact }>(`/seekers/${seekerId}/contact`),
};
