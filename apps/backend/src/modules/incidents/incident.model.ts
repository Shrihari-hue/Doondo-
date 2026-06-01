/**
 * IncidentLog — a private, timestamped note an employer keeps about a
 * worker ("arrived 40 min late", "broke a plate"), optionally with a
 * photo. Append-only and employer-only: never shown to the worker, never
 * part of the public review/rating. It builds an honest reliability
 * picture over time without the heat of a star rating.
 *
 * Distinct from WorkerNote (a single editable scratchpad) — this is a log
 * of discrete events, each with its own timestamp.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

interface IncidentLog {
  employerId: Types.ObjectId;
  workerId: Types.ObjectId;
  applicationId?: Types.ObjectId | null;
  note: string;
  /** Optional base64 image data URL. */
  photoUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type IncidentLogDocument = HydratedDocument<IncidentLog>;
type IncidentLogModelType = Model<IncidentLog>;

const schema = new Schema<IncidentLog, IncidentLogModelType>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    workerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', default: null },
    note: { type: String, required: true, trim: true, maxlength: 500 },
    photoUrl: { type: String, default: null },
  },
  { timestamps: true },
);
schema.index({ employerId: 1, workerId: 1, createdAt: -1 });

export const IncidentLogModel = model<IncidentLog, IncidentLogModelType>(
  'IncidentLog',
  schema,
);

export type { IncidentLog, IncidentLogDocument };
