/**
 * "Needs you now" — the prioritized employer action feed for Home.
 */

import { apiRequest } from './client';

export type NeedsYouNowRoute = 'applicant' | 'applicants' | 'workforce';

export type NeedsYouNowKind =
  | 'worker_on_the_way'
  | 'counter_offer'
  | 'work_proof'
  | 'applicant_waiting'
  | 'expiring_doc';

export interface NeedsYouNowItem {
  kind: NeedsYouNowKind;
  count: number;
  sample: string;
  applicationId: string | null;
  route: NeedsYouNowRoute;
  priority: number;
}

export interface NeedsYouNowResult {
  items: NeedsYouNowItem[];
}

export const needsYouNowApi = {
  get: () => apiRequest<NeedsYouNowResult>('/needs-you-now'),
};
