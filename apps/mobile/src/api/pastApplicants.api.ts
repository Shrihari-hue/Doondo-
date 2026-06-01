/**
 * Re-tap past applicants — workers who applied to this employer before
 * and are broadcasting availability nearby again. The employer's warmest
 * untapped pool: they already wanted to work here once.
 */

import { apiRequest } from './client';

export interface PastApplicant {
  seeker: {
    id: string;
    name: string;
    photoUrl: string | null;
    skills: string[];
    isVerified: boolean;
    phone: string | null;
    rating: { avg: number; count: number } | null;
  };
  distanceMeters: number;
  availableUntil: string;
  lastApplied: {
    status: string;
    appliedAt: string | null;
    jobTitle: string | null;
  };
}

export const pastApplicantsApi = {
  list: (p: { lat: number; lng: number; radius?: number; limit?: number }) => {
    const params = new URLSearchParams({
      lat: String(p.lat),
      lng: String(p.lng),
    });
    if (p.radius) params.set('radius', String(p.radius));
    if (p.limit) params.set('limit', String(p.limit));
    return apiRequest<{ workers: PastApplicant[] }>(
      `/past-applicants?${params.toString()}`,
    );
  },
};
