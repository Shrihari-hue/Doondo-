import { View } from 'react-native';
import { radii, spacing } from '@doondo/tokens';
import { Button, Card, Pill, Text } from '@/components';
import type { PublicJob } from '@/api/types';

interface Props {
  coords: { lat: number; lng: number };
  jobs: PublicJob[];
  radiusKm?: number;
}

/**
 * Web fallback for the native map view so Expo web can boot for design
 * review. The mobile-native map experience still lives in JobsMapView.tsx.
 */
export function JobsMapView({ coords, jobs, radiusKm = 5 }: Props) {
  return (
    <View style={{ flex: 1, padding: spacing.xl }}>
      <Card>
        <View style={{ gap: spacing.md }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              MAP PREVIEW
            </Text>
            <Text variant="bodyLarge" weight="medium">
              Map view is available in the native mobile app.
            </Text>
          </View>

          <Text variant="footnote" tone="secondary">
            This web fallback exists so the app can boot for browser-based UI review.
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <Pill label={`${jobs.length} jobs`} tone="neutral" />
            <Pill label={`${radiusKm} km radius`} tone="neutral" />
            <Pill
              label={`${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}`}
              tone="info"
            />
          </View>

          <View
            style={{
              minHeight: 220,
              borderRadius: radii.lg,
              borderWidth: 0.5,
              borderStyle: 'dashed',
              alignItems: 'center',
              justifyContent: 'center',
              padding: spacing.lg,
            }}
          >
            <Text variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
              Native map markers, camera fit, and preview card are hidden on web.
            </Text>
          </View>

          <Button label="Return To List View On Mobile" variant="secondary" disabled />
        </View>
      </Card>
    </View>
  );
}
