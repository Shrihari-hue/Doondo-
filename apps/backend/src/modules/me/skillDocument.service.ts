/**
 * Skill documents — the worker's uploaded proof files, per skill.
 *
 * A worker attaches a certificate, licence, training document, or photo
 * to a skill they claim. The file is pushed to cloud storage (see
 * fileStorage.service); only the URL + metadata land on the user record.
 * Employers see these grouped by skill on the applicant view, which
 * makes a claimed trade credible.
 */

import { randomUUID } from 'node:crypto';
import { errors } from '@/lib/errors';
import {
  UserModel,
  type PublicUser,
  type SkillDocumentKind,
} from '@/modules/users/user.model';
import {
  storeFile,
  MAX_FILE_BASE64_BYTES,
  ALLOWED_FILE_MIME,
} from '@/modules/storage/fileStorage.service';

/** Caps — generous, since each entry is just a URL + metadata. */
const MAX_PER_SKILL = 5;
const MAX_TOTAL = 40;

export interface AddSkillDocumentInput {
  /** Skill slug the file is proof for. */
  skill: string;
  /** The file as a base64 data URL. */
  dataUrl: string;
  /** Original file name. */
  fileName: string;
  mimeType: string;
}

/** A document is a 'photo' when it's an image, otherwise a 'document'. */
function inferKind(mimeType: string): SkillDocumentKind {
  return /^image\//i.test(mimeType) ? 'photo' : 'document';
}

/**
 * Upload one proof file for a skill and attach it to the worker.
 * Returns the updated public user.
 *
 * Throws `notFound` / `validation` / `conflict` on bad input.
 */
export async function addSkillDocument(
  userId: string,
  input: AddSkillDocumentInput,
): Promise<PublicUser> {
  const user = await UserModel.findById(userId);
  if (!user) throw errors.notFound('User not found.');

  if (!ALLOWED_FILE_MIME.test(input.mimeType)) {
    throw errors.validation(
      { mimeType: 'unsupported' },
      'Only PDF and image files can be attached.',
    );
  }
  if (input.dataUrl.length > MAX_FILE_BASE64_BYTES) {
    throw errors.validation(
      { dataUrl: 'too_large' },
      'That file is too large — please attach a smaller one.',
    );
  }

  const docs = user.skillDocuments ?? [];
  if (docs.length >= MAX_TOTAL) {
    throw errors.conflict('You have reached the maximum number of skill files.');
  }
  if (docs.filter((d) => d.skill === input.skill).length >= MAX_PER_SKILL) {
    throw errors.conflict(`You can attach up to ${MAX_PER_SKILL} files per skill.`);
  }

  const stored = await storeFile({
    ownerId: userId,
    dataUrl: input.dataUrl,
    mimeType: input.mimeType,
    fileName: input.fileName,
  });

  user.skillDocuments = [
    ...docs,
    {
      id: randomUUID(),
      skill: input.skill.trim().toLowerCase(),
      url: stored.url,
      fileName: input.fileName.trim().slice(0, 200),
      mimeType: input.mimeType,
      kind: inferKind(input.mimeType),
      sizeBytes: stored.sizeBytes,
      uploadedAt: new Date(),
    },
  ];
  await user.save();
  return user.toPublicJSON();
}

/** Remove one skill document by id. Returns the updated public user. */
export async function removeSkillDocument(
  userId: string,
  docId: string,
): Promise<PublicUser> {
  const user = await UserModel.findById(userId);
  if (!user) throw errors.notFound('User not found.');

  user.skillDocuments = (user.skillDocuments ?? []).filter((d) => d.id !== docId);
  await user.save();
  return user.toPublicJSON();
}
