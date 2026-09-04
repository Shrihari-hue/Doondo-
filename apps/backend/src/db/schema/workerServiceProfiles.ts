/**
 * Worker Service Profiles — the persistent record of which catalog
 * `service`s a worker is willing to take Quick Work offers for.
 * seeker-plan.md §8.
 *
 * Deliberately separate from the ephemeral `availabilities` beacon row:
 * "I do AC repair and plumbing" is a standing fact about the worker,
 * independent of whether they currently have a live "available now"
 * beacon. A worker configures this once (and edits it occasionally);
 * matching (`quickWorkMatching.service.ts`) requires BOTH a live,
 * in-radius `availabilities` row AND a matching row here before offering
 * a request to that worker.
 *
 * Flat one-row-per-(worker,service) table, per seeker-plan.md §8.2's
 * explicit "start flat, only add a richer table if ranking genuinely
 * needs more" guidance — no skill-level/experience/radius columns yet.
 */

import { pgTable, uuid, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';
import { services } from './catalog';

export const workerServiceProfiles = pgTable(
  'worker_service_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workerId: uuid('worker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('worker_service_profiles_worker_service_unique').on(t.workerId, t.serviceId),
    index('worker_service_profiles_worker_id_idx').on(t.workerId),
    index('worker_service_profiles_service_id_idx').on(t.serviceId),
  ],
);

export type WorkerServiceProfile = typeof workerServiceProfiles.$inferSelect;
