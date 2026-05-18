/**
 * AvailableWorkersScreen — employer-facing list of seekers who are
 * broadcasting their availability right now within ~10km.
 *
 * The page is the matchmaking counterpart to the seeker's
 * AvailabilityBeaconChip on Home: when a worker says "I'm free for the
 * next 2 hours, can do delivery or helper work", they show up here for
 * every nearby employer. Each row offers one-tap call (gated by the
 * /seekers/:id/contact reveal endpoint).
 *
 * Reached from the Applicants tab via a new "Workers available right
 * now" section that links here.
 */

import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState, Avatar, Stars } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { getCurrentCoords, type Coords } from '@/lib/location';
import {
  availabilityApi,
  type NearbyAvailability,
} from '@/api/availability.api';
import { contactApi } from '@/api/contact.api';
import { ApiError } from '@/api/errors';
import { prettifySkill, tradeEmoji } from '@/lib/trades';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

// Tagged `manual` because it isn't device GPS — satisfies the Coords
// interface so consumers can branch on the source if they want to.
const FALLBACK_COORDS: Coords = { lat: 12.9716, lng: 77.5946, source: 'manual' };

export function AvailableWorkersScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const [coords, setCoords] = useState<Coords | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const c = await getCurrentCoords().catch(() => null);
      if (cancelled) return;
      setCoords(c ?? FALLBACK_COORDS);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const query = useQuery({
    queryKey: ['availabilities', 'nearby', coords?.lat, coords?.lng],
    queryFn: () =>
      availabilityApi.nearby({
        lat: coords!.lat,
        lng: coords!.lng,
        radius: 15_000,
        limit: 30,
      }),
    enabled: coords !== null,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const callMutation = useMutation({
    mutationFn: (seekerId: string) => contactApi.revealSeeker(seekerId),
    onSuccess: (data) => {
      const phone = data.contact.phone;
      if (!phone) {
        haptic('error');
        Alert.alert(
          t('employer.available_workers.no_phone_title'),
          t('employer.available_workers.no_phone_body'),
        );
        return;
      }
      haptic('selection');
      const clean = phone.replace(/[^\d+]/g, '');
      Linking.openURL(`tel:${clean}`).catch(() => {
        Alert.alert(
          t('employer.available_workers.no_dialer_title'),
          t('employer.available_workers.no_dialer_body', { phone }),
        );
      });
    },
    onError: (err) => {
      haptic('error');
      const msg =
        err instanceof ApiError ? err.message : t('employer.available_workers.not_available_default');
      Alert.alert(t('employer.available_workers.not_available_title'), msg);
    },
  });

  const availabilities = query.data?.availabilities ?? [];

  return (
    <Screen edges={[]}>
      <LinearGradient
        colors={[blue[700], blue[600], blue[500]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xl,
          borderBottomLeftRadius: radii.xl,
          borderBottomRightRadius: radii.xl,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginBottom: spacing.md,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: '#FFFFFF' }}>←</Text>
          </Pressable>
          <Text
            style={{
              fontSize: 17,
              fontWeight: '600',
              color: '#FFFFFF',
              flex: 1,
            }}
          >
            {t('employer.available_workers.header_title')}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 13,
            lineHeight: 19,
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          {t('employer.available_workers.header_subtitle')}
        </Text>
      </LinearGradient>

      <View style={{ flex: 1, paddingTop: spacing.md }}>
        {query.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <LoadingSpinner />
          </View>
        ) : query.isError ? (
          <EmptyState
            title={t('employer.available_workers.error_title')}
            message={t('employer.available_workers.error_message')}
            cta={{
              label: t('employer.available_workers.retry'),
              onPress: () => {
                haptic('selection');
                void query.refetch();
              },
            }}
          />
        ) : availabilities.length === 0 ? (
          <EmptyState
            glyph="📡"
            eyebrow={t('employer.available_workers.empty_eyebrow')}
            title={t('employer.available_workers.empty_title')}
            message={t('employer.available_workers.empty_message')}
          />
        ) : (
          <FlatList
            data={availabilities}
            keyExtractor={(a) => a.id}
            contentContainerStyle={{
              paddingHorizontal: spacing.xl,
              paddingBottom: insets.bottom + spacing['5xl'],
              gap: spacing.sm,
            }}
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
                tintColor={theme.brand.hero}
              />
            }
            renderItem={({ item }) => (
              <AvailabilityRow
                item={item}
                onCall={() => callMutation.mutate(item.seeker.id)}
                calling={callMutation.isPending}
                t={t}
              />
            )}
          />
        )}
      </View>
    </Screen>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function AvailabilityRow({
  item,
  onCall,
  calling,
  t,
}: {
  item: NearbyAvailability;
  onCall: () => void;
  calling: boolean;
  t: TFn;
}) {
  const { theme } = useTheme();
  const minutesLeft = Math.max(
    0,
    Math.round((new Date(item.until).getTime() - Date.now()) / 60_000),
  );
  const distanceLabel =
    item.distanceMeters < 1000
      ? t('employer.available_workers.meters_short', { n: item.distanceMeters })
      : t('employer.available_workers.kilometers_short', { n: (item.distanceMeters / 1000).toFixed(1) });

  return (
    <View
      style={{
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.md,
        gap: spacing.sm,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar
          name={item.seeker.name}
          photoUrl={item.seeker.photoUrl}
          size={48}
          premium={item.seeker.isVerified}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: theme.text.primary,
            }}
            numberOfLines={1}
          >
            {item.seeker.name}
            {item.seeker.isVerified ? '  ✓' : ''}
          </Text>
          <Text style={{ fontSize: 12, color: theme.text.tertiary }} numberOfLines={1}>
            {distanceLabel} · {minutesLeft > 0 ? t('employer.available_workers.minutes_left', { n: minutesLeft }) : t('employer.available_workers.expiring')}
            {item.location.area ? ` · ${item.location.area}` : ''}
          </Text>
          {item.seeker.rating ? (
            <View style={{ marginTop: 2 }}>
              <Stars
                score={item.seeker.rating.avg}
                count={item.seeker.rating.count}
                compact
              />
            </View>
          ) : null}
        </View>
      </View>

      {/* Trade chips */}
      {item.tradesAvailable.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {item.tradesAvailable.map((slug) => {
            const emoji = tradeEmoji(slug);
            return (
              <View
                key={slug}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 2,
                  borderRadius: radii.pill,
                  backgroundColor: '#EFF6FF',
                  borderWidth: 0.5,
                  borderColor: '#BFDBFE',
                }}
              >
                {emoji ? <Text style={{ fontSize: 12 }}>{emoji}</Text> : null}
                <Text
                  style={{ fontSize: 11, fontWeight: '600', color: '#1E40AF' }}
                >
                  {prettifySkill(slug)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Note */}
      {item.note ? (
        <Text
          style={{
            fontSize: 13,
            color: theme.text.secondary,
            lineHeight: 18,
            fontStyle: 'italic',
          }}
        >
          “{item.note}”
        </Text>
      ) : null}

      {/* Call CTA */}
      <Pressable
        onPress={onCall}
        disabled={calling}
        accessibilityRole="button"
        accessibilityLabel={t('employer.available_workers.call_a11y', { name: item.seeker.name })}
        style={({ pressed }) => ({
          backgroundColor: '#2563EB',
          paddingVertical: 12,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: calling ? 0.5 : pressed ? 0.85 : 1,
          shadowColor: '#2563EB',
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 3,
        })}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
          {calling ? t('employer.available_workers.opening_dialer') : t('employer.available_workers.call_now')}
        </Text>
      </Pressable>
    </View>
  );
}
