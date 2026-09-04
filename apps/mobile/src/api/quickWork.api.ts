/**
 * Quick Work API — employer-side request lifecycle (Phase 2).
 * employer-plan.md §25. Matching/offers (Phase 3) live in their own
 * client once that phase lands.
 */

import { apiRequest } from './client';

export type QuickWorkStatus =
  | 'draft' | 'posted' | 'matching' | 'offered' | 'accepted' | 'arriving' | 'arrived'
  | 'in_progress' | 'completed' | 'payment_pending' | 'paid' | 'rated'
  | 'cancelled' | 'expired' | 'no_worker_found' | 'disputed';

export interface QuickWorkRequest {
  id: string;
  employerId: string;
  categoryId: string | null;
  serviceId: string | null;
  title: string | null;
  description: string | null;
  photos: string[];
  videos: string[];
  voiceNoteUrl: string | null;
  location: { lat: number; lng: number } | null;
  address: string | null;
  city: string | null;
  isImmediate: boolean;
  scheduledAt: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  estimatedPrice: number | null;
  finalPrice: number | null;
  status: QuickWorkStatus;
  matchedWorkerId: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  disputeReason: string | null;
  priceApprovedAt: string | null;
  noShowBy: string | null;
  noShowReason: string | null;
  noShowAt: string | null;
  createdAt: string;
  postedAt: string | null;
  acceptedAt: string | null;
  arrivingAt: string | null;
  arrivingEtaMinutes: number | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completionPhotoUrl: string | null;
  completionNotes: string | null;
  paidAt: string | null;
  ratedAt: string | null;
  cancelledAt: string | null;
}

export interface QuickWorkDraftInput {
  categoryId?: string | null;
  serviceId?: string | null;
  title?: string | null;
  description?: string | null;
  photos?: string[];
  videos?: string[];
  voiceNoteUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  city?: string | null;
  isImmediate?: boolean;
  scheduledAt?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
}

export interface QuickWorkOffer {
  id: string;
  requestId: string;
  workerId: string;
  status: 'offered' | 'accepted' | 'declined' | 'expired' | 'superseded';
  distanceMeters: number | null;
  etaMinutes: number | null;
  offeredAt: string;
  expiresAt: string;
}

export const quickWorkApi = {
  createDraft: (input: QuickWorkDraftInput = {}) =>
    apiRequest<{ request: QuickWorkRequest }>('/quick-work/requests', { method: 'POST', body: input }).then(
      (r) => r.request,
    ),

  updateDraft: (id: string, input: QuickWorkDraftInput) =>
    apiRequest<{ request: QuickWorkRequest }>(`/quick-work/requests/${id}`, { method: 'PATCH', body: input }).then(
      (r) => r.request,
    ),

  getById: (id: string) =>
    apiRequest<{ request: QuickWorkRequest }>(`/quick-work/requests/${id}`).then((r) => r.request),

  listMine: (params: { role?: 'employer' | 'worker'; status?: QuickWorkStatus } = {}) => {
    const qs = new URLSearchParams();
    if (params.role) qs.set('role', params.role);
    if (params.status) qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<{ requests: QuickWorkRequest[] }>(`/quick-work/requests/mine${suffix}`).then((r) => r.requests);
  },

  post: (id: string) =>
    apiRequest<{ request: QuickWorkRequest }>(`/quick-work/requests/${id}/post`, { method: 'POST' }).then(
      (r) => r.request,
    ),

  cancel: (id: string, reason?: string | null) =>
    apiRequest<{ request: QuickWorkRequest }>(`/quick-work/requests/${id}/cancel`, {
      method: 'POST',
      body: { reason: reason ?? null },
    }).then((r) => r.request),

  retryMatching: (id: string) =>
    apiRequest<{ retried: true }>(`/quick-work/requests/${id}/retry-matching`, { method: 'POST' }),

  // ─── Worker side (Phase 3) — seeker-plan.md §10-12 ──────────────────────
  listIncomingOffers: () =>
    apiRequest<{ offers: QuickWorkOffer[] }>('/quick-work/offers/incoming').then((r) => r.offers),

  acceptOffer: (offerId: string) =>
    apiRequest<{ request: QuickWorkRequest }>(`/quick-work/offers/${offerId}/accept`, { method: 'POST' }).then(
      (r) => r.request,
    ),

  declineOffer: (offerId: string) =>
    apiRequest<{ declined: true }>(`/quick-work/offers/${offerId}/decline`, { method: 'POST' }),

  // ─── Worker execution flow (Phase 5) — seeker-plan.md §13-18 ────────────
  markArriving: (id: string, coords?: { lat: number; lng: number }) =>
    apiRequest<{ request: QuickWorkRequest }>(`/quick-work/requests/${id}/arriving`, {
      method: 'POST',
      body: coords ?? {},
    }).then((r) => r.request),

  markArrived: (id: string) =>
    apiRequest<{ request: QuickWorkRequest }>(`/quick-work/requests/${id}/arrived`, { method: 'POST' }).then(
      (r) => r.request,
    ),

  startWork: (id: string) =>
    apiRequest<{ request: QuickWorkRequest }>(`/quick-work/requests/${id}/start`, { method: 'POST' }).then(
      (r) => r.request,
    ),

  completeWork: (
    id: string,
    input: { completionPhotoUrl?: string | null; completionNotes?: string | null; finalPrice?: number | null },
  ) =>
    apiRequest<{ request: QuickWorkRequest }>(`/quick-work/requests/${id}/complete`, {
      method: 'POST',
      body: input,
    }).then((r) => r.request),

  raiseDispute: (id: string, reason: string) =>
    apiRequest<{ request: QuickWorkRequest }>(`/quick-work/requests/${id}/dispute`, {
      method: 'POST',
      body: { reason },
    }).then((r) => r.request),

  // ─── Price approval (employer) ──────────────────────────────────────────
  approvePrice: (id: string) =>
    apiRequest<{ request: QuickWorkRequest }>(`/quick-work/requests/${id}/approve-price`, { method: 'POST' }).then(
      (r) => r.request,
    ),

  // ─── No-show ─────────────────────────────────────────────────────────────
  reportNoShow: (id: string, reason: string) =>
    apiRequest<{ request: QuickWorkRequest }>(`/quick-work/requests/${id}/report-no-show`, {
      method: 'POST',
      body: { reason },
    }).then((r) => r.request),

  // ─── Media (employer, draft only) ───────────────────────────────────────
  uploadMedia: (id: string, input: { kind: 'photo' | 'video' | 'voice'; dataUrl: string; mimeType: string; fileName?: string }) =>
    apiRequest<{ request: QuickWorkRequest }>(`/quick-work/requests/${id}/media`, {
      method: 'POST',
      body: input,
    }).then((r) => r.request),

  removeMedia: (id: string, input: { kind: 'photo' | 'video' | 'voice'; url?: string }) =>
    apiRequest<{ request: QuickWorkRequest }>(`/quick-work/requests/${id}/media`, {
      method: 'DELETE',
      body: input,
    }).then((r) => r.request),
};
