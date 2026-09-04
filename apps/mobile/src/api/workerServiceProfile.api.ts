/**
 * Worker Service Profile API — the persistent Quick Work service opt-in.
 * seeker-plan.md §8/§29. Separate from availability.api.ts's ephemeral
 * beacon — see workerServiceProfiles.ts's schema doc for why.
 */

import { apiRequest } from './client';
import type { CatalogService } from './services.api';

export interface WorkerServiceProfile {
  serviceId: string;
  service: CatalogService | null;
}

export const workerServiceProfileApi = {
  listMine: () =>
    apiRequest<{ profiles: WorkerServiceProfile[] }>('/me/quick-work-services').then((r) => r.profiles),

  setMine: (serviceIds: string[]) =>
    apiRequest<{ profiles: WorkerServiceProfile[] }>('/me/quick-work-services', {
      method: 'POST',
      body: { serviceIds },
    }).then((r) => r.profiles),
};
