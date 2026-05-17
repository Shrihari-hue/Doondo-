/**
 * ProfileView — one document per (viewerId, seekerId, day) tuple.
 *
 * Why per-day: we don't want the same employer hammering refresh to
 * inflate the count. A unique index on (seekerId, viewerId, day)
 * collapses repeated views into a single bucket. The seeker side
 * reads "views in the last 7 days" from this collection.
 *
 * Why "day" not "hour" or full timestamps: matches the motivational UX
 * line — "12 employers viewed your profile this week" — and keeps the
 * index tiny. We never need finer granularity than that.
 *
 * Privacy: seekers see only the COUNT, never the viewer identity.
 * Employer IDs live here so we can collapse duplicate impressions but
 * are never sent back to the seeker UI.
 */

import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

interface ProfileView {
  seekerId: Types.ObjectId;
  viewerId: Types.ObjectId;
  /** UTC midnight of the viewing day, ISO date YYYY-MM-DD. */
  day: string;
  createdAt: Date;
  updatedAt: Date;
}

type ProfileViewDocument = HydratedDocument<ProfileView>;
type ProfileViewModelType = Model<ProfileView>;

const profileViewSchema = new Schema<ProfileView, ProfileViewModelType>(
  {
    seekerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    viewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  },
  { timestamps: true },
);

// Collapse duplicates within the same day per (seeker, viewer).
profileViewSchema.index(
  { seekerId: 1, viewerId: 1, day: 1 },
  { unique: true },
);
// Cheap range scans for "last 7 days" reads.
profileViewSchema.index({ seekerId: 1, createdAt: -1 });

export const ProfileViewModel = model<ProfileView, ProfileViewModelType>(
  'ProfileView',
  profileViewSchema,
);

export type { ProfileView, ProfileViewDocument };
