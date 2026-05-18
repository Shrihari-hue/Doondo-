/**
 * SOS endpoints — Trust Circle CRUD + alert trigger.
 *
 * The Trust Circle lives on the user document (PUT replaces the whole
 * 3-item array). The trigger fans out to matched Doondo users + nearest
 * verified peers, returning unmatched contacts so the device can open
 * SMS composers as a fallback.
 */

import { apiRequest } from './client';
import type { SosTriggerResponse, PublicSosAlert } from './types';

export interface TrustContactPayload {
  name: string;
  phone: string;
  /** 'family' | 'friend' | 'employer' | custom (max 40 chars). */
  relationship?: string | null;
}

export interface TrustCircleResponse {
  trustCircle: Array<{
    name: string;
    phone: string;
    relationship: string | null;
  }>;
  isPeerResponder: boolean;
}

export const sosApi = {
  getTrustCircle: () =>
    apiRequest<TrustCircleResponse>('/me/trust-circle'),

  putTrustCircle: (contacts: TrustContactPayload[]) =>
    apiRequest<TrustCircleResponse>('/me/trust-circle', {
      method: 'PUT',
      body: { contacts },
    }),

  setPeerResponder: (enabled: boolean) =>
    apiRequest<{ isPeerResponder: boolean }>('/me/peer-responder', {
      method: 'POST',
      body: { enabled },
    }),

  trigger: (body: { lat?: number; lng?: number; note?: string }) =>
    apiRequest<SosTriggerResponse>('/sos/trigger', {
      method: 'POST',
      body,
    }),

  listMine: () =>
    apiRequest<{ alerts: PublicSosAlert[] }>('/sos/mine'),

  resolve: (alertId: string) =>
    apiRequest<{ alert: PublicSosAlert }>(`/sos/${alertId}/resolve`, {
      method: 'POST',
    }),
};
