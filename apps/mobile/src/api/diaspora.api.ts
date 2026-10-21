/** Doondo Diaspora — hiring from abroad for family in India. */
import { apiRequest } from './client';

export interface DiasporaSettings {
  enabled: boolean;
  country: string | null;
  timezone: string | null;
  localContact: { name: string | null; phone: string | null; relation: string | null } | null;
}

export const diasporaApi = {
  get: () => apiRequest<{ settings: DiasporaSettings }>('/diaspora').then((r) => r.settings),
  save: (s: Partial<DiasporaSettings>) =>
    apiRequest<{ settings: DiasporaSettings }>('/diaspora', { method: 'PUT', body: s }).then((r) => r.settings),
};
