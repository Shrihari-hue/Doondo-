/**
 * CollectQr — a worker's Doondo Collect QR code.
 *
 * Two kinds:
 *   - 'open'  a reusable QR; the payer enters the amount.
 *   - 'fixed' tied to a specific hire's wage; the amount is pre-filled.
 *
 * The QR encodes a Doondo pay-link carrying `ref` (so money lands in
 * Doondo's PA account and the commission can be split) — never the
 * worker's raw VPA. One worker can mint several (one open + per-job fixed).
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

export const COLLECT_QR_KINDS = ['open', 'fixed'] as const;
export type CollectQrKind = (typeof COLLECT_QR_KINDS)[number];

interface CollectQr {
  ownerId: Types.ObjectId;
  kind: CollectQrKind;
  /** Paise for a fixed QR; null for an open (any-amount) QR. */
  amountPaise?: number | null;
  /** Optional hire this QR collects for (fixed kind). */
  applicationId?: Types.ObjectId | null;
  /** Short unique reference embedded in the pay-link / QR. */
  ref: string;
  /** The string the QR encodes. */
  payload: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type CollectQrDocument = HydratedDocument<CollectQr>;
type CollectQrModelType = Model<CollectQr>;

const schema = new Schema<CollectQr, CollectQrModelType>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: COLLECT_QR_KINDS, required: true },
    amountPaise: { type: Number, default: null },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', default: null },
    ref: { type: String, required: true, unique: true, index: true },
    payload: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
schema.index({ ownerId: 1, createdAt: -1 });

export const CollectQrModel = model<CollectQr, CollectQrModelType>('CollectQr', schema);

export type { CollectQr, CollectQrDocument };
