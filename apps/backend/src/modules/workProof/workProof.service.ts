/**
 * Work-proof service — submit, review, and read the end-of-shift work
 * photo. Authorisation is by membership on the underlying application:
 * only the hired worker submits, only that application's employer
 * reviews, and either side may read.
 */

import { eq } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { getDb } from '@/db/client';
import { applications, workProofs, type WorkProofStatus } from '@/db/schema';

export type { WorkProofStatus };

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

type WorkProofRow = typeof workProofs.$inferSelect;

function toPublic(p: WorkProofRow): PublicWorkProof {
  return {
    status: p.status,
    photoUrl: p.photoUrl,
    submittedAt: p.submittedAt ? p.submittedAt.toISOString() : null,
    reviewedAt: p.reviewedAt ? p.reviewedAt.toISOString() : null,
  };
}

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

  const db = getDb();
  const [app] = await db
    .select({ seekerId: applications.seekerId, employerId: applications.employerId, status: applications.status })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) throw errors.applicationNotFound();
  if (app.seekerId !== seekerId) {
    throw errors.forbidden();
  }
  if (app.status !== 'hired') {
    throw errors.conflict('You can submit work proof once you are hired.');
  }

  const now = new Date();
  const [doc] = await db
    .insert(workProofs)
    .values({
      applicationId,
      seekerId: app.seekerId,
      employerId: app.employerId,
      photoUrl: photoDataUrl,
      status: 'submitted',
      submittedAt: now,
      reviewedAt: null,
    })
    .onConflictDoUpdate({
      target: workProofs.applicationId,
      set: {
        seekerId: app.seekerId,
        employerId: app.employerId,
        photoUrl: photoDataUrl,
        status: 'submitted',
        submittedAt: now,
        reviewedAt: null,
        updatedAt: now,
      },
    })
    .returning();
  return toPublic(doc!);
}

export async function reviewProof(
  employerId: string,
  applicationId: string,
  approve: boolean,
): Promise<PublicWorkProof> {
  const db = getDb();
  const [proof] = await db.select().from(workProofs).where(eq(workProofs.applicationId, applicationId)).limit(1);
  if (!proof) throw errors.conflict('No work proof has been submitted yet.');
  if (proof.employerId !== employerId) {
    throw errors.forbidden();
  }
  const [updated] = await db
    .update(workProofs)
    .set({ status: approve ? 'approved' : 'rejected', reviewedAt: new Date() })
    .where(eq(workProofs.id, proof.id))
    .returning();
  return toPublic(updated!);
}

export async function getProof(
  callerId: string,
  applicationId: string,
): Promise<PublicWorkProof> {
  const db = getDb();
  const [app] = await db
    .select({ seekerId: applications.seekerId, employerId: applications.employerId })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) throw errors.applicationNotFound();
  const isSeeker = app.seekerId === callerId;
  const isEmployer = app.employerId === callerId;
  if (!isSeeker && !isEmployer) throw errors.forbidden();

  const [proof] = await db.select().from(workProofs).where(eq(workProofs.applicationId, applicationId)).limit(1);
  return proof ? toPublic(proof) : { ...NONE };
}
