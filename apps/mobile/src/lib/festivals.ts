/**
 * Festival Mode — client helpers.
 *
 * The festival calendar itself now lives on the server (region-aware,
 * and lunar dates are a config edit there rather than an app release).
 * This module just exposes a cached hook over `GET /festivals/active`
 * plus a small pure helper for tagging festival-relevant jobs.
 */
import { useQuery } from '@tanstack/react-query';
import { festivalApi, type Festival, type FestivalState } from '@/api/festival.api';

export type { Festival, FestivalState } from '@/api/festival.api';

/**
 * True when a job's skills overlap the festival's spiking trades —
 * drives the festival job board filter and the festival job tag.
 */
export function isFestivalJob(skills: string[], festival: Festival): boolean {
  const have = new Set(skills.map((s) => s.toLowerCase()));
  return festival.trades.some((trade) => have.has(trade));
}

/**
 * The full festival state for the current worker — `active` and
 * `upcoming`. Cached for an hour and shared across every consumer
 * (Home banner, job feed, Hire Celebration), so it's one network call.
 */
export function useFestivalState(): FestivalState | undefined {
  const query = useQuery({
    queryKey: ['festival', 'state'],
    queryFn: () => festivalApi.active(),
    staleTime: 60 * 60_000,
  });
  return query.data;
}

/** Convenience — just the currently-active festival, or null. */
export function useFestival(): Festival | null {
  return useFestivalState()?.active ?? null;
}
