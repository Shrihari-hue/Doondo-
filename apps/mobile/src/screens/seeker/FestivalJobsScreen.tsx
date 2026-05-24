/**
 * FestivalJobsScreen — Festival Mode's job board.
 *
 * Lists nearby jobs in the trades that spike for the active festival
 * (decorators for Diwali, cooks for Onam, …). It pulls the standard
 * nearby feed and filters client-side to the festival's trade slugs, so
 * it needs no new backend endpoint.
 *
 * Reached from the FestivalBanner on the Home screen — which itself only
 * appears during a festival window.
 */
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useFestival, isFestivalJob } from '@/lib/festivals';
import { jobsApi } from '@/api/jobs.api';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const PERIOD_SHORT: Record<string, string> = {
  hour: '/hr',
  day: '/day',
  week: '/wk',
  month: '/mo',
  fixed: '',
};

function formatPay(pay: PublicJob['pay']): string {
  const base = `₹${Math.round(pay.amount / 100).toLocaleString('en-IN')}`;
  return `${base} ${PERIOD_SHORT[pay.period] ?? ''}`.trim();
}

/** "850 m" / "2.4 km" from a distance in metres. */
function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const { user } = useAuth();
  const festival = useFestival();

  const coords = user?.location?.coordinates ?? null;

  const query = useQuery({
    queryKey: ['festival', 'jobs', festival?.id, coords?.join(',')],
    enabled: Boolean(festival && coords),
    queryFn: () =>
      jobsApi.nearby({
        lat: coords![1],
        lng: coords![0],
        radius: 25_000,
        limit: 60,
      }),
  });

  // Filter the nearby feed to the festival's spiking trades.
  const festivalJobs: PublicJob[] = festival
    ? (query.data?.jobs ?? []).filter((j) => isFestivalJob(j.skills, festival))
    : [];

  const accent = festival?.accent ?? theme.brand.hero;

  return (
    <Screen edges={[]}>
      {/* Festival header */}
      <View
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.lg,
          backgroundColor: festival?.accentSoft ?? theme.bg.surface,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.border.subtle,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Text
            onPress={() => navigation.goBack()}
            style={{ fontSize: 22, color: theme.text.primary }}
            accessibilityRole="button"
          >
            ←
          </Text>
          <Text style={{ fontSize: 26 }}>{festival?.emoji ?? '🎉'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text.primary }}>
              {festival
                ? t('festival.board_title', { festival: festival.name })
                : t('festival.board_title_generic')}
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.secondary, marginTop: 1 }}>
              {t('festival.board_sub')}
            </Text>
          </View>
        </View>
      </View>

      {!festival ? (
        <Centered>
          <Text style={{ fontSize: 14, color: theme.text.secondary, textAlign: 'center' }}>
            {t('festival.none_active')}
          </Text>
        </Centered>
      ) : !coords ? (
        <Centered>
          <Text style={{ fontSize: 14, color: theme.text.secondary, textAlign: 'center' }}>
            {t('festival.need_location')}
          </Text>
        </Centered>
      ) : query.isLoading ? (
        <Centered>
          <LoadingSpinner />
        </Centered>
      ) : festivalJobs.length === 0 ? (
        <Centered>
          <Text style={{ fontSize: 14, color: theme.text.secondary, textAlign: 'center' }}>
            {t('festival.board_empty')}
          </Text>
        </Centered>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: spacing['5xl'],
            gap: spacing.md,
          }}
        >
          {/* Honest, motivating insight — the real count of festival jobs. */}
          <Text style={{ fontSize: 13, fontWeight: '700', color: accent }}>
            {t('festival.board_count', { count: festivalJobs.length })}
          </Text>

          {festivalJobs.map((job) => (
            <Pressable
              key={job.id}
              accessibilityRole="button"
              onPress={() => {
                haptic('selection');
                navigation.navigate('JobDetail', { jobId: job.id });
              }}
              style={({ pressed }) => ({
                backgroundColor: theme.bg.surface,
                borderRadius: 16,
                borderWidth: 0.5,
                borderColor: theme.border.subtle,
                padding: spacing.lg,
                gap: 6,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text
                  style={{ flex: 1, fontSize: 15, fontWeight: '600', color: theme.text.primary }}
                  numberOfLines={1}
                >
                  {job.title}
                </Text>
                {/* Festival pick tag */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 3,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 999,
                    backgroundColor: festival.accentSoft,
                  }}
                >
                  <Text style={{ fontSize: 10 }}>{festival.emoji}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: accent }}>
                    {t('festival.tag')}
                  </Text>
                </View>
              </View>
              {job.employer ? (
                <Text
                  style={{ fontSize: 12, color: theme.text.secondary }}
                  numberOfLines={1}
                >
                  {job.employer.companyName ?? job.employer.name}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.brand.hero }}>
                  {formatPay(job.pay)}
                </Text>
                <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
                  {job.location.area ?? job.location.city}
                  {typeof job.distanceMeters === 'number'
                    ? ` · ${formatDistance(job.distanceMeters)}`
                    : ''}
                </Text>
                {job.urgent ? (
                  <View
                    style={{
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 999,
                      backgroundColor: theme.status.warningSubtle,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '700',
                        color: theme.status.warning,
                      }}
                    >
                      {t('festival.urgent')}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
        gap: spacing.md,
      }}
    >
      {children}
    </View>
  );
}

export function FestivalJobsScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
