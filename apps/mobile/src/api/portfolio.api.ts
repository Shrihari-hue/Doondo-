/**
 * Workplace portfolio ("Look Inside") endpoints.
 *
 * Employers build a visual tour of their place — photos with role pins,
 * a short video, the team, perks and FAQs. Seekers open it from the AR
 * view, job detail and the workplace job sheet.
 */

import { apiRequest } from './client';
import type { PublicJob } from './types';

export const PHOTO_KINDS = ['front', 'work_area', 'seating', 'team', 'kitchen', 'other'] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export interface RolePin {
  id: string;
  /** 0..1 across the photo. */
  x: number;
  /** 0..1 down the photo. */
  y: number;
  /** Vacancy this pin opens, or null for a plain label. */
  jobId: string | null;
  label: string;
}

export interface PortfolioPhoto {
  id: string;
  url: string;
  kind: PhotoKind;
  caption: string | null;
  pins: RolePin[];
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  photoUrl: string | null;
  tenure: string | null;
}

export interface Faq {
  id: string;
  q: string;
  a: string;
}

export interface WorkplacePortfolio {
  employerId: string;
  about: string | null;
  perks: string[];
  photos: PortfolioPhoto[];
  video: { url: string; durationSeconds: number } | null;
  team: TeamMember[];
  faqs: Faq[];
  updatedAt: string;
}

export interface PortfolioEmployer {
  id: string;
  name: string;
  companyName: string | null;
  photoUrl: string | null;
  isVerified: boolean;
  businessType: string | null;
  area: string | null;
  city: string | null;
}

export interface LookInsidePayload {
  employer: PortfolioEmployer;
  portfolio: WorkplacePortfolio | null;
  jobs: PublicJob[];
}

export interface PortfolioSummary {
  employerId: string;
  photoCount: number;
  coverUrl: string | null;
  hasVideo: boolean;
  teamCount: number;
}

export interface PortfolioPatch {
  about?: string | null;
  perks?: string[];
  faqs?: Array<{ id?: string; q: string; a: string }>;
  team?: Array<{ id?: string; name: string; role: string; tenure?: string | null }>;
  photos?: Array<{
    id: string;
    kind: PhotoKind;
    caption?: string | null;
    pins?: Array<{ x: number; y: number; jobId?: string | null; label: string }>;
  }>;
}

type P = { portfolio: WorkplacePortfolio };

export const portfolioApi = {
  /** Public Look Inside payload. */
  get: (employerId: string) => apiRequest<LookInsidePayload>(`/portfolio/${employerId}`, { auth: false }),

  /** Which employers have a tour (cover photo, counts). Max 50 ids. */
  summaries: (employerIds: string[]) =>
    apiRequest<{ summaries: PortfolioSummary[] }>(
      `/portfolio/summaries?ids=${encodeURIComponent([...new Set(employerIds)].slice(0, 50).join(','))}`,
      { auth: false },
    ),

  mine: () => apiRequest<P>('/portfolio/mine'),

  update: (patch: PortfolioPatch) => apiRequest<P>('/portfolio/mine', { method: 'PUT', body: patch }),

  addPhoto: (body: { dataUrl: string; mimeType: string; kind: PhotoKind; caption?: string | null }) =>
    apiRequest<P>('/portfolio/mine/photos', { method: 'POST', body }),

  removePhoto: (photoId: string) => apiRequest<P>(`/portfolio/mine/photos/${photoId}`, { method: 'DELETE' }),

  setTeamPhoto: (memberId: string, body: { dataUrl: string; mimeType: string }) =>
    apiRequest<P>(`/portfolio/mine/team/${memberId}/photo`, { method: 'POST', body }),

  setVideo: (body: { dataUrl: string; mimeType: string; durationSeconds: number }) =>
    apiRequest<P>('/portfolio/mine/video', { method: 'POST', body }),

  removeVideo: () => apiRequest<P>('/portfolio/mine/video', { method: 'DELETE' }),
};

/** Pick the best "hero" photo for a job: a pinned photo, then work area, then front. */
export function heroPhotoFor(portfolio: WorkplacePortfolio | null, jobId?: string): PortfolioPhoto | null {
  if (!portfolio || portfolio.photos.length === 0) return null;
  const photos = portfolio.photos;
  return (
    (jobId ? photos.find((p) => p.pins.some((pin) => pin.jobId === jobId)) : undefined) ??
    photos.find((p) => p.kind === 'work_area') ??
    photos.find((p) => p.kind === 'front') ??
    photos[0]!
  );
}
