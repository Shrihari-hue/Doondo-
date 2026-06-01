/**
 * WorkerNote — a private, employer-only note pinned to a worker.
 *
 * "Great with customers, bring back for weekends." "Late twice." These
 * are the things an employer remembers about a worker but has nowhere to
 * put. The note is strictly private to the employer who wrote it — it is
 * never shown to the worker and never affects the worker's Doondo Score
 * or public reputation. It exists purely to make My Crew and re-hire
 * decisions real instead of memory-based, especially for an employer
 * juggling many workers.
 *
 * One note per (employer, worker) pair — the note is a living scratchpad
 * the employer edits over time, not an append-only log. The unique
 * compound index enforces that and makes the upsert in the route a single
 * atomic write.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

interface WorkerNote {
  /** The employer who wrote the note. The note is private to them. */
  employerId: Types.ObjectId;
  /** The worker the note is about. */
  workerId: Types.ObjectId;
  /** Free-text note. Empty string is allowed (treated as "cleared"). */
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

type WorkerNoteDocument = HydratedDocument<WorkerNote>;
type WorkerNoteModelType = Model<WorkerNote>;

const schema = new Schema<WorkerNote, WorkerNoteModelType>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    workerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, default: '', maxlength: 1000, trim: true },
  },
  { timestamps: true },
);

// One note per employer↔worker pair. Drives the upsert and guarantees a
// lookup by the pair is a single indexed hit.
schema.index({ employerId: 1, workerId: 1 }, { unique: true });

export const WorkerNoteModel = model<WorkerNote, WorkerNoteModelType>(
  'WorkerNote',
  schema,
);

export type { WorkerNote, WorkerNoteDocument };
