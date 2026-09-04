/**
 * Service Catalog — read-side for the shared category/service tables.
 *
 * Both the employer (Quick Work request creation) and the worker
 * (service eligibility picker) read the exact same tables through this
 * one service — see db/schema/catalog.ts's module doc for why this is
 * new infrastructure rather than a promotion of `trades.ts`/
 * `skill.catalogue.ts`.
 *
 * Read-only for v1: the catalog is seeded via
 * scripts/seedServiceCatalog.ts, not edited through the API. An
 * admin-write surface can be added later without touching this file's
 * shape.
 */

import { and, asc, eq, ilike, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { serviceCategories, services, type Service, type ServiceCategory } from '@/db/schema';

export interface PublicServiceCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
}

export interface PublicService {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  requiresVerification: boolean;
  requiresQualification: boolean;
  requiresLicense: boolean;
  supportsQuickWork: boolean;
  supportsScheduledWork: boolean;
  supportsTraditionalJob: boolean;
}

function toPublicCategory(row: ServiceCategory): PublicServiceCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon ?? null,
    sortOrder: row.sortOrder,
  };
}

function toPublicService(row: Service): PublicService {
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    icon: row.icon ?? null,
    requiresVerification: row.requiresVerification,
    requiresQualification: row.requiresQualification,
    requiresLicense: row.requiresLicense,
    supportsQuickWork: row.supportsQuickWork,
    supportsScheduledWork: row.supportsScheduledWork,
    supportsTraditionalJob: row.supportsTraditionalJob,
  };
}

/** GET /service-categories — the top-level category grid. */
export async function listCategories(): Promise<PublicServiceCategory[]> {
  const rows = await getDb()
    .select()
    .from(serviceCategories)
    .where(eq(serviceCategories.isActive, true))
    .orderBy(asc(serviceCategories.sortOrder), asc(serviceCategories.name));
  return rows.map(toPublicCategory);
}

interface ListServicesInput {
  categoryId?: string;
  /** Free-text search — server-side ILIKE, mobile never matches on names client-side. */
  q?: string;
  limit?: number;
}

/** GET /services?categoryId=&q= — services within a category, or a search across all of them. */
export async function listServices(input: ListServicesInput): Promise<PublicService[]> {
  const conditions = [eq(services.isActive, true)];
  if (input.categoryId) conditions.push(eq(services.categoryId, input.categoryId));
  if (input.q?.trim()) conditions.push(ilike(services.name, `%${input.q.trim()}%`));

  const rows = await getDb()
    .select()
    .from(services)
    .where(and(...conditions))
    .orderBy(asc(services.sortOrder), asc(services.name))
    .limit(input.limit ?? 200);
  return rows.map(toPublicService);
}

/** Bulk-hydrate services by id — used when resolving `availabilities.serviceIds` or a request's `serviceId`. */
export async function getServicesByIds(ids: string[]): Promise<Map<string, PublicService>> {
  if (ids.length === 0) return new Map();
  const rows = await getDb().select().from(services).where(inArray(services.id, ids));
  return new Map(rows.map((r) => [r.id, toPublicService(r)]));
}

/** Single-service lookup — used by matching/eligibility checks (requiresVerification etc). */
export async function getServiceById(id: string): Promise<PublicService | null> {
  const [row] = await getDb().select().from(services).where(eq(services.id, id)).limit(1);
  return row ? toPublicService(row) : null;
}
