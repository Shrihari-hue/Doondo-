/**
 * Hire Reels endpoints — strongly-typed wrappers around apiRequest.
 *
 * A reel is a worker's short video intro: they record one, it lives on
 * their profile, and employers browse a discovery feed of them.
 */

import { apiRequest } from './client';

export interface PublicReel {
  id: string;
  seekerId: string;
  /** Where the video plays from (a CDN URL, or a mock placeholder). */
  videoUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  caption: string | null;
  createdAt: string;
  /** Worker summary — present on feed results. */
  seeker?: {
    id: string;
    name: string;
    photoUrl: string | null;
    skills: string[];
  };
}

export interface UploadReelParams {
  /** Video as a base64 data URL. */
  videoDataUrl: string;
  mimeType: string;
  durationSeconds: number;
  caption?: string | null;
}

export const reelsApi = {
  /** Record or replace the signed-in worker's intro reel. */
  upload: (p: UploadReelParams) =>
    apiRequest<{ reel: PublicReel }>('/reels', {
      method: 'POST',
      body: {
        videoDataUrl: p.videoDataUrl,
        mimeType: p.mimeType,
        durationSeconds: p.durationSeconds,
        caption: p.caption ?? null,
      },
    }),

  /** The signed-in worker's own reel, or null when they have none. */
  mine: () => apiRequest<{ reel: PublicReel | null }>('/reels/mine'),

  /** Remove the signed-in worker's reel. */
  remove: () =>
    apiRequest<{ removed: boolean }>('/reels', { method: 'DELETE' }),

  /** The employer discovery feed — recent worker reels. */
  feed: (limit?: number) =>
    apiRequest<{ reels: PublicReel[] }>(
      `/reels/feed${limit ? `?limit=${limit}` : ''}`,
    ),

  /** A specific worker's reel — for their profile. */
  forSeeker: (seekerId: string) =>
    apiRequest<{ reel: PublicReel | null }>(`/reels/seeker/${seekerId}`),
};
