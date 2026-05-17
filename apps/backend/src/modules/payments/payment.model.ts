/**
 * PaymentIntent — an employer's commitment to pay a worker for a
 * completed hire via UPI.
 *
 * V1 flow:
 *   1. Employer taps "Pay via UPI" on an applicant they hired.
 *   2. Server creates a PaymentIntent with a UPI deep-link string.
 *   3. Employer's app opens the link (gpay/phonepe/etc).
 *   4. Employer manually marks the intent as paid after they see
 *      success in their UPI app.
 *   5. Worker gets a notification + the amount is logged to their wallet
 *      as a settled `hire_payment` transaction.
 *
 * This is a stub on top of UPI's intent protocol — there's no PSP
 * webhook yet, so we trust the employer's mark-paid action. The model
 * stores enough state to migrate to a real PSP later.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

export const PAYMENT_STATUSES = [
  'pending',
  'in_progress',
  'paid',
  'failed',
  'cancelled',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

interface PaymentIntent {
  employerId: Types.ObjectId;
  seekerId: Types.ObjectId;
  applicationId?: Types.ObjectId | null;
  amountPaise: number;
  currency: string;
  /** Worker's UPI VPA (e.g. "shree@okhdfcbank") snapshotted at intent time. */
  seekerVpa: string;
  /** Composed UPI intent URI returned to the employer's client. */
  upiUri: string;
  /** Doondo-side reference number — short and embedded in the URI. */
  ref: string;
  status: PaymentStatus;
  /** Set when employer confirms paid; null otherwise. */
  paidAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type PaymentIntentDocument = HydratedDocument<PaymentIntent>;

const schema = new Schema<PaymentIntent>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    seekerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', default: null },
    amountPaise: { type: Number, required: true, min: 100, max: 10_000_000 },
    currency: { type: String, default: 'INR', uppercase: true, length: 3 },
    seekerVpa: { type: String, required: true, lowercase: true, maxlength: 80 },
    upiUri: { type: String, required: true },
    ref: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending', index: true },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);
schema.index({ employerId: 1, createdAt: -1 });
schema.index({ seekerId: 1, createdAt: -1 });

export const PaymentIntentModel = model<PaymentIntent>('PaymentIntent', schema);
export type { PaymentIntent, PaymentIntentDocument };
