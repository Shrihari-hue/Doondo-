/**
 * PhotoVerification — an employer marks one of the seeker's work photos
 * as "I worked with this person and that's genuinely their work."
 *
 * Lives in the endorsements module because it's the same trust loop
 * shape as Endorsement but scoped per-photo rather than per-trade.
 * Unique on (employerId, seekerId, photoIndex) so each employer can
 * verify a given photo exactly once.
 *
 * Surfaces on:
 *   - Seeker's resume preview: a "✓ Verified" corner badge on photos
 *     with at least one verification
 *   - Employer's ApplicantDetail: the overlay button is replaced by a
 *     "Verified by you" label once they've stamped a given photo
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export interface PhotoVerification {
  employerId: Schema.Types.ObjectId;
  seekerId: Schema.Types.ObjectId;
  /** 0..5 — index into the seeker's workPhotos array at the time of verify. */
  photoIndex: number;
  applicationId?: Schema.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicPhotoVerification {
  id: string;
  employerId: string;
  employerName: string;
  employerCompanyName: string | null;
  seekerId: string;
  photoIndex: number;
  createdAt: string;
}

interface PhotoVerificationMethods {
  toPublicJSON(opts: {
    employerName: string;
    employerCompanyName?: string | null;
  }): PublicPhotoVerification;
}

export type PhotoVerificationDocument = HydratedDocument<
  PhotoVerification,
  PhotoVerificationMethods
>;
type PhotoVerificationModelType = Model<
  PhotoVerification,
  Record<string, never>,
  PhotoVerificationMethods
>;

const photoVerificationSchema = new Schema<
  PhotoVerification,
  PhotoVerificationModelType,
  PhotoVerificationMethods
>(
  {
    employerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    seekerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    photoIndex: { type: Number, required: true, min: 0, max: 9 },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', default: null },
  },
  { timestamps: true },
);

// One verification per (employer, seeker, photo).
photoVerificationSchema.index(
  { employerId: 1, seekerId: 1, photoIndex: 1 },
  { unique: true },
);
// "Count verifications for this seeker grouped by photoIndex" — drives
// the verified-corner-badge on the resume preview.
photoVerificationSchema.index({ seekerId: 1, photoIndex: 1 });

photoVerificationSchema.method('toPublicJSON', function (
  this: PhotoVerificationDocument,
  opts,
): PublicPhotoVerification {
  return {
    id: this._id.toString(),
    employerId: (this.employerId as unknown as { toString(): string }).toString(),
    employerName: opts.employerName,
    employerCompanyName: opts.employerCompanyName ?? null,
    seekerId: (this.seekerId as unknown as { toString(): string }).toString(),
    photoIndex: this.photoIndex,
    createdAt: this.createdAt.toISOString(),
  };
});

export const PhotoVerificationModel = model<
  PhotoVerification,
  PhotoVerificationModelType
>('PhotoVerification', photoVerificationSchema);
