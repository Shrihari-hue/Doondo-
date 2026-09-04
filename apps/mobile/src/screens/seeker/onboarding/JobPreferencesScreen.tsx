/**
 * JobPreferencesScreen — "Select your job preferences".
 *
 * The first step of seeker onboarding: pick the trades you are good at.
 * Those slugs are the same `User.skills` the profile editor already
 * writes (`meApi.updateProfile({ skills })`) and the same vocabulary the
 * job feeds rank against — so this screen adds no new data model, no new
 * endpoint, and no backend change. It is a friendlier front door to a
 * field that previously only existed buried in Edit Profile.
 *
 * Layout is a responsive 3-column grid built from rows of `flex: 1`
 * tiles — see TRADE_ROWS at the foot of the file for why that, and not a
 * percentage wrap.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Button, FormError } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth.store';
import { haptic } from '@/lib/haptics';
import { meApi } from '@/api/me.api';
import { TRADES, type TradeOption } from '@/lib/trades';
import { setSecure } from '@/lib/secureStore';
import { SEEKER_GUTTER, SEEKER_SECTION_GAP } from './layout';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'JobPreferences'>;

/** Hard cap mirrors EditProfileScreen's — the server takes a flat list. */
const MAX_TRADES = 20;

export function JobPreferencesScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user } = useAuth();
  const setAuthState = useAuthStore.setState;

  const onboarding = route.params?.mode !== 'edit';

  const [selected, setSelected] = useState<string[]>(user?.skills ?? []);
  const [error, setError] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const mutation = useMutation({
    mutationFn: () => meApi.updateProfile({ skills: selected }),
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setAuthState((s) => ({ ...s, user: updated }));
      if (onboarding) {
        navigation.replace('WorkTypeSelect');
      } else {
        navigation.goBack();
      }
    },
    onError: (err) => {
      haptic('error');
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    },
  });

  function toggle(slug: string) {
    haptic('selection');
    setError(null);
    setSelected((current) =>
      current.includes(slug)
        ? current.filter((s) => s !== slug)
        : current.length >= MAX_TRADES
          ? current
          : [...current, slug],
    );
  }

  function skip() {
    haptic('selection');
    // A worker who skips still gets a working app — the feed just can't
    // rank by trade yet. Remember the skip so we don't nag every launch.
    void setSecure('seekerPrefsOnboarded', '1').catch(() => undefined);
    navigation.replace('WorkTypeSelect');
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: SEEKER_GUTTER, gap: spacing.xs, paddingBottom: spacing.lg }}>
        {!onboarding ? (
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ paddingBottom: spacing.sm }}
          >
            <Feather name="arrow-left" size={22} color={theme.text.primary} />
          </Pressable>
        ) : null}
        <Text variant="titleLarge" weight="semibold">
          Select your job preferences
        </Text>
        <Text variant="body" tone="secondary">
          Choose jobs you are good at. You can select multiple.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: SEEKER_GUTTER,
          paddingBottom: SEEKER_SECTION_GAP,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: spacing.md }}>
          {TRADE_ROWS.map((row, rowIndex) => (
            <View key={rowIndex} style={{ flexDirection: 'row', gap: spacing.md }}>
              {row.map((trade) =>
                trade === null ? (
                  // Spacer keeps the final short row left-aligned instead
                  // of stretching its tiles to an odd width.
                  <View key={`spacer-${rowIndex}`} style={{ flex: 1 }} />
                ) : (
                  <TradeTile
                    key={trade.slug}
                    trade={trade}
                    selected={selectedSet.has(trade.slug)}
                    onPress={() => toggle(trade.slug)}
                  />
                ),
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: SEEKER_GUTTER, paddingTop: spacing.md, gap: spacing.sm }}>
        {error ? <FormError message={error} /> : null}
        <Button
          label={
            mutation.isPending
              ? 'Saving…'
              : selected.length > 0
                ? `Continue (${selected.length} selected)`
                : 'Continue'
          }
          onPress={() => {
            if (selected.length === 0) {
              setError('Pick at least one job you can do, or tap Skip for now.');
              haptic('warning');
              return;
            }
            mutation.mutate();
          }}
          disabled={mutation.isPending}
        />
        {onboarding ? <Button label="Skip for now" variant="ghost" onPress={skip} /> : null}
      </View>
    </Screen>
  );
}

/**
 * Trades laid out as fixed rows of three `flex: 1` tiles rather than a
 * percentage wrap grid.
 *
 * A `flexBasis: '31%'` wrap looks right on paper but overflows on a
 * 360dp screen once the 12px gaps are counted (3 x 31% + 24px > 100%),
 * silently collapsing to two columns. Rows of `flex: 1` cannot: the
 * columns are always equal, always three, the gaps stay real 8pt values,
 * and both outer edges land on the screen gutter at any width.
 */
const TRADE_COLUMNS = 3;
const TRADE_ROWS: Array<Array<TradeOption | null>> = (() => {
  const rows: Array<Array<TradeOption | null>> = [];
  for (let i = 0; i < TRADES.length; i += TRADE_COLUMNS) {
    const row: Array<TradeOption | null> = TRADES.slice(i, i + TRADE_COLUMNS);
    while (row.length < TRADE_COLUMNS) row.push(null);
    rows.push(row);
  }
  return rows;
})();

function TradeTile({
  trade,
  selected,
  onPress,
}: {
  trade: TradeOption;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={trade.label}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.75 : 1 })}
    >
      <View
        style={{
          height: 96,
          borderRadius: radii.xl,
          borderWidth: selected ? 1.5 : 0.5,
          borderColor: selected ? theme.brand.primary : theme.border.default,
          backgroundColor: selected ? theme.brand.primarySubtle : theme.bg.surface,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.sm,
          gap: spacing.xs,
        }}
      >
        <Text variant="title">{trade.emoji}</Text>
        <Text variant="caption" weight="medium" numberOfLines={2} style={{ textAlign: 'center' }}>
          {trade.shortLabel ?? trade.label}
        </Text>
        {selected ? (
          <View style={{ position: 'absolute', top: spacing.sm, right: spacing.sm }}>
            <Feather name="check-circle" size={14} color={theme.brand.primary} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
