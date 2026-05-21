/**
 * ConstitutionScreen — the seeker's "Doondo Constitution" editor.
 *
 * A worker sets their own work rules: how far they'll travel, and a few
 * hard boundaries (no night shifts, no Sunday work, must have safety
 * gear, must have a written contract). Employers see these on the
 * applicant view — so a bad fit is filtered out before anyone wastes an
 * interview. It's a small dignity: the worker states the terms.
 *
 * Reached from a row on the Profile menu. Reads + writes the real
 * /me/constitution endpoint.
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Button, FormError, LoadingSpinner, ErrorPanel } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { useConstitution, useSaveConstitution } from '@/hooks/useConstitution';
import type { SeekerConstitution } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

/** The four boolean rules, in display order. */
const RULE_FIELDS: ReadonlyArray<{
  field: 'noNightShifts' | 'noSundays' | 'requiresPpe' | 'requiresContract';
  labelKey: string;
}> = [
  { field: 'noNightShifts', labelKey: 'constitution.no_nights_label' },
  { field: 'noSundays', labelKey: 'constitution.no_sundays_label' },
  { field: 'requiresPpe', labelKey: 'constitution.requires_ppe_label' },
  { field: 'requiresContract', labelKey: 'constitution.requires_contract_label' },
];

function ConstitutionInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const t = useTranslate();
  const query = useConstitution();
  const saveMut = useSaveConstitution();

  const [rules, setRules] = useState<SeekerConstitution | null>(null);
  const [distanceText, setDistanceText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Seed local state once the server value arrives.
  useEffect(() => {
    if (query.data && rules === null) {
      const c = query.data.constitution;
      setRules(c);
      setDistanceText(c.maxDistanceKm != null ? String(c.maxDistanceKm) : '');
    }
  }, [query.data, rules]);

  function toggle(field: (typeof RULE_FIELDS)[number]['field']) {
    haptic('selection');
    setRules((r) => (r ? { ...r, [field]: !r[field] } : r));
  }

  function onSave() {
    if (!rules) return;
    const raw = distanceText.trim();
    const km =
      raw === '' || !Number.isFinite(Number(raw))
        ? null
        : Math.min(500, Math.max(0, Math.round(Number(raw))));
    setError(null);
    haptic('selection');
    saveMut.mutate(
      { ...rules, maxDistanceKm: km },
      {
        onSuccess: () => {
          haptic('success');
          navigation.goBack();
        },
        onError: () => {
          haptic('error');
          setError(t('constitution.save_error'));
        },
      },
    );
  }

  if (query.isLoading || (rules === null && !query.isError)) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }

  if (query.isError || !rules) {
    return (
      <Screen>
        <View style={{ flex: 1, padding: spacing.xl, justifyContent: 'center' }}>
          <ErrorPanel
            error={null}
            onRetry={() => void query.refetch()}
            title={t('constitution.error')}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: spacing['5xl'],
          gap: spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" tone="secondary">
            {t('constitution.back')}
          </Text>
        </Pressable>

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('constitution.title')}
          </Text>
          <Text variant="footnote" tone="secondary">
            {t('constitution.tagline')}
          </Text>
        </View>

        <FormError message={error} />

        {/* Max travel distance */}
        <View style={{ gap: spacing.xs }}>
          <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
            {t('constitution.max_distance_label')}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: theme.border.default,
              backgroundColor: theme.bg.surface,
            }}
          >
            <TextInput
              value={distanceText}
              onChangeText={setDistanceText}
              placeholder={t('constitution.max_distance_placeholder')}
              placeholderTextColor={theme.text.tertiary}
              keyboardType="number-pad"
              style={{
                flex: 1,
                fontSize: 16,
                paddingVertical: spacing.md,
                color: theme.text.primary,
              }}
            />
            <Text variant="footnote" tone="tertiary">
              {t('constitution.max_distance_unit')}
            </Text>
          </View>
          <Text variant="caption" tone="tertiary">
            {t('constitution.max_distance_hint')}
          </Text>
        </View>

        {/* Boolean rules */}
        <View
          style={{
            borderRadius: radii.lg,
            borderWidth: 0.5,
            borderColor: theme.border.default,
            backgroundColor: theme.bg.surface,
            overflow: 'hidden',
          }}
        >
          {RULE_FIELDS.map((rule, i) => (
            <View key={rule.field}>
              {i > 0 && (
                <View style={{ height: 0.5, backgroundColor: theme.border.default }} />
              )}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                }}
              >
                <Text variant="body" style={{ flex: 1 }}>
                  {t(rule.labelKey)}
                </Text>
                <Switch
                  value={rules[rule.field]}
                  onValueChange={() => toggle(rule.field)}
                  trackColor={{ false: theme.border.default, true: theme.brand.hero }}
                  thumbColor="#FFFDF7"
                />
              </View>
            </View>
          ))}
        </View>

        <Button
          label={
            saveMut.isPending ? t('constitution.saving') : t('constitution.save')
          }
          onPress={onSave}
          disabled={saveMut.isPending}
        />
      </ScrollView>
    </Screen>
  );
}

export function ConstitutionScreen() {
  return (
    <SeekerThemeOverride>
      <ConstitutionInner />
    </SeekerThemeOverride>
  );
}
