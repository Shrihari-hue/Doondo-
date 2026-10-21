/** "Why wasn't I picked?" — grounded explanation for a rejected application. */
import { apiRequest } from './client';
import type { PublicJob } from './types';

export interface RejectionExplainer {
  applicationId: string;
  jobTitle: string;
  explanation: string;
  facts: { missingSkills: string[]; applicantsCount: number; jobFilled: boolean; profileCompletionHints: string[] };
  nextSteps: Array<{ kind: 'course' | 'profile' | 'job'; label: string; courseId?: string; jobId?: string }>;
  similarJobs: PublicJob[];
  source: 'ai' | 'fallback';
  generatedAt: string;
}

export const rejectionExplainerApi = {
  get: (applicationId: string) =>
    apiRequest<{ explainer: RejectionExplainer }>(`/rejection-explainer/${applicationId}`).then((r) => r.explainer),
};
