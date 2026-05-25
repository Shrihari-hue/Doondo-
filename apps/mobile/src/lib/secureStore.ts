/**
 * Wrapper around expo-secure-store. Keeps three concerns in one place:
 *
 *   1. Namespacing — every key is prefixed with `doondo:` so we don't
 *      collide with anything else on the device.
 *   2. Type safety — the key set is closed; can't accidentally read/write
 *      a typo'd key.
 *   3. Failure tolerance — if the keychain refuses (e.g. user disabled
 *      device passcode), we degrade to in-memory rather than crash. The
 *      user just gets logged out on next launch.
 */

import * as SecureStore from 'expo-secure-store';

export type SecureKey =
  | 'refreshToken'
  /**
   * Multi-account: JSON-encoded array of SavedAccount entries (see
   * auth.store.ts). One entry per signed-in account on this device.
   * `refreshToken` above continues to hold the ACTIVE account's token
   * so bootstrap() can stay backward-compatible.
   */
  | 'savedAccounts'
  /** Multi-account: id of the currently active account. */
  | 'activeAccountId'
  | 'themePref'
  | 'languagePref'
  | 'notificationsEnabled'
  | 'onboardingSeen'
  /**
   * JSON blob: { name: string, phone: string }. The seeker's chosen
   * emergency contact for the SOS feature. Lives on-device only —
   * never synced to the server. Cleared if the user removes it.
   */
  | 'sosContact'
  /**
   * Last-chosen Home tab — 'today' | 'this_week' | 'career'. Persists
   * across sessions so the worker isn't bounced back to a default
   * every time they reopen the app.
   */
  | 'homeMode'
  /** Accessibility text-scale multiplier, stored as a string ("1.0".."1.5"). */
  | 'textScale'
  /** Accessibility text-to-speech toggle, stored as "true" / "false". */
  | 'ttsEnabled'
  /**
   * Biometric / device app-lock preference, "true" / "false". When on,
   * the app requires a fingerprint / face / screen-lock unlock on every
   * open. Opt-in; off by default.
   */
  | 'biometricLockEnabled'
  /**
   * "Doondo for Women" — Women's Mode preference, "true" / "false". When
   * on, the seeker's job feeds are filtered to women-safe postings.
   * Opt-in; off by default. Lives on-device only.
   */
  | 'womenModeEnabled'
  /**
   * Jobs-list search location — a JSON `{ label, lat, lng }` of the place
   * the worker chose to search around, or "" for "use my location".
   * Lets a worker browse jobs in a city other than where they are.
   */
  | 'jobSearchPlace'
  /**
   * Recently-searched job places — a JSON array of `{ label, lat, lng }`,
   * newest first, capped at 5. Powers one-tap re-selection in the
   * location picker.
   */
  | 'jobSearchRecents';

const PREFIX = 'doondo:';
const memoryFallback = new Map<string, string>();

const k = (key: SecureKey) => `${PREFIX}${key}`;

export async function setSecure(key: SecureKey, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(k(key), value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    memoryFallback.set(k(key), value);
  }
}

export async function getSecure(key: SecureKey): Promise<string | null> {
  try {
    const value = await SecureStore.getItemAsync(k(key));
    if (value !== null) return value;
  } catch {
    // fall through to memory
  }
  return memoryFallback.get(k(key)) ?? null;
}

export async function deleteSecure(key: SecureKey): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(k(key));
  } catch {
    // best effort
  }
  memoryFallback.delete(k(key));
}
