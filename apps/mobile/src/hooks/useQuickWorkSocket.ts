/**
 * useQuickWorkSocket — keeps Quick Work React Query caches live.
 * employer-plan.md §24 / seeker-plan.md §28.
 *
 * Reuses the exact same socket connection every other `use*Socket` hook
 * in this app already opens (`lib/socket.ts#connectSocket`) — no second
 * real-time transport. Rather than patch each payload's fields into the
 * cache (the Applications hook's approach), this just invalidates the
 * affected query keys and lets the existing 5-8s polling `refetchInterval`
 * on each screen pick up the real state immediately — simpler, and safe
 * since the database (not the socket payload) stays authoritative.
 *
 * Mount once at the AppNavigator level, same as useApplicationSocket.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { connectSocket, disconnectSocket } from '@/lib/socket';

const REQUEST_SCOPED_EVENTS = [
  'quick_work:request_posted',
  'quick_work:matching_started',
  'quick_work:matched',
  'quick_work:status_changed',
  'quick_work:worker_arriving',
  'quick_work:worker_arrived',
  'quick_work:started',
  'quick_work:completed',
  'quick_work:cancelled',
  'quick_work:expired',
  'quick_work:no_worker_found',
  'quick_work:payment_pending',
  'quick_work:paid',
  'quick_work:disputed',
  'quick_work:rated',
  'quick_work:scheduled_reminder',
  'quick_work:no_show',
  'quick_work:price_approved',
] as const;

const OFFER_EVENTS = ['quick_work:offer_received', 'quick_work:offer_expired', 'quick_work:offer_closed'] as const;

export function useQuickWorkSocket() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status !== 'authenticated' || !accessToken) return;

    const socket = connectSocket(accessToken);

    const onRequestEvent = (payload: { requestId?: string }) => {
      if (payload?.requestId) {
        void queryClient.invalidateQueries({ queryKey: ['quick-work', 'request', payload.requestId] });
      }
      void queryClient.invalidateQueries({ queryKey: ['quick-work', 'requests', 'mine'] });
    };
    const onOfferEvent = () => {
      void queryClient.invalidateQueries({ queryKey: ['quick-work', 'offers', 'incoming'] });
    };

    for (const event of REQUEST_SCOPED_EVENTS) socket.on(event, onRequestEvent);
    for (const event of OFFER_EVENTS) socket.on(event, onOfferEvent);

    return () => {
      for (const event of REQUEST_SCOPED_EVENTS) socket.off(event, onRequestEvent);
      for (const event of OFFER_EVENTS) socket.off(event, onOfferEvent);
    };
  }, [accessToken, status, queryClient]);
}
