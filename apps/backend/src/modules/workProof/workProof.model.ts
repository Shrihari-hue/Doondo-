/**
 * WorkProof — a photo of completed work, submitted by the worker at the
 * end of a shift and approved by the employer.
 *
 * The quality half of trust: shift check-in proves the worker *showed
 * up*; this proves the work got *done* (a clean kitchen, a painted wall)
 * before payment is released. Kept as its own document — like
 * ShiftCheckIn — so the photo (a base64 data URL) never bloats the
 * application list payloads; it's fetched only when someone opens the
 * proof.
 *
 * One proof per application (unique index drives the upsert); a worker can
 * re-submit a new photo while it's still pending or after a rejection,
 * which resets the review.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

export const WORK_PROOF_STATUSES = ['submitted', 'approved', 'rejected'] as const;
export type WorkProofStatus = (typeof WORK_PROOF_STATUSES)[number];

interface WorkProof {
  applicationId: Types.ObjectId;
  seekerId: Types.ObjectId;
  employerId: Types.ObjectId;
  /** base64 image data URL of the completed work. */
  photoUrl: string;
  status: WorkProofStatus;
  submittedAt: Date;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type WorkProofDocument = HydratedDocument<WorkProof>;
type WorkProofModelType = Model<WorkProof>;

const schema = new Schema<WorkProof, WorkProofModelType>(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true, unique: true },
    seekerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    photoUrl: { type: String, required: true },
    status: { type: String, enum: WORK_PROOF_STATUSES, default: 'submitted', index: true },
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const WorkProofModel = model<WorkProof, WorkProofModelType>('WorkProof', schema);

export type { WorkProof, WorkProofDocument };
