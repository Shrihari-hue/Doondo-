/**
 * Skill Passport — the worker's portable, verified work credential.
 *
 * One call returns the Doondo Score, per-skill verification status,
 * endorsements, passed trade tests, experience, and ratings. Seeker-only;
 * the server computes everything on the read path.
 */

import { apiRequest } from './client';
import type { PassportSkill, PassportTest, SkillPassport } from './types';
import type { QrMatrix } from './doondoScore.api';

export type { QrMatrix };

/** A signed, QR-shareable Skill Passport credential. */
export interface PassportCredential {
  /** Short lookup code embedded in the QR URL. */
  code: string;
  /** Public verification URL the QR encodes. */
  verifyUrl: string;
  score: number;
  memberSince: string;
  skills: PassportSkill[];
  verifiedSkillCount: number;
  skillTests: PassportTest[];
  jobsCompleted: number;
  ratings: { avg: number | null; count: number };
  issuedAt: string;
  expiresAt: string;
  qr: QrMatrix;
}

export const skillPassportApi = {
  get: () => apiRequest<SkillPassport>('/me/skill-passport'),

  /**
   * Mint a fresh signed, QR-shareable Skill Passport credential for the
   * caller. Same pattern as doondoScoreApi.credential() — the QR
   * encodes a public verification URL anyone can open to confirm it.
   */
  credential: () =>
    apiRequest<{ credential: PassportCredential }>('/me/passport-credential', {
      method: 'POST',
    }),
};
