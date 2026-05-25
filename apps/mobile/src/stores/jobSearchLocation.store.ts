/**
 * Job search location store — the place the Jobs list is centred on.
 *
 * By default the Jobs list searches around the worker's own location
 * (GPS). When the worker picks a different place from the location
 * picker, that choice lives here and the list re-centres on it.
 *
 * The choice persists on-device (secure-store), like the Women's Mode
 * and Home-tab preferences — a worker planning to relocate shouldn't
 * have to re-pick the place every time they open the app. Clearing it
 * (picking "Use my location") snaps the list back to GPS.
 *
 * The store also keeps the last few searched places so the picker can
 * offer one-tap re-selection.
 */
import { create } from 'zustand';
import { getSecure, setSecure } from '@/lib/secureStore';

export interface JobSearchPlace {
  /** Display label, e.g. "Bengaluru" or "Indiranagar, Bengaluru". */
  label: string;
  lat: number;
  lng: number;
}

interface JobSearchLocationState {
  /** The chosen place, or null = use the worker's own GPS location. */
  place: JobSearchPlace | null;
  /** Recently-searched places, newest first (max 5). */
  recents: JobSearchPlace[];
  /** The stored preference has finished loading. */
  hydrated: boolean;
  /** Load the persisted place + recents. Call once when Jobs mounts. */
  hydrate: () => Promise<void>;
  /** Choose a place, or pass null to go back to "my location". */
  setPlace: (place: JobSearchPlace | null) => Promise<void>;
}

const PLACE_KEY = 'jobSearchPlace';
const RECENTS_KEY = 'jobSearchRecents';
const MAX_RECENTS = 5;

/** Parse a stored place, returning null on anything malformed. */
function parsePlace(raw: unknown): JobSearchPlace | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<JobSearchPlace>;
  if (
    typeof p.label === 'string' &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number'
  ) {
    return { label: p.label, lat: p.lat, lng: p.lng };
  }
  return null;
}

export const useJobSearchLocationStore = create<JobSearchLocationState>((set, get) => ({
  place: null,
  recents: [],
  hydrated: false,

  async hydrate() {
    try {
      const [placeRaw, recentsRaw] = await Promise.all([
        getSecure(PLACE_KEY),
        getSecure(RECENTS_KEY),
      ]);
      const place = placeRaw ? parsePlace(JSON.parse(placeRaw)) : null;
      let recents: JobSearchPlace[] = [];
      if (recentsRaw) {
        const arr = JSON.parse(recentsRaw);
        if (Array.isArray(arr)) {
          recents = arr
            .map(parsePlace)
            .filter((p): p is JobSearchPlace => p !== null)
            .slice(0, MAX_RECENTS);
        }
      }
      set({ place, recents, hydrated: true });
    } catch {
      // Best-effort — a read failure just leaves the list on GPS.
      set({ hydrated: true });
    }
  },

  async setPlace(place) {
    // Update the UI immediately; persist behind it.
    let recents = get().recents;
    if (place) {
      recents = [
        place,
        ...recents.filter(
          (r) => r.label.toLowerCase() !== place.label.toLowerCase(),
        ),
      ].slice(0, MAX_RECENTS);
    }
    set({ place, recents });
    try {
      await Promise.all([
        setSecure(PLACE_KEY, place ? JSON.stringify(place) : ''),
        setSecure(RECENTS_KEY, JSON.stringify(recents)),
      ]);
    } catch {
      /* best-effort — the in-memory value still holds for this session */
    }
  },
}));
