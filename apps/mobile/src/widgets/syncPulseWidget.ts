/**
 * Cache the latest Pulse snapshot for the Android widget and ask Android
 * to redraw it. Safe to call on any platform — no-ops off Android.
 */
import { Platform } from 'react-native';
import { setSecure } from '@/lib/secureStore';
import type { PulseSnapshot } from '@/api/types';
import type { PulseWidgetData } from './PulseWidget';

export async function syncPulseWidget(p: PulseSnapshot, nudgeText: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  const data: PulseWidgetData = {
    score: p.score,
    applyStreak: p.applyStreak,
    activeApplications: p.activeApplications,
    profileCompletion: p.profileCompletion,
    nudge: nudgeText,
    updatedAt: new Date().toISOString(),
  };
  try {
    await setSecure('pulseWidget', JSON.stringify(data));
    const mod = await import('react-native-android-widget');
    const React = await import('react');
    const { PulseWidget } = await import('./PulseWidget');
    await mod.requestWidgetUpdate({
      widgetName: 'Pulse',
      renderWidget: () => React.createElement(PulseWidget, { data }),
    });
  } catch {
    // Widget module missing (e.g. Expo Go) or no widget placed — fine.
  }
}
