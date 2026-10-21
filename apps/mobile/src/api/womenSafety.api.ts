/** Doondo for Women — privacy settings + peer workplace-safety confirmations. */
import { apiRequest } from './client';
import type { WomenSafety } from './types';

export type WomenSafetySignalKey = keyof WomenSafety;

export interface PrivacySettings { maskLocation: boolean; womenMode: boolean }
export interface PendingSafetyQuestion {
  applicationId: string;
  jobTitle: string;
  employerName: string;
  declared: WomenSafetySignalKey[];
}
export interface EmployerSafetySummary {
  employerId: string;
  reports: number;
  safe: number;
  safePercent: number | null;
  signals: Partial<Record<WomenSafetySignalKey, number>>;
}

export const womenSafetyApi = {
  privacy: () => apiRequest<{ privacy: PrivacySettings }>('/women-safety/privacy').then((r) => r.privacy),
  setPrivacy: (patch: Partial<PrivacySettings>) =>
    apiRequest<{ privacy: PrivacySettings }>('/women-safety/privacy', { method: 'PATCH', body: patch }).then((r) => r.privacy),
  pending: () => apiRequest<{ questions: PendingSafetyQuestion[] }>('/women-safety/pending').then((r) => r.questions),
  report: (body: { applicationId: string; safe: boolean; confirmed: WomenSafetySignalKey[] }) =>
    apiRequest<{ saved: boolean }>('/women-safety/reports', { method: 'POST', body }),
  employer: (employerId: string) =>
    apiRequest<{ summary: EmployerSafetySummary }>(`/women-safety/employers/${employerId}`).then((r) => r.summary),
};
