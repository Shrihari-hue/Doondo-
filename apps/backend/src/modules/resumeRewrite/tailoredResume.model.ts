/**
 * TailoredResume — a worker's Smart Resume saved for one specific job.
 *
 * The AI rewrite is generated on demand (resumeRewrite.service); once the
 * worker has reviewed (and possibly edited) it, the result is persisted
 * here, keyed uniquely by (seeker, job). Two payoffs:
 *   - reopening the Smart Resume for the same job is instant, and shows
 *     the worker's reviewed/edited version rather than re-generating;
 *   - when the worker applies, the apply path snapshots this onto the
 *     Application so the employer sees the job-tuned resume.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export interface TailoredWorkBlurbDoc {
  company: string;
  role: string;
  blurb: string;
}

export interface TailoredResumeRecord {
  seekerId: Schema.Types.ObjectId;
  jobId: Schema.Types.ObjectId;
  summary: string;
  pitch: string;
  highlightedSkills: string[];
  matchedSkills: string[];
  workBlurbs: TailoredWorkBlurbDoc[];
  /** Which provider generated the draft this was reviewed from. */
  provider: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TailoredResumeDocument = HydratedDocument<TailoredResumeRecord>;
type TailoredResumeModelType = Model<TailoredResumeRecord>;

const workBlurbSchema = new Schema<TailoredWorkBlurbDoc>(
  {
    company: { type: String, required: true, trim: true, maxlength: 160 },
    role: { type: String, required: true, trim: true, maxlength: 160 },
    blurb: { type: String, default: '', trim: true, maxlength: 600 },
  },
  { _id: false },
);

const tailoredResumeSchema = new Schema<TailoredResumeRecord, TailoredResumeModelType>(
  {
    seekerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    summary: { type: String, default: '', trim: true, maxlength: 2000 },
    pitch: { type: String, default: '', trim: true, maxlength: 600 },
    highlightedSkills: { type: [String], default: [] },
    matchedSkills: { type: [String], default: [] },
    workBlurbs: { type: [workBlurbSchema], default: [] },
    provider: { type: String, default: 'mock', trim: true, maxlength: 20 },
  },
  { timestamps: true },
);

// One saved resume per (seeker, job) — the PUT endpoint upserts on it.
tailoredResumeSchema.index({ seekerId: 1, jobId: 1 }, { unique: true });

export const TailoredResumeModel = model<TailoredResumeRecord, TailoredResumeModelType>(
  'TailoredResume',
  tailoredResumeSchema,
);
