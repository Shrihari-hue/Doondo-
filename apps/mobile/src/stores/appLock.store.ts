/**
 * App-lock store — the biometric / PIN unlock gate.
 *
 * When the worker turns the lock on, every app-open is gated by a quick
 * device unlock (fingerprint, face, or screen PIN/pattern). Combined
 * with offline session restore, the experience is: log in once with a
 * password, then unlock with your thumb forever after — online or off.
 *
 * Opt-in and off by default — a security feature, not a surprise. The
 * preference persists in secure-store; `locked` is runtime-only and is
 * re-engaged whenever the app is backgrounded (see RootNavigator).
 */

import { create } from 'zustand';
import { getSecure, setSecure } from '@/lib/secureStore';
import { isBiometricAvailable, authenticate } from '@/lib/biometric';

interface AppLockState {
  /** The worker has turned the lock on (persisted preference). */
  enabled: boolean;
  /** The device actually has a fingerprint / face / screen lock set up. */
  available: boolean;
  /** The preference + availability check have finished loading. */
  hydrated: boolean;
  /** The app is currently locked and awaiting an unlock. */
  locked: boolean;

  /** Load the preference + device capability. Call once at app start. */
  hydrate: () => Promise<void>;
  /** Turn the lock on or off. */
  setEnabled: (on: boolean) => Promise<void>;
  /** Re-engage the lock — called when the app goes to the background. */
  lock: () => void;
  /** Run the device unlock prompt; on success, clear the lock. */
  unlock: (promptMessage: string) => Promise<boolean>;
}

export const useAppLockStore = create<AppLockState>((set, get) => ({
  enabled: false,
  available: false,
  hydrated: false,
  locked: false,

  async hydrate() {
    const [stored, available] = await Promise.all([
      getSecure('biometricLockEnabled'),
      isBiometricAvailable(),
    ]);
    // Honour the preference only when the device can actually unlock.
    const enabled = stored === 'true' && available;
    set({ enabled, available, hydrated: true, locked: enabled });
  },

  async setEnabled(on) {
    await setSecure('biometricLockEnabled', on ? 'true' : 'false');
    // Don't lock the worker out the instant they flip it on — they're
    // already inside the app. The lock engages on the next open.
    set({ enabled: on, locked: false });
  },

  lock() {
    if (get().enabled) set({ locked: true });
  },

  async unlock(promptMessage) {
    const ok = await authenticate(promptMessage);
    if (ok) set({ locked: false });
    return ok;
  },
}));
