/**
 * Women's Mode store — the "Doondo for Women" worker preference.
 *
 * When a seeker turns Women's Mode on, their job feeds are filtered to
 * postings the employer has marked women-safe. It is a *view filter*,
 * nothing more: it never changes a worker's account, and it is strictly
 * additive — men's feeds are untouched, and a woman can turn it off any
 * time to see everything.
 *
 * The preference lives on-device (secure-store), like the app-lock and
 * Home-tab preferences — it is a personal UI choice, not account state,
 * so it needs no server round-trip. `hydrated` lets a feed wait for the
 * stored value before its first fetch so the worker never sees a flash
 * of the unfiltered list.
 */

import { create } from 'zustand';
import { getSecure, setSecure } from '@/lib/secureStore';

interface WomenModeState {
  /** The seeker has turned Women's Mode on (persisted preference). */
  enabled: boolean;
  /** The stored preference has finished loading. */
  hydrated: boolean;

  /** Load the preference. Call once at app start. */
  hydrate: () => Promise<void>;
  /** Turn Women's Mode on or off. */
  setEnabled: (on: boolean) => Promise<void>;
}

export const useWomenModeStore = create<WomenModeState>((set) => ({
  enabled: false,
  hydrated: false,

  async hydrate() {
    try {
      const stored = await getSecure('womenModeEnabled');
      set({ enabled: stored === 'true', hydrated: true });
    } catch {
      // Best-effort — a read failure just leaves the mode off.
      set({ hydrated: true });
    }
  },

  async setEnabled(on) {
    // Update the UI immediately; persist behind it.
    set({ enabled: on });
    try {
      await setSecure('womenModeEnabled', on ? 'true' : 'false');
    } catch {
      /* best-effort — the in-memory value still holds for this session */
    }
  },
}));
