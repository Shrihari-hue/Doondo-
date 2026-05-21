/**
 * Offline-queue hooks — drive the pending-application sync.
 *
 * `useOfflineQueueSync` is mounted once for the authenticated session.
 * It flushes the queue on mount and every time the app returns to the
 * foreground (an AppState 'active' transition) — the moment a worker
 * walks back into signal. No NetInfo dependency: a foreground event is
 * a good-enough "maybe we're online again" trigger, and the flush
 * itself stops cleanly if the network is still down.
 *
 * `useOfflinePendingCount` exposes how many applications are waiting,
 * for a "will send when you're online" indicator.
 */

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  countPendingApplications,
  flushPendingApplications,
} from '@/lib/offlineQueue';

export function useOfflineQueueSync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    async function flush() {
      const summary = await flushPendingApplications().catch(() => null);
      if (cancelled || !summary) return;
      // A delivered application changes the seeker's application list
      // and a job's applicant count — refresh both.
      if (summary.sent > 0) {
        void queryClient.invalidateQueries({ queryKey: ['applications'] });
        void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      }
    }

    void flush();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flush();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [queryClient]);
}

export function useOfflinePendingCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void countPendingApplications().then((n) => {
        if (!cancelled) setCount(n);
      });
    };
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return count;
}
