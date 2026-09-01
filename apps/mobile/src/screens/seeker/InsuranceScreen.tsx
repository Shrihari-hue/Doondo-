/**
 * InsuranceScreen — gig-worker accident cover opt-in.
 *
 * One tier in v1 (Standard, ₹49/mo). Big upper card with the cover
 * numbers, then opt-in / cancel CTA. Status pill changes after opt-in
 * ("Pending review", "Active", etc.). Renders even before opt-in so the
 * worker can see what they'd be signing up for.
 */
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import type { ThemeContextValue } from '@/theme/types';
import { Screen, Text, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { insuranceApi, type InsuranceSubscription } from '@/api/insurance.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function inr(paise: number, opts?: { lakhs?: boolean }): string {
  if (opts?.lakhs && paise >= 10000000) {
    return `₹${(paise / 10000000).toFixed(1)} L`;
  }
  if (paise >= 100000) {
    return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
  }
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

function statusCopy(
  s: InsuranceSubscription['status'],
  t: TFn,
  theme: ThemeContextValue['theme'],
): { label: string; color: string } {
  switch (s) {
    case 'pending':
      return { label: t('insurance.status_pending'), color: theme.warning };
    case 'active':
      return { label: t('insurance.status_active'), color: theme.success };
    case 'paused':
      return { label: t('insurance.status_paused'), color: theme.text.tertiary };
    case 'cancelled':
      return { label: t('insurance.status_cancelled'), color: theme.error };
  }
}

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const t = useTranslate();

  const statusQ = useQuery({
    queryKey: ['insurance', 'me'],
    queryFn: () => insuranceApi.status(),
  });

  const optInMut = useMutation({
    mutationFn: () => insuranceApi.optIn(),
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['insurance', 'me'] });
      Alert.alert(t('insurance.opt_in_success_title'), t('insurance.opt_in_success_body'));
    },
    onError: (err) =>
      Alert.alert(t('insurance.opt_in_error_title'), (err as Error).message ?? t('insurance.opt_in_error_default')),
  });

  const cancelMut = useMutation({
    mutationFn: () => insuranceApi.cancel(),
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['insurance', 'me'] });
    },
  });

  if (statusQ.isLoading) {
    return (
      <Screen edges={[]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }

  const data = statusQ.data;
  const sub = data?.subscription ?? null;
  const tier = data?.tier;
  const activeOrPending =
    sub?.status === 'pending' || sub?.status === 'active' || sub?.status === 'paused';
  const sc = sub ? statusCopy(sub.status, t, theme) : null;

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: spacing['5xl'],
          gap: spacing.lg,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.xl,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: theme.text.primary }}>
              {t('insurance.title')}
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 2 }}>
              {t('insurance.subtitle')}
            </Text>
          </View>
        </View>

        {/* Big tier card */}
        {tier && (
          <View
            style={{
              marginHorizontal: spacing.xl,
              padding: spacing.lg,
              borderRadius: 20,
              backgroundColor: theme.brand.primaryDark,
              gap: spacing.sm,
              shadowColor: theme.brand.primaryDark,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 6,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: theme.brand.primaryOnDark }}>
              {t('insurance.standard_cover_label')}
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: theme.text.onBrand }}>
              {t('insurance.price_per_month', { n: Math.round(tier.monthlyPremiumPaise / 100) })}
            </Text>
            <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
              <Bullet text={t('insurance.bullet_death_disability', { amount: inr(tier.deathCoverPaise, { lakhs: true }) })} />
              <Bullet text={t('insurance.bullet_hospital_cash', { amount: inr(tier.hospitalCashPerDayPaise), days: tier.hospitalCashMaxDaysPerYear })} />
              <Bullet text={t('insurance.bullet_active_during_hires')} />
            </View>
            {sc && (
              <View
                style={{
                  marginTop: spacing.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 6,
                  alignSelf: 'flex-start',
                  borderRadius: radii.pill,
                  backgroundColor: 'rgba(255,255,255,0.18)',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text.onBrand }}>
                  {sc.label}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* CTA */}
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
          {!activeOrPending && (
            <Pressable
              onPress={() => optInMut.mutate()}
              disabled={optInMut.isPending}
              style={{
                paddingVertical: spacing.md,
                borderRadius: radii.pill,
                backgroundColor: theme.brand.primary,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: theme.text.onBrand, fontWeight: '700', fontSize: 15 }}>
                {optInMut.isPending ? t('insurance.opt_in_subscribing') : t('insurance.opt_in_btn')}
              </Text>
            </Pressable>
          )}
          {activeOrPending && (
            <Pressable
              onPress={() =>
                Alert.alert(
                  t('insurance.cancel_confirm_title'),
                  t('insurance.cancel_confirm_body'),
                  [
                    { text: t('insurance.cancel_confirm_keep'), style: 'cancel' },
                    {
                      text: t('insurance.cancel_confirm_cancel'),
                      style: 'destructive',
                      onPress: () => cancelMut.mutate(),
                    },
                  ],
                )
              }
              style={{
                paddingVertical: spacing.md,
                borderRadius: radii.pill,
                borderWidth: 0.5,
                borderColor: theme.error,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: theme.error, fontWeight: '600', fontSize: 14 }}>
                {t('insurance.cancel_btn')}
              </Text>
            </Pressable>
          )}
          <Text style={{ fontSize: 11, color: theme.text.tertiary, lineHeight: 16 }}>
            {t('insurance.footer_disclaimer')}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Bullet({ text }: { text: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Text style={{ fontSize: 14, color: theme.brand.primaryOnDark }}>✓</Text>
      <Text style={{ flex: 1, fontSize: 13, color: theme.text.onBrand, lineHeight: 18 }}>
        {text}
      </Text>
    </View>
  );
}

export function InsuranceScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
