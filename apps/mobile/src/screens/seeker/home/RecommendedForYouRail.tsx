/**
 * "Recommended for you" horizontal rail on the seeker Home.
 *
 * Calls /jobs/recommended which returns up to 10 scored jobs. Hides
 * completely when the seeker isn't logged in, has nothing in their
 * resume yet, or the engine returns no scoreable matches. Falls back
 * silently on error — Home should never show an error state for an
 * additive rail.
 */
import { Pressable, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { spacing } from '@doondo/tokens';
import { Text, Pill } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { jobsApi } from '@/api/jobs.api';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

/**
 * Localised pay formatter. `t` is passed in (instead of being read via
 * useTranslate inside this helper) because helpers below the component
 * tree can't call hooks. Standard pattern across the home subcomponents.
 */
function formatPay(
  pay: { amount: number; amountMax: number | null; period: string },
  t: (key: string) => string,
): string {
  const min = Math.round(pay.amount / 100);
  const max = pay.amountMax ? Math.round(pay.amountMax / 100) : null;
  const range = max && max !== min ? `₹${min}–${max}` : `₹${min}`;
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
  return `${range}${t(periodKey)}`;
}

export function RecommendedForYouRail() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const t = useTranslate();
  const query = useQuery({
    queryKey: ['jobs', 'recommended'],
    queryFn: () => jobsApi.recommended(),
    enabled: user?.role === 'seeker',
    staleTime: 5 * 60 * 1000,
    // No error state — Home shouldn't surface failures for additive rails.
    retry: 1,
  });
  const jobs = query.data?.jobs ?? [];
  if (jobs.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.xs,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text.primary }}>
          {t('home.recommended.title')}
        </Text>
        <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
          {t('home.recommended.subtitle')}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xs }}
      >
        {jobs.map((j) => (
          <Pressable
            key={j.id}
            onPress={() => {
              haptic('selection');
              navigation.navigate('JobDetail', { jobId: j.id });
            }}
            style={({ pressed }) => ({
              width: 260,
              borderRadius: 16,
              padding: spacing.md,
              backgroundColor: theme.bg.surface,
              borderWidth: 0.5,
              borderColor: theme.border.subtle,
              opacity: pressed ? 0.85 : 1,
              gap: 6,
            })}
          >
            <Text
              numberOfLines={1}
              style={{ fontSize: 14, fontWeight: '700', color: theme.text.primary }}
            >
              {j.title}
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.secondary }} numberOfLines={1}>
              {j.employer?.companyName ?? j.employer?.name ?? t('home.recommended.fallback_employer')}
              {j.location.area ? ` · ${j.location.area}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              <Pill label={formatPay(j.pay, t)} tone="warning" />
              {j.urgent && <Pill label={t('home.recommended.urgent_pill')} tone="warning" leading="●" />}
              {j.safeForWomen && <Pill label={t('home.recommended.women_safe_pill')} tone="success" leading="🛡" />}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
