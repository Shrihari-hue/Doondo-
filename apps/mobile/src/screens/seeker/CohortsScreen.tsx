/**
 * CohortsScreen — my course groups + join one by code.
 * New groups are started from a course ("Study with friends").
 */
import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, Button, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { cohortsApi } from '@/api/cohorts.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function CohortsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useTranslate();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const q = useQuery({ queryKey: ['cohorts'], queryFn: cohortsApi.mine });
  const join = useMutation({
    mutationFn: () => cohortsApi.join(code),
    onSuccess: (c) => {
      haptic('success');
      setCode('');
      void qc.invalidateQueries({ queryKey: ['cohorts'] });
      navigation.navigate('Cohort', { cohortId: c.id });
    },
    onError: (e) => Alert.alert(t('cohorts.join_failed'), e instanceof Error ? e.message : undefined),
  });

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing['5xl'], paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <Text variant="title" weight="semibold">{t('cohorts.title')}</Text>
        </View>
        <Text variant="footnote" tone="secondary">{t('cohorts.intro')}</Text>

        {q.isLoading ? <LoadingSpinner /> : (q.data?.length ?? 0) === 0 ? (
          <EmptyState glyph="👥" title={t('cohorts.empty_title')} message={t('cohorts.empty_message')}
            cta={{ label: t('cohorts.browse_courses'), onPress: () => navigation.navigate('Courses') }} />
        ) : (
          q.data!.map((c) => (
            <Pressable key={c.id} onPress={() => { haptic('selection'); navigation.navigate('Cohort', { cohortId: c.id }); }}>
              <Card>
                <View style={{ gap: 4 }}>
                  <Text variant="body" weight="semibold">{c.name}</Text>
                  <Text variant="footnote" tone="secondary">{c.courseTitle} · {t('cohorts.members', { n: c.members.length })}</Text>
                </View>
              </Card>
            </Pressable>
          ))
        )}

        <Card>
          <View style={{ gap: spacing.sm }}>
            <Text variant="body" weight="semibold">{t('cohorts.join_title')}</Text>
            <TextInput value={code} onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
              placeholder="ABC234" placeholderTextColor={theme.text.tertiary} autoCapitalize="characters"
              style={{ borderWidth: 1, borderColor: theme.border.default, borderRadius: radii.md, padding: 12, fontSize: 18, letterSpacing: 3, color: theme.text.primary }} />
            <Button label={join.isPending ? '…' : t('cohorts.join_cta')} onPress={() => join.mutate()} disabled={code.length < 4 || join.isPending} />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
