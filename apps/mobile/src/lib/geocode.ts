/**
 * Forward geocoding — turn a typed place name ("Indiranagar, Bengaluru")
 * into coordinates so the Jobs list can re-centre on it.
 *
 * Uses expo-location's built-in geocoder (the same module already used
 * for the worker's GPS position) — no API key, no extra cost. Forward
 * geocoding does not require location permission.
 */
import * as Location from 'expo-location';

export interface GeocodedPlace {
  /** The place label to show — the worker's query, tidied. */
  label: string;
  lat: number;
  lng: number;
}

/**
 * Resolve a place name to coordinates. Returns null when the query is
 * too short, nothing is found, or the device geocoder is unavailable.
 */
export async function geocodePlace(query: string): Promise<GeocodedPlace | null> {
  const q = query.trim();
  if (q.length < 2) return null;
  try {
    const results = await Location.geocodeAsync(q);
    const first = results[0];
    if (
      !first ||
      typeof first.latitude !== 'number' ||
      typeof first.longitude !== 'number'
    ) {
      return null;
    }
    return { label: q, lat: first.latitude, lng: first.longitude };
  } catch {
    return null;
  }
}
