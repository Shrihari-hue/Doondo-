/**
 * CrewMember — a worker an employer has saved to their crew.
 *
 * "My crew" is the employer's private roster of trusted workers for
 * one-tap re-hire. It's seeded two ways: saving a good past hire, and
 * importing phone contacts (this module's `import` matches a contact's
 * number to an existing Doondo worker and adds them here). One row per
 * (employer, worker) pair — the unique index makes adds idempotent.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

interface CrewMember {
  employerId: Types.ObjectId;
  workerId: Types.ObjectId;
  /** How the worker entered the crew — useful for later analytics. */
  source: 'import' | 'rehire' | 'manual';
  createdAt: Date;
  updatedAt: Date;
}

type CrewMemberDocument = HydratedDocument<CrewMember>;
type CrewMemberModelType = Model<CrewMember>;

const schema = new Schema<CrewMember, CrewMemberModelType>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    workerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    source: { type: String, enum: ['import', 'rehire', 'manual'], default: 'manual' },
  },
  { timestamps: true },
);

schema.index({ employerId: 1, workerId: 1 }, { unique: true });

export const CrewMemberModel = model<CrewMember, CrewMemberModelType>('CrewMember', schema);

export type { CrewMember, CrewMemberDocument };
