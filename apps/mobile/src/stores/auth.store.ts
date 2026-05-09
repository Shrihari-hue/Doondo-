/**
 * Auth store — single source of truth for "who is signed in" state.
 *
 * State machine (status):
 *   bootstrapping → authenticated | unauthenticated
 *   unauthenticated → bootstrapping (during login/register) → authenticated
 *   authenticated → unauthenticated (on logout / refresh failure)
 *
 * Persistence:
 *   - refresh token → expo-secure-store (survives app restart)
 *   - access token  → memory only (short-lived, refreshable)
 *   - user          → memory only (re-fetched via /auth/me on bootstrap)
 *
 * The store also wires itself into the API client via setAuthAdapter() in
 * App.tsx so the client can read tokens and trigger logout on auth failure
 * without a circular import.
 */

import { create } from 'zustand';
import { authApi } from '@/api/auth.api';
import type { AuthSuccess, PublicUser } from '@/api/types';
import { ApiError } from '@/api/errors';
import { setSecure, getSecure, deleteSecure } from '@/lib/secureStore';

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  accessToken: string | null;
  refreshToken: string | null;

  /** Hydrate from secure store + /me on app start. Idempotent. */
  bootstrap: () => Promise<void>;

  /** Set after a successful login or register. */
  setSession: (auth: AuthSuccess) => Promise<void>;

  /** Update the access token (e.g. after a refresh interceptor rotation). */
  updateTokens: (accessToken: string, refreshToken: string) => Promise<void>;

  /** Force the store into unauthenticated. Used by client on refresh failure. */
  forceLogout: () => Promise<void>;

  /** User-initiated logout — also tells the backend to revoke the refresh token. */
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'bootstrapping',
  user: null,
  accessToken: null,
  refreshToken: null,

  async bootstrap() {
    const stored = await getSecure('refreshToken');
    if (!stored) {
      set({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null });
      return;
    }
    try {
      const { tokens } = await authApi.refresh(stored);
      // Store the new pair before fetching /me so apiRequest can attach it.
      await setSecure('refreshToken', tokens.refreshToken);
      set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      const { user } = await authApi.me();
      set({ status: 'authenticated', user });
    } catch (err) {
      // Refresh failed (revoked, expired family, network down). Drop to
      // unauthenticated; the user will sign in again. We delete the stored
      // refresh token so we don't loop on the next launch.
      if (err instanceof ApiError && !err.isTransient) {
        await deleteSecure('refreshToken');
      }
      set({
        status: 'unauthenticated',
        user: null,
        accessToken: null,
        refreshToken: null,
      });
    }
  },

  async setSession(auth) {
    await setSecure('refreshToken', auth.tokens.refreshToken);
    set({
      status: 'authenticated',
      user: auth.user,
      accessToken: auth.tokens.accessToken,
      refreshToken: auth.tokens.refreshToken,
    });
  },

  async updateTokens(accessToken, refreshToken) {
    await setSecure('refreshToken', refreshToken);
    set({ accessToken, refreshToken });
  },

  async forceLogout() {
    await deleteSecure('refreshToken');
    set({
      status: 'unauthenticated',
      user: null,
      accessToken: null,
      refreshToken: null,
    });
  },

  async logout() {
    const refreshToken = get().refreshToken;
    if (refreshToken) {
      // Best-effort; if the network is down we still want to log out locally.
      try {
        await authApi.logout(refreshToken);
      } catch {
        // ignore
      }
    }
    await deleteSecure('refreshToken');
    set({
      status: 'unauthenticated',
      user: null,
      accessToken: null,
      refreshToken: null,
    });
  },
}));
