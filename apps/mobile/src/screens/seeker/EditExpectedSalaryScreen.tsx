/**
 * EditExpectedSalaryScreen — modal for setting the seeker's desired pay.
 *
 * Amount is entered in rupees in the UI and converted to paise at the
 * boundary (the backend stores minor units like Job.pay does).
 */

import { useState } from 'react';
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

type Nav = NativeStackNavigationProp<AppStackParamList>;

const PERIODS = [
  { key: 'hour', label: 'per hour' },
  { key: 'day', label: 'per day' },
  { key: 'week', label: 'per week' },
  { key: 'month', label: 'per month' },
  { key: 'fixed', label: 'fixed total' },
] as const;
type Period = (typeof PERIODS)[number]['key'];

function EditExpectedSalaryInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const setStore = useAuthStore.setState;

  // Pre-fill from existing value (paise → rupees).
  const initialAmount = user?.expectedSalary
    ? Math.round(user.expectedSalary.amount / 100).toString()
    : '';
  const initialPeriod: Period = user?.expectedSalary?.period ?? 'day';

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
          amount: Math.round(rupees * 100), // rupees → paise
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

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing.xl,
          paddingBottom: spacing['5xl'],
          gap: spacing.xl,
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
            What pay are you looking for?
          </Text>
          <Text variant="footnote" tone="secondary">
            Shown on your profile to employers.
          </Text>
        </View>

        <FormError message={error} />

        <TextField
          label="Amount (₹)"
          value={amount}
          onChangeText={(t) => setAmount(t.replace(/[^\d]/g, ''))}
          keyboardType="number-pad"
          placeholder="e.g. 1250"
        />

        <View style={{ gap: spacing.sm }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 1.6,
              color: theme.text.tertiary,
            }}
          >
            PERIOD
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {PERIODS.map((p) => {
              const active = period === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => {
                    haptic('selection');
                    setPeriod(p.key);
                  }}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radii.pill,
                    borderWidth: 1,
                    borderColor: active ? theme.brand.hero : theme.border.default,
                    backgroundColor: active ? theme.brand.heroSubtle : 'transparent',
                  }}
                >
                  <Text
                    variant="footnote"
                    weight={active ? 'medium' : 'regular'}
                    style={{ color: active ? theme.brand.hero : theme.text.secondary }}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

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
      </ScrollView>
    </Screen>
  );
}

export function EditExpectedSalaryScreen() {
  return (
    <SeekerThemeOverride>
      <EditExpectedSalaryInner />
    </SeekerThemeOverride>
  );
}
