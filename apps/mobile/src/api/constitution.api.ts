/**
 * Doondo Constitution — the seeker's personal work rules.
 *
 * GET returns the worker's current rules (fully defaulted); PUT replaces
 * them. Seeker-only; employers see a worker's Constitution on the
 * applicant view, not through this endpoint.
 */

import { apiRequest } from './client';
import type { SeekerConstitution } from './types';

export const constitutionApi = {
  get: () =>
    apiRequest<{ constitution: SeekerConstitution }>('/me/constitution'),

  save: (body: SeekerConstitution) =>
    apiRequest<{ constitution: SeekerConstitution }>('/me/constitution', {
      method: 'PUT',
      body,
    }),
};
