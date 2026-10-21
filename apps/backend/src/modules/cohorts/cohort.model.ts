/**
 * Cohort — a 5-person study group working through one course together.
 * CohortMessage — the group's message board.
 */
import { Schema, model, type Model, Types } from 'mongoose';

export const COHORT_MAX = 5;

export interface Cohort {
  courseId: string;
  name: string;
  code: string;
  createdBy: Types.ObjectId;
  members: Types.ObjectId[];
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const cohortSchema = new Schema<Cohort, Model<Cohort>>(
  {
    courseId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    code: { type: String, required: true, unique: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [Schema.Types.ObjectId], ref: 'User', default: [], index: true },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const CohortModel = model<Cohort, Model<Cohort>>('Cohort', cohortSchema);

export interface CohortMessage {
  cohortId: Types.ObjectId;
  senderId: Types.ObjectId;
  text: string;
  createdAt: Date;
}

const msgSchema = new Schema<CohortMessage, Model<CohortMessage>>(
  {
    cohortId: { type: Schema.Types.ObjectId, ref: 'Cohort', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
msgSchema.index({ cohortId: 1, createdAt: -1 });

export const CohortMessageModel = model<CohortMessage, Model<CohortMessage>>('CohortMessage', msgSchema);
