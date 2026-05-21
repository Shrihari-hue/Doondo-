/**
 * Voice-note transcription — turn a chat voice message into text.
 *
 * Why this matters:
 *   Voice notes are the most natural way for many blue-collar workers
 *   to communicate — faster than typing, no literacy barrier. But the
 *   *recipient* may be on a noisy site, in a meeting, hard of hearing,
 *   or simply skimming a long thread. A transcript under every voice
 *   bubble makes the message readable and searchable without changing
 *   how the sender speaks.
 *
 * Provider pattern:
 *   Same shape as profileExtract.service — a swappable provider so a
 *   fresh checkout works with no API key (the `mock` provider) and a
 *   production deploy flips one env var to get real transcripts (the
 *   `openai` provider, Whisper). Callers never see the difference.
 *
 * Note: this transcribes, it does not translate. A worker speaking
 * Tamil gets a Tamil transcript — faithful to what was said.
 */

import { env } from '@/config/env';
import { logger } from '@/lib/logger';

export interface TranscriptionInput {
  /** Audio as a base64 data URL — `data:audio/m4a;base64,...`. */
  dataUrl: string;
  /** MIME type from the message attachment (e.g. `audio/m4a`). */
  mimeType: string;
}

export interface TranscriptionResult {
  /** The transcribed text. Empty string when nothing could be heard. */
  text: string;
  /** Which provider produced this — useful for logs / dev sanity. */
  provider: 'openai' | 'mock';
}

interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}

// ─── Mock provider ──────────────────────────────────────────────────────────
// Returns a deterministic, plausible transcript so the chat UX is
// end-to-end testable on a fresh checkout. Production deploys must set
// TRANSCRIPTION_PROVIDER=openai to get real transcripts.

class MockTranscriptionProvider implements TranscriptionProvider {
  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    logger.info(
      { audioBytes: input.dataUrl.length, mimeType: input.mimeType },
      'transcription: using mock provider',
    );
    return {
      text:
        'Hello, I saw your job post and I am interested. I can start soon — ' +
        'please let me know the timing and the location.',
      provider: 'mock',
    };
  }
}

// ─── OpenAI (Whisper) provider ──────────────────────────────────────────────
// Posts the audio to OpenAI's audio-transcription endpoint as multipart
// form data. Whisper is solidly multilingual, which matters for a
// five-language user base.

/** MIME → file extension. Whisper infers format partly from the name. */
const MIME_EXT: Record<string, string> = {
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

class OpenAITranscriptionProvider implements TranscriptionProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const match = input.dataUrl.match(/^data:([a-z0-9.+/-]+);base64,(.+)$/i);
    if (!match) {
      throw new Error('Voice attachment is not a base64 data URL.');
    }
    const declaredMime = match[1]!;
    const buffer = Buffer.from(match[2]!, 'base64');
    const mime = (input.mimeType || declaredMime).toLowerCase();
    const ext = MIME_EXT[mime] ?? 'm4a';

    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime }), `voice.${ext}`);
    form.append('model', this.model);

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error(
        { status: res.status, body: text.slice(0, 300) },
        'openai transcription call failed',
      );
      throw new Error(`Transcription failed (${res.status})`);
    }

    const json = (await res.json()) as { text?: unknown };
    const text = typeof json.text === 'string' ? json.text.trim() : '';
    return { text, provider: 'openai' };
  }
}

// ─── Provider picker ───────────────────────────────────────────────────────

let cachedProvider: TranscriptionProvider | null = null;

function pickProvider(): TranscriptionProvider {
  if (cachedProvider) return cachedProvider;
  if (env.TRANSCRIPTION_PROVIDER === 'openai') {
    if (!env.OPENAI_API_KEY) {
      throw new Error(
        'TRANSCRIPTION_PROVIDER=openai but OPENAI_API_KEY is not set.',
      );
    }
    cachedProvider = new OpenAITranscriptionProvider(
      env.OPENAI_API_KEY,
      env.TRANSCRIPTION_MODEL,
    );
  } else {
    cachedProvider = new MockTranscriptionProvider();
  }
  return cachedProvider;
}

/**
 * Transcribe one voice note. Throws on a configuration error or a
 * provider failure — callers (the chat send path) treat transcription
 * as best-effort and swallow the error so a failed transcript never
 * blocks the message itself.
 */
export async function transcribeAudio(
  input: TranscriptionInput,
): Promise<TranscriptionResult> {
  return pickProvider().transcribe(input);
}

/** Test helper — swap in a fake provider. */
export function __setProviderForTests(provider: TranscriptionProvider | null): void {
  cachedProvider = provider;
}
