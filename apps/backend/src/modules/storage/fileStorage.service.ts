/**
 * File storage — where uploaded documents (skill certificates, licences,
 * proof photos) actually live.
 *
 * Unlike the tiny base64 audio notes, these files belong on a media
 * host / CDN so the user document stays small and the files are served
 * straight from cloud storage.
 *
 * Provider pattern (same shape as reelStorage.service): a swappable
 * provider so a fresh checkout works with no media host — the `mock`
 * provider returns a deterministic placeholder URL — and a production
 * deploy flips one env var (`FILE_STORAGE_PROVIDER=http`) to push the
 * file to whatever uploader / CDN it runs. Callers only ever see the
 * returned URL.
 */

import { env } from '@/config/env';
import { logger } from '@/lib/logger';

/**
 * Base64 payload ceiling (~1.4MB) — the proven bound the reel/video and
 * audio attachments use, so it is known to pass the JSON body parser.
 * A certificate PDF or a proof photo fits comfortably; the `http`
 * provider can later accept larger files via multipart.
 */
export const MAX_FILE_BASE64_BYTES = 1_400_000;

/** MIME types accepted for an uploaded skill document. */
export const ALLOWED_FILE_MIME = /^(application\/pdf|image\/(jpeg|jpg|png|webp))$/i;

export interface FileUploadInput {
  /** Who owns the file — namespaces the stored object. */
  ownerId: string;
  /** The file as a base64 data URL. */
  dataUrl: string;
  /** MIME type of the file. */
  mimeType: string;
  /** Original file name — preserved in the stored object's name. */
  fileName: string;
}

export interface FileStorageResult {
  /** Where the stored file can be fetched from. */
  url: string;
  /** Size of the decoded file in bytes. */
  sizeBytes: number;
  /** Which provider stored it — useful for logs / dev sanity. */
  provider: 'mock' | 'http';
}

interface FileStorageProvider {
  store(input: FileUploadInput): Promise<FileStorageResult>;
}

/** Decoded-byte size of a base64 data URL's payload. */
function decodedSize(dataUrl: string): number {
  const b64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
  // 4 base64 chars → 3 bytes, minus padding.
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/** Slugify a file name so it's safe inside a URL path. */
function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'file'
  );
}

// ─── Mock provider ──────────────────────────────────────────────────────────
// Returns a deterministic placeholder URL so the whole pick → upload →
// show flow is wired and testable on a fresh checkout. The URL is not a
// real fetchable file; a production deploy sets FILE_STORAGE_PROVIDER=http.

class MockFileStorageProvider implements FileStorageProvider {
  async store(input: FileUploadInput): Promise<FileStorageResult> {
    const sizeBytes = decodedSize(input.dataUrl);
    logger.info(
      { ownerId: input.ownerId, sizeBytes, mimeType: input.mimeType },
      'file storage: using mock provider',
    );
    return {
      url: `https://files.doondo.app/mock/${input.ownerId}/${Date.now()}-${slugifyName(
        input.fileName,
      )}`,
      sizeBytes,
      provider: 'mock',
    };
  }
}

// ─── HTTP-upload provider ───────────────────────────────────────────────────
// Posts the decoded file to whatever uploader / CDN the deploy configures
// via FILE_UPLOAD_URL, and expects a JSON `{ url }` back. Keeps the
// backend free of any specific cloud SDK.

class HttpFileStorageProvider implements FileStorageProvider {
  constructor(
    private uploadUrl: string,
    private uploadToken: string | undefined,
  ) {}

  async store(input: FileUploadInput): Promise<FileStorageResult> {
    const match = input.dataUrl.match(/^data:([a-z0-9.+/-]+);base64,(.+)$/i);
    if (!match) throw new Error('File is not a base64 data URL.');
    const buffer = Buffer.from(match[2]!, 'base64');

    const headers: Record<string, string> = {
      'Content-Type': input.mimeType || match[1]!,
      'X-File-Owner': input.ownerId,
      'X-File-Name': slugifyName(input.fileName),
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
        'file upload call failed',
      );
      throw new Error(`File upload failed (${res.status})`);
    }
    const json = (await res.json()) as { url?: unknown };
    if (typeof json.url !== 'string') {
      throw new Error('File uploader did not return a url.');
    }
    return { url: json.url, sizeBytes: buffer.length, provider: 'http' };
  }
}

// ─── Provider picker ────────────────────────────────────────────────────────

let cachedProvider: FileStorageProvider | null = null;

function pickProvider(): FileStorageProvider {
  if (cachedProvider) return cachedProvider;
  if (env.FILE_STORAGE_PROVIDER === 'http') {
    if (!env.FILE_UPLOAD_URL) {
      throw new Error('FILE_STORAGE_PROVIDER=http but FILE_UPLOAD_URL is not set.');
    }
    cachedProvider = new HttpFileStorageProvider(
      env.FILE_UPLOAD_URL,
      env.FILE_UPLOAD_TOKEN,
    );
  } else {
    cachedProvider = new MockFileStorageProvider();
  }
  return cachedProvider;
}

/** Store one uploaded file and return where it lives. */
export async function storeFile(
  input: FileUploadInput,
): Promise<FileStorageResult> {
  return pickProvider().store(input);
}

/** Test helper — swap in a fake provider. */
export function __setFileProviderForTests(
  provider: FileStorageProvider | null,
): void {
  cachedProvider = provider;
}
