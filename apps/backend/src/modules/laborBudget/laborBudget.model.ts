/**
 * EmployerBudget — an employer's self-set wage budget for a period.
 *
 * Turns Doondo from a hiring tool into a cost tool: the employer sets a
 * weekly or monthly ceiling on what they'll spend on wages, and the app
 * shows spend-to-date against it (computed live from paid payments — see
 * the service). One budget per employer; changing the period or amount
 * just overwrites it, so this is a tiny single-row-per-employer model
 * with a unique index doing the upsert work.
 *
 * Nothing here is enforced server-side — a budget is guidance, not a
 * gate. The employer can always post and pay past it; the value is the
 * visibility, not a block.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

export const BUDGET_PERIODS = ['week', 'month'] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

interface EmployerBudget {
  employerId: Types.ObjectId;
  period: BudgetPeriod;
  /** Budget ceiling in paise. */
  amountPaise: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

type EmployerBudgetDocument = HydratedDocument<EmployerBudget>;
type EmployerBudgetModelType = Model<EmployerBudget>;

const schema = new Schema<EmployerBudget, EmployerBudgetModelType>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    period: { type: String, enum: BUDGET_PERIODS, required: true, default: 'month' },
    amountPaise: { type: Number, required: true, min: 0, max: 1_000_000_000 },
    currency: { type: String, default: 'INR', uppercase: true, length: 3 },
  },
  { timestamps: true },
);

export const EmployerBudgetModel = model<EmployerBudget, EmployerBudgetModelType>(
  'EmployerBudget',
  schema,
);

export type { EmployerBudget, EmployerBudgetDocument };
