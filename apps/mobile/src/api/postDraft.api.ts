/**
 * Voice Command Posting endpoint — strongly-typed wrapper around
 * apiRequest. The employer-side mirror of voiceAgent.api.ts.
 *
 * One call, `voice()`, runs a single draft turn: the employer's
 * recognised speech ("2 dishwashers, Friday night, ₹600") goes up, a
 * structured draft job post comes back. The mobile pre-fills
 * PostJobScreen with the draft and prompts the employer to confirm or
 * complete any `missing` essentials before publishing through the normal
 * POST /jobs path.
 *
 * The device does speech-to-text on its own (expo-speech-recognition)
 * and sends the resulting `transcript`. The backend also accepts a raw
 * audio clip, but the on-device path keeps requests small.
 *
 * This endpoint never publishes — drafting and publishing stay separate
 * so a mis-heard wage can never silently go live.
 */

import { apiRequest } from './client';

/** A pay period a wage attaches to — mirrors the backend PAY_PERIODS. */
export type PayPeriod = 'hour' | 'day' | 'week' | 'month' | 'fixed';

/** A job type — mirrors the backend JOB_TYPES. */
export type JobType = 'full_time' | 'part_time' | 'gig' | 'shift' | 'contract';

/** An essential field the parser could not determine — prompt the employer. */
export type DraftMissingField = 'title' | 'wage' | 'jobType' | 'schedule';

/**
 * The structured draft. Every field is optional — the parser fills what
 * it heard and leaves the rest for the employer. Spreads straight into
 * the PostJobScreen form state.
 */
export interface JobDraft {
  title?: string;
  trade?: string;
  headcount?: number;
  wageAmount?: number;
  wagePeriod?: PayPeriod;
  jobType?: JobType;
  scheduleDays?: number[];
  startTime?: string;
  urgent?: boolean;
}

export interface PostDraftResult {
  /** The structured draft to pre-fill the post-job form. */
  draft: JobDraft;
  /** Essentials the parser couldn't determine — highlight these. */
  missing: DraftMissingField[];
  /** The transcript the parser acted on (echoed so the UI can show it). */
  transcript: string;
}

export interface PostDraftParams {
  /** The recognised speech for this turn. */
  transcript: string;
}

export const postDraftApi = {
  voice: (p: PostDraftParams) =>
    apiRequest<PostDraftResult>('/post-draft/voice', {
      method: 'POST',
      body: { transcript: p.transcript },
    }),
};
