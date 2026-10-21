/**
 * WomenSafetyReport — a woman who worked a job confirms (or disputes) the
 * employer's declared women-safety signals. One per hire. This is the
 * "verifier" that turns employer claims into peer-confirmed signals.
 */
import { Schema, model, type Model, Types } from 'mongoose';
import { WOMEN_SAFETY_SIGNALS, type WomenSafetySignal } from '@/modules/jobs/womenSafety';

export interface WomenSafetyReport {
  employerId: Types.ObjectId;
  jobId: Types.ObjectId;
  applicationId: Types.ObjectId;
  seekerId: Types.ObjectId;
  /** Overall: would you tell another woman this workplace is safe? */
  safe: boolean;
  /** Which of the employer's declared signals were true in practice. */
  confirmed: WomenSafetySignal[];
  createdAt: Date;
}

const schema = new Schema<WomenSafetyReport, Model<WomenSafetyReport>>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true, unique: true },
    seekerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    safe: { type: Boolean, required: true },
    confirmed: { type: [String], enum: WOMEN_SAFETY_SIGNALS, default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const WomenSafetyReportModel = model<WomenSafetyReport, Model<WomenSafetyReport>>('WomenSafetyReport', schema);
