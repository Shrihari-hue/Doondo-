/**
 * Photo proof of work — worker submits a photo of the finished job at
 * checkout; the employer approves before paying. The quality half of
 * trust, alongside shift check-in.
 */

import { apiRequest } from './client';

export type WorkProofStatus = 'none' | 'submitted' | 'approved' | 'rejected';

export interface WorkProof {
  status: WorkProofStatus;
  photoUrl: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export const workProofApi = {
  get: (applicationId: string) =>
    apiRequest<WorkProof>(`/work-proof/${applicationId}`),

  /** Worker submits the completed-work photo (base64 data URL). */
  submit: (applicationId: string, photoDataUrl: string) =>
    apiRequest<WorkProof>(`/work-proof/${applicationId}`, {
      method: 'POST',
      body: { photoDataUrl },
    }),

  /** Employer approves (true) or rejects (false) the submitted proof. */
  review: (applicationId: string, approve: boolean) =>
    apiRequest<WorkProof>(`/work-proof/${applicationId}/review`, {
      method: 'POST',
      body: { approve },
    }),
};
