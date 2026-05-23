/**
 * EarningsScreen — the seeker's "Earnings" tab.
 *
 * A light hub that gathers the worker's money features that used to be
 * buried in the Profile menu. Each row pushes an existing AppStack modal:
 *   - My earnings      → MyEarnings
 *   - Cash advance     → Advance
 *   - Worker insurance → Insurance
 *
 * Added as part of the 6-tab navigation redesign — see
 * Doondo-Profile-Redesign-Spec.md at the repo root.
 */
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

interface HubRow {
  glyph: string;
  label: string;
  hint: string;
  onPress: () => void;
}

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();

  const rows: HubRow[] = [
    {
      glyph: '💰',
      label: t('earnings_hub.ledger'),
      hint: t('earnings_hub.ledger_hint'),
      onPress: () => navigation.navigate('MyEarnings'),
    },
    {
      glyph: '🏦',
      label: t('earnings_hub.advance'),
      hint: t('earnings_hub.advance_hint'),
      onPress: () => navigation.navigate('Advance'),
    },
    {
      glyph: '🛡️',
      label: t('earnings_hub.insurance'),
      hint: t('earnings_hub.insurance_hint'),
      onPress: () => navigation.navigate('Insurance'),
    },
  ];

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: spacing['5xl'],
          gap: spacing.lg,
        }}
      >
        <View style={{ paddingHorizontal: spacing.xl }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: theme.text.primary }}>
            {t('earnings_hub.title')}
          </Text>
          <Text style={{ fontSize: 13, color: theme.text.tertiary, marginTop: 2 }}>
            {t('earnings_hub.subtitle')}
          </Text>
        </View>

        <HubCard rows={rows} />
      </ScrollView>
    </Screen>
  );
}

function HubCard({ rows }: { rows: HubRow[] }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        marginHorizontal: spacing.xl,
        backgroundColor: theme.bg.surface,
        borderRadius: 16,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        overflow: 'hidden',
      }}
    >
      {rows.map((row, i) => (
        <Pressable
          key={row.label}
          accessibilityRole="button"
          accessibilityLabel={`${row.label}. ${row.hint}`}
          onPress={() => {
            haptic('selection');
            row.onPress();
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            minHeight: 64,
            borderBottomWidth: i < rows.length - 1 ? 0.5 : 0,
            borderBottomColor: theme.border.subtle,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: theme.brand.heroSubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 18 }}>{row.glyph}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}>
              {row.label}
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 1 }}>
              {row.hint}
            </Text>
          </View>
          <Text style={{ fontSize: 20, color: theme.text.tertiary }}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function EarningsScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
