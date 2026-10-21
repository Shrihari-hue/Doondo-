/** Cached "why wasn't I picked?" paragraph per (application, locale). */
import { Schema, model, type Model, Types } from 'mongoose';

interface RejectionExplainerDoc {
  applicationId: Types.ObjectId;
  locale: string;
  text: string;
  source: 'ai' | 'fallback';
  createdAt: Date;
}

const schema = new Schema<RejectionExplainerDoc, Model<RejectionExplainerDoc>>({
  applicationId: { type: Schema.Types.ObjectId, required: true },
  locale: { type: String, required: true, maxlength: 5 },
  text: { type: String, required: true, maxlength: 2000 },
  source: { type: String, enum: ['ai', 'fallback'], required: true },
  createdAt: { type: Date, default: Date.now },
});
schema.index({ applicationId: 1, locale: 1 }, { unique: true });

export const RejectionExplainerModel = model<RejectionExplainerDoc, Model<RejectionExplainerDoc>>('RejectionExplainer', schema);
