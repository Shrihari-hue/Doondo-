/**
 * useAuthBootstrap — runs once on app start. Reads refresh token from
 * secure store, swaps it for a fresh access pair, and fetches /me. The
 * store handles persistence; this hook just kicks off the work.
 *
 * Called from App.tsx, not from individual screens.
 */

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { setErrorUser } from '@/lib/errorTracking';

export function useAuthBootstrap(): void {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const user = useAuthStore((s) => s.user);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  // Tag Sentry events with the active user id so support tickets can
  // be cross-referenced. We never pass email / phone — just the id.
  useEffect(() => {
    setErrorUser(user ? { id: user.id } : null);
  }, [user]);
}
