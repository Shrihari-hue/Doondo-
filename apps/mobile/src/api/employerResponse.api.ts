/**
 * Employer response settings — quiet hours + auto-reply.
 *
 * Lets an employer declare when they're reachable so the anti-ghost
 * engine doesn't flag them overnight. Hours are IST [0–23]; the window
 * may wrap midnight (start 21, end 7).
 */

import { apiRequest } from './client';

export interface ResponseSettings {
  quietHoursEnabled: boolean;
  quietStartHour: number;
  quietEndHour: number;
  autoReply: string;
  smsApplicantAlerts: boolean;
}

export const employerResponseApi = {
  get: () => apiRequest<ResponseSettings>('/employer-response'),

  save: (settings: ResponseSettings) =>
    apiRequest<ResponseSettings>('/employer-response', {
      method: 'PUT',
      body: settings,
    }),
};
