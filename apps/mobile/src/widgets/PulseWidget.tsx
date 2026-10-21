/**
 * PulseWidget — the Android home-screen widget for Doondo Pulse.
 *
 * Rendered by react-native-android-widget's primitives (not RN views), so
 * it can only use FlexWidget / TextWidget and plain style props. Shows the
 * Doondo Score, apply streak, active applications and the next step.
 * Tapping opens the app (Home).
 */
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export interface PulseWidgetData {
  score: number;
  applyStreak: number;
  activeApplications: number;
  profileCompletion: number;
  nudge: string;
  updatedAt: string;
}

const BRAND = '#C8533A';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <FlexWidget style={{ flex: 1, flexDirection: 'column', alignItems: 'center' }}>
      <TextWidget text={value} style={{ fontSize: 20, fontWeight: '700', color: '#111827' }} />
      <TextWidget text={label} style={{ fontSize: 11, color: '#6B7280' }} />
    </FlexWidget>
  );
}

export function PulseWidget({ data }: { data: PulseWidgetData | null }) {
  if (!data) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{ height: 'match_parent', width: 'match_parent', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, justifyContent: 'center' }}
      >
        <TextWidget text="Doondo Pulse" style={{ fontSize: 15, fontWeight: '700', color: BRAND }} />
        <TextWidget text="Open Doondo to load your score and streak." style={{ fontSize: 12, color: '#6B7280' }} />
      </FlexWidget>
    );
  }
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14, flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
        <TextWidget text="Doondo Pulse" style={{ fontSize: 13, fontWeight: '700', color: BRAND }} />
        <TextWidget text={`Profile ${data.profileCompletion}%`} style={{ fontSize: 11, color: '#6B7280' }} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent' }}>
        <Stat value={String(data.score)} label="Score" />
        <Stat value={`${data.applyStreak}🔥`} label="Streak" />
        <Stat value={String(data.activeApplications)} label="In play" />
      </FlexWidget>
      <TextWidget text={data.nudge} maxLines={1} truncate="END" style={{ fontSize: 12, color: '#374151' }} />
    </FlexWidget>
  );
}
