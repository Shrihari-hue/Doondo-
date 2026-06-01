/**
 * Work-proof service — submit, review, and read the end-of-shift work
 * photo. Authorisation is by membership on the underlying application:
 * only the hired worker submits, only that application's employer
 * reviews, and either side may read.
 */

import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { ApplicationModel } from '@/modules/applications/application.model';
import { WorkProofModel, type WorkProofStatus } from './workProof.model';

export interface PublicWorkProof {
  status: WorkProofStatus | 'none';
  photoUrl: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}

const NONE: PublicWorkProof = {
  status: 'none',
  photoUrl: null,
  submittedAt: null,
  reviewedAt: null,
};

/** ~550KB cap matches the shift-selfie limit; a data:image/ URL only. */
const MAX_PHOTO_CHARS = 600_000;

export async function submitProof(
  seekerId: string,
  applicationId: string,
  photoDataUrl: string,
): Promise<PublicWorkProof> {
  if (typeof photoDataUrl !== 'string' || !photoDataUrl.startsWith('data:image/')) {
    throw errors.validation({ photoDataUrl: 'invalid' }, 'photo must be an image data URL.');
  }
  if (photoDataUrl.length > MAX_PHOTO_CHARS) {
    throw errors.validation({ photoDataUrl: 'too_large' }, 'photo is too large.');
  }

  const app = await ApplicationModel.findById(applicationId).lean();
  if (!app) throw errors.applicationNotFound();
  if ((app.seekerId as unknown as Types.ObjectId).toString() !== seekerId) {
    throw errors.forbidden();
  }
  if (app.status !== 'hired') {
    throw errors.conflict('You can submit work proof once you are hired.');
  }

  const now = new Date();
  const doc = await WorkProofModel.findOneAndUpdate(
    { applicationId: new Types.ObjectId(applicationId) },
    {
      $set: {
        seekerId: app.seekerId,
        employerId: app.employerId,
        photoUrl: photoDataUrl,
        status: 'submitted',
        submittedAt: now,
        reviewedAt: null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  return toPublic(doc);
}

export async function reviewProof(
  employerId: string,
  applicationId: string,
  approve: boolean,
): Promise<PublicWorkProof> {
  const proof = await WorkProofModel.findOne({
    applicationId: new Types.ObjectId(applicationId),
  });
  if (!proof) throw errors.conflict('No work proof has been submitted yet.');
  if ((proof.employerId as unknown as Types.ObjectId).toString() !== employerId) {
    throw errors.forbidden();
  }
  proof.status = approve ? 'approved' : 'rejected';
  proof.reviewedAt = new Date();
  await proof.save();
  return toPublic(proof.toObject() as Parameters<typeof toPublic>[0]);
}

export async function getProof(
  callerId: string,
  applicationId: string,
): Promise<PublicWorkProof> {
  const app = await ApplicationModel.findById(applicationId).lean();
  if (!app) throw errors.applicationNotFound();
  const isSeeker = (app.seekerId as unknown as Types.ObjectId).toString() === callerId;
  const isEmployer = (app.employerId as unknown as Types.ObjectId).toString() === callerId;
  if (!isSeeker && !isEmployer) throw errors.forbidden();

  const proof = await WorkProofModel.findOne({
    applicationId: new Types.ObjectId(applicationId),
  }).lean();
  return proof ? toPublic(proof) : { ...NONE };
}

function toPublic(p: {
  status: WorkProofStatus;
  photoUrl: string;
  submittedAt: Date;
  reviewedAt?: Date | null;
}): PublicWorkProof {
  return {
    status: p.status,
    photoUrl: p.photoUrl,
    submittedAt: p.submittedAt ? new Date(p.submittedAt).toISOString() : null,
    reviewedAt: p.reviewedAt ? new Date(p.reviewedAt).toISOString() : null,
  };
}
