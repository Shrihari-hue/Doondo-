/**
 * Portfolio media storage — workplace photos, team photos and the
 * workplace video.
 *
 * Follows the same provider split as the rest of the media stack:
 *   - FILE_STORAGE_PROVIDER=mock (default): bytes are written to
 *     PORTFOLIO_STORAGE_DIR and served statically at /media/portfolio,
 *     so the whole Look Inside flow works on a fresh checkout. URLs are
 *     host-relative; the mobile resolves them with resolveMediaUrl().
 *   - FILE_STORAGE_PROVIDER=http: bytes go to FILE_UPLOAD_URL through the
 *     shared fileStorage uploader, which returns an absolute CDN URL.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { storeFile } from '@/modules/storage/fileStorage.service';

export const PORTFOLIO_PUBLIC_BASE = '/media/portfolio';

/** ~1.4MB decoded — compressed phone photos fit easily. */
export const MAX_IMAGE_BYTES = 1_500_000;
/** ~40MB decoded — a short (≤60 s) compressed workplace clip. */
export const MAX_VIDEO_BYTES = 42_000_000;

export const IMAGE_MIME = /^image\/(jpeg|jpg|png|webp)$/i;
export const VIDEO_MIME = /^video\/(mp4|quicktime|webm)$/i;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export function portfolioDir(): string {
  return path.resolve(process.cwd(), env.PORTFOLIO_STORAGE_DIR);
}

function decode(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:([a-z0-9.+/-]+);base64,(.+)$/i);
  if (!match) throw new Error('Upload is not a base64 data URL.');
  return { mime: match[1]!.toLowerCase(), buffer: Buffer.from(match[2]!, 'base64') };
}

export interface StoredMedia {
  url: string;
  sizeBytes: number;
}

/** Store one media file for an employer and return its URL. */
export async function storePortfolioMedia(input: {
  employerId: string;
  dataUrl: string;
  mimeType: string;
}): Promise<StoredMedia> {
  const { mime: declared, buffer } = decode(input.dataUrl);
  const mime = (input.mimeType || declared).toLowerCase();
  const ext = EXT[mime] ?? 'bin';
  const name = `${randomUUID()}.${ext}`;

  if (env.FILE_STORAGE_PROVIDER === 'http') {
    const res = await storeFile({
      ownerId: `portfolio-${input.employerId}`,
      dataUrl: input.dataUrl,
      mimeType: mime,
      fileName: name,
    });
    return { url: res.url, sizeBytes: res.sizeBytes };
  }

  const dir = path.join(portfolioDir(), input.employerId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buffer);
  const url = `${PORTFOLIO_PUBLIC_BASE}/${input.employerId}/${name}`;
  logger.info({ employerId: input.employerId, bytes: buffer.length, url }, 'portfolio storage: wrote file to disk');
  return { url, sizeBytes: buffer.length };
}

/** Best-effort delete of a file this provider wrote (mock only). */
export async function removePortfolioMedia(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith(`${PORTFOLIO_PUBLIC_BASE}/`)) return;
  const rel = url.slice(PORTFOLIO_PUBLIC_BASE.length + 1);
  // Only "<employerId>/<file>" — never let a crafted URL escape the dir.
  if (!/^[a-f0-9]{24}\/[\w-]+\.[a-z0-9]+$/i.test(rel)) return;
  await fs.rm(path.join(portfolioDir(), rel), { force: true }).catch(() => undefined);
}

/** Decoded size of a base64 data URL without allocating the buffer. */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}
