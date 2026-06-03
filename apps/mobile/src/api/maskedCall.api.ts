/**
 * Masked calling — start a privacy-preserving call to the other party on
 * a hire. Returns either a proxy number to dial (masked) or, when no
 * telephony provider is configured, the real number (reveal fallback).
 */

import { apiRequest } from './client';

export interface CallResult {
  mode: 'proxy' | 'reveal';
  dialNumber: string | null;
  name: string;
  masked: boolean;
}

export const maskedCallApi = {
  start: (applicationId: string) =>
    apiRequest<{ call: CallResult }>('/masked-call', {
      method: 'POST',
      body: { applicationId },
    }).then((r) => r.call),
};
