/**
 * Location helper — wraps expo-location with the behaviour we want for the
 * "Find work near you" pitch:
 *
 *   1. Ask permission. If granted, fetch the device coords once.
 *   2. If denied, return null and let the caller fall back to a manual
 *      city/area picker (Phase 2 will add that picker).
 *   3. Cache the last successful coords for the session so repeated calls
 *      don't re-prompt or re-spin GPS.
 *
 * We deliberately use `Location.Accuracy.Balanced` — high enough to put
 * you in the right neighborhood, low enough to be quick and not drain
 * battery. The "walking distance" radius is forgiving anyway.
 */

import * as Location from 'expo-location';

export interface Coords {
  lat: number;
  lng: number;
  /** Set when coords come from GPS. Helpful for UI ("Detected your area"). */
  source: 'gps' | 'manual';
}

let cached: Coords | null = null;

export async function getCurrentCoords(): Promise<Coords | null> {
  if (cached) return cached;

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) {
    return null;
  }

  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    cached = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      source: 'gps',
    };
    return cached;
  } catch {
    return null;
  }
}

/**
 * Override the cache with manually-picked coords. Used after the user
 * sets their city/area in the location picker (Phase 2 polish step).
 */
export function setManualCoords(coords: { lat: number; lng: number }): Coords {
  cached = { ...coords, source: 'manual' };
  return cached;
}

export function clearCachedCoords(): void {
  cached = null;
}
