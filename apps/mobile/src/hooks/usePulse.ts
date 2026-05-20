/**
 * usePulse — the worker's momentum snapshot for the Home dashboard.
 *
 * Backed by React Query. A 60s staleTime keeps the Home screen from
 * re-hitting the endpoint on every focus while still feeling current;
 * a pull-to-refresh on Home refetches it along with the job feed.
 */

import { useQuery } from '@tanstack/react-query';
import { pulseApi } from '@/api/pulse.api';

export const PULSE_KEY = ['me', 'pulse'] as const;

export function usePulse() {
  return useQuery({
    queryKey: PULSE_KEY,
    queryFn: () => pulseApi.get(),
    staleTime: 60_000,
  });
}
