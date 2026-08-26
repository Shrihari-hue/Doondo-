/**
 * WomenHubScreen — the "Doondo for Women" home.
 *
 * One destination that brings the feature together:
 *   1. Women's Mode toggle — flip the whole job experience to women-safe
 *      postings (a view filter; it never changes the account).
 *   2. A curated feed of women-safe jobs nearby.
 *   3. Plain-language safe-work guidance.
 *   4. One-tap reach for the existing safety tools — SOS, Trust Circle.
 *
 * Honest framing throughout: the women-safety signals are declared by
 * employers, not verified by Doondo, and the screen says so.
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, WomenSafetyBadge } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { getCurrentCoords } from '@/lib/location';
import { WOMEN_SAFETY_TIPS } from '@/lib/womenSafetyCatalog';
import { useWomenModeStore } from '@/stores/womenMode.store';
import { jobsApi } from '@/api/jobs.api';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, options?: Record<string, unknown>) => string;

/** Feather icon per guidance tip id — keeps the hub emoji-free without
 * touching the shared womenSafetyCatalog (also used by the employer
 * PostJob screen and the JobDetail signal chips). */
const TIP_ICONS: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  know_rights: 'file-text',
  trusted_contact: 'phone-call',
  safe_commute: 'navigation',
  trust_instincts: 'compass',
};

function payLabel(pay: PublicJob['pay'], t: TFn): string {
  const symbol =
    pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : `${pay.currency} `;
  const lo = (pay.amount / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const hi = pay.amountMax
    ? (pay.amountMax / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : null;
  const periodKey =
    pay.period === 'hour'
      ? 'common.pay_period.suffix_hour'
      : pay.period === 'day'
        ? 'common.pay_period.suffix_day'
        : pay.period === 'week'
          ? 'common.pay_period.suffix_week'
          : pay.period === 'month'
            ? 'common.pay_period.suffix_month'
            : 'common.pay_period.suffix_fixed';
  return `${symbol}${hi ? `${lo}–${hi}` : lo}${t(periodKey)}`;
}

function WomenHubScreenInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const t = useTranslate();

  const womenModeEnabled = useWomenModeStore((s) => s.enabled);
  const setWomenMode = useWomenModeStore((s) => s.setEnabled);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [coordsResolved, setCoordsResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getCurrentCoords().then((c) => {
      if (cancelled) return;
      if (c) setCoords({ lat: c.lat, lng: c.lng });
      setCoordsResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Curated feed — women-safe postings only.
  const jobsQuery = useQuery({
    queryKey: ['women', 'safe-jobs', coords?.lat, coords?.lng],
    queryFn: () =>
      jobsApi.nearby({
        lat: coords!.lat,
        lng: coords!.lng,
        radius: 15_000,
        safeForWomenOnly: true,
        limit: 8,
      }),
    enabled: coords != null,
    staleTime: 60_000,
  });

  const jobs = jobsQuery.data?.jobs ?? [];

  return (
    <Screen>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing.sm,
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            borderWidth: 0.5,
            borderColor: theme.border.default,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="chevron-left" size={18} color={theme.text.primary} />
        </Pressable>
        <Text variant="bodyLarge" weight="medium" style={{ flex: 1 }}>
          {t('women.hub_title')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing['4xl'],
          gap: spacing.lg,
        }}
      >
        {/* Intro */}
        <View
          style={{
            backgroundColor: theme.brand.heroSubtle,
            borderRadius: radii.lg,
            padding: spacing.lg,
            gap: spacing.xs,
          }}
        >
          <Text variant="bodyLarge" weight="semibold" style={{ color: theme.brand.hero }}>
            {t('women.intro_title')}
          </Text>
          <Text variant="footnote" tone="secondary" style={{ lineHeight: 20 }}>
            {t('women.intro_body')}
          </Text>
        </View>

        {/* Women's Mode toggle */}
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.border.default,
            borderRadius: radii.lg,
            padding: spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="body" weight="medium">
              {t('women.mode_title')}
            </Text>
            <Text variant="footnote" tone="secondary" style={{ lineHeight: 19 }}>
              {t('women.mode_desc')}
            </Text>
          </View>
          <Switch
            value={womenModeEnabled}
            onValueChange={(on) => {
              haptic('selection');
              void setWomenMode(on);
            }}
            trackColor={{ false: theme.border.default, true: theme.brand.hero }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Curated women-safe feed */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.1 }}>
            {t('women.safe_jobs_title').toUpperCase()}
          </Text>

          {!coordsResolved || (coords && jobsQuery.isLoading) ? (
            <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
              <LoadingSpinner />
            </View>
          ) : !coords ? (
            <Text variant="footnote" tone="secondary">
              {t('women.location_needed')}
            </Text>
          ) : jobs.length === 0 ? (
            <Text variant="footnote" tone="secondary">
              {t('women.safe_jobs_empty')}
            </Text>
          ) : (
            jobs.map((job) => (
              <Pressable
                key={job.id}
                onPress={() => {
                  haptic('light');
                  navigation.navigate('JobDetail', { jobId: job.id });
                }}
                style={{
                  borderWidth: 0.5,
                  borderColor: theme.border.subtle,
                  backgroundColor: theme.bg.surface,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                  gap: 6,
                  shadowColor: '#0F172A',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 8,
                  elevation: 1,
                }}
              >
                <Text variant="body" weight="medium" numberOfLines={2}>
                  {job.title}
                </Text>
                {job.employer?.name ? (
                  <Text variant="footnote" tone="secondary" numberOfLines={1}>
                    {job.employer.companyName || job.employer.name}
                  </Text>
                ) : null}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: spacing.sm,
                    marginTop: 2,
                  }}
                >
                  <Text
                    variant="footnote"
                    weight="medium"
                    style={{ color: theme.brand.hero }}
                  >
                    {payLabel(job.pay, t)}
                  </Text>
                  {job.distanceMeters != null ? (
                    <Text variant="footnote" tone="tertiary">
                      {job.distanceMeters < 1000
                        ? t('common.units.meters_short', { n: job.distanceMeters })
                        : t('common.units.kilometers_short', {
                            n: (job.distanceMeters / 1000).toFixed(1),
                          })}
                    </Text>
                  ) : null}
                  <WomenSafetyBadge tier={job.womenSafetyTier} compact />
                </View>
              </Pressable>
            ))
          )}
        </View>

        {/* Safe-work guidance */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.1 }}>
            {t('women.guidance_title').toUpperCase()}
          </Text>
          {WOMEN_SAFETY_TIPS.map((tip) => (
            <View
              key={tip.id}
              style={{
                flexDirection: 'row',
                gap: spacing.md,
                borderWidth: 0.5,
                borderColor: theme.border.subtle,
                backgroundColor: theme.bg.surface,
                borderRadius: radii.lg,
                padding: spacing.md,
                alignItems: 'flex-start',
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: theme.brand.heroSubtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name={TIP_ICONS[tip.id] ?? 'info'} size={16} color={theme.brand.hero} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" weight="medium">
                  {t(`women.tip.${tip.id}_title`)}
                </Text>
                <Text variant="footnote" tone="secondary" style={{ lineHeight: 19 }}>
                  {t(`women.tip.${tip.id}_body`)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Safety tools */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.1 }}>
            {t('women.tools_title').toUpperCase()}
          </Text>
          {(
            [
              { route: 'Sos' as const, icon: 'alert-octagon' as const, key: 'sos', tone: 'danger' as const },
              { route: 'TrustCircle' as const, icon: 'users' as const, key: 'trust_circle', tone: 'hero' as const },
            ]
          ).map((tool) => (
            <Pressable
              key={tool.key}
              onPress={() => {
                haptic('selection');
                navigation.navigate(tool.route);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                borderWidth: 0.5,
                borderColor: theme.border.subtle,
                backgroundColor: theme.bg.surface,
                borderRadius: radii.lg,
                padding: spacing.md,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: tool.tone === 'danger' ? theme.status.dangerSubtle : theme.brand.heroSubtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather
                  name={tool.icon}
                  size={16}
                  color={tool.tone === 'danger' ? theme.status.danger : theme.brand.hero}
                />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" weight="medium">
                  {t(`women.tool_${tool.key}_label`)}
                </Text>
                <Text variant="footnote" tone="secondary">
                  {t(`women.tool_${tool.key}_desc`)}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={theme.text.tertiary} />
            </Pressable>
          ))}
        </View>

        {/* Honest disclaimer */}
        <Text
          variant="caption"
          tone="tertiary"
          style={{ textAlign: 'center', lineHeight: 17 }}
        >
          {t('women.disclaimer')}
        </Text>
      </ScrollView>
    </Screen>
  );
}

export function WomenHubScreen() {
  return (
    <SeekerThemeOverride>
      <WomenHubScreenInner />
    </SeekerThemeOverride>
  );
}
