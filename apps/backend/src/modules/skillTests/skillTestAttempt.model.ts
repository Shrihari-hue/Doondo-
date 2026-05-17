/**
 * SkillTestAttempt — a seeker's submission against one skill test.
 *
 * Stored per attempt (not just the latest) so we have a full audit
 * trail if anyone later disputes the badge. A seeker who hasn't
 * passed can re-attempt after a 24-hour cooldown. Once they've
 * passed, the badge is permanent (no expiry in v1).
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export interface SkillTestAttempt {
  seekerId: Schema.Types.ObjectId;
  testId: string;
  score: number;
  passingScore: number;
  passed: boolean;
  /** The seeker's answers — array of option indices. */
  answers: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicSkillTestAttempt {
  id: string;
  testId: string;
  score: number;
  passingScore: number;
  passed: boolean;
  createdAt: string;
}

interface AttemptMethods {
  toPublicJSON(): PublicSkillTestAttempt;
}

export type SkillTestAttemptDocument = HydratedDocument<
  SkillTestAttempt,
  AttemptMethods
>;
type SkillTestAttemptModelType = Model<
  SkillTestAttempt,
  Record<string, never>,
  AttemptMethods
>;

const schema = new Schema<SkillTestAttempt, SkillTestAttemptModelType, AttemptMethods>(
  {
    seekerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    testId: { type: String, required: true, trim: true, maxlength: 80, index: true },
    score: { type: Number, required: true, min: 0 },
    passingScore: { type: Number, required: true, min: 0 },
    passed: { type: Boolean, required: true, index: true },
    answers: { type: [Number], required: true },
  },
  { timestamps: true },
);

// "Newest attempt for this seeker on this test" — drives cooldown + UI.
schema.index({ seekerId: 1, testId: 1, createdAt: -1 });

schema.method('toPublicJSON', function (
  this: SkillTestAttemptDocument,
): PublicSkillTestAttempt {
  return {
    id: this._id.toString(),
    testId: this.testId,
    score: this.score,
    passingScore: this.passingScore,
    passed: Boolean(this.passed),
    createdAt: this.createdAt.toISOString(),
  };
});

export const SkillTestAttemptModel = model<SkillTestAttempt, SkillTestAttemptModelType>(
  'SkillTestAttempt',
  schema,
);
