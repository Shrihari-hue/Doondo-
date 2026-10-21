/**
 * WageWatchScreen — what my trade pays in my city right now.
 * For each of my skills: the typical range (middle half of postings), the
 * median, and whether it's going up or down vs the previous 4 weeks.
 * Information to help a worker negotiate — nothing more.
 */
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { spacing } from '@doondo/tokens';
import { Screen, Text, Card, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { prettifySkill } from '@/lib/trades';
import { wageWatchApi } from '@/api/wageWatch.api';

const rs = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

export function WageWatchScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useTranslate();
  const q = useQuery({ queryKey: ['wage-watch'], queryFn: wageWatchApi.get, staleTime: 60 * 60 * 1000 });

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing['5xl'], paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text variant="title" weight="semibold">{t('wage_watch.title')}</Text>
            {q.data?.city ? <Text variant="footnote" tone="secondary">{t('wage_watch.subtitle', { city: q.data.city })}</Text> : null}
          </View>
        </View>
        {q.isLoading ? <LoadingSpinner /> : (q.data?.rates.length ?? 0) === 0 ? (
          <EmptyState glyph="📊" title={t('wage_watch.empty_title')} message={t('wage_watch.empty_message')} />
        ) : (
          q.data!.rates.map((r) => (
            <Card key={r.skill}>
              <View style={{ gap: spacing.xs }}>
                <Text variant="bodyLarge" weight="semibold">{prettifySkill(r.skill)}</Text>
                <Text variant="title" weight="semibold">{rs(r.medianPaise)}<Text variant="footnote" tone="secondary"> / {t(`wage_watch.per.${r.period}`)}</Text></Text>
                <Text variant="footnote" tone="secondary">{t('wage_watch.range', { low: rs(r.p25Paise), high: rs(r.p75Paise), n: r.samples })}</Text>
                {r.trend != null && (
                  <Text variant="footnote" weight="medium" tone={r.trend < -0.05 ? 'warning' : r.trend > 0.05 ? 'success' : 'secondary'}>
                    {r.trend > 0.05 ? '▲ ' : r.trend < -0.05 ? '▼ ' : ''}{t('wage_watch.trend', { pct: Math.abs(Math.round(r.trend * 100)), dir: r.trend >= 0 ? t('wage_watch.up') : t('wage_watch.down') })}
                  </Text>
                )}
              </View>
            </Card>
          ))
        )}
        <Text variant="caption" tone="tertiary">{t('wage_watch.note')}</Text>
      </ScrollView>
    </Screen>
  );
}
