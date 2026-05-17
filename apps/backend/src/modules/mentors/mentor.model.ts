/**
 * Mentor — experienced worker who's opted in to help newer workers in
 * their trade. Created when a seeker toggles "Mentor others" on their
 * Profile.
 *
 * Eligibility (enforced at controller level, not at the model):
 *   - 5+ ratings received with average ≥ 4.0
 *   - 3+ years experience reported on the resume
 *   - Profile is verified (phone + selfie)
 *
 * Matching is by primary trade + city. We don't allow cross-city
 * mentorship for now — workers should meet face-to-face if they want.
 */

import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

interface Mentor {
  userId: Types.ObjectId;
  /** Trade the mentor specialises in (lowercase, canonical key). */
  trade: string;
  /** City the mentor is based in — match field for requests. */
  city: string;
  /** Self-written bio shown to mentees. */
  bio: string;
  /** Max mentees per month. Defaults to 3 — protects against burnout. */
  monthlyCap: number;
  /** Whether this mentor is currently accepting requests. */
  open: boolean;
  /** Active mentees count, updated denormalised on accept/end. */
  activeMentees: number;
  createdAt: Date;
  updatedAt: Date;
}

interface MentorshipRequest {
  menteeId: Types.ObjectId;
  mentorId: Types.ObjectId;
  trade: string;
  city: string;
  message: string;
  status: 'pending' | 'accepted' | 'declined' | 'ended';
  createdAt: Date;
  updatedAt: Date;
}

type MentorDocument = HydratedDocument<Mentor>;
type MentorshipRequestDocument = HydratedDocument<MentorshipRequest>;

const mentorSchema = new Schema<Mentor>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    trade: { type: String, required: true, lowercase: true, index: true },
    city: { type: String, required: true, index: true, maxlength: 80 },
    bio: { type: String, default: '', maxlength: 600 },
    monthlyCap: { type: Number, default: 3, min: 1, max: 10 },
    open: { type: Boolean, default: true, index: true },
    activeMentees: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);
mentorSchema.index({ trade: 1, city: 1, open: 1 });

const requestSchema = new Schema<MentorshipRequest>(
  {
    menteeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mentorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trade: { type: String, required: true, lowercase: true },
    city: { type: String, required: true },
    message: { type: String, default: '', maxlength: 400 },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'ended'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true },
);
// Prevent duplicate active requests from the same mentee to the same mentor.
requestSchema.index(
  { menteeId: 1, mentorId: 1, status: 1 },
  { unique: false },
);

export const MentorModel = model<Mentor>('Mentor', mentorSchema);
export const MentorshipRequestModel = model<MentorshipRequest>(
  'MentorshipRequest',
  requestSchema,
);

export type { Mentor, MentorshipRequest, MentorDocument, MentorshipRequestDocument };
