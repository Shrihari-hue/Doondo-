/**
 * FavoriteEmployer — a worker has marked an employer as a favourite.
 *
 * Two-way reputation: the employer sees how many workers favourited them
 * ("9 workers favourited you") — a signal that attracts more supply — and
 * (future) a worker's feed can surface favourited employers' posts first.
 * One row per (worker, employer) pair.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

interface FavoriteEmployer {
  workerId: Types.ObjectId;
  employerId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

type FavoriteEmployerDocument = HydratedDocument<FavoriteEmployer>;
type FavoriteEmployerModelType = Model<FavoriteEmployer>;

const schema = new Schema<FavoriteEmployer, FavoriteEmployerModelType>(
  {
    workerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true },
);
schema.index({ workerId: 1, employerId: 1 }, { unique: true });

export const FavoriteEmployerModel = model<FavoriteEmployer, FavoriteEmployerModelType>(
  'FavoriteEmployer',
  schema,
);

export type { FavoriteEmployer, FavoriteEmployerDocument };
