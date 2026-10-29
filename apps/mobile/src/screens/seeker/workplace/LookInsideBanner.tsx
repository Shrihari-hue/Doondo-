/**
 * LookInsideBanner — "📷 Look inside Third Wave Coffee" entry shown on
 * job detail when the employer has a workplace portfolio. Renders
 * nothing when they don't (or while loading), so it never adds noise.
 */

import { Image, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { radii, spacing } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { resolveMediaUrl } from '@/api/client';
import { portfolioApi } from '@/api/portfolio.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function LookInsideBanner({
  employerId,
  employerName,
  distanceM,
}: {
  employerId: string | null | undefined;
  employerName: string;
  distanceM?: number | null;
}) {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const t = useTranslate();
  const q = useQuery({
    queryKey: ['portfolio-summaries', employerId],
    queryFn: () => portfolioApi.summaries([employerId!]),
    enabled: Boolean(employerId),
    staleTime: 5 * 60_000,
  });
  const s = q.data?.summaries[0];
  if (!employerId || !s || s.photoCount === 0) return null;

  const bits = [
    t(s.photoCount === 1 ? 'look_inside.banner_photos_one' : 'look_inside.banner_photos', { n: s.photoCount }),
    s.hasVideo ? t('look_inside.banner_video') : null,
    s.teamCount > 0 ? t('look_inside.banner_team', { n: s.teamCount }) : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={() => {
        haptic('selection');
        navigation.navigate('LookInside', { employerId, distanceM: distanceM ?? undefined });
      }}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.sm,
        paddingRight: spacing.md,
        borderRadius: radii.lg,
        backgroundColor: theme.bg.surface,
        borderWidth: 0.5,
        borderColor: theme.brand.hero,
      }}
    >
      <Image source={{ uri: resolveMediaUrl(s.coverUrl) ?? undefined }} style={{ width: 64, height: 64, borderRadius: radii.md, backgroundColor: theme.bg.muted }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
          📷 {t('look_inside.banner_title', { name: employerName })}
        </Text>
        <Text variant="footnote" tone="secondary" numberOfLines={1}>{bits.join(' · ')}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={theme.brand.hero} />
    </Pressable>
  );
}
