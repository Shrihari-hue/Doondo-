/**
 * "Workers your trusted employers rated" — workers highly rated by other
 * employers in your city. Local social proof: a peer already worked with
 * and paid them.
 */

import { apiRequest } from './client';

export interface TrustedWorker {
  seeker: {
    id: string;
    name: string;
    photoUrl: string | null;
    skills: string[];
    isVerified: boolean;
  };
  avgScore: number;
  employerCount: number;
}

export const trustedWorkersApi = {
  list: (limit = 10) =>
    apiRequest<{ workers: TrustedWorker[] }>(`/trusted-workers?limit=${limit}`),
};
