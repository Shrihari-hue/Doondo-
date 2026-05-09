/**
 * useAuthBootstrap — runs once on app start. Reads refresh token from
 * secure store, swaps it for a fresh access pair, and fetches /me. The
 * store handles persistence; this hook just kicks off the work.
 *
 * Called from App.tsx, not from individual screens.
 */

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';

export function useAuthBootstrap(): void {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
}
