/**
 * MentorSession — a bookable 1:1 slot a mentor publishes. A mentee books
 * it; paid slots carry a UPI deep-link straight to the mentor (Doondo never
 * holds the money) and a two-step paid confirmation like cash wages.
 */
import { Schema, model, type Model, Types } from 'mongoose';

export const SESSION_STATUSES = ['open', 'booked', 'completed', 'cancelled'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const SESSION_MODES = ['call', 'video', 'in_person'] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

export interface MentorSession {
  mentorUserId: Types.ObjectId;
  menteeId: Types.ObjectId | null;
  startAt: Date;
  durationMinutes: number;
  priceRupees: number;
  mode: SessionMode;
  topic: string | null;
  note: string | null;
  status: SessionStatus;
  payment: {
    ref: string;
    upiUri: string | null;
    menteeMarkedPaidAt: Date | null;
    mentorConfirmedAt: Date | null;
  } | null;
  cancelledBy: 'mentor' | 'mentee' | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<MentorSession, Model<MentorSession>>(
  {
    mentorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    menteeId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    startAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, required: true, min: 15, max: 120 },
    priceRupees: { type: Number, required: true, min: 0, max: 5000 },
    mode: { type: String, enum: SESSION_MODES, default: 'call' },
    topic: { type: String, default: null, maxlength: 120 },
    note: { type: String, default: null, maxlength: 400 },
    status: { type: String, enum: SESSION_STATUSES, default: 'open', index: true },
    payment: {
      type: new Schema(
        {
          ref: { type: String, required: true },
          upiUri: { type: String, default: null },
          menteeMarkedPaidAt: { type: Date, default: null },
          mentorConfirmedAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    cancelledBy: { type: String, enum: ['mentor', 'mentee', null], default: null },
  },
  { timestamps: true },
);

export const MentorSessionModel = model<MentorSession, Model<MentorSession>>('MentorSession', schema);
