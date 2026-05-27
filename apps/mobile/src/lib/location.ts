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

/**
 * Reverse-geocode coordinates to a city name. Used so that hitting
 * "Detect Location" populates `user.location.city` without forcing the
 * user to type their city manually — this matters for regional Festival
 * Mode matching (Pongal in Tamil Nadu, Onam in Kerala), which is dead
 * code when `city` is null.
 *
 * Falls back across `city → subregion → region` because expo-location's
 * results vary by device and locale: some report `city` as the
 * municipality, others only fill `subregion` (district) or `region`
 * (state). Any of those is good enough for the festival matcher, which
 * uses two-way substring matching against both city and state keywords.
 *
 * Returns null on permission denial, network failure, or empty results.
 */
export async function reverseGeocodeCity(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lng,
    });
    const first = results?.[0];
    if (!first) return null;
    const candidate = first.city ?? first.subregion ?? first.region ?? null;
    if (!candidate) return null;
    const trimmed = candidate.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
