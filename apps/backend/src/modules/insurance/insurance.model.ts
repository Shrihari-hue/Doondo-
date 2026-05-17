/**
 * InsuranceSubscription — gig-worker accident cover opt-in.
 *
 * V1 stub: one tier (Standard) at a fixed monthly premium. Subscription
 * state lives here; actual payment collection + policy issuance are
 * handled by ops manually until we partner with an insurer.
 *
 * Tier details (subject to insurer negotiation — these are reasonable
 * defaults for the preview):
 *
 *   - Standard: ₹49 / month
 *       · Accidental death / disability cover: ₹2,00,000
 *       · Hospital cash: ₹500 / day, up to 30 days / year
 *       · Active during all hires made through Doondo
 *
 * Status lifecycle:
 *   pending  → seeker opted in, payment pending
 *   active   → ops confirmed, cover live
 *   paused   → missed payment / seeker asked to pause
 *   cancelled → terminated, no further cover
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

export const INSURANCE_TIERS = ['standard'] as const;
export type InsuranceTier = (typeof INSURANCE_TIERS)[number];

export const INSURANCE_STATUSES = ['pending', 'active', 'paused', 'cancelled'] as const;
export type InsuranceStatus = (typeof INSURANCE_STATUSES)[number];

interface InsuranceSubscription {
  seekerId: Types.ObjectId;
  tier: InsuranceTier;
  /** Premium in paise — denormalised for cheap reads even if the tier changes. */
  monthlyPremiumPaise: number;
  status: InsuranceStatus;
  /** When cover became active. Null until ops confirms. */
  startedAt?: Date | null;
  /** When the seeker last renewed (paid). Drives the next-renewal date. */
  lastPaidAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type InsuranceSubscriptionDocument = HydratedDocument<InsuranceSubscription>;

const schema = new Schema<InsuranceSubscription>(
  {
    seekerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    tier: { type: String, enum: INSURANCE_TIERS, default: 'standard' },
    monthlyPremiumPaise: { type: Number, required: true, min: 0 },
    status: { type: String, enum: INSURANCE_STATUSES, default: 'pending', index: true },
    startedAt: { type: Date, default: null },
    lastPaidAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const InsuranceSubscriptionModel = model<InsuranceSubscription>(
  'InsuranceSubscription',
  schema,
);

export type { InsuranceSubscription, InsuranceSubscriptionDocument };
