/**
 * Reel storage — where a worker's intro-reel video actually lives.
 *
 * Hire Reels lets a blue-collar worker record a short video pitch.
 * Video is far too large to keep inline in MongoDB the way the tiny
 * base64 audio notes are, so it belongs on a media host / CDN.
 *
 * Provider pattern (same shape as transcription.service): a swappable
 * provider so a fresh checkout works with no media host at all — the
 * `mock` provider returns a deterministic placeholder URL — and a
 * production deploy flips one env var (`REEL_STORAGE_PROVIDER=http`) to
 * push the clip to whatever uploader/CDN it runs. Callers never see the
 * difference; `Reel.videoUrl` just holds whatever the provider returns.
 *
 * `validateReel` is pure and synchronous — it is unit-tested in the
 * offline bootcheck.
 */

import { env } from '@/config/env';
import { logger } from '@/lib/logger';

/** A reel must be at least this many seconds — a 1-second clip is a misfire. */
export const MIN_REEL_SECONDS = 3;
/** …and at most this long. Matches the chat-video ceiling. */
export const MAX_REEL_SECONDS = 30;
/**
 * Base64 payload ceiling (~1.4MB) — the same bound the chat video and
 * audio attachments use, so it is known to pass the JSON body parser.
 * A short, low-quality clip fits comfortably; the `http` provider can
 * later accept larger files via multipart.
 */
export const MAX_REEL_BASE64_BYTES = 1_400_000;

export type ReelRejectReason = 'ok' | 'too_short' | 'too_long' | 'too_large' | 'bad_format';

export interface ReelValidation {
  ok: boolean;
  reason: ReelRejectReason;
}

/**
 * Check a candidate reel before it is stored. Pure — no I/O. The mobile
 * client also enforces these bounds, but the server is the source of
 * truth: a bad clip never reaches the storage provider.
 */
export function validateReel(input: {
  durationSeconds: number;
  base64Length: number;
  isDataUrl: boolean;
}): ReelValidation {
  if (!input.isDataUrl) return { ok: false, reason: 'bad_format' };
  if (input.durationSeconds < MIN_REEL_SECONDS) return { ok: false, reason: 'too_short' };
  if (input.durationSeconds > MAX_REEL_SECONDS) return { ok: false, reason: 'too_long' };
  if (input.base64Length > MAX_REEL_BASE64_BYTES) return { ok: false, reason: 'too_large' };
  return { ok: true, reason: 'ok' };
}

export interface ReelUploadInput {
  /** The worker whose reel this is — used to name the stored object. */
  seekerId: string;
  /** Video as a base64 data URL — `data:video/mp4;base64,...`. */
  dataUrl: string;
  /** MIME type of the clip. */
  mimeType: string;
}

export interface ReelStorageResult {
  /** Where the stored video can be played from. */
  videoUrl: string;
  /** Poster image, when the provider produced one. */
  thumbnailUrl: string | null;
  /** Which provider stored it — useful for logs / dev sanity. */
  provider: 'mock' | 'http';
}

interface ReelStorageProvider {
  store(input: ReelUploadInput): Promise<ReelStorageResult>;
}

// ─── Mock provider ──────────────────────────────────────────────────────────
// Returns a deterministic placeholder URL so the whole record → store →
// play flow is wired and testable on a fresh checkout. The URL is not a
// real playable file; a production deploy sets REEL_STORAGE_PROVIDER=http.

class MockReelStorageProvider implements ReelStorageProvider {
  async store(input: ReelUploadInput): Promise<ReelStorageResult> {
    logger.info(
      { seekerId: input.seekerId, videoBytes: input.dataUrl.length },
      'reel storage: using mock provider',
    );
    return {
      videoUrl: `https://reels.doondo.app/mock/${input.seekerId}.mp4`,
      thumbnailUrl: null,
      provider: 'mock',
    };
  }
}

// ─── HTTP-upload provider ───────────────────────────────────────────────────
// Posts the decoded video to whatever uploader/CDN the deploy configures
// via REEL_UPLOAD_URL, and expects a JSON `{ videoUrl, thumbnailUrl? }`
// back. Keeps the backend free of any specific cloud SDK.

class HttpReelStorageProvider implements ReelStorageProvider {
  constructor(
    private uploadUrl: string,
    private uploadToken: string | undefined,
  ) {}

  async store(input: ReelUploadInput): Promise<ReelStorageResult> {
    const match = input.dataUrl.match(/^data:([a-z0-9.+/-]+);base64,(.+)$/i);
    if (!match) throw new Error('Reel video is not a base64 data URL.');
    const buffer = Buffer.from(match[2]!, 'base64');

    const headers: Record<string, string> = {
      'Content-Type': input.mimeType || match[1]!,
      'X-Reel-Seeker': input.seekerId,
    };
    if (this.uploadToken) headers.Authorization = `Bearer ${this.uploadToken}`;

    const res = await fetch(this.uploadUrl, {
      method: 'POST',
      headers,
      body: buffer,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error(
        { status: res.status, body: text.slice(0, 300) },
        'reel upload call failed',
      );
      throw new Error(`Reel upload failed (${res.status})`);
    }
    const json = (await res.json()) as {
      videoUrl?: unknown;
      thumbnailUrl?: unknown;
    };
    if (typeof json.videoUrl !== 'string') {
      throw new Error('Reel uploader did not return a videoUrl.');
    }
    return {
      videoUrl: json.videoUrl,
      thumbnailUrl: typeof json.thumbnailUrl === 'string' ? json.thumbnailUrl : null,
      provider: 'http',
    };
  }
}

// ─── Provider picker ────────────────────────────────────────────────────────

let cachedProvider: ReelStorageProvider | null = null;

function pickProvider(): ReelStorageProvider {
  if (cachedProvider) return cachedProvider;
  if (env.REEL_STORAGE_PROVIDER === 'http') {
    if (!env.REEL_UPLOAD_URL) {
      throw new Error('REEL_STORAGE_PROVIDER=http but REEL_UPLOAD_URL is not set.');
    }
    cachedProvider = new HttpReelStorageProvider(
      env.REEL_UPLOAD_URL,
      env.REEL_UPLOAD_TOKEN,
    );
  } else {
    cachedProvider = new MockReelStorageProvider();
  }
  return cachedProvider;
}

/** Store one reel video and return where it lives. */
export async function storeReelVideo(
  input: ReelUploadInput,
): Promise<ReelStorageResult> {
  return pickProvider().store(input);
}

/** Test helper — swap in a fake provider. */
export function __setReelProviderForTests(
  provider: ReelStorageProvider | null,
): void {
  cachedProvider = provider;
}
