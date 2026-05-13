/**
 * Ratings API — bidirectional ratings, only allowed after a `hired`
 * application. The server figures out the direction from the
 * authenticated reviewer's role on the application.
 */

import { apiRequest } from './client';

export type RatingRole = 'employer' | 'seeker';

export interface PublicRating {
  id: string;
  reviewerId: string;
  reviewerName: string;
  reviewerPhotoUrl: string | null;
  revieweeId: string;
  applicationId: string;
  jobId: string;
  jobTitle: string;
  role: RatingRole;
  score: number;
  comment: string | null;
  createdAt: string;
}

export interface RatingSummary {
  avg: number;
  count: number;
}

export interface UnratedApp {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  otherPartyName: string;
  otherPartyPhotoUrl: string | null;
  hiredAt: string;
}

export interface CreatePayload {
  applicationId: string;
  score: number;
  comment?: string;
}

export const ratingsApi = {
  create: (body: CreatePayload) =>
    apiRequest<{ rating: PublicRating }>('/ratings', {
      method: 'POST',
      body,
    }),

  listMyUnrated: (limit = 10) =>
    apiRequest<{ unrated: UnratedApp[] }>(`/ratings/unrated?limit=${limit}`),

  listForUser: (userId: string, limit = 20) =>
    apiRequest<{ ratings: PublicRating[]; summary: RatingSummary }>(
      `/users/${userId}/ratings?limit=${limit}`,
    ),
};
