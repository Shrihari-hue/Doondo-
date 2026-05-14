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
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { AppStackParamList } from '@/navigation/types';
import type { JobType } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

/**
 * Each period option carries its own "when to use" copy. This is the
 * mental model from the user's perspective ("I want a daily wage" or
 * "I want a monthly salary") rather than the data model.
 */
const PERIODS = [
  {
    key: 'day' as const,
    label: 'Per day',
    hint: 'Daily wage work — construction, helper, delivery on commission, mason',
    samplePrompt: 'e.g. 600 — typical for daily-wage roles',
  },
  {
    key: 'month' as const,
    label: 'Per month',
    hint: 'Full-time monthly salary — delivery boy at a company, salon assistant, retail staff',
    samplePrompt: 'e.g. 15000 — typical for full-time roles',
  },
  {
    key: 'hour' as const,
    label: 'Per hour',
    hint: 'Hourly contract or part-time work — tutoring, freelance, evening shifts',
    samplePrompt: 'e.g. 100 — typical for hourly work',
  },
  {
    key: 'fixed' as const,
    label: 'Fixed (per gig)',
    hint: 'One-time job paid as a single amount — event photography, repairs, single tasks',
    samplePrompt: 'e.g. 3000 — one-time payment',
  },
  {
    key: 'week' as const,
    label: 'Per week',
    hint: 'Weekly wage — less common, used in some seasonal or contract roles',
    samplePrompt: 'e.g. 4000 — for weekly-paid roles',
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

  // Pre-fill from existing value (paise → rupees), or use the smart
  // default based on preferred job types.
  const initialAmount = user?.expectedSalary
    ? Math.round(user.expectedSalary.amount / 100).toString()
    : '';
  const smartDefault = useMemo(
    () => defaultPeriodFor(user?.preferredJobTypes),
    [user?.preferredJobTypes],
  );
  const initialPeriod: Period = user?.expectedSalary?.period ?? smartDefault;

  const [amount, setAmount] = useState(initialAmount);
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const rupees = Number(amount.replace(/[^\d.]/g, ''));
      if (!Number.isFinite(rupees) || rupees <= 0) {
        throw new Error('Enter a valid amount');
      }
      return meApi.updateProfile({
        expectedSalary: {
          amount: Math.round(rupees * 100),
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
      setError(err instanceof Error ? err.message : 'Could not save');
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
            ← Cancel
          </Text>
        </Pressable>

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            EXPECTED SALARY
          </Text>
          <Text variant="display" weight="medium" display>
            How do you want to be paid?
          </Text>
          <Text variant="footnote" tone="secondary">
            Pick what matches the kind of work you want. Employers see this on your profile.
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
            HOW YOU'RE PAID
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
                    borderColor: active ? theme.brand.hero : theme.border.default,
                    backgroundColor: active ? theme.brand.heroSubtle : theme.bg.surface,
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
                        borderColor: active ? theme.brand.hero : theme.border.strong,
                        backgroundColor: active ? theme.brand.hero : 'transparent',
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
                        color: active ? theme.brand.hero : theme.text.primary,
                      }}
                    >
                      {p.label}
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
                    {p.hint}
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
            AMOUNT (₹)
          </Text>
          <TextField
            label=""
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^\d]/g, ''))}
            keyboardType="number-pad"
            placeholder={activePeriodMeta.samplePrompt}
          />
        </View>

        {/* Live preview of what employers will see */}
        {amount.trim().length > 0 && (
          <View
            style={{
              padding: spacing.md,
              borderRadius: radii.md,
              backgroundColor: theme.brand.heroSubtle,
              borderWidth: 0.5,
              borderColor: theme.brand.heroBorder,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                letterSpacing: 1.2,
                color: theme.brand.hero,
              }}
            >
              EMPLOYERS WILL SEE
            </Text>
            <Text
              style={{
                fontSize: 22,
                fontWeight: '700',
                color: theme.text.primary,
                marginTop: 4,
              }}
            >
              ₹{Number(amount).toLocaleString()} {periodSuffix(period)}
            </Text>
          </View>
        )}

        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Button
            label={save.isPending ? 'Saving…' : 'Save'}
            onPress={() => save.mutate()}
            disabled={save.isPending || amount.trim().length === 0}
          />
          {user?.expectedSalary && (
            <Button label="Clear" variant="secondary" onPress={clear} />
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
          You can change this anytime. We use it to suggest jobs that
          match your pay expectation.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function periodSuffix(period: Period): string {
  return ({
    hour: '/ hour',
    day: '/ day',
    week: '/ week',
    month: '/ month',
    fixed: 'fixed',
  } as const)[period];
}

export function EditExpectedSalaryScreen() {
  return (
    <SeekerThemeOverride>
      <EditExpectedSalaryInner />
    </SeekerThemeOverride>
  );
}
