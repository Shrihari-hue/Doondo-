import { QueryClient } from '@tanstack/react-query';

/**
 * Shared React Query client for all server state.
 *
 * Defaults reflect a mobile-first app:
 *   - staleTime: 30s — most lists feel fresh for that long; cuts re-fetches
 *     when navigating back to a screen.
 *   - retry: 2 — mobile networks are flaky; one retry isn't always enough.
 *   - refetchOnWindowFocus: false — RN doesn't have window focus the way
 *     web does. We use refetchOnReconnect (default true) instead.
 *   - refetchOnReconnect: true — when a flaky network returns, pull fresh data.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
