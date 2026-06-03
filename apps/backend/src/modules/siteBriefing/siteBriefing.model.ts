/**
 * SiteBriefing — a per-job "before you arrive" briefing the employer
 * prepares for hired workers: plain instructions ("park behind the shop,
 * ask for Raju, wear boots"), annotated photos of the site, and
 * (optionally) a voice note. Kept as its own document keyed by jobId so
 * the photos/audio never bloat job feed payloads — fetched only when the
 * employer edits it or a hired worker opens it.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

interface SiteBriefing {
  jobId: Types.ObjectId;
  employerId: Types.ObjectId;
  text: string;
  /** base64 image data URLs (annotated site photos). */
  photoUrls: string[];
  /** Optional base64 audio data URL (voice note). */
  audioUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type SiteBriefingDocument = HydratedDocument<SiteBriefing>;
type SiteBriefingModelType = Model<SiteBriefing>;

const schema = new Schema<SiteBriefing, SiteBriefingModelType>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, unique: true },
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, default: '', trim: true, maxlength: 1000 },
    photoUrls: { type: [String], default: [] },
    audioUrl: { type: String, default: null },
  },
  { timestamps: true },
);

export const SiteBriefingModel = model<SiteBriefing, SiteBriefingModelType>(
  'SiteBriefing',
  schema,
);

export type { SiteBriefing, SiteBriefingDocument };
