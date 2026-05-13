/**
 * Notification hooks — backed by React Query so the bell badge stays
 * fresh across the app without manual refetches.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/api/notifications.api';

const NOTIFICATIONS_KEY = ['notifications'] as const;
const UNREAD_COUNT_KEY = ['notifications', 'unread-count'] as const;

export function useNotifications(limit = 20) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, limit],
    queryFn: () => notificationsApi.list({ limit }),
    // Refetch when the app comes back to the foreground or the user
    // pulls to refresh; the underlying React Query staleTime keeps
    // network traffic reasonable.
    staleTime: 30_000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: () => notificationsApi.unreadCount(),
    // Bell badge: refresh more eagerly so it feels live.
    staleTime: 15_000,
    // Light polling so the badge updates even without a screen change.
    refetchInterval: 60_000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
    },
  });
}
