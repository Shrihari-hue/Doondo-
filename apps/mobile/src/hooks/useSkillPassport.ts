/**
 * useSkillPassport — the worker's portable, verified work credential.
 *
 * Backed by React Query. A 60s staleTime is plenty: a passport changes
 * only when an endorsement, test pass, or hire lands, none of which are
 * second-to-second events.
 */

import { useQuery } from '@tanstack/react-query';
import { skillPassportApi } from '@/api/skillPassport.api';

export const SKILL_PASSPORT_KEY = ['me', 'skill-passport'] as const;

export function useSkillPassport() {
  return useQuery({
    queryKey: SKILL_PASSPORT_KEY,
    queryFn: () => skillPassportApi.get(),
    staleTime: 60_000,
  });
}
