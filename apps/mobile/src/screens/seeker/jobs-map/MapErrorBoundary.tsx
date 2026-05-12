/**
 * MapErrorBoundary — catches native crashes from react-native-maps so a bad
 * map render can't take down the whole app.
 *
 * Most common crash cause on Android: missing Google Maps API key, which
 * makes the native MapView segfault on init. Until the key is configured in
 * `app.json` under android.config.googleMaps.apiKey, this boundary shows a
 * friendly fallback and lets the user switch back to the list view.
 *
 * Once the API key ships, this boundary still earns its keep — any future
 * marker-rendering or geo-data bug here will degrade gracefully instead of
 * crashing.
 */

import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import { spacing } from '@doondo/tokens';
import { Text, Card } from '@/components';

interface Props {
  children: ReactNode;
  /** Optional callback so the parent can switch back to the list view. */
  onError?: () => void;
}

interface State {
  hasError: boolean;
}

export class MapErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    // Log to console for dev; replace with proper telemetry when wired up.
    // eslint-disable-next-line no-console
    console.warn('[MapErrorBoundary] map crashed:', error?.message ?? error);
    this.props.onError?.();
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: spacing.xl,
          }}
        >
          <Card>
            <View style={{ gap: spacing.sm }}>
              <Text variant="bodyLarge" weight="medium">
                Map view unavailable
              </Text>
              <Text variant="footnote" tone="secondary">
                We couldn&rsquo;t render the map right now. Switch back to the
                list view to keep browsing nearby jobs.
              </Text>
            </View>
          </Card>
        </View>
      );
    }
    return this.props.children;
  }
}
