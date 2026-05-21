/**
 * Doondo Constitution hooks — the seeker's personal work rules.
 *
 * `useConstitution` reads the current rules; `useSaveConstitution`
 * persists an edited copy and refreshes the cache.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { constitutionApi } from '@/api/constitution.api';
import type { SeekerConstitution } from '@/api/types';

export const CONSTITUTION_KEY = ['me', 'constitution'] as const;

export function useConstitution() {
  return useQuery({
    queryKey: CONSTITUTION_KEY,
    queryFn: () => constitutionApi.get(),
    staleTime: 60_000,
  });
}

export function useSaveConstitution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SeekerConstitution) => constitutionApi.save(body),
    onSuccess: (data) => {
      // Seed the cache with the saved value so the screen reflects it
      // immediately without a refetch round-trip.
      queryClient.setQueryData(CONSTITUTION_KEY, data);
    },
  });
}
