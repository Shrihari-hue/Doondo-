/**
 * pulseWidget — pushes the worker's latest Doondo Pulse snapshot to the
 * home-screen widget (#30) whenever usePulse() gets fresh data.
 *
 * Thin wrapper over the local doondo-pulse-widget native module so
 * callers don't need to know the native module can be absent (Expo Go,
 * or a dev client built before the widget was added) — setPulseWidget
 * never throws either way.
 */
import { setPulseWidgetSnapshot } from 'doondo-pulse-widget';
import type { PulseSnapshot } from '@/api/types';

/** Push a fresh Pulse snapshot to the widget. Safe to call on every successful fetch — cheap, and idempotent from the widget's point of view. */
export function pushPulseSnapshotToWidget(snapshot: PulseSnapshot, nudgeText: string): void {
  setPulseWidgetSnapshot({
    score: snapshot.score,
    applyStreak: snapshot.applyStreak,
    nudgeText,
    updatedAt: new Date().toISOString(),
  });
}
