/**
 * Headless task for the Android widget. Android calls this when the
 * widget is added, resized, or its update period elapses. We render from
 * the last snapshot the app cached (see syncPulseWidget) — no network.
 */
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { getSecure } from '@/lib/secureStore';
import { PulseWidget, type PulseWidgetData } from './PulseWidget';

async function readSnapshot(): Promise<PulseWidgetData | null> {
  try {
    const raw = await getSecure('pulseWidget');
    return raw ? (JSON.parse(raw) as PulseWidgetData) : null;
  } catch {
    return null;
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetInfo.widgetName !== 'Pulse') return;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
    case 'WIDGET_CLICK':
      props.renderWidget(<PulseWidget data={await readSnapshot()} />);
      break;
    default:
      break;
  }
}
