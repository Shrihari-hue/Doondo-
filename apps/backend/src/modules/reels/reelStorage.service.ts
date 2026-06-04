/**
 * Reel storage — where a worker's intro-reel video actually lives.
 *
 * Hire Reels lets a blue-collar worker record a short video pitch.
 * Video is far too large to keep inline in MongoDB the way the tiny
 * base64 audio notes are, so it belongs on a media host / CDN.
 *
 * Provider pattern (same shape as transcription.service): a swappable
 * provider so a fresh checkout works with no media host at all — the
 * `mock` provider writes the clip to a local directory the API serves
 * statically (so the URL it returns is actually playable) — and a
 * production deploy flips one env var (`REEL_STORAGE_PROVIDER=http`)
 * to push the clip to whatever uploader/CDN it runs. Callers never see
 * the difference; `Reel.videoUrl` just holds whatever the provider
 * returns.
 *
 * `validateReel` is pure and synchronous — it is unit-tested in the
 * offline bootcheck.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { env } from '@/config/env';
import { logger } from '@/lib/logger';

/** A reel must be at least this many seconds — a 1-second clip is a misfire. */
export const MIN_REEL_SECONDS = 3;
/** …and at most this long. Matches the chat-video ceiling. */
export const MAX_REEL_SECONDS = 30;
/**
 * Base64 payload ceiling (~56MB ≈ ~40MB of raw video). The reel route
 * gets its own larger body-parser mount in server.ts so the global 4MB
 * JSON limit stays in place for every other endpoint. Keep this value
 * in sync with the client cap in apps/mobile/src/lib/reelVideo.ts and
 * with the JSON body-parser limit on `/api/v1/reels`. The `http`
 * provider can later accept much larger files via multipart.
 */
export const MAX_REEL_BASE64_BYTES = 56_000_000;

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
  /**
   * Best-effort cleanup when a worker removes their reel. Providers that
   * own the bytes (the mock disk store) reap the file; providers that
   * just forward to an external CDN can no-op — the CDN owns retention.
   */
  remove?(seekerId: string): Promise<void>;
}

// ─── Mock provider ──────────────────────────────────────────────────────────
// Writes the decoded video to a local directory the API serves statically,
// so on a fresh checkout (no CDN configured) the full record → store →
// play loop actually works. One file per worker — re-recording overwrites,
// matching the upsert semantics on the Reel row. Production deploys flip
// REEL_STORAGE_PROVIDER=http to push to a real CDN instead.

class MockReelStorageProvider implements ReelStorageProvider {
  /** Where files land on disk — defaults under the backend cwd. */
  private readonly dir: string;
  /** Public base URL bytes are served from (matches the static mount). */
  private readonly publicBase: string;

  constructor() {
    this.dir = path.resolve(process.cwd(), env.REEL_STORAGE_DIR);
    // Host-RELATIVE base. The mobile resolves it against the API base URL
    // it already talks to, so the video is always served from the same
    // reachable host — no need to keep PUBLIC_BASE_URL in sync with the
    // client's API_URL (the dev footgun that made reels "unavailable" on a
    // real device). The `http` CDN provider still returns absolute URLs.
    this.publicBase = '/media/reels';
  }

  /** Where a given seeker's reel lives on disk. */
  filePathFor(seekerId: string, ext = 'mp4'): string {
    return path.join(this.dir, `${seekerId}.${ext}`);
  }

  async store(input: ReelUploadInput): Promise<ReelStorageResult> {
    const match = input.dataUrl.match(/^data:([a-z0-9.+/-]+);base64,(.+)$/i);
    if (!match) throw new Error('Reel video is not a base64 data URL.');
    const declaredType = (input.mimeType || match[1] || 'video/mp4').toLowerCase();
    // Keep extensions tight — the player handles mp4/mov/webm. Unknown
    // types fall back to .mp4; the mime is what the player keys off of
    // when the static file server is properly configured (express.static
    // sets Content-Type from the file extension, which is why we map).
    const ext = declaredType.includes('quicktime')
      ? 'mov'
      : declaredType.includes('webm')
        ? 'webm'
        : 'mp4';

    const buffer = Buffer.from(match[2]!, 'base64');

    await fs.mkdir(this.dir, { recursive: true });
    // A worker only has one reel — clear any older file with a different
    // extension so we don't leave orphans behind a re-record.
    await this.removeAllVariants(input.seekerId);

    const filePath = this.filePathFor(input.seekerId, ext);
    await fs.writeFile(filePath, buffer);

    const videoUrl = `${this.publicBase}/${input.seekerId}.${ext}`;
    logger.info(
      {
        seekerId: input.seekerId,
        bytes: buffer.length,
        path: filePath,
        videoUrl,
      },
      'reel storage: mock provider wrote file to disk',
    );

    return {
      videoUrl,
      thumbnailUrl: null,
      provider: 'mock',
    };
  }

  async remove(seekerId: string): Promise<void> {
    await this.removeAllVariants(seekerId);
  }

  /** Delete every known extension for this seeker — cheap and idempotent. */
  private async removeAllVariants(seekerId: string): Promise<void> {
    await Promise.all(
      ['mp4', 'mov', 'webm'].map((ext) =>
        fs.rm(this.filePathFor(seekerId, ext), { force: true }).catch(() => {
          /* swallow — already gone */
        }),
      ),
    );
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

/**
 * Best-effort cleanup hook — called when a worker removes their reel.
 * Providers that own the bytes (the mock disk store) reap the file;
 * external CDNs no-op and own retention themselves.
 */
export async function removeReelVideo(seekerId: string): Promise<void> {
  const provider = pickProvider();
  if (!provider.remove) return;
  try {
    await provider.remove(seekerId);
  } catch (err) {
    // Don't fail the user-visible delete just because cleanup hiccuped —
    // the Reel row is already gone; the file is at worst orphaned.
    logger.warn({ seekerId, err }, 'reel storage: remove() failed');
  }
}

/** Test helper — swap in a fake provider. */
export function __setReelProviderForTests(
  provider: ReelStorageProvider | null,
): void {
  cachedProvider = provider;
}
