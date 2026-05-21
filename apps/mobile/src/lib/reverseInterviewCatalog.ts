/**
 * Reverse Interview catalog.
 *
 * The five questions a worker has always wanted to ask an employer but
 * rarely could: do you pay on time, is overtime paid, is there safety
 * gear, a written contract, separate facilities for women. The employer
 * answers them when posting a job; the worker reads the answers on the
 * job detail *before* applying. It's a quiet power flip — the terms are
 * on the record, in public, up front.
 *
 * `field` matches the `WorkplaceAnswers` field on the Job model exactly,
 * so the same catalog drives both the employer's answer form and the
 * seeker's read-only panel. `key` is the i18n path for the question
 * text. The matching strings live under `reverse_interview.*` in every
 * locale file.
 */

import type { WorkplaceAnswers } from '@/api/types';

export type WorkplaceQuestionField =
  | 'paysOnTime'
  | 'overtimePaid'
  | 'providesPpe'
  | 'writtenContract'
  | 'womensFacilities';

export interface WorkplaceQuestion {
  /** Matches the Job model's WorkplaceAnswers field name. */
  field: WorkplaceQuestionField;
  /** i18n key for the question text. */
  key: string;
}

/** The five questions, in the order they're shown on both screens. */
export const WORKPLACE_QUESTIONS: ReadonlyArray<WorkplaceQuestion> = [
  { field: 'paysOnTime', key: 'reverse_interview.q.pays_on_time' },
  { field: 'overtimePaid', key: 'reverse_interview.q.overtime_paid' },
  { field: 'providesPpe', key: 'reverse_interview.q.provides_ppe' },
  { field: 'writtenContract', key: 'reverse_interview.q.written_contract' },
  { field: 'womensFacilities', key: 'reverse_interview.q.womens_facilities' },
];

/**
 * True when at least one question has a real (non-null) answer — the
 * gate the seeker's panel uses to decide whether to render at all.
 */
export function hasAnyAnswer(answers: WorkplaceAnswers | null | undefined): boolean {
  if (!answers) return false;
  return WORKPLACE_QUESTIONS.some(
    (q) => answers[q.field] === true || answers[q.field] === false,
  );
}
