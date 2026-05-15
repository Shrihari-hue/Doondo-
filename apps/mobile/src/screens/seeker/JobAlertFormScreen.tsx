/**
 * JobAlertFormScreen — create or edit a single saved alert.
 *
 * Fields:
 *   - Name        Short label for the alert ("Delivery in Indiranagar")
 *   - Keyword     Free-text search (matched against title/desc/skills)
 *   - City        Optional — empty = anywhere
 *   - Job types   Multi-select pills (full_time / part_time / gig / shift / contract)
 *   - Urgent only Boolean — only ping for time-sensitive jobs
 *
 * Save = POST or PATCH; on success we invalidate the alerts cache and
 * pop back to the list.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { alertsApi, type PublicJobAlert } from '@/api/alerts.api';
import { ApiError } from '@/api/errors';
import type { AppStackParamList } from '@/navigation/types';
import type { JobType } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'JobAlertForm'>;

const ALL_JOB_TYPES: JobType[] = ['full_time', 'part_time', 'gig', 'shift', 'contract'];

interface Draft {
  name: string;
  query: string;
  city: string;
  jobTypes: JobType[];
  urgentOnly: boolean;
}

function JobAlertFormInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const alertId = route.params?.alertId;
  const suggestion = route.params?.suggestion;
  const isEdit = Boolean(alertId);

  // Default city = the seeker's own city, so the most common alert
  // (work near home) takes one tap to set up.
  const defaultCity = user?.location?.city ?? '';

  const listQuery = useQuery({
    queryKey: ['alerts', 'me'],
    queryFn: () => alertsApi.list(),
    staleTime: 30_000,
    enabled: isEdit, // we only need the list when editing — to find the row
  });

  const existing = useMemo<PublicJobAlert | undefined>(() => {
    if (!isEdit) return undefined;
    return listQuery.data?.alerts.find((a) => a.id === alertId);
  }, [alertId, isEdit, listQuery.data]);

  const [draft, setDraft] = useState<Draft>(() => ({
    name: suggestion?.name ?? '',
    query: suggestion?.query ?? '',
    city: suggestion?.city ?? defaultCity,
    jobTypes: suggestion?.jobTypes ?? [],
    urgentOnly: suggestion?.urgentOnly ?? false,
  }));

  // Hydrate from server-side when the edit row arrives.
  useEffect(() => {
    if (!existing) return;
    setDraft({
      name: existing.name,
      query: existing.query ?? '',
      city: existing.city ?? '',
      jobTypes: existing.jobTypes,
      urgentOnly: existing.urgentOnly,
    });
  }, [existing]);

  const createMutation = useMutation({
    mutationFn: () =>
      alertsApi.create({
        name: draft.name.trim(),
        query: draft.query.trim() || null,
        city: draft.city.trim() || null,
        jobTypes: draft.jobTypes,
        urgentOnly: draft.urgentOnly,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts', 'me'] });
      haptic('success');
      navigation.goBack();
    },
    onError: (err) => {
      haptic('error');
      const msg = err instanceof ApiError ? err.message : 'Try again.';
      Alert.alert("Couldn't save alert", msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      alertsApi.update(alertId!, {
        name: draft.name.trim(),
        query: draft.query.trim() || null,
        city: draft.city.trim() || null,
        jobTypes: draft.jobTypes,
        urgentOnly: draft.urgentOnly,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts', 'me'] });
      haptic('success');
      navigation.goBack();
    },
    onError: (err) => {
      haptic('error');
      const msg = err instanceof ApiError ? err.message : 'Try again.';
      Alert.alert("Couldn't save alert", msg);
    },
  });

  const onSave = () => {
    Keyboard.dismiss();
    if (draft.name.trim().length < 1) {
      haptic('error');
      Alert.alert('Add a name', 'Give your alert a short name to identify it.');
      return;
    }
    if (
      !draft.query.trim() &&
      !draft.city.trim() &&
      draft.jobTypes.length === 0 &&
      !draft.urgentOnly
    ) {
      haptic('error');
      Alert.alert(
        'Too broad',
        'Add at least one criterion (keyword, city, job type, or urgent only) so we know what to ping you about.',
      );
      return;
    }
    haptic('selection');
    if (isEdit) updateMutation.mutate();
    else createMutation.mutate();
  };

  const toggleType = (t: JobType) => {
    haptic('selection');
    setDraft((d) => ({
      ...d,
      jobTypes: d.jobTypes.includes(t)
        ? d.jobTypes.filter((x) => x !== t)
        : [...d.jobTypes, t],
    }));
  };

  const saving = createMutation.isPending || updateMutation.isPending;
  const loading = isEdit && listQuery.isLoading;

  // Edge case: edit URL with an id that no longer exists (alert was
  // deleted on another device). Bounce back so the user isn't stranded.
  useEffect(() => {
    if (
      isEdit &&
      !listQuery.isLoading &&
      !listQuery.isError &&
      listQuery.data &&
      !existing
    ) {
      Alert.alert('Alert not found', "This alert no longer exists.", [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  }, [isEdit, listQuery.isLoading, listQuery.isError, listQuery.data, existing, navigation]);

  return (
    <Screen edges={[]}>
      <LinearGradient
        colors={[blue[700], blue[600], blue[500]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.lg,
          borderBottomLeftRadius: radii.xl,
          borderBottomRightRadius: radii.xl,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: '#FFFFFF' }}>←</Text>
          </Pressable>
          <Text
            style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF', flex: 1 }}
          >
            {isEdit ? 'Edit alert' : 'New alert'}
          </Text>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: spacing['5xl'],
            gap: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Field
            label="Name this alert"
            placeholder="e.g. Delivery in Indiranagar"
            value={draft.name}
            onChangeText={(t) => setDraft((d) => ({ ...d, name: t }))}
            autoCapitalize="sentences"
          />
          <Field
            label="Keyword (optional)"
            placeholder="e.g. delivery, helper, welder"
            value={draft.query}
            onChangeText={(t) => setDraft((d) => ({ ...d, query: t }))}
            autoCapitalize="none"
          />
          <Field
            label="City (optional)"
            placeholder="e.g. Bengaluru"
            value={draft.city}
            onChangeText={(t) => setDraft((d) => ({ ...d, city: t }))}
            autoCapitalize="words"
          />

          {/* Job types */}
          <View style={{ gap: spacing.xs }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: theme.text.secondary,
                letterSpacing: 0.3,
              }}
            >
              Job types (optional)
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {ALL_JOB_TYPES.map((t) => {
                const active = draft.jobTypes.includes(t);
                return (
                  <Pressable
                    key={t}
                    onPress={() => toggleType(t)}
                    style={({ pressed }) => ({
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm - 2,
                      borderRadius: radii.pill,
                      backgroundColor: active ? blue[600] : theme.bg.surface,
                      borderWidth: 0.5,
                      borderColor: active ? blue[600] : theme.border.default,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: active ? '#FFFFFF' : theme.text.primary,
                      }}
                    >
                      {prettyJobType(t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontSize: 11, color: theme.text.tertiary, marginTop: 2 }}>
              Leave empty to match any type.
            </Text>
          </View>

          {/* Urgent only */}
          <Pressable
            onPress={() => {
              haptic('selection');
              setDraft((d) => ({ ...d, urgentOnly: !d.urgentOnly }));
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              padding: spacing.md,
              borderRadius: radii.md,
              backgroundColor: theme.bg.surface,
              borderWidth: 0.5,
              borderColor: theme.border.subtle,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{ fontSize: 14, fontWeight: '600', color: theme.text.primary }}
              >
                Urgent only
              </Text>
              <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
                Only ping me when an urgent job matches
              </Text>
            </View>
            <Switch
              value={draft.urgentOnly}
              onValueChange={(v) => setDraft((d) => ({ ...d, urgentOnly: v }))}
              trackColor={{ true: blue[500], false: theme.border.default }}
              thumbColor="#FFFFFF"
            />
          </Pressable>

          {/* Summary preview */}
          <View
            style={{
              padding: spacing.md,
              borderRadius: radii.md,
              backgroundColor: theme.bg.subtle,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                letterSpacing: 1.4,
                color: theme.text.tertiary,
                marginBottom: 4,
              }}
            >
              YOU&apos;LL HEAR ABOUT
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: theme.text.primary,
                lineHeight: 20,
              }}
            >
              {summariseDraft(draft)}
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Sticky save */}
      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + spacing.md,
          borderTopWidth: 0.5,
          borderTopColor: theme.border.subtle,
          backgroundColor: theme.bg.canvas,
        }}
      >
        <Pressable
          onPress={onSave}
          disabled={saving || loading}
          style={({ pressed }) => ({
            paddingVertical: spacing.md + 2,
            borderRadius: radii.pill,
            alignItems: 'center',
            backgroundColor: blue[600],
            opacity: saving || loading ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create alert'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  autoCapitalize,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: theme.text.secondary,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.text.tertiary}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        style={{
          backgroundColor: theme.bg.surface,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
          borderRadius: radii.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
          fontSize: 15,
          color: theme.text.primary,
        }}
      />
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function prettyJobType(t: JobType): string {
  switch (t) {
    case 'full_time':
      return 'Full-time';
    case 'part_time':
      return 'Part-time';
    case 'gig':
      return 'Gig';
    case 'shift':
      return 'Shift';
    case 'contract':
      return 'Contract';
  }
}

function summariseDraft(d: Draft): string {
  const parts: string[] = [];
  if (d.urgentOnly) parts.push('Urgent');
  if (d.jobTypes.length > 0) {
    parts.push(d.jobTypes.map(prettyJobType).join('/'));
  } else {
    parts.push('Any job type');
  }
  if (d.query.trim()) parts.push(`matching "${d.query.trim()}"`);
  if (d.city.trim()) parts.push(`in ${d.city.trim()}`);
  else parts.push('anywhere');
  return parts.join(' · ');
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function JobAlertFormScreen() {
  return (
    <SeekerThemeOverride>
      <JobAlertFormInner />
    </SeekerThemeOverride>
  );
}
