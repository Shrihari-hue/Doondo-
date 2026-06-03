/**
 * Squads — reusable worker groups the employer deploys to a job in one tap.
 */

import { apiRequest } from './client';

export interface SquadMember {
  id: string;
  name: string;
  photoUrl: string | null;
}

export interface Squad {
  id: string;
  name: string;
  members: SquadMember[];
  createdAt: string;
}

export interface DeployResult {
  jobId: string;
  deployed: SquadMember[];
  failed: { workerId: string; reason: string }[];
}

export const squadsApi = {
  list: () => apiRequest<{ squads: Squad[] }>('/squads').then((r) => r.squads),

  create: (name: string, workerIds: string[]) =>
    apiRequest<{ squad: Squad }>('/squads', {
      method: 'POST',
      body: { name, workerIds },
    }).then((r) => r.squad),

  remove: (id: string) => apiRequest<{ deleted: boolean }>(`/squads/${id}`, { method: 'DELETE' }),

  deploy: (id: string, jobId: string) =>
    apiRequest<DeployResult>(`/squads/${id}/deploy`, { method: 'POST', body: { jobId } }),
};
