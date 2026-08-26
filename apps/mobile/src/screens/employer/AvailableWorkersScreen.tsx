/**
 * AvailableWorkersScreen — employer-facing view of seekers who are
 * broadcasting their availability right now within ~15km.
 *
 * Two ways to browse the same beacon feed:
 *   - List — the original ranked rows.
 *   - Map  — pins on a map (WorkersMapView), the headline of two-way
 *            discovery.
 *
 * Each worker offers one-tap call (gated by /seekers/:id/contact) and
 * "Send hiring request" — invite them to apply for one of your jobs.
 * The header also links to the inbound "Interested in you" list and the
 * outbound "Requests sent" list.
 *
 * Reached from the Applicants tab via a "Workers available right now"
 * section that links here.
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
import { Feather } from '@expo/vector-icons';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState, Avatar, Stars } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { resolveCoords, type ResolvedCoords } from '@/lib/location';
import { useAuth } from '@/hooks/useAuth';
import {
  availabilityApi,
  type NearbyAvailability,
} from '@/api/availability.api';
import { contactApi } from '@/api/contact.api';
import { pastApplicantsApi, type PastApplicant } from '@/api/pastApplicants.api';
import { trustedWorkersApi, type TrustedWorker } from '@/api/trustedWorkers.api';
import { travelTimeApi } from '@/api/travelTime.api';
import { ApiError } from '@/api/errors';
import { prettifySkill, tradeEmoji } from '@/lib/trades';
import { WorkersMapView } from './workers-map/WorkersMapView';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;
type ViewMode = 'list' | 'map';

const SEARCH_RADIUS_M = 15_000;

const BLUE = '#2563EB';
const BLUE_LIGHT = '#EFF6FF';
const GREEN = '#16A34A';
const AMBER = '#F59E0B';

export function AvailableWorkersScreen() {
  const { scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const { user } = useAuth();
  const [coords, setCoords] = useState<ResolvedCoords | null>(null);
  const [mode, setMode] = useState<ViewMode>('list');

  const bg = isLight ? '#FFFFFF' : '#0C0A0E';
  const cardBg = isLight ? '#FFFFFF' : '#0D0D0D';
  const cardBorder = isLight ? '#E5E7EB' : '#1E1E1E';
  const textPrimary = isLight ? '#1F2937' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';

  // Prefer live GPS → the employer's saved location → a flagged default,
  // so a denied GPS permission doesn't silently search a far-off city.
  const savedCoords =
    user?.employerLocation?.coordinates ?? user?.location?.coordinates ?? null;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const c = await resolveCoords(savedCoords);
      if (cancelled) return;
      setCoords(c);
    })();
    return () => {
      cancelled = true;
    };
  }, [savedCoords]);

  const query = useQuery({
    queryKey: ['availabilities', 'nearby', coords?.lat, coords?.lng],
    queryFn: () =>
      availabilityApi.nearby({
        lat: coords!.lat,
        lng: coords!.lng,
        radius: SEARCH_RADIUS_M,
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

  // Re-tap: prior applicants who are broadcasting availability nearby now.
  const pastQuery = useQuery({
    queryKey: ['past-applicants', coords?.lat, coords?.lng],
    queryFn: () =>
      pastApplicantsApi.list({
        lat: coords!.lat,
        lng: coords!.lng,
        radius: SEARCH_RADIUS_M,
        limit: 10,
      }),
    enabled: coords !== null,
    staleTime: 60_000,
  });
  const pastApplicants = pastQuery.data?.workers ?? [];

  // Local social proof: workers other employers in this city rated highly.
  const trustedQuery = useQuery({
    queryKey: ['trusted-workers'],
    queryFn: () => trustedWorkersApi.list(8),
    staleTime: 5 * 60_000,
  });
  const trustedWorkers = trustedQuery.data?.workers ?? [];

  // Real driving ETA from the employer to each listed worker. Drives both
  // the "~X min drive" label and the list order (travel time beats
  // crow-flies distance). Degrades to a straight-line estimate server-side.
  const availabilityKey = availabilities.map((a) => a.seekerId).join(',');
  const travelQuery = useQuery({
    queryKey: ['travel-times', coords?.lat, coords?.lng, availabilityKey],
    queryFn: () =>
      travelTimeApi.batch(
        { lat: coords!.lat, lng: coords!.lng },
        availabilities.slice(0, 50).map((a) => ({
          id: a.seekerId,
          lat: a.location.coordinates[1],
          lng: a.location.coordinates[0],
        })),
      ),
    enabled: coords !== null && availabilities.length > 0,
    staleTime: 5 * 60_000,
  });
  const travelMap = new Map(
    (travelQuery.data?.results ?? []).map((r) => [r.id, r]),
  );
  // Sort by travel time when we have it, falling back to straight-line.
  const sortedAvailabilities = [...availabilities].sort((a, b) => {
    const ta = travelMap.get(a.seekerId)?.minutes ?? Infinity;
    const tb = travelMap.get(b.seekerId)?.minutes ?? Infinity;
    if (ta !== tb) return ta - tb;
    return a.distanceMeters - b.distanceMeters;
  });

  // Open the send-hiring-request flow for a worker.
  const onHire = (worker: NearbyAvailability) => {
    haptic('selection');
    navigation.navigate('SendHiringRequest', {
      seekerId: worker.seeker.id,
      seekerName: worker.seeker.name,
    });
  };

  return (
    <Screen edges={[]}>
      {/* ── Header ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          borderBottomWidth: 0.5,
          borderBottomColor: cardBorder,
          backgroundColor: bg,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={textPrimary} />
        </Pressable>
        <Text
          style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: textPrimary, marginRight: 22 }}
          numberOfLines={1}
        >
          {t('employer.available_workers.header_title')}
        </Text>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md, backgroundColor: bg }}>
        <Text style={{ fontSize: 13, lineHeight: 19, color: textSecondary }}>
          {t('employer.available_workers.header_subtitle')}
        </Text>

        {/* Quick links — inbound interest + outbound requests */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <HeaderLink
            icon="user-plus"
            label="Interested in you"
            isLight={isLight}
            onPress={() => {
              haptic('selection');
              navigation.navigate('InterestedWorkers');
            }}
          />
          <HeaderLink
            icon="send"
            label="Requests sent"
            isLight={isLight}
            onPress={() => {
              haptic('selection');
              navigation.navigate('SentHiringRequests');
            }}
          />
        </View>
      </View>

      {/* List / Map toggle */}
      <View
        style={{
          flexDirection: 'row',
          alignSelf: 'center',
          marginTop: spacing.md,
          backgroundColor: cardBg,
          borderRadius: radii.pill,
          borderWidth: 1,
          borderColor: cardBorder,
          padding: 3,
        }}
      >
        <ModeTab label="List" active={mode === 'list'} onPress={() => setMode('list')} />
        <ModeTab label="Map" active={mode === 'map'} onPress={() => setMode('map')} />
      </View>

      {coords?.origin === 'default' ? (
        <View
          style={{
            marginTop: spacing.sm,
            marginHorizontal: spacing.xl,
            padding: spacing.md,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: isLight ? '#FDE68A' : '#78350F',
            backgroundColor: isLight ? '#FFFBEB' : '#2A1A00',
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <Feather name="alert-triangle" size={14} color={AMBER} />
          <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: isLight ? '#92400E' : '#FCD34D' }}>
            {t('employer.available_workers.location_default')}
          </Text>
        </View>
      ) : null}

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
        ) : mode === 'map' && coords ? (
          <WorkersMapView
            coords={{ lat: coords.lat, lng: coords.lng }}
            workers={availabilities}
            radiusKm={SEARCH_RADIUS_M / 1000}
            onHire={onHire}
            onCall={(w) => callMutation.mutate(w.seeker.id)}
            calling={callMutation.isPending}
          />
        ) : availabilities.length === 0 ? (
          <EmptyState
            illustration="search"
            tone="hero"
            eyebrow={t('employer.available_workers.empty_eyebrow')}
            title={t('employer.available_workers.empty_title')}
            message={t('employer.available_workers.empty_message')}
          />
        ) : (
          <FlatList
            data={sortedAvailabilities}
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
                tintColor={BLUE}
              />
            }
            ListHeaderComponent={
              pastApplicants.length > 0 || trustedWorkers.length > 0 ? (
                <View>
                  {pastApplicants.length > 0 ? (
                    <PastApplicantsStrip
                      items={pastApplicants}
                      onCall={(id) => callMutation.mutate(id)}
                      t={t}
                    />
                  ) : null}
                  {trustedWorkers.length > 0 ? (
                    <TrustedWorkersStrip
                      items={trustedWorkers}
                      onCall={(id) => callMutation.mutate(id)}
                      t={t}
                    />
                  ) : null}
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <AvailabilityRow
                item={item}
                onCall={() => callMutation.mutate(item.seeker.id)}
                onHire={() => onHire(item)}
                calling={callMutation.isPending}
                travelMinutes={travelMap.get(item.seekerId)?.minutes}
                travelEstimated={travelMap.get(item.seekerId)?.estimated}
                t={t}
              />
            )}
          />
        )}
      </View>
    </Screen>
  );
}

// ─── Re-tap past applicants strip ─────────────────────────────────────────────

/**
 * A highlighted strip above the live-workers list: people who applied to
 * this employer before and are broadcasting availability nearby again.
 * Warm leads — already wanted to work here once — so they earn a spot at
 * the top with one-tap call.
 */
function PastApplicantsStrip({
  items,
  onCall,
  t,
}: {
  items: PastApplicant[];
  onCall: (seekerId: string) => void;
  t: TFn;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        marginBottom: spacing.md,
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.default,
        backgroundColor: theme.bg.surface,
        gap: spacing.sm,
      }}
    >
      <Text variant="footnote" weight="semibold" tone="secondary" style={{ letterSpacing: 0.8 }}>
        {t('employer.past_applicants.heading', { n: items.length })}
      </Text>
      {items.slice(0, 5).map((w) => (
        <View
          key={w.seeker.id}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
        >
          <Avatar name={w.seeker.name} photoUrl={w.seeker.photoUrl} size={36} />
          <View style={{ flex: 1 }}>
            <Text variant="body" weight="medium" numberOfLines={1}>
              {w.seeker.name}
            </Text>
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {w.lastApplied.jobTitle
                ? t('employer.past_applicants.applied_for', { title: w.lastApplied.jobTitle })
                : t('employer.past_applicants.applied_before')}
            </Text>
          </View>
          <Pressable
            onPress={() => onCall(w.seeker.id)}
            accessibilityRole="button"
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: 6,
              borderRadius: radii.pill,
              backgroundColor: '#10B981',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
              {t('employer.past_applicants.call')}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/**
 * Local social-proof strip: workers other employers in this city rated
 * highly. A peer recommendation beats a cold result, so they get a spot
 * near the top with the count of employers who vouched for them.
 */
function TrustedWorkersStrip({
  items,
  onCall,
  t,
}: {
  items: TrustedWorker[];
  onCall: (seekerId: string) => void;
  t: TFn;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        marginBottom: spacing.md,
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.default,
        backgroundColor: theme.bg.surface,
        gap: spacing.sm,
      }}
    >
      <Text variant="footnote" weight="semibold" tone="secondary" style={{ letterSpacing: 0.8 }}>
        {t('employer.trusted_workers.heading')}
      </Text>
      {items.slice(0, 5).map((w) => (
        <View
          key={w.seeker.id}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
        >
          <Avatar name={w.seeker.name} photoUrl={w.seeker.photoUrl} size={36} />
          <View style={{ flex: 1 }}>
            <Text variant="body" weight="medium" numberOfLines={1}>
              {w.seeker.name}
            </Text>
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {t('employer.trusted_workers.rated_by', {
                avg: w.avgScore,
                n: w.employerCount,
              })}
            </Text>
          </View>
          <Pressable
            onPress={() => onCall(w.seeker.id)}
            accessibilityRole="button"
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: 6,
              borderRadius: radii.pill,
              backgroundColor: '#10B981',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
              {t('employer.trusted_workers.call')}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

// ─── Header pieces ───────────────────────────────────────────────────────────

function HeaderLink({
  icon,
  label,
  isLight,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  isLight: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: spacing.sm,
        borderRadius: radii.lg,
        backgroundColor: isLight ? '#EFF6FF' : 'rgba(59,130,246,0.14)',
        borderWidth: 0.5,
        borderColor: isLight ? '#DBEAFE' : 'rgba(96,165,250,0.35)',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Feather name={icon} size={13} color={blue[600]} />
      <Text
        style={{ fontSize: 12, fontWeight: '700', color: blue[600] }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ModeTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={active ? { selected: true } : {}}
      style={{
        paddingVertical: 7,
        paddingHorizontal: spacing.xl,
        borderRadius: radii.pill,
        backgroundColor: active ? blue[600] : 'transparent',
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: '700',
          color: active ? '#FFFFFF' : theme.text.tertiary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function AvailabilityRow({
  item,
  onCall,
  onHire,
  calling,
  travelMinutes,
  travelEstimated,
  t,
}: {
  item: NearbyAvailability;
  onCall: () => void;
  onHire: () => void;
  calling: boolean;
  /** Driving ETA in minutes, when computed. */
  travelMinutes?: number;
  travelEstimated?: boolean;
  t: TFn;
}) {
  const { theme, scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const minutesLeft = Math.max(
    0,
    Math.round((new Date(item.until).getTime() - Date.now()) / 60_000),
  );
  const distanceLabel =
    item.distanceMeters < 1000
      ? t('employer.available_workers.meters_short', { n: item.distanceMeters })
      : t('employer.available_workers.kilometers_short', { n: (item.distanceMeters / 1000).toFixed(1) });
  const travelLabel =
    travelMinutes != null
      ? travelEstimated
        ? t('employer.available_workers.drive_est', { n: travelMinutes })
        : t('employer.available_workers.drive', { n: travelMinutes })
      : null;

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
            {travelLabel ? `${travelLabel} · ` : ''}{distanceLabel} · {minutesLeft > 0 ? t('employer.available_workers.minutes_left', { n: minutesLeft }) : t('employer.available_workers.expiring')}
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
                  backgroundColor: isLight ? '#EFF6FF' : '#1E3A5F',
                  borderWidth: 0.5,
                  borderColor: isLight ? '#BFDBFE' : '#1E3A5F',
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

      {/* Actions — hire (primary) + call */}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Pressable
          onPress={onHire}
          accessibilityRole="button"
          accessibilityLabel={`Send a hiring request to ${item.seeker.name}`}
          style={({ pressed }) => ({
            flex: 1,
            backgroundColor: theme.brand.hero,
            paddingVertical: 12,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: '#FFFDF7', fontSize: 14, fontWeight: '700' }}>
            Send hiring request
          </Text>
        </Pressable>
        <Pressable
          onPress={onCall}
          disabled={calling}
          accessibilityRole="button"
          accessibilityLabel={t('employer.available_workers.call_a11y', { name: item.seeker.name })}
          style={({ pressed }) => ({
            paddingVertical: 12,
            paddingHorizontal: spacing.lg,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.border.default,
            opacity: calling ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: theme.text.primary, fontSize: 14, fontWeight: '700' }}>
            {calling ? t('employer.available_workers.opening_dialer') : t('employer.available_workers.call_now')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
