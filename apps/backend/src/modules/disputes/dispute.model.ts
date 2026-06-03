/**
 * Dispute — a formal, two-sided grievance tied to one hire.
 *
 * When a shift goes wrong — a no-show, a pay disagreement, a work-quality
 * or behaviour complaint — either the employer or the worker can raise a
 * dispute against the other, scoped to the Application that connects them.
 * Unlike an IncidentLog (employer-private notes) or a Report (one-way
 * moderation flag), a dispute is visible to both parties and has a
 * lifecycle: it opens, the other side can respond, and it ends when one
 * party marks it resolved or withdraws it.
 *
 * Evidence photos are base64 data URLs kept inline (capped + count-limited)
 * the same way work-proof and incident photos are, so the dispute row is
 * self-contained.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

export const DISPUTE_CATEGORIES = [
  'no_show',
  'payment',
  'work_quality',
  'behavior',
  'hours',
  'safety',
  'other',
] as const;
export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];

export const DISPUTE_STATUSES = [
  'open', // raised, the other side hasn't responded
  'awaiting_response', // the ball is in the raiser's court after a reply
  'resolved', // closed — settled
  'dismissed', // closed — withdrawn / no merit
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export type PartyRole = 'employer' | 'seeker';

interface DisputeResponse {
  byRole: PartyRole;
  text: string;
  at: Date;
}

interface Dispute {
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  employerId: Types.ObjectId;
  seekerId: Types.ObjectId;
  raisedByRole: PartyRole;
  category: DisputeCategory;
  description: string;
  photoUrls: string[];
  status: DisputeStatus;
  responses: DisputeResponse[];
  resolution?: {
    outcome: 'resolved' | 'dismissed';
    note?: string | null;
    byRole: PartyRole;
    at: Date;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

type DisputeDocument = HydratedDocument<Dispute>;
type DisputeModelType = Model<Dispute>;

const responseSchema = new Schema<DisputeResponse>(
  {
    byRole: { type: String, enum: ['employer', 'seeker'], required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const schema = new Schema<Dispute, DisputeModelType>(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    seekerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    raisedByRole: { type: String, enum: ['employer', 'seeker'], required: true },
    category: { type: String, enum: DISPUTE_CATEGORIES, required: true },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    photoUrls: { type: [String], default: [] },
    status: { type: String, enum: DISPUTE_STATUSES, default: 'open', index: true },
    responses: { type: [responseSchema], default: [] },
    resolution: {
      type: new Schema(
        {
          outcome: { type: String, enum: ['resolved', 'dismissed'], required: true },
          note: { type: String, default: null, maxlength: 1000 },
          byRole: { type: String, enum: ['employer', 'seeker'], required: true },
          at: { type: Date, default: Date.now },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);
schema.index({ employerId: 1, status: 1, createdAt: -1 });
schema.index({ seekerId: 1, status: 1, createdAt: -1 });

export const DisputeModel = model<Dispute, DisputeModelType>('Dispute', schema);

export type { Dispute, DisputeDocument, DisputeResponse };
