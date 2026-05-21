/**
 * Skill Passport — the worker's portable, verified work credential.
 *
 * One call returns the Doondo Score, per-skill verification status,
 * endorsements, passed trade tests, experience, and ratings. Seeker-only;
 * the server computes everything on the read path.
 */

import { apiRequest } from './client';
import type { SkillPassport } from './types';

export const skillPassportApi = {
  get: () => apiRequest<SkillPassport>('/me/skill-passport'),
};
