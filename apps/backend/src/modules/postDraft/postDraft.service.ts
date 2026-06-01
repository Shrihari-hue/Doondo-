/**
 * Post-draft service — runs one turn of employer Voice Command Posting.
 *
 * The flow per turn mirrors the seeker voice agent:
 *   1. The mobile records the employer speaking and (with the speech-to-
 *      text layer) turns it into a transcript — or sends a raw audio clip.
 *   2. This service resolves a transcript (transcribing the clip via the
 *      shared transcription service when the device didn't), then runs the
 *      deterministic `parseJobDraft`.
 *   3. It returns the structured draft + the list of essential fields the
 *      parser could not determine.
 *   4. The mobile pre-fills PostJobScreen with the draft and prompts the
 *      employer to confirm or complete the `missing` fields before
 *      publishing through the same `createJob` path the typed form uses.
 *
 * Nothing here posts a job on its own: drafting and publishing are kept
 * separate so a mis-heard wage can never silently go live. The employer
 * always confirms. That confirm step also means this service needs no
 * write access — it is a pure read/parse turn, which keeps it cheap and
 * safe to call on every pause in dictation.
 */

import { logger } from '@/lib/logger';
import { transcribeAudio } from '@/modules/transcription/transcription.service';
import { parseJobDraft, type ParsedDraft } from './postDraft.parser';

export interface PostDraftInput {
  /** The authenticated employer dictating the post. */
  employerId: string;
  /** Recognised speech, when the device transcribed on-device. */
  transcript?: string;
  /** A base64 audio data URL, when the device did not. */
  audioDataUrl?: string;
  /** MIME type of the audio clip (defaults to audio/m4a). */
  mimeType?: string;
}

export interface PostDraftResult extends ParsedDraft {
  /** The transcript the parser acted on, echoed so the UI can show it. */
  transcript: string;
}

/**
 * Resolve a transcript (preferring the device's text, else transcribing
 * the clip), parse it into a draft, and return both. Never throws on a
 * mis-parse — an empty utterance simply comes back as an empty draft with
 * every essential listed under `missing`, which the UI handles as "tell
 * me about the job" rather than an error.
 */
export async function runPostDraftTurn(
  input: PostDraftInput,
): Promise<PostDraftResult> {
  let transcript = (input.transcript ?? '').trim();

  if (!transcript && input.audioDataUrl) {
    const result = await transcribeAudio({
      dataUrl: input.audioDataUrl,
      mimeType: input.mimeType ?? 'audio/m4a',
    });
    transcript = result.text.trim();
  }

  const parsed = parseJobDraft(transcript);

  logger.info(
    {
      employerId: input.employerId,
      heardTrade: parsed.draft.trade ?? '(none)',
      headcount: parsed.draft.headcount ?? 1,
      wage: parsed.draft.wageAmount ?? null,
      missing: parsed.missing,
    },
    'employer voice post-draft',
  );

  return { ...parsed, transcript };
}
