/**
 * UserReport — a report filed against a user (fake profile, scam, abuse).
 * Lands in a trust-and-safety queue for the ops team to review; no
 * automated action is taken on it here. Either role can file one.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

export const REPORT_REASONS = ['fake_profile', 'scam', 'abusive', 'no_show', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['open', 'reviewed', 'actioned', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

interface UserReport {
  reporterId: Types.ObjectId;
  reportedUserId: Types.ObjectId;
  reason: ReportReason;
  note: string;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
}

type UserReportDocument = HydratedDocument<UserReport>;
type UserReportModelType = Model<UserReport>;

const schema = new Schema<UserReport, UserReportModelType>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportedUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    note: { type: String, default: '', trim: true, maxlength: 1000 },
    status: { type: String, enum: REPORT_STATUSES, default: 'open', index: true },
  },
  { timestamps: true },
);

export const UserReportModel = model<UserReport, UserReportModelType>('UserReport', schema);

export type { UserReport, UserReportDocument };
