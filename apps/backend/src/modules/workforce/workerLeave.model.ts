/**
 * WorkerLeave — one day an employer has marked a hired worker as on leave.
 * Keyed by (applicationId, date) so marking the same day twice is idempotent.
 * `date` is the IST calendar day, "YYYY-MM-DD".
 */
import { Schema, model, type Model, Types } from 'mongoose';

export interface WorkerLeave {
  employerId: Types.ObjectId;
  applicationId: Types.ObjectId;
  seekerId: Types.ObjectId;
  date: string;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<WorkerLeave, Model<WorkerLeave>>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    seekerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    reason: { type: String, default: null, maxlength: 200 },
  },
  { timestamps: true },
);

schema.index({ applicationId: 1, date: 1 }, { unique: true });

export const WorkerLeaveModel = model<WorkerLeave, Model<WorkerLeave>>('WorkerLeave', schema);
