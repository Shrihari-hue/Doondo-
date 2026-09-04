/**
 * Worker Service Profiles — CRUD on the persistent Quick Work
 * service opt-in. seeker-plan.md §8/§29.
 *
 * `POST /me/quick-work-services` is a full-replace upsert (send the
 * worker's complete current service list) — simplest correct semantics
 * for a "these are the services I do" settings screen, same pattern
 * `availability.service.ts#publish` already uses for its own fields.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { errors } from '@/lib/errors';
import { workerServiceProfiles, services } from '@/db/schema';
import type { PublicService } from '@/modules/serviceCatalog/serviceCatalog.service';

export interface WorkerServiceProfileView {
  serviceId: string;
  service: PublicService | null;
}

/** GET /me/quick-work-services */
export async function listMine(workerId: string): Promise<WorkerServiceProfileView[]> {
  const rows = await getDb()
    .select({ serviceId: workerServiceProfiles.serviceId })
    .from(workerServiceProfiles)
    .where(eq(workerServiceProfiles.workerId, workerId));
  if (rows.length === 0) return [];

  const serviceIds = rows.map((r) => r.serviceId);
  const catalog = await getDb().select().from(services).where(inArray(services.id, serviceIds));
  const catalogMap = new Map(catalog.map((s) => [s.id, s]));

  return rows.map((r) => {
    const s = catalogMap.get(r.serviceId);
    return {
      serviceId: r.serviceId,
      service: s
        ? {
            id: s.id,
            categoryId: s.categoryId,
            name: s.name,
            slug: s.slug,
            description: s.description,
            icon: s.icon,
            requiresVerification: s.requiresVerification,
            requiresQualification: s.requiresQualification,
            requiresLicense: s.requiresLicense,
            supportsQuickWork: s.supportsQuickWork,
            supportsScheduledWork: s.supportsScheduledWork,
            supportsTraditionalJob: s.supportsTraditionalJob,
          }
        : null,
    };
  });
}

/** POST /me/quick-work-services — full-replace upsert of the worker's service list. */
export async function setMine(workerId: string, serviceIds: string[]): Promise<WorkerServiceProfileView[]> {
  const uniqueIds = Array.from(new Set(serviceIds));

  if (uniqueIds.length > 0) {
    // Reject ids that aren't real, active catalog services — never trust
    // client-supplied ids blindly (employer-plan.md §8.3's "id not name"
    // rule cuts both ways: the id must actually resolve).
    const validRows = await getDb()
      .select({ id: services.id })
      .from(services)
      .where(and(inArray(services.id, uniqueIds), eq(services.isActive, true)));
    const validIds = new Set(validRows.map((r) => r.id));
    const invalid = uniqueIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw errors.validation({ invalidServiceIds: invalid }, 'One or more services are invalid.');
    }
  }

  await getDb().transaction(async (tx) => {
    await tx.delete(workerServiceProfiles).where(eq(workerServiceProfiles.workerId, workerId));
    if (uniqueIds.length > 0) {
      await tx.insert(workerServiceProfiles).values(uniqueIds.map((serviceId) => ({ workerId, serviceId })));
    }
  });

  return listMine(workerId);
}

/** Used by matching/eligibility checks that need a quick yes/no. */
export async function isEligibleFor(workerId: string, serviceId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: workerServiceProfiles.id })
    .from(workerServiceProfiles)
    .where(and(eq(workerServiceProfiles.workerId, workerId), eq(workerServiceProfiles.serviceId, serviceId)))
    .limit(1);
  return Boolean(row);
}
