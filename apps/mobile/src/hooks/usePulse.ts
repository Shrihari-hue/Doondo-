/**
 * usePulse — the worker's momentum snapshot for the Home dashboard.
 *
 * Backed by React Query. A 60s staleTime keeps the Home screen from
 * re-hitting the endpoint on every focus while still feeling current;
 * a pull-to-refresh on Home refetches it along with the job feed.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pulseApi } from '@/api/pulse.api';
import { useTranslate } from '@/i18n/useTranslate';
import { pushPulseSnapshotToWidget } from '@/lib/pulseWidget';

export const PULSE_KEY = ['me', 'pulse'] as const;

export function usePulse() {
  const t = useTranslate();
  const query = useQuery({
    queryKey: PULSE_KEY,
    queryFn: () => pulseApi.get(),
    staleTime: 60_000,
  });

  // Push every fresh snapshot to the home-screen widget (#30) — the
  // widget has no i18n of its own, so it gets the already-localized
  // nudge text rather than the raw key. No-ops safely on a build
  // without the native widget module.
  const pulse = query.data;
  useEffect(() => {
    if (pulse) pushPulseSnapshotToWidget(pulse, t(pulse.nudge.key));
  }, [pulse, t]);

  return query;
}
