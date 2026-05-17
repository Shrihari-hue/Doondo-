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
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function formatPay(pay: { amount: number; amountMax: number | null; period: string }): string {
  const min = Math.round(pay.amount / 100);
  const max = pay.amountMax ? Math.round(pay.amountMax / 100) : null;
  const range = max && max !== min ? `₹${min}–${max}` : `₹${min}`;
  const period = pay.period === 'day' ? '/day' : pay.period === 'hour' ? '/hr' : `/${pay.period}`;
  return `${range}${period}`;
}

export function RecommendedForYouRail() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
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
          ✨ Recommended for you
        </Text>
        <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
          Based on your resume
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
              {j.employer?.companyName ?? j.employer?.name ?? 'Employer'}
              {j.location.area ? ` · ${j.location.area}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              <Pill label={formatPay(j.pay)} tone="warning" />
              {j.urgent && <Pill label="Urgent" tone="warning" leading="●" />}
              {j.safeForWomen && <Pill label="Women-safe" tone="success" leading="🛡" />}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
