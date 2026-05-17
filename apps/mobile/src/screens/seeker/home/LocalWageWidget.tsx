/**
 * LocalWageWidget — Home dashboard card showing the live going-rate for
 * the seeker's primary trade in their city.
 *
 *   "{Trade} in {City} typically earn ₹X–Y per day right now"
 *
 * Sources data from /jobs/pay-stats (already used by JobDetail's
 * transparency line). Hidden when:
 *   - The seeker has no skills set yet (no trade to query).
 *   - The seeker has no resolved city (we need it for the geo bucket).
 *   - The endpoint returns sampleSize < 5 (too small for a confident
 *     headline — better to say nothing than mislead).
 *
 * Trade pick: we use the first skill in the seeker's skills array. The
 * Resume Builder already orders skills by primary-first, so this is
 * usually the trade the worker most strongly identifies with.
 */
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { spacing } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { jobsApi } from '@/api/jobs.api';
import { prettifySkill } from '@/lib/trades';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import type { JobType, PublicUser } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

interface Props {
  user: PublicUser | null;
}

/**
 * Trade → JobType heuristic. Most blue-collar trades map to 'gig' or
 * 'shift' (paid per day); white-collar maps to 'full_time'. We try the
 * worker's preferred type first, then fall back to 'gig' for the daily-pay
 * narrative which is the original intent of this widget.
 */
function preferredJobType(user: PublicUser | null): JobType {
  const prefs = user?.preferredJobTypes ?? [];
  if (prefs.length === 1 && prefs[0]) return prefs[0];
  // Tie-break toward 'gig' (daily) since the widget's whole point is
  // "₹X per day right now" — most relevant to gig/shift workers.
  return 'gig';
}

function inrPerPeriod(paise: number): string {
  // Round to nearest ₹10 for display cleanliness (₹487 → ₹490).
  const rupees = Math.round(paise / 100 / 10) * 10;
  return `₹${rupees.toLocaleString('en-IN')}`;
}

export function LocalWageWidget({ user }: Props) {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const t = useTranslate();

  const trade = user?.skills?.[0] ?? null;
  const city = user?.location?.city ?? null;
  const jobType = preferredJobType(user);

  const query = useQuery({
    queryKey: ['wage-stats', trade, city, jobType],
    queryFn: () =>
      jobsApi.payStats({
        type: jobType,
        city: city!,
        period: 'day',
      }),
    enabled: Boolean(trade && city),
    staleTime: 60 * 60 * 1000, // 1h — market rates don't move every minute
  });

  const range = useMemo(() => {
    const d = query.data;
    if (!d) return null;
    if (d.sampleSize < 5 || !d.p25 || !d.p75) return null;
    return `${inrPerPeriod(d.p25)}–${inrPerPeriod(d.p75)}`;
  }, [query.data]);

  if (!trade || !city || !range) return null;

  return (
    <Pressable
      onPress={() => {
        haptic('selection');
        navigation.navigate('SeekerTabs', {
          screen: 'Jobs',
          params: { initialQuery: trade },
        } as never);
      }}
      style={({ pressed }) => ({
        borderRadius: 16,
        padding: spacing.lg,
        backgroundColor: '#FEF3C7',
        borderWidth: 0.5,
        borderColor: '#FCD34D',
        opacity: pressed ? 0.85 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: '#FDE68A',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 22 }}>💰</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: '#92400E' }}
        >
          {t('home.wage.eyebrow')}
        </Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#78350F', marginTop: 2 }}>
          {t('home.wage.headline', {
            trade: prettifySkill(trade),
            city,
            range,
          })}
        </Text>
        <Text style={{ fontSize: 12, color: '#92400E', marginTop: 2 }}>
          {t('home.wage.basis', { count: query.data?.sampleSize ?? 0 })}
        </Text>
      </View>
    </Pressable>
  );
}
