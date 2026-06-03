/**
 * Squad — a named, reusable group of workers an employer dispatches
 * together.
 *
 * Where "My crew" is the flat roster of everyone the employer trusts, a
 * squad is a saved subset they hire as a unit — "Morning kitchen crew",
 * "Diwali setup team". Deploying a squad to a job fans a direct offer to
 * every member at once, so filling a multi-headcount shift with people
 * who already work well together is one tap instead of N.
 *
 * Members are plain worker ids (validated against the employer's crew at
 * create time); the unique index keeps squad names distinct per employer.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

interface Squad {
  employerId: Types.ObjectId;
  name: string;
  workerIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

type SquadDocument = HydratedDocument<Squad>;
type SquadModelType = Model<Squad>;

const schema = new Schema<Squad, SquadModelType>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    workerIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true },
);
schema.index({ employerId: 1, name: 1 }, { unique: true });

export const SquadModel = model<Squad, SquadModelType>('Squad', schema);

export type { Squad, SquadDocument };
