/**
 * Skill assessments API — catalogue + attempt submission.
 */

import { apiRequest } from './client';

export interface PublicSkillTest {
  id: string;
  title: string;
  tagline: string;
  emoji: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  durationMinutes: number;
  passingScore: number;
  questions: Array<{
    id: string;
    question: string;
    options: string[];
  }>;
}

export interface SkillTestAttempt {
  id: string;
  testId: string;
  score: number;
  passingScore: number;
  passed: boolean;
  createdAt: string;
  /** Server-issued timestamp telling the client when to allow another attempt. */
  cooldownUntil?: string | null;
}

export const skillTestsApi = {
  list: () => apiRequest<{ tests: PublicSkillTest[] }>('/skill-tests'),

  detail: (id: string) =>
    apiRequest<{ test: PublicSkillTest }>(`/skill-tests/${id}`),

  submit: (id: string, body: { answers: number[] }) =>
    apiRequest<{ attempt: SkillTestAttempt }>(
      `/skill-tests/${id}/attempts`,
      { method: 'POST', body },
    ),

  myAttempts: () =>
    apiRequest<{ attempts: SkillTestAttempt[] }>('/me/skill-test-attempts'),

  passedForSeeker: (seekerId: string) =>
    apiRequest<{ passedTestIds: string[] }>(`/seekers/${seekerId}/passed-tests`),
};
