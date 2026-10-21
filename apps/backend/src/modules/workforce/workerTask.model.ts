/**
 * WorkerTask — a task an employer assigns to one hired worker.
 * The worker sees their tasks on "My Job" and can move them along.
 */
import { Schema, model, type Model, Types } from 'mongoose';

export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface WorkerTask {
  employerId: Types.ObjectId;
  applicationId: Types.ObjectId;
  seekerId: Types.ObjectId;
  title: string;
  location: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<WorkerTask, Model<WorkerTask>>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    seekerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    location: { type: String, default: null, maxlength: 140 },
    dueDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium' },
    status: { type: String, enum: TASK_STATUSES, default: 'pending', index: true },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const WorkerTaskModel = model<WorkerTask, Model<WorkerTask>>('WorkerTask', schema);
