/**
 * EditExpectedSalaryScreen — set the seeker's desired pay.
 *
 * UX goals:
 *   - The seeker shouldn't have to guess which period to use. We
 *     pre-select based on their `preferredJobTypes` so most users can
 *     hit Save without thinking about it.
 *   - Each period option carries a one-line description that maps
 *     real-world work types to the right choice ("per day → daily wage
 *     work like construction or delivery").
 *   - A footer line explains what employers will see, so the seeker
 *     understands the implication of saving.
 *
 * Amount is entered in rupees in the UI and converted to paise at the
 * boundary (the backend stores minor units to match Job.pay shape).
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, TextField, Button, FormError } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { meApi } from '@/api/me.api';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth.store';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { AppStackParamList } from '@/navigation/types';
import type { JobType } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Each period option references translation keys for its label, hint
 * and sample-amount placeholder. Resolved at render time so the user's
 * active locale drives the wording instead of the data model.
 */
const PERIODS = [
  {
    key: 'day' as const,
    labelKey: 'edit_salary.period_label_day',
    hintKey: 'edit_salary.period_hint_day',
    samplePromptKey: 'edit_salary.sample_day',
  },
  {
    key: 'month' as const,
    labelKey: 'edit_salary.period_label_month',
    hintKey: 'edit_salary.period_hint_month',
    samplePromptKey: 'edit_salary.sample_month',
  },
  {
    key: 'hour' as const,
    labelKey: 'edit_salary.period_label_hour',
    hintKey: 'edit_salary.period_hint_hour',
    samplePromptKey: 'edit_salary.sample_hour',
  },
  {
    key: 'fixed' as const,
    labelKey: 'edit_salary.period_label_fixed',
    hintKey: 'edit_salary.period_hint_fixed',
    samplePromptKey: 'edit_salary.sample_fixed',
  },
  {
    key: 'week' as const,
    labelKey: 'edit_salary.period_label_week',
    hintKey: 'edit_salary.period_hint_week',
    samplePromptKey: 'edit_salary.sample_week',
  },
] as const;
type Period = (typeof PERIODS)[number]['key'];

/**
 * Smart default period — pick the most-fitting choice based on the
 * seeker's preferred job types. They set these during signup, so most
 * users can just hit Save.
 */
function defaultPeriodFor(preferred: JobType[] | undefined): Period {
  if (!preferred || preferred.length === 0) return 'day';
  // Priority order: month > day > fixed > hour. If they have multiple,
  // we pick the most "salaried" one — encourages stable expectations.
  if (preferred.includes('full_time') || preferred.includes('contract')) return 'month';
  if (preferred.includes('part_time') || preferred.includes('shift')) return 'day';
  if (preferred.includes('gig')) return 'fixed';
  return 'day';
}

function EditExpectedSalaryInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const setStore = useAuthStore.setState;
  const t = useTranslate();

  // Pre-fill from existing value (paise → rupees), or use the smart
  // default based on preferred job types.
  const initialAmount = user?.expectedSalary
    ? Math.round(user.expectedSalary.amount / 100).toString()
    : '';
  const initialAmountMax =
    user?.expectedSalary?.amountMax != null
      ? Math.round(user.expectedSalary.amountMax / 100).toString()
      : '';
  const smartDefault = useMemo(
    () => defaultPeriodFor(user?.preferredJobTypes),
    [user?.preferredJobTypes],
  );
  const initialPeriod: Period = user?.expectedSalary?.period ?? smartDefault;

  const [amount, setAmount] = useState(initialAmount);
  const [amountMax, setAmountMax] = useState(initialAmountMax);
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const rupees = Number(amount.replace(/[^\d.]/g, ''));
      if (!Number.isFinite(rupees) || rupees <= 0) {
        throw new Error(t('edit_salary.error_enter_valid'));
      }
      let maxPaise: number | null = null;
      const maxRupees = amountMax.trim()
        ? Number(amountMax.replace(/[^\d.]/g, ''))
        : NaN;
      if (Number.isFinite(maxRupees) && maxRupees > 0) {
        if (maxRupees < rupees) {
          throw new Error(t('edit_salary.error_max_lt_min'));
        }
        maxPaise = Math.round(maxRupees * 100);
      }
      return meApi.updateProfile({
        expectedSalary: {
          amount: Math.round(rupees * 100),
          amountMax: maxPaise,
          period,
          currency: 'INR',
        },
      });
    },
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setStore((s) => ({ ...s, user: updated }));
      navigation.goBack();
    },
    onError: (err) => {
      haptic('error');
      setError(err instanceof Error ? err.message : t('edit_salary.error_save_default'));
    },
  });

  function clear() {
    haptic('selection');
    meApi.updateProfile({ expectedSalary: null }).then((res) => {
      setStore((s) => ({ ...s, user: res.user }));
      navigation.goBack();
    });
  }

  const activePeriodMeta = PERIODS.find((p) => p.key === period)!;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing.xl,
          paddingBottom: spacing['5xl'],
          gap: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" tone="secondary">
            {t('edit_salary.cancel_back')}
          </Text>
        </Pressable>

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('edit_salary.eyebrow')}
          </Text>
          <Text variant="display" weight="medium" display>
            {t('edit_salary.title')}
          </Text>
          <Text variant="footnote" tone="secondary">
            {t('edit_salary.hint')}
          </Text>
        </View>

        <FormError message={error} />

        {/* Period chooser FIRST — picking a period changes the helper
            copy under the amount field, so the order is "period → amount" */}
        <View style={{ gap: spacing.sm }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 1.6,
              color: theme.text.tertiary,
            }}
          >
            {t('edit_salary.how_paid_eyebrow')}
          </Text>
          <View style={{ gap: spacing.sm }}>
            {PERIODS.map((p) => {
              const active = period === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => {
                    haptic('selection');
                    setPeriod(p.key);
                  }}
                  style={({ pressed }) => ({
                    padding: spacing.md,
                    borderRadius: radii.lg,
                    borderWidth: active ? 1.5 : 0.5,
                    borderColor: active ? theme.brand.primary : theme.border.default,
                    backgroundColor: active ? theme.brand.primarySubtle : theme.bg.surface,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.sm,
                    }}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: 2,
                        borderColor: active ? theme.brand.primary : theme.border.strong,
                        backgroundColor: active ? theme.brand.primary : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {active && (
                        <View
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 4,
                            backgroundColor: '#FFFFFF',
                          }}
                        />
                      )}
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 15,
                        fontWeight: '600',
                        color: active ? theme.brand.primary : theme.text.primary,
                      }}
                    >
                      {t(p.labelKey)}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.text.secondary,
                      marginTop: 4,
                      marginLeft: 26, // align under the radio circle
                      lineHeight: 17,
                    }}
                  >
                    {t(p.hintKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Amount field — placeholder shifts to a relevant example for
            the active period */}
        <View style={{ gap: spacing.sm }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 1.6,
              color: theme.text.tertiary,
            }}
          >
            {t('edit_salary.amount_eyebrow')}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <TextField
                label={t('edit_salary.min_label')}
                value={amount}
                onChangeText={(text) => setAmount(text.replace(/[^\d]/g, ''))}
                keyboardType="number-pad"
                placeholder={t(activePeriodMeta.samplePromptKey)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                label={t('edit_salary.max_label')}
                value={amountMax}
                onChangeText={(text) => setAmountMax(text.replace(/[^\d]/g, ''))}
                keyboardType="number-pad"
                placeholder={t('edit_salary.max_placeholder')}
              />
            </View>
          </View>
          <Text
            style={{
              fontSize: 11,
              color: theme.text.tertiary,
              lineHeight: 16,
            }}
          >
            {t('edit_salary.amount_hint')}
          </Text>
        </View>

        {/* Live preview of what employers will see */}
        {amount.trim().length > 0 && (
          <View
            style={{
              padding: spacing.md,
              borderRadius: radii.md,
              backgroundColor: theme.brand.accentSubtle,
              borderWidth: 0.5,
              borderColor: theme.brand.accentBorder,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                letterSpacing: 1.2,
                color: theme.brand.accent,
              }}
            >
              {t('edit_salary.preview_eyebrow')}
            </Text>
            <Text
              style={{
                fontSize: 22,
                fontWeight: '700',
                color: theme.text.primary,
                marginTop: 4,
              }}
            >
              ₹{Number(amount).toLocaleString('en-IN')}
              {amountMax.trim() && Number(amountMax) > Number(amount)
                ? `–₹${Number(amountMax).toLocaleString('en-IN')}`
                : ''}{' '}
              {periodSuffix(period, t)}
            </Text>
          </View>
        )}

        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {/* Hardcoded blue/white — the Save here is the moment the user
             commits their pay expectation; it has to read clearly. */}
          <Pressable
            onPress={() => save.mutate()}
            disabled={save.isPending || amount.trim().length === 0}
            accessibilityRole="button"
            accessibilityLabel={t('edit_salary.save_a11y')}
            style={({ pressed }) => ({
              paddingVertical: 14,
              borderRadius: radii.lg,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.brand.primary,
              opacity:
                save.isPending || amount.trim().length === 0
                  ? 0.5
                  : pressed
                    ? 0.85
                    : 1,
              shadowColor: theme.brand.primary,
              shadowOpacity: 0.25,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 4,
            })}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 16,
                fontWeight: '700',
              }}
            >
              {save.isPending ? t('edit_salary.saving_btn') : t('edit_salary.save_btn')}
            </Text>
          </Pressable>
          {user?.expectedSalary && (
            <Pressable
              onPress={clear}
              accessibilityRole="button"
              accessibilityLabel={t('edit_salary.clear_a11y')}
              style={({ pressed }) => ({
                paddingVertical: 12,
                borderRadius: radii.lg,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.bg.surface,
                borderWidth: 1,
                borderColor: theme.border.default,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  color: theme.text.primary,
                  fontSize: 15,
                  fontWeight: '600',
                }}
              >
                {t('edit_salary.clear_btn')}
              </Text>
            </Pressable>
          )}
        </View>

        <Text
          style={{
            fontSize: 12,
            color: theme.text.tertiary,
            textAlign: 'center',
            marginTop: spacing.sm,
            lineHeight: 17,
          }}
        >
          {t('edit_salary.footer_note')}
        </Text>
      </ScrollView>
    </Screen>
  );
}

function periodSuffix(period: Period, t: TFn): string {
  return t(`edit_salary.period_suffix_${period}`);
}

export function EditExpectedSalaryScreen() {
  return (
    <SeekerThemeOverride>
      <EditExpectedSalaryInner />
    </SeekerThemeOverride>
  );
}
