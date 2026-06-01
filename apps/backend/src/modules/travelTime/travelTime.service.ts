/**
 * Travel-time — real driving time/distance from an employer to nearby
 * workers, via the Google Distance Matrix API.
 *
 * Why this matters: proximity by straight line is a poor predictor of
 * "will they actually turn up" — a worker 2 km away across a river or a
 * rail line can be a 25-minute trip. Sorting candidates by *travel time*
 * instead of crow-flies distance surfaces the people who can realistically
 * get to the shop.
 *
 * Graceful degradation is core to the design:
 *   - No `GOOGLE_MAPS_KEY` configured  → straight-line estimate.
 *   - API error / over-quota / element not found → straight-line estimate
 *     for the affected rows only.
 * Every result carries `estimated: true` when it came from the fallback,
 * so the UI can be honest ("~12 min est."). The feature therefore works
 * the moment it ships and gets *better* once a key is set — it never
 * hard-fails on a missing/limited key.
 *
 * The Distance Matrix web service caps a request at 25 destinations, so we
 * chunk. One origin (the employer) × up to 25 worker destinations per call.
 */

import { env } from '@/config/env';
import { logger } from '@/lib/logger';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TravelDestination extends LatLng {
  /** Opaque id the caller uses to map results back (e.g. a seeker id). */
  id: string;
}

export interface TravelResult {
  id: string;
  /** Road distance in metres (or straight-line when estimated). */
  meters: number;
  /** Travel time in whole minutes. */
  minutes: number;
  /** True when this row is a straight-line fallback, not a real route. */
  estimated: boolean;
}

/** Max destinations per Distance Matrix request (Google's documented cap). */
const CHUNK = 25;
/** Blended local speed (km/h) for the straight-line fallback ETA. */
const FALLBACK_SPEED_KMH = 18;
/** Hard timeout on the upstream call so a slow Google never stalls us. */
const FETCH_TIMEOUT_MS = 6000;

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

function estimate(origin: LatLng, dest: TravelDestination): TravelResult {
  const meters = haversineMeters(origin, dest);
  const minutes = Math.max(1, Math.round((meters / 1000 / FALLBACK_SPEED_KMH) * 60));
  return { id: dest.id, meters, minutes, estimated: true };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Call Distance Matrix for one origin × ≤25 destinations. Throws on failure. */
async function fetchMatrixChunk(
  origin: LatLng,
  dests: TravelDestination[],
): Promise<TravelResult[]> {
  const destParam = dests.map((d) => `${d.lat},${d.lng}`).join('|');
  const url =
    'https://maps.googleapis.com/maps/api/distancematrix/json' +
    `?origins=${origin.lat},${origin.lng}` +
    `&destinations=${encodeURIComponent(destParam)}` +
    `&mode=driving&units=metric&key=${env.GOOGLE_MAPS_KEY}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let json: {
    status?: string;
    rows?: Array<{
      elements?: Array<{
        status?: string;
        distance?: { value?: number };
        duration?: { value?: number };
      }>;
    }>;
  };
  try {
    const res = await fetch(url, { signal: controller.signal });
    json = (await res.json()) as typeof json;
  } finally {
    clearTimeout(timer);
  }

  if (json.status !== 'OK' || !json.rows?.[0]?.elements) {
    throw new Error(`Distance Matrix status ${json.status ?? 'unknown'}`);
  }
  const elements = json.rows[0].elements;
  return dests.map((d, i) => {
    const el = elements[i];
    if (el?.status === 'OK' && el.duration?.value != null && el.distance?.value != null) {
      return {
        id: d.id,
        meters: el.distance.value,
        minutes: Math.max(1, Math.round(el.duration.value / 60)),
        estimated: false,
      };
    }
    // Per-element failure (ZERO_RESULTS / NOT_FOUND) → straight-line row.
    return estimate(origin, d);
  });
}

/**
 * Travel times from `origin` to each destination. Always resolves with one
 * result per destination, in input order — falling back to a straight-line
 * estimate for anything the API can't (or isn't configured to) answer.
 */
export async function getTravelTimes(
  origin: LatLng,
  destinations: TravelDestination[],
): Promise<TravelResult[]> {
  if (destinations.length === 0) return [];

  // No key → estimate everything, no upstream call.
  if (!env.GOOGLE_MAPS_KEY) {
    return destinations.map((d) => estimate(origin, d));
  }

  const out: TravelResult[] = [];
  for (const group of chunk(destinations, CHUNK)) {
    try {
      out.push(...(await fetchMatrixChunk(origin, group)));
    } catch (err) {
      logger.warn({ err }, 'Distance Matrix chunk failed — using straight-line estimate');
      out.push(...group.map((d) => estimate(origin, d)));
    }
  }
  return out;
}
