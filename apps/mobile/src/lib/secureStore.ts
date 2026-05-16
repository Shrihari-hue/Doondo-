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
  | 'homeMode';

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
