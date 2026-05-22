/**
 * Voice agent endpoint — strongly-typed wrapper around apiRequest.
 *
 * One call, `turn()`, runs a single conversational turn: the worker's
 * recognised speech goes up, a structured outcome comes back. The mobile
 * turns that outcome into a spoken sentence (the reply text lives in the
 * i18n files) and reads it aloud.
 *
 * The device does speech-to-text on its own (expo-speech-recognition)
 * and sends the resulting `transcript`. The backend also accepts a raw
 * audio clip, but the on-device path keeps requests small.
 */

import { apiRequest } from './client';
import type { PublicJob } from './types';

export type VoiceIntentKind = 'search' | 'apply' | 'repeat' | 'help' | 'unknown';

export interface VoiceIntent {
  kind: VoiceIntentKind;
  /** Present for a search — the trade keyword, or '' for a generic search. */
  query?: string;
  /** Present for an apply — the 1-based result position. */
  index?: number;
}

/** What happened this turn — each value maps to a localized spoken reply. */
export type VoiceOutcome =
  | 'results'
  | 'no_results'
  | 'applied'
  | 'already_applied'
  | 'apply_failed'
  | 'need_search_first'
  | 'repeat'
  | 'help'
  | 'not_understood';

export interface VoiceTurnResult {
  intent: VoiceIntent;
  outcome: VoiceOutcome;
  /** The transcript the agent acted on (echoed back). */
  transcript: string;
  /** Search results to read aloud + render as cards. */
  jobs: PublicJob[];
  /** The job an apply landed on (applied / already_applied outcomes). */
  appliedJob: { id: string; title: string } | null;
  /** Result ids to pass back on the next turn so "the second one" resolves. */
  contextJobIds: string[];
}

export interface VoiceTurnParams {
  /** The recognised speech for this turn. */
  transcript: string;
  /** The worker's coordinates — drives the job search. */
  lat: number;
  lng: number;
  /** Result ids from the previous turn. Omit on the first turn. */
  contextJobIds?: string[];
}

export const voiceAgentApi = {
  turn: (p: VoiceTurnParams) =>
    apiRequest<VoiceTurnResult>('/voice-agent/turn', {
      method: 'POST',
      body: {
        transcript: p.transcript,
        lat: p.lat,
        lng: p.lng,
        contextJobIds: p.contextJobIds ?? [],
      },
    }),
};
