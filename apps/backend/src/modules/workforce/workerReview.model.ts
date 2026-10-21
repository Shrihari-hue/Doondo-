/**
 * WorkerReview — an employer's private monthly performance review of a
 * hired worker. One per (application, month). Not shown to the worker;
 * public feedback goes through ratings.
 */
import { Schema, model, type Model, Types } from 'mongoose';

export interface WorkerReview {
  employerId: Types.ObjectId;
  applicationId: Types.ObjectId;
  seekerId: Types.ObjectId;
  month: string;
  punctuality: number;
  quality: number;
  attitude: number;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const star = { type: Number, min: 0, max: 5, default: 0 };

const schema = new Schema<WorkerReview, Model<WorkerReview>>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    seekerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    punctuality: star,
    quality: star,
    attitude: star,
    notes: { type: String, default: '', maxlength: 2000 },
  },
  { timestamps: true },
);

schema.index({ applicationId: 1, month: 1 }, { unique: true });

export const WorkerReviewModel = model<WorkerReview, Model<WorkerReview>>('WorkerReview', schema);
