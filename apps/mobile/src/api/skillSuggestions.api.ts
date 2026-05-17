/**
 * skillSuggestions.api — "Add X → +N% matches" rail on Profile.
 */
import { apiRequest } from './client';

export interface SkillSuggestion {
  skill: string;
  upliftPercent: number;
  jobsNeedingIt: number;
}

export const skillSuggestionsApi = {
  list: () =>
    apiRequest<{ suggestions: SkillSuggestion[] }>('/me/skill-suggestions'),
};
