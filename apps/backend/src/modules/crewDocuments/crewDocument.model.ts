/**
 * CrewDocument — a worker credential the employer tracks the expiry of
 * (driving licence, electrical cert, security badge). Lets the employer
 * catch a lapse before it becomes a compliance problem on shift day.
 * Employer-private.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

interface CrewDocument {
  employerId: Types.ObjectId;
  workerId: Types.ObjectId;
  label: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

type CrewDocumentDocument = HydratedDocument<CrewDocument>;
type CrewDocumentModelType = Model<CrewDocument>;

const schema = new Schema<CrewDocument, CrewDocumentModelType>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    workerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
schema.index({ employerId: 1, expiresAt: 1 });

export const CrewDocumentModel = model<CrewDocument, CrewDocumentModelType>(
  'CrewDocument',
  schema,
);

export type { CrewDocument, CrewDocumentDocument };
