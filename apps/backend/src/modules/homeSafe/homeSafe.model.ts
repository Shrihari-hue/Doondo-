/**
 * HomeSafeCheck — the "reached home safe" bookend to a shift.
 *
 * When a worker checks OUT of a shift, we open a pending check. The worker
 * taps "I'm home safe" once they're back, which closes it and (if they've
 * opted into Trust Circle sharing) sends a reassurance ping to their
 * contacts — the positive counterpart to the shift-start/end pings.
 *
 * This is deliberately a gentle, opt-in reassurance loop, not an alarm:
 * an unconfirmed check just stays pending. One row per check-out event.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

export const HOME_SAFE_STATUSES = ['pending', 'safe'] as const;
export type HomeSafeStatus = (typeof HOME_SAFE_STATUSES)[number];

interface HomeSafeCheck {
  seekerId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  employerId: Types.ObjectId;
  status: HomeSafeStatus;
  /** When the shift check-out happened (the prompt opened). */
  startedAt: Date;
  confirmedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type HomeSafeCheckDocument = HydratedDocument<HomeSafeCheck>;
type HomeSafeCheckModelType = Model<HomeSafeCheck>;

const schema = new Schema<HomeSafeCheck, HomeSafeCheckModelType>(
  {
    seekerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: HOME_SAFE_STATUSES, default: 'pending', index: true },
    startedAt: { type: Date, default: Date.now },
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
schema.index({ seekerId: 1, status: 1, startedAt: -1 });

export const HomeSafeCheckModel = model<HomeSafeCheck, HomeSafeCheckModelType>(
  'HomeSafeCheck',
  schema,
);

export type { HomeSafeCheck, HomeSafeCheckDocument };
