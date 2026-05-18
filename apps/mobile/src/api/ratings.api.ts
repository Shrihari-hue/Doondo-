/**
 * Ratings API — bidirectional ratings, only allowed after a `hired`
 * application. The server figures out the direction from the
 * authenticated reviewer's role on the application.
 */

import { apiRequest } from './client';

export type RatingRole = 'employer' | 'seeker';
export type TagPolarity = 'positive' | 'neutral' | 'negative';

export interface PublicRating {
  id: string;
  /** Null when the review was posted anonymously. */
  reviewerId: string | null;
  reviewerName: string;
  reviewerPhotoUrl: string | null;
  revieweeId: string;
  applicationId: string;
  jobId: string;
  jobTitle: string;
  role: RatingRole;
  score: number;
  comment: string | null;
  /** Structured tag slugs (e.g. `paid_on_time`) — see ratings/tagCatalog. */
  tags: string[];
  /** Whether the reviewer chose to post anonymously. */
  anonymous: boolean;
  createdAt: string;
}

/** One row in the tag-summary aggregation. */
export interface TagSummaryEntry {
  slug: string;
  label: string;
  polarity: TagPolarity;
  count: number;
  /** 0..1 — share of the user's reviews carrying this tag. */
  ratio: number;
}

export interface TagSummary {
  totalReviews: number;
  role: RatingRole;
  tags: TagSummaryEntry[];
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
  /** Tag slugs from the role's catalogue (max 6). */
  tags?: string[];
  /** Hide reviewer identity in public listings. */
  anonymous?: boolean;
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

  /**
   * Aggregated structured-tag summary for a user. `role` selects which
   * direction the summary is for — when reading an employer profile,
   * pass 'employer' so the response uses the employer-review tags.
   */
  tagSummary: (userId: string, role: RatingRole = 'employer') =>
    apiRequest<TagSummary>(
      `/users/${userId}/tag-summary?role=${role}`,
      { auth: false },
    ),
};
