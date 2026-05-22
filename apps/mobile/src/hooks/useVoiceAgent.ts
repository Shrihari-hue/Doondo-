/**
 * useVoiceAgent — conversation state for the voice job-search agent.
 *
 * Owns the short-term memory of a voice session: the log of turns, and
 * the `contextJobIds` that let "apply to the second one" resolve against
 * the results the agent last read out. Each turn is one round-trip to
 * `POST /voice-agent/turn`.
 *
 * Deliberately *not* responsible for speech: the hook returns structured
 * results, and the screen turns them into a spoken sentence (in the
 * worker's language, via i18n) and reads them aloud. Keeping i18n + TTS
 * in the view layer means this hook is plain, predictable state.
 */

import { useCallback, useRef, useState } from 'react';
import { voiceAgentApi, type VoiceTurnResult } from '@/api/voiceAgent.api';

export interface VoiceConversationTurn {
  /** Stable key for the conversation list. */
  id: string;
  /**
   * What the worker said. `null` for a turn started by tapping a card's
   * Apply button rather than by speaking.
   */
  userText: string | null;
  /** The structured result the agent returned. */
  result: VoiceTurnResult;
}

export interface UseVoiceAgentResult {
  /** The conversation so far, oldest first. */
  turns: VoiceConversationTurn[];
  /** A turn request is in flight. */
  busy: boolean;
  /** The last turn request itself failed (network / server error). */
  error: boolean;
  /** Submit recognised speech as a turn. Resolves with the new turn. */
  submit: (transcript: string) => Promise<VoiceConversationTurn | null>;
  /** Apply to one specific job — the card "Apply" button. Reuses the agent. */
  applyJob: (jobId: string) => Promise<VoiceConversationTurn | null>;
  /** Clear the conversation and its context. */
  reset: () => void;
}

export function useVoiceAgent(
  coords: { lat: number; lng: number } | null,
): UseVoiceAgentResult {
  const [turns, setTurns] = useState<VoiceConversationTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  // The result ids the agent last read aloud — the anchor for "apply to
  // the second one". A ref, not state: it is read inside callbacks and
  // should never itself trigger a re-render.
  const contextRef = useRef<string[]>([]);
  const seqRef = useRef(0);

  const runTurn = useCallback(
    async (
      transcript: string,
      userText: string | null,
      contextOverride?: string[],
    ): Promise<VoiceConversationTurn | null> => {
      if (!coords) {
        setError(true);
        return null;
      }
      setBusy(true);
      setError(false);
      try {
        const result: VoiceTurnResult = await voiceAgentApi.turn({
          transcript,
          lat: coords.lat,
          lng: coords.lng,
          contextJobIds: contextOverride ?? contextRef.current,
        });
        // Only a search re-anchors the context. An apply (whether by
        // voice or by a card tap) must leave the spoken result list
        // intact, so a later "apply the third one" still works.
        if (result.intent.kind === 'search') {
          contextRef.current = result.contextJobIds;
        }
        const turn: VoiceConversationTurn = {
          id: `t${++seqRef.current}`,
          userText,
          result,
        };
        setTurns((prev) => [...prev, turn]);
        return turn;
      } catch {
        setError(true);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [coords],
  );

  const submit = useCallback(
    (transcript: string) => runTurn(transcript, transcript),
    [runTurn],
  );

  const applyJob = useCallback(
    (jobId: string) => runTurn('apply', null, [jobId]),
    [runTurn],
  );

  const reset = useCallback(() => {
    setTurns([]);
    setError(false);
    contextRef.current = [];
  }, []);

  return { turns, busy, error, submit, applyJob, reset };
}
