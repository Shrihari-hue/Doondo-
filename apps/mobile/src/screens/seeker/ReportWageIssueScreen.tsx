/**
 * ReportWageIssueScreen — Wage Strike Alerts (#46). A worker flags one
 * job's wage practices. Always anonymous, always private: the flagged
 * employer never sees this report, other seekers never see it — only an
 * aggregate ratio surfaces on EmployerDetail once enough reports land
 * (see wageFlag.service.ts MIN_SIGNAL_FLAGS).
 */
import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Button } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { wageFlagsApi, type WageFlagReason, type WagePeriod } from '@/api/wageFlags.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'ReportWageIssue'>;

const REASONS: WageFlagReason[] = ['below_promised_wage', 'late_payment', 'unpaid_overtime', 'wage_theft', 'other'];
const PERIODS: WagePeriod[] = ['hour', 'day', 'week', 'month', 'fixed'];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: active ? 1.5 : 1,
        borderColor: active ? theme.brand.primary : theme.border.subtle,
        backgroundColor: active ? theme.brand.primarySubtle : 'transparent',
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? theme.brand.primary : theme.text.secondary }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const { jobId, jobTitle } = route.params;

  const [reason, setReason] = useState<WageFlagReason>('below_promised_wage');
  const [promised, setPromised] = useState('');
  const [actual, setActual] = useState('');
  const [period, setPeriod] = useState<WagePeriod>('day');
  const [note, setNote] = useState('');
  const [showWageFields, setShowWageFields] = useState(false);

  const mut = useMutation({
    mutationFn: () =>
      wageFlagsApi.create({
        jobId,
        reason,
        promisedWageAmount: promised ? Number(promised) : undefined,
        actualWageAmount: actual ? Number(actual) : undefined,
        wagePeriod: showWageFields ? period : undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      haptic('success');
      Alert.alert(t('report_wage_issue.sent_title'), t('report_wage_issue.sent_body'), [
        { text: t('report_wage_issue.done'), onPress: () => navigation.goBack() },
      ]);
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(t('report_wage_issue.error_title'), (err as Error).message ?? t('report_wage_issue.error_default'));
    },
  });

  return (
    <Screen edges={[]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.border.subtle,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" hitSlop={12}>
          <Feather name="chevron-left" size={22} color={theme.text.primary} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text.primary }}>
          {t('report_wage_issue.title')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['5xl'], gap: spacing.xl }}>
        <View
          style={{
            backgroundColor: theme.bg.muted,
            borderRadius: radii.lg,
            padding: spacing.md,
            gap: 4,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text.secondary }}>
            {t('report_wage_issue.anonymous_title')}
          </Text>
          <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
            {t('report_wage_issue.anonymous_body')}
          </Text>
        </View>

        <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: '600', color: theme.text.primary }}>
          {jobTitle}
        </Text>

        <View style={{ gap: spacing.sm }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
            {t('report_wage_issue.reason_section')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {REASONS.map((r) => (
              <Chip
                key={r}
                label={t(`report_wage_issue.reason_${r}`)}
                active={reason === r}
                onPress={() => {
                  haptic('selection');
                  setReason(r);
                }}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Pressable
            onPress={() => {
              haptic('selection');
              setShowWageFields((v) => !v);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Feather name={showWageFields ? 'chevron-down' : 'chevron-right'} size={16} color={theme.text.secondary} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
              {t('report_wage_issue.wage_details_section')}
            </Text>
          </Pressable>
          {showWageFields && (
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 11, color: theme.text.tertiary }}>{t('report_wage_issue.promised_label')}</Text>
                  <TextInput
                    value={promised}
                    onChangeText={setPromised}
                    keyboardType="number-pad"
                    placeholder="₹"
                    placeholderTextColor={theme.text.tertiary}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.border.subtle,
                      borderRadius: radii.md,
                      paddingHorizontal: spacing.md,
                      paddingVertical: 10,
                      color: theme.text.primary,
                    }}
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 11, color: theme.text.tertiary }}>{t('report_wage_issue.actual_label')}</Text>
                  <TextInput
                    value={actual}
                    onChangeText={setActual}
                    keyboardType="number-pad"
                    placeholder="₹"
                    placeholderTextColor={theme.text.tertiary}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.border.subtle,
                      borderRadius: radii.md,
                      paddingHorizontal: spacing.md,
                      paddingVertical: 10,
                      color: theme.text.primary,
                    }}
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {PERIODS.map((p) => (
                  <Chip
                    key={p}
                    label={t(`report_wage_issue.period_${p}`)}
                    active={period === p}
                    onPress={() => {
                      haptic('selection');
                      setPeriod(p);
                    }}
                  />
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
            {t('report_wage_issue.note_section')}
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('report_wage_issue.note_placeholder')}
            placeholderTextColor={theme.text.tertiary}
            multiline
            style={{
              minHeight: 80,
              borderWidth: 1,
              borderColor: theme.border.subtle,
              borderRadius: radii.md,
              padding: spacing.md,
              color: theme.text.primary,
              textAlignVertical: 'top',
            }}
          />
        </View>

        <Button
          label={mut.isPending ? t('report_wage_issue.sending') : t('report_wage_issue.submit_cta')}
          disabled={mut.isPending}
          onPress={() => mut.mutate()}
        />
      </ScrollView>
    </Screen>
  );
}

export function ReportWageIssueScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
