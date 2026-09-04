/**
 * Service Catalog API — the shared category/service tables that back
 * Quick Work request creation (employer) and service-eligibility
 * selection (worker). One catalog, one client, both roles import this
 * same file — see employer-plan.md §8 / seeker-plan.md §8.
 */

import { apiRequest } from './client';

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
}

export interface CatalogService {
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

export interface ListServicesParams {
  categoryId?: string;
  /** Server-side ILIKE search — never filter by name client-side, match by id. */
  q?: string;
}

export const servicesApi = {
  /** GET /service-categories — the top-level category grid. */
  listCategories: () =>
    apiRequest<{ categories: ServiceCategory[] }>('/service-categories').then((r) => r.categories),

  /** GET /services?categoryId=&q= — services within a category, or a search across all of them. */
  listServices: (params: ListServicesParams = {}) => {
    const qs = new URLSearchParams();
    if (params.categoryId) qs.set('categoryId', params.categoryId);
    if (params.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<{ services: CatalogService[] }>(`/services${suffix}`).then((r) => r.services);
  },
};
