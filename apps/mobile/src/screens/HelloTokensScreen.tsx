import { ScrollView, View } from 'react-native';
import { spacing } from '@doondo/tokens';
import { Screen, Text, Button, Card, Pill } from '@/components';

/**
 * HelloTokensScreen — the first thing you see on the device.
 *
 * Purpose: prove the design system works on a real phone before we build any
 * real features on top. If the coral, champagne, and jade tones don't read
 * right here, they won't read right anywhere.
 *
 * This screen will be removed in Phase 1.5 once the role picker becomes the
 * actual app entry. Until then, treat it as a living style guide.
 */
export function HelloTokensScreen() {
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: spacing['6xl'],
          gap: spacing['3xl'],
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero header */}
        <View style={{ gap: spacing.xs, marginTop: spacing.lg }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            JEWEL-TOUCHED · WARM DARK LUXE
          </Text>
          <Text variant="display" weight="medium" display>
            Doondo
          </Text>
          <Text variant="body" tone="secondary">
            Hello tokens. This is what your design system looks like on a real phone.
          </Text>
        </View>

        {/* Regular job card */}
        <Section label="REGULAR CARD">
          <Card>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: spacing.md,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="bodyLarge" weight="medium">
                  Café barista
                </Text>
                <Text variant="footnote" tone="secondary" style={{ marginTop: 2 }}>
                  Third Wave Coffee · Indiranagar
                </Text>
              </View>
              <Pill label="Match 92" tone="success" />
            </View>
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.sm,
                marginTop: spacing.md,
                flexWrap: 'wrap',
              }}
            >
              <Pill label="₹18,000/mo" tone="warning" />
              <Pill label="Full-time" />
              <Pill label="1.8 km" />
            </View>
          </Card>
        </Section>

        {/* Premium card — hairline champagne border */}
        <Section label="PREMIUM CARD · CHAMPAGNE HAIRLINE">
          <Card premium>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: spacing.md,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text variant="bodyLarge" weight="medium">
                  Sous chef
                </Text>
                <Text variant="footnote" tone="secondary" style={{ marginTop: 2 }}>
                  ITC Windsor · Verified employer
                </Text>
              </View>
              <Pill label="Match 96" tone="premium" leading="★" />
            </View>
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.sm,
                marginTop: spacing.md,
                flexWrap: 'wrap',
              }}
            >
              <Pill label="₹45,000/mo" tone="warning" />
              <Pill label="Verified" tone="success" />
              <Pill label="2.1 km" />
            </View>
          </Card>
        </Section>

        {/* Pills row */}
        <Section label="PILLS · TONE LIBRARY">
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Pill label="Neutral" />
            <Pill label="Verified" tone="success" />
            <Pill label="Urgent" tone="warning" />
            <Pill label="SOS" tone="danger" />
            <Pill label="Tip" tone="info" />
            <Pill label="Hot" tone="hero" />
            <Pill label="Premium" tone="premium" leading="★" />
          </View>
        </Section>

        {/* Buttons */}
        <Section label="BUTTONS · EVERY VARIANT">
          <View style={{ gap: spacing.sm }}>
            <Button label="Apply now" variant="primary" />
            <Button label="Save for later" variant="secondary" />
            <Button label="Skip" variant="ghost" />
            <Button label="Upgrade to premium" variant="premium" />
            <Button label="Delete account" variant="danger" />
            <Button label="Disabled" variant="primary" disabled />
          </View>
        </Section>

        {/* Type scale */}
        <Section label="TYPE · INTER">
          <View style={{ gap: spacing.sm }}>
            <Text variant="display" weight="medium" display>
              Hire nearby.
            </Text>
            <Text variant="titleLarge" weight="medium">
              Nearby jobs in Indiranagar
            </Text>
            <Text variant="title" weight="medium">
              Café barista
            </Text>
            <Text variant="bodyLarge">Third Wave Coffee, just listed</Text>
            <Text variant="body" tone="secondary">
              Search nearby work in your city, area, or walking radius.
            </Text>
            <Text variant="footnote" tone="tertiary">
              Posted 2h ago · 1.8 km away · 3 applicants
            </Text>
          </View>
        </Section>
      </ScrollView>
    </Screen>
  );
}

interface SectionProps {
  label: string;
  children: React.ReactNode;
}

function Section({ label, children }: SectionProps) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}
