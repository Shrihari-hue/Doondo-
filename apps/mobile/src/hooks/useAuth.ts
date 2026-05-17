/**
 * useAuth — convenience hook returning a stable, typed slice of the auth
 * store. Use this in screens; reach for useAuthStore directly only when
 * you need imperative actions outside React (e.g. inside the API client).
 */

import { useAuthStore } from '@/stores/auth.store';

export function useAuth() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const logout = useAuthStore((s) => s.logout);
  const savedAccounts = useAuthStore((s) => s.savedAccounts);
  const activeAccountId = useAuthStore((s) => s.activeAccountId);
  const addAccount = useAuthStore((s) => s.addAccount);
  const switchAccount = useAuthStore((s) => s.switchAccount);

  return {
    status,
    user,
    isAuthenticated: status === 'authenticated',
    isBootstrapping: status === 'bootstrapping',
    setSession,
    logout,
    // Multi-account
    savedAccounts,
    activeAccountId,
    addAccount,
    switchAccount,
  };
}
