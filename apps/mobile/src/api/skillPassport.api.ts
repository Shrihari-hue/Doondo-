/**
 * Skill Passport — the worker's portable, verified work credential.
 *
 * One call returns the Doondo Score, per-skill verification status,
 * endorsements, passed trade tests, experience, and ratings. Seeker-only;
 * the server computes everything on the read path.
 */

import { apiRequest } from './client';
import type { SkillPassport } from './types';
import type { QrMatrix } from './doondoScore.api';

/** A signed, QR-shareable Skill Passport credential (90-day validity). */
export interface PassportCredential {
  code: string;
  verifyUrl: string;
  issuedAt: string;
  expiresAt: string;
  skillsVerified: number;
  qr: QrMatrix;
}

export const skillPassportApi = {
  get: () => apiRequest<SkillPassport>('/me/skill-passport'),
  /** Mint (or refresh) the signed passport credential. Same code across refreshes. */
  issueCredential: () =>
    apiRequest<{ credential: PassportCredential }>('/me/passport-credential', { method: 'POST' }).then(
      (r) => r.credential,
    ),
};
