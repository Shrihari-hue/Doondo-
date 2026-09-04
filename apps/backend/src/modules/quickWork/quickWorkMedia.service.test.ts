import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupTestData,
  closeDb,
  createTestQuickWorkRequest,
  createTestService,
  createTestUser,
  ensureDb,
} from '@/test/helpers';
import * as quickWorkService from './quickWork.service';
import { removeMedia, uploadMedia } from './quickWorkMedia.service';

/** A 1x1 JPEG as a base64 data URL — small, real, and a valid allowed MIME. */
const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const TINY_M4A = 'data:audio/m4a;base64,AAAAHGZ0eXBNNEEgAAAAAE00QSBpc29tbXA0Mg==';

describe('quickWorkMedia.service', () => {
  const userIds: string[] = [];
  const quickWorkRequestIds: string[] = [];
  const serviceIds: string[] = [];
  const categoryIds: string[] = [];

  beforeAll(() => {
    ensureDb();
  });

  afterAll(async () => {
    await cleanupTestData({ userIds, quickWorkRequestIds, serviceIds, categoryIds });
    await closeDb();
  });

  async function draftRequest() {
    const employer = await createTestUser('employer');
    userIds.push(employer.id);
    const { categoryId, serviceId } = await createTestService();
    categoryIds.push(categoryId);
    serviceIds.push(serviceId);
    const row = await createTestQuickWorkRequest(employer.id, serviceId, { status: 'draft' });
    quickWorkRequestIds.push(row.id);
    return { employer, requestId: row.id, serviceId };
  }

  it('attaches a photo to the draft and can remove it again', async () => {
    const { employer, requestId } = await draftRequest();

    const withPhoto = await uploadMedia(requestId, employer.id, {
      kind: 'photo',
      dataUrl: TINY_JPEG,
      mimeType: 'image/jpeg',
      fileName: 'leak.jpg',
    });
    expect(withPhoto.photos).toHaveLength(1);
    const url = withPhoto.photos[0]!;

    const afterRemove = await removeMedia(requestId, employer.id, { kind: 'photo', url });
    expect(afterRemove.photos).toHaveLength(0);
  });

  it('attaches a voice note and clears it', async () => {
    const { employer, requestId } = await draftRequest();

    const withVoice = await uploadMedia(requestId, employer.id, {
      kind: 'voice',
      dataUrl: TINY_M4A,
      mimeType: 'audio/m4a',
      fileName: 'note.m4a',
    });
    expect(withVoice.voiceNoteUrl).not.toBeNull();

    const cleared = await removeMedia(requestId, employer.id, { kind: 'voice' });
    expect(cleared.voiceNoteUrl).toBeNull();
  });

  it('rejects a mime type that does not match the declared kind', async () => {
    const { employer, requestId } = await draftRequest();
    await expect(
      uploadMedia(requestId, employer.id, {
        kind: 'photo',
        dataUrl: TINY_M4A,
        mimeType: 'audio/m4a',
        fileName: 'not-a-photo.m4a',
      }),
    ).rejects.toMatchObject({ code: 'QUICK_WORK_MEDIA_INVALID' });
  });

  it('rejects an upload from anyone other than the owning employer', async () => {
    const { requestId } = await draftRequest();
    const stranger = await createTestUser('employer');
    userIds.push(stranger.id);
    await expect(
      uploadMedia(requestId, stranger.id, {
        kind: 'photo',
        dataUrl: TINY_JPEG,
        mimeType: 'image/jpeg',
        fileName: 'x.jpg',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('rejects adding media once the request has left DRAFT', async () => {
    const { employer, requestId } = await draftRequest();
    await quickWorkService.post(requestId, employer.id);
    await expect(
      uploadMedia(requestId, employer.id, {
        kind: 'photo',
        dataUrl: TINY_JPEG,
        mimeType: 'image/jpeg',
        fileName: 'late.jpg',
      }),
    ).rejects.toMatchObject({ code: 'QUICK_WORK_MEDIA_INVALID' });
  });

  it('keeps attached media readable by the matched worker, but not by an unrelated user', async () => {
    const { employer, serviceId } = await draftRequest();

    const worker = await createTestUser('seeker');
    const outsider = await createTestUser('seeker');
    userIds.push(worker.id, outsider.id);

    const matched = await createTestQuickWorkRequest(employer.id, serviceId, {
      status: 'accepted',
      matchedWorkerId: worker.id,
      photos: [`https://files.doondo.app/mock/${employer.id}/site.jpg`],
      acceptedAt: new Date(),
    });
    quickWorkRequestIds.push(matched.id);

    const asWorker = await quickWorkService.getById(matched.id, worker.id);
    expect(asWorker.photos).toHaveLength(1);

    await expect(quickWorkService.getById(matched.id, outsider.id)).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
    });
  });
});
