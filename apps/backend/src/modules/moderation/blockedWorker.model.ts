/**
 * BlockedWorker — an employer has blocked a worker from applying to their
 * jobs again. Enforced at apply time: a blocked worker's application is
 * rejected before it's created. One row per (employer, worker) pair.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

interface BlockedWorker {
  employerId: Types.ObjectId;
  workerId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

type BlockedWorkerDocument = HydratedDocument<BlockedWorker>;
type BlockedWorkerModelType = Model<BlockedWorker>;

const schema = new Schema<BlockedWorker, BlockedWorkerModelType>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    workerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
schema.index({ employerId: 1, workerId: 1 }, { unique: true });

export const BlockedWorkerModel = model<BlockedWorker, BlockedWorkerModelType>(
  'BlockedWorker',
  schema,
);

export type { BlockedWorker, BlockedWorkerDocument };
