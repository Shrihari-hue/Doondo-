/**
 * Media capture for the employer's Quick Work request (gap #2) —
 * photo / video / voice note attached to a DRAFT before posting.
 *
 * Deliberately thin: reuses `storeFile()` (the same cloud-storage
 * provider already used for skill-document uploads, see
 * modules/storage/fileStorage.service.ts) rather than inventing a second
 * upload pipeline, and writes straight into the `photos`/`videos`/
 * `voiceNoteUrl` columns that already existed on `quick_work_requests`
 * (see db/schema/quickWork.ts — these columns predate this file; only the
 * upload endpoint to fill them was missing).
 *
 * Only reachable while the request is still a DRAFT, mirroring
 * `updateDraft()`'s own restriction — media is part of the progressive
 * request-creation wizard, not something attached after posting.
 *
 * Authorization: only the owning employer can upload/remove. Read access
 * to the resulting URLs is already gated the same way every other Quick
 * Work field is — `getById`/`getOwnedRow` only let the employer or the
 * matched worker see the request at all (quickWork.service.ts). The
 * storage layer itself doesn't add per-file ACLs, same as the existing
 * skill-document/reel uploads — not a new gap introduced here.
 */

import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { errors } from '@/lib/errors';
import { quickWorkRequests, type QuickWorkRequest } from '@/db/schema';
import { storeFile, MAX_FILE_BASE64_BYTES } from '@/modules/storage/fileStorage.service';
import { getById as getRequestById, type PublicQuickWorkRequest } from './quickWork.service';

export type MediaKind = 'photo' | 'video' | 'voice';

const IMAGE_MIME = /^image\/(jpeg|jpg|png|webp)$/i;
const VIDEO_MIME = /^video\/(mp4|quicktime|webm)$/i;
const VOICE_MIME = /^audio\/(m4a|mp4|aac|mpeg|webm|ogg|wav|x-m4a)$/i;

const MAX_PHOTOS = 6;
const MAX_VIDEOS = 2;

function mimeFor(kind: MediaKind): RegExp {
  return kind === 'photo' ? IMAGE_MIME : kind === 'video' ? VIDEO_MIME : VOICE_MIME;
}

async function getOwnedDraft(id: string, employerId: string): Promise<QuickWorkRequest> {
  const [row] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, id)).limit(1);
  if (!row) throw errors.quickWorkNotFound();
  if (row.employerId !== employerId) throw errors.forbidden();
  if (row.status !== 'draft') {
    throw errors.quickWorkMediaInvalid('Media can only be added while the request is still a draft.');
  }
  return row;
}

export interface UploadMediaInput {
  kind: MediaKind;
  dataUrl: string;
  mimeType: string;
  fileName: string;
}

export async function uploadMedia(
  id: string,
  employerId: string,
  input: UploadMediaInput,
): Promise<PublicQuickWorkRequest> {
  const row = await getOwnedDraft(id, employerId);

  if (!mimeFor(input.kind).test(input.mimeType)) {
    throw errors.quickWorkMediaInvalid(`Unsupported ${input.kind} format.`);
  }
  if (input.dataUrl.length > MAX_FILE_BASE64_BYTES) {
    throw errors.quickWorkMediaInvalid('That file is too large — please use a smaller one.');
  }
  if (input.kind === 'photo' && (row.photos ?? []).length >= MAX_PHOTOS) {
    throw errors.quickWorkMediaInvalid(`You can attach up to ${MAX_PHOTOS} photos.`);
  }
  if (input.kind === 'video' && (row.videos ?? []).length >= MAX_VIDEOS) {
    throw errors.quickWorkMediaInvalid(`You can attach up to ${MAX_VIDEOS} videos.`);
  }

  const stored = await storeFile({
    ownerId: employerId,
    dataUrl: input.dataUrl,
    mimeType: input.mimeType,
    fileName: input.fileName,
  });

  const patch: Partial<typeof quickWorkRequests.$inferInsert> =
    input.kind === 'photo'
      ? { photos: [...(row.photos ?? []), stored.url] }
      : input.kind === 'video'
        ? { videos: [...(row.videos ?? []), stored.url] }
        : { voiceNoteUrl: stored.url };

  const [updated] = await getDb()
    .update(quickWorkRequests)
    .set(patch)
    .where(and(eq(quickWorkRequests.id, id), eq(quickWorkRequests.status, 'draft')))
    .returning();
  if (!updated) throw errors.quickWorkMediaInvalid('Media can only be added while the request is still a draft.');

  return getRequestById(id, employerId);
}

export interface RemoveMediaInput {
  kind: MediaKind;
  /** Required for photo/video (which url to drop); ignored for voice. */
  url?: string;
}

export async function removeMedia(
  id: string,
  employerId: string,
  input: RemoveMediaInput,
): Promise<PublicQuickWorkRequest> {
  const row = await getOwnedDraft(id, employerId);

  const patch: Partial<typeof quickWorkRequests.$inferInsert> =
    input.kind === 'photo'
      ? { photos: (row.photos ?? []).filter((u) => u !== input.url) }
      : input.kind === 'video'
        ? { videos: (row.videos ?? []).filter((u) => u !== input.url) }
        : { voiceNoteUrl: null };

  await getDb()
    .update(quickWorkRequests)
    .set(patch)
    .where(and(eq(quickWorkRequests.id, id), eq(quickWorkRequests.status, 'draft')));

  return getRequestById(id, employerId);
}
