/**
 * advances.api — seeker advance / microloan stub.
 *
 * V1 just persists the request; ops processes it manually until we
 * integrate a real lender.
 */
import { apiRequest } from './client';

export type AdvanceStatus =
  | 'requested'
  | 'approved'
  | 'paid'
  | 'repaid'
  | 'declined'
  | 'cancelled';

export interface PublicAdvance {
  id: string;
  amountPaise: number;
  currency: string;
  reason: string;
  applicationId: string | null;
  status: AdvanceStatus;
  repayBy: string | null;
  opsNote: string | null;
  createdAt: string;
}

export interface CreateAdvanceInput {
  amountPaise: number;
  reason?: string;
  applicationId?: string;
  repayBy?: string;
}

export const advancesApi = {
  list: () =>
    apiRequest<{ advances: PublicAdvance[] }>('/me/advances'),
  create: (input: CreateAdvanceInput) =>
    apiRequest<{ advance: PublicAdvance }>('/me/advances', {
      method: 'POST',
      body: input,
    }),
  cancel: (id: string) =>
    apiRequest<{ advance: PublicAdvance }>(`/me/advances/${id}/cancel`, {
      method: 'PATCH',
    }),
};
