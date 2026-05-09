/**
 * useApplicationSocket — keeps the Applications React Query cache live.
 *
 * Behaviour:
 *   1. When the user is authenticated, connect the socket with their
 *      access token (handshake auth).
 *   2. Listen for `application:status_changed`. On any event, mutate
 *      the cached `applications.me` array in place to reflect the new
 *      status, and bump the cached job detail viewedAt timestamp if we
 *      have one. No refetch needed — the payload has everything we
 *      need.
 *   3. On logout / unmount, disconnect.
 *
 * Mount this once at the AppNavigator level so the listener follows the
 * authenticated session, not any single screen.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import type { ApplicationStatus, PublicApplication } from '@/api/types';

interface StatusChangedPayload {
  applicationId: string;
  jobId: string;
  status: ApplicationStatus;
  timestamp: string;
}

export function useApplicationSocket() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status !== 'authenticated' || !accessToken) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket(accessToken);

    const onStatusChanged = (payload: StatusChangedPayload) => {
      // Update the list cache.
      queryClient.setQueryData<{ applications: PublicApplication[] } | undefined>(
        ['applications', 'me'],
        (prev) => {
          if (!prev) return prev;
          return {
            applications: prev.applications.map((a) =>
              a.id === payload.applicationId
                ? mergeStatus(a, payload)
                : a,
            ),
          };
        },
      );
      // Update the single-detail cache if present.
      queryClient.setQueryData<{ application: PublicApplication } | undefined>(
        ['application', payload.applicationId],
        (prev) => {
          if (!prev) return prev;
          return { application: mergeStatus(prev.application, payload) };
        },
      );
    };

    socket.on('application:status_changed', onStatusChanged);

    return () => {
      socket.off('application:status_changed', onStatusChanged);
    };
  }, [accessToken, status, queryClient]);
}

/**
 * Merge a status-change event into an Application, setting the matching
 * timeline timestamp without losing the others.
 */
function mergeStatus(
  app: PublicApplication,
  payload: StatusChangedPayload,
): PublicApplication {
  const timeline = { ...app.timeline };
  switch (payload.status) {
    case 'pending':
      timeline.appliedAt = payload.timestamp;
      break;
    case 'viewed':
      timeline.viewedAt = payload.timestamp;
      break;
    case 'shortlisted':
      timeline.shortlistedAt = payload.timestamp;
      break;
    case 'rejected':
      timeline.rejectedAt = payload.timestamp;
      break;
    case 'hired':
      timeline.hiredAt = payload.timestamp;
      break;
    case 'withdrawn':
      timeline.withdrawnAt = payload.timestamp;
      break;
  }
  return { ...app, status: payload.status, timeline };
}
