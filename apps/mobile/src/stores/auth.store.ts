/**
 * Auth store — single source of truth for "who is signed in" state.
 *
 * State machine (status):
 *   bootstrapping → authenticated | unauthenticated
 *   unauthenticated → bootstrapping (during login/register) → authenticated
 *   authenticated → unauthenticated (on logout / refresh failure)
 *
 * Persistence:
 *   - refresh token (active account) → expo-secure-store key `refreshToken`
 *     (legacy key; kept stable so bootstrap is backward-compatible)
 *   - all saved accounts             → expo-secure-store key `savedAccounts`
 *     (JSON-encoded array of SavedAccount, one entry per signed-in
 *     account on this device — drives the Instagram-style switcher)
 *   - active account id              → expo-secure-store key `activeAccountId`
 *   - access token                   → memory only (short-lived, refreshable)
 *   - user                           → memory only (re-fetched via /auth/me)
 *
 * Multi-account model
 * -------------------
 * Each Doondo user has ONE role (seeker | employer). To let one person
 * have both, we store multiple accounts and let them switch — same model
 * Instagram uses for personal/business accounts. Adding an account
 * doesn't sign the current one out; switching just swaps the active
 * tuple of {user, accessToken, refreshToken}.
 *
 * The store also wires itself into the API client via setAuthAdapter() in
 * App.tsx so the client can read tokens and trigger logout on auth failure
 * without a circular import.
 */

import { create } from 'zustand';
import { authApi } from '@/api/auth.api';
import type { AuthSuccess, PublicUser, UserRole } from '@/api/types';
import { ApiError } from '@/api/errors';
import { setSecure, getSecure, deleteSecure } from '@/lib/secureStore';
import { cacheUser, getCachedUser, clearCachedUser } from '@/lib/userCache';

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated';

/**
 * Per-account snapshot persisted in secure-store. We keep just enough to
 * render the switcher (name, photo, role) without a network round-trip,
 * plus the refresh token needed to bring this account online when the
 * user picks it.
 */
export interface SavedAccount {
  userId: string;
  name: string;
  /** Company name takes precedence in the switcher row for employers. */
  companyName: string | null;
  photoUrl: string | null;
  role: UserRole;
  refreshToken: string;
}

interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  accessToken: string | null;
  refreshToken: string | null;

  /**
   * True when the session was restored from the on-device cache because
   * the phone was offline at launch (no access token yet). The app
   * works from cached data + the offline apply queue until the network
   * returns, at which point the session is silently upgraded.
   */
  offline: boolean;

  /** All signed-in accounts on this device. Includes the active one. */
  savedAccounts: SavedAccount[];
  /** Id of the active account inside `savedAccounts`. */
  activeAccountId: string | null;

  /** Hydrate from secure store + /me on app start. Idempotent. */
  bootstrap: () => Promise<void>;

  /** Set after a successful login or register. Replaces the active session. */
  setSession: (auth: AuthSuccess) => Promise<void>;

  /**
   * Add a new account without signing out the current one. Used by the
   * "Add Employer account" flow from the account switcher. Switches to
   * the newly added account on success.
   */
  addAccount: (auth: AuthSuccess) => Promise<void>;

  /**
   * Swap the active session to another saved account. The whole app
   * re-routes (seeker tabs ↔ employer tabs) because AppNavigator keys
   * off user.role.
   */
  switchAccount: (accountId: string) => Promise<void>;

  /** Update the access token (e.g. after a refresh interceptor rotation). */
  updateTokens: (accessToken: string, refreshToken: string) => Promise<void>;

  /** Force the store into unauthenticated. Used by client on refresh failure. */
  forceLogout: () => Promise<void>;

  /**
   * User-initiated logout — revokes the active account's refresh token
   * and drops it from saved accounts. If another saved account exists,
   * we auto-switch to it; otherwise we land at unauthenticated.
   */
  logout: () => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readSavedAccounts(): Promise<SavedAccount[]> {
  const raw = await getSecure('savedAccounts');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: drop any malformed entries.
    return parsed.filter(
      (a): a is SavedAccount =>
        a &&
        typeof a.userId === 'string' &&
        typeof a.name === 'string' &&
        typeof a.refreshToken === 'string' &&
        (a.role === 'seeker' || a.role === 'employer' || a.role === 'admin'),
    );
  } catch {
    return [];
  }
}

async function writeSavedAccounts(accounts: SavedAccount[]): Promise<void> {
  await setSecure('savedAccounts', JSON.stringify(accounts));
}

/** Snapshot a freshly authed user as a SavedAccount entry. */
function snapshotAccount(auth: AuthSuccess): SavedAccount {
  return {
    userId: auth.user.id,
    name: auth.user.name,
    companyName: auth.user.companyName ?? null,
    photoUrl: auth.user.photoUrl ?? null,
    role: auth.user.role,
    refreshToken: auth.tokens.refreshToken,
  };
}

/**
 * Merge the latest auth result into the saved-accounts list. If we
 * already have an entry for this userId we replace it (its refresh
 * token will have rotated); otherwise we append.
 */
function upsertAccount(
  accounts: SavedAccount[],
  next: SavedAccount,
): SavedAccount[] {
  const existing = accounts.findIndex((a) => a.userId === next.userId);
  if (existing === -1) return [...accounts, next];
  const out = accounts.slice();
  out[existing] = next;
  return out;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'bootstrapping',
  user: null,
  accessToken: null,
  refreshToken: null,
  offline: false,
  savedAccounts: [],
  activeAccountId: null,

  async bootstrap() {
    // Pull both the legacy single-account key and the new multi-account
    // blob. The legacy key is the source of truth for "which account is
    // active right now" because the API client already keys off it.
    const [stored, accounts, activeId] = await Promise.all([
      getSecure('refreshToken'),
      readSavedAccounts(),
      getSecure('activeAccountId'),
    ]);

    if (!stored) {
      set({
        status: 'unauthenticated',
        user: null,
        accessToken: null,
        refreshToken: null,
        savedAccounts: accounts,
        activeAccountId: null,
      });
      return;
    }

    try {
      const { tokens } = await authApi.refresh(stored);
      await setSecure('refreshToken', tokens.refreshToken);
      set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      const { user } = await authApi.me();

      // Backfill: if savedAccounts is empty but a legacy single-account
      // session is bootstrapping, seed the list with this user so the
      // switcher works immediately.
      const seeded = upsertAccount(accounts, {
        userId: user.id,
        name: user.name,
        companyName: user.companyName ?? null,
        photoUrl: user.photoUrl ?? null,
        role: user.role,
        refreshToken: tokens.refreshToken,
      });
      await writeSavedAccounts(seeded);
      await setSecure('activeAccountId', user.id);
      // Cache the profile so a later offline launch can restore it.
      void cacheUser(user);

      set({
        status: 'authenticated',
        user,
        offline: false,
        savedAccounts: seeded,
        activeAccountId: user.id,
      });
    } catch (err) {
      if (err instanceof ApiError && err.isTransient) {
        // No network at launch — not a rejected session. Restore the
        // last session from the on-device cache so the worker lands
        // inside the app (cached jobs + the offline apply queue work)
        // instead of a dead login screen. The token is kept; the
        // session upgrades silently once the network returns.
        const cached = activeId ? await getCachedUser(activeId) : null;
        if (cached) {
          set({
            status: 'authenticated',
            user: cached,
            accessToken: null,
            refreshToken: stored,
            offline: true,
            savedAccounts: accounts,
            activeAccountId: cached.id,
          });
          return;
        }
        // No cached profile to restore — fall through to login.
      } else {
        // Permanent failure (revoked / expired family). Drop this
        // account's token + cached profile; the user signs in again.
        // Other saved accounts stay intact for the switcher.
        await deleteSecure('refreshToken');
        await deleteSecure('activeAccountId');
        const remaining = activeId
          ? accounts.filter((a) => a.userId !== activeId)
          : accounts;
        await writeSavedAccounts(remaining);
        if (activeId) void clearCachedUser(activeId);
        set({ savedAccounts: remaining });
      }
      set({
        status: 'unauthenticated',
        user: null,
        accessToken: null,
        refreshToken: null,
        offline: false,
        activeAccountId: null,
      });
    }
  },

  async setSession(auth) {
    await setSecure('refreshToken', auth.tokens.refreshToken);
    await setSecure('activeAccountId', auth.user.id);
    const next = upsertAccount(get().savedAccounts, snapshotAccount(auth));
    await writeSavedAccounts(next);
    void cacheUser(auth.user);
    set({
      status: 'authenticated',
      user: auth.user,
      accessToken: auth.tokens.accessToken,
      refreshToken: auth.tokens.refreshToken,
      offline: false,
      savedAccounts: next,
      activeAccountId: auth.user.id,
    });
  },

  async addAccount(auth) {
    // Identical persistence to setSession — the difference is purely
    // semantic. We expose it as a separate action so callers can express
    // intent ("I'm adding, not replacing") and so we have a clean hook
    // point if we later want to e.g. show a "switched to ..." toast.
    await get().setSession(auth);
  },

  async switchAccount(accountId) {
    const account = get().savedAccounts.find((a) => a.userId === accountId);
    if (!account) return;
    if (account.userId === get().activeAccountId) return;

    // Flip to bootstrapping so the RootNavigator shows the splash while
    // we exchange the new account's refresh token for a fresh access
    // token + user payload. This avoids briefly rendering the previous
    // user's tabs with the new user's data.
    set({
      status: 'bootstrapping',
      user: null,
      accessToken: null,
      refreshToken: null,
    });

    try {
      const { tokens } = await authApi.refresh(account.refreshToken);
      await setSecure('refreshToken', tokens.refreshToken);
      await setSecure('activeAccountId', account.userId);
      // Refresh-token rotation — persist the new one back into the
      // saved-accounts list so we don't try the old one next time.
      const rotated = upsertAccount(get().savedAccounts, {
        ...account,
        refreshToken: tokens.refreshToken,
      });
      await writeSavedAccounts(rotated);

      set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      const { user } = await authApi.me();
      void cacheUser(user);
      set({
        status: 'authenticated',
        user,
        offline: false,
        savedAccounts: upsertAccount(rotated, {
          ...account,
          name: user.name,
          companyName: user.companyName ?? null,
          photoUrl: user.photoUrl ?? null,
          role: user.role,
          refreshToken: tokens.refreshToken,
        }),
        activeAccountId: user.id,
      });
    } catch {
      // Switch failed (revoked / network). Drop the bad entry so the
      // switcher doesn't keep offering it, then fall back to whichever
      // account was active before (if its token is still around).
      const remaining = get().savedAccounts.filter(
        (a) => a.userId !== account.userId,
      );
      await writeSavedAccounts(remaining);
      set({ savedAccounts: remaining });
      // Re-run bootstrap to re-establish whatever session is still valid.
      await get().bootstrap();
    }
  },

  async updateTokens(accessToken, refreshToken) {
    await setSecure('refreshToken', refreshToken);
    // Mirror the rotated refresh token onto the active SavedAccount entry.
    const active = get().activeAccountId;
    if (active) {
      const next = get().savedAccounts.map((a) =>
        a.userId === active ? { ...a, refreshToken } : a,
      );
      await writeSavedAccounts(next);
      set({ savedAccounts: next });
    }
    set({ accessToken, refreshToken });
  },

  async forceLogout() {
    await deleteSecure('refreshToken');
    await deleteSecure('activeAccountId');
    const active = get().activeAccountId;
    if (active) void clearCachedUser(active);
    const remaining = active
      ? get().savedAccounts.filter((a) => a.userId !== active)
      : get().savedAccounts;
    await writeSavedAccounts(remaining);
    set({
      status: 'unauthenticated',
      user: null,
      accessToken: null,
      refreshToken: null,
      offline: false,
      savedAccounts: remaining,
      activeAccountId: null,
    });
  },

  async logout() {
    const refreshToken = get().refreshToken;
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // ignore — local logout proceeds regardless
      }
    }
    const active = get().activeAccountId;
    if (active) void clearCachedUser(active);
    const remaining = active
      ? get().savedAccounts.filter((a) => a.userId !== active)
      : get().savedAccounts;
    await writeSavedAccounts(remaining);
    await deleteSecure('refreshToken');
    await deleteSecure('activeAccountId');

    // If another saved account exists, slide into it so the user lands
    // on a useful screen instead of being kicked back to the login wall.
    const next = remaining[0];
    if (next) {
      set({ savedAccounts: remaining });
      await get().switchAccount(next.userId);
      return;
    }

    set({
      status: 'unauthenticated',
      user: null,
      accessToken: null,
      refreshToken: null,
      offline: false,
      savedAccounts: remaining,
      activeAccountId: null,
    });
  },
}));
