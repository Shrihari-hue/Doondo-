/**
 * EmployerResponseSettings — an employer's reachability window.
 *
 * The anti-ghost engine holds employers accountable for leaving seekers
 * on read. That's right, but it shouldn't punish someone for not replying
 * at 2am. This lets an employer declare quiet hours (in IST — Doondo's
 * home market) during which the ghost sweep won't flag them, plus an
 * optional auto-reply line so a worker who writes overnight still gets an
 * acknowledgement.
 *
 * One row per employer (unique index drives the upsert). Quiet hours are
 * stored as integer hours [0–23]; a window may wrap past midnight
 * (e.g. start 21, end 7), which the `isWithinQuietHours` helper handles.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

interface EmployerResponseSettings {
  employerId: Types.ObjectId;
  /** Master switch — quiet hours only apply when true. */
  quietHoursEnabled: boolean;
  /** IST hour [0–23] the quiet window opens. */
  quietStartHour: number;
  /** IST hour [0–23] the quiet window closes. */
  quietEndHour: number;
  /** Optional auto-reply shown/sent to a worker who writes in quiet hours. */
  autoReply: string;
  /** Send the employer an SMS when a new applicant arrives. */
  smsApplicantAlerts: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type EmployerResponseSettingsDocument = HydratedDocument<EmployerResponseSettings>;
type EmployerResponseSettingsModelType = Model<EmployerResponseSettings>;

const schema = new Schema<EmployerResponseSettings, EmployerResponseSettingsModelType>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    quietHoursEnabled: { type: Boolean, default: false },
    quietStartHour: { type: Number, default: 21, min: 0, max: 23 },
    quietEndHour: { type: Number, default: 7, min: 0, max: 23 },
    autoReply: { type: String, default: '', trim: true, maxlength: 300 },
    smsApplicantAlerts: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const EmployerResponseSettingsModel = model<
  EmployerResponseSettings,
  EmployerResponseSettingsModelType
>('EmployerResponseSettings', schema);

export type { EmployerResponseSettings, EmployerResponseSettingsDocument };
