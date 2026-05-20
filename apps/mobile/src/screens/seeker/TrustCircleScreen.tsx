/**
 * TrustCircleScreen — manage the 3 emergency contacts who get a push
 * on SOS, plus the peer-responder opt-in.
 *
 * Design rules:
 *   - 3 slots, always visible. Empty slots show "Add contact" affordance.
 *   - Inline editing per slot. No separate "add contact" modal — that
 *     adds friction for a feature people add in 30 seconds.
 *   - Relationship picker as 4 chips: Family / Friend / Employer / Other.
 *     "Other" reveals a free-text input.
 *   - Peer responder is an opt-in toggle with a clear explanation. The
 *     default is off (we don't auto-volunteer workers).
 *   - Server is the source of truth; mutations save immediately so a
 *     half-edited row is never the only record.
 *
 * Permission posture: anyone can have a Trust Circle (employers too).
 * The peer-responder pool is implicitly seeker-only because verified
 * workers within geo radius are the queryable subset.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { sosApi, type TrustContactPayload, type TrustCircleResponse } from '@/api/sos.api';
import { haptic } from '@/lib/haptics';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { useTranslate } from '@/i18n/useTranslate';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

const RELATIONSHIP_PRESETS = ['family', 'friend', 'employer'] as const;
type RelationshipPreset = (typeof RELATIONSHIP_PRESETS)[number] | 'other';

interface DraftContact {
  name: string;
  phone: string;
  relationship: string;
}

function emptyDraft(): DraftContact {
  return { name: '', phone: '', relationship: 'family' };
}

function fromPayload(c: TrustContactPayload | undefined): DraftContact {
  if (!c) return emptyDraft();
  return {
    name: c.name ?? '',
    phone: c.phone ?? '',
    relationship: (c.relationship && c.relationship.trim()) || 'family',
  };
}

function TrustCircleInner() {
  const { theme } = useTheme();
  const t = useTranslate();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['trustCircle'],
    queryFn: () => sosApi.getTrustCircle(),
    staleTime: 30_000,
  });

  const [drafts, setDrafts] = useState<[DraftContact, DraftContact, DraftContact]>([
    emptyDraft(),
    emptyDraft(),
    emptyDraft(),
  ]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // Seed drafts from the server payload once it arrives. Subsequent
  // edits stay local until the user taps Save on a row.
  useEffect(() => {
    if (!query.data) return;
    const contacts = query.data.trustCircle ?? [];
    setDrafts([
      fromPayload(contacts[0]),
      fromPayload(contacts[1]),
      fromPayload(contacts[2]),
    ]);
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: (next: TrustContactPayload[]) => sosApi.putTrustCircle(next),
    onSuccess: (res) => {
      queryClient.setQueryData(['trustCircle'], res);
      haptic('success');
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(
        t('trust_circle.alert_save_fail'),
        friendlyErrorMessage(err, t('trust_circle.alert_conn')),
      );
    },
  });

  const peerToggleMutation = useMutation({
    mutationFn: (enabled: boolean) => sosApi.setPeerResponder(enabled),
    onMutate: (enabled) => {
      // Optimistic — the toggle should feel instant.
      const previous = queryClient.getQueryData<TrustCircleResponse>(['trustCircle']);
      if (previous) {
        queryClient.setQueryData(['trustCircle'], {
          ...previous,
          isPeerResponder: enabled,
        });
      }
      return { previous };
    },
    onError: (err, _enabled, ctx) => {
      // Roll back on failure.
      if (ctx?.previous) queryClient.setQueryData(['trustCircle'], ctx.previous);
      haptic('error');
      Alert.alert(
        t('trust_circle.alert_update_fail'),
        friendlyErrorMessage(err, t('trust_circle.alert_conn')),
      );
    },
    onSuccess: () => {
      haptic('selection');
    },
  });

  const shareShiftsMutation = useMutation({
    mutationFn: (enabled: boolean) => sosApi.setShareShifts(enabled),
    onMutate: (enabled) => {
      const previous = queryClient.getQueryData<TrustCircleResponse>(['trustCircle']);
      if (previous) {
        queryClient.setQueryData(['trustCircle'], {
          ...previous,
          shareShiftsWithCircle: enabled,
        });
      }
      return { previous };
    },
    onError: (err, _enabled, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['trustCircle'], ctx.previous);
      haptic('error');
      Alert.alert(
        t('trust_circle.alert_update_fail'),
        friendlyErrorMessage(err, t('trust_circle.alert_conn')),
      );
    },
    onSuccess: () => {
      haptic('selection');
    },
  });

  const persistedContacts = useMemo<TrustContactPayload[]>(() => {
    const data = query.data?.trustCircle ?? [];
    return data.map((c) => ({
      name: c.name,
      phone: c.phone,
      relationship: c.relationship,
    }));
  }, [query.data]);

  const saveRow = useCallback(
    (index: number) => {
      const draft = drafts[index]!;
      if (draft.name.trim().length < 2) {
        Alert.alert(
          t('trust_circle.alert_name_title'),
          t('trust_circle.alert_name_body'),
        );
        return;
      }
      if (draft.phone.replace(/[^\d]/g, '').length < 7) {
        Alert.alert(
          t('trust_circle.alert_phone_title'),
          t('trust_circle.alert_phone_body'),
        );
        return;
      }
      // Build the new array — replace `index`, keep the others.
      const next: TrustContactPayload[] = [];
      for (let i = 0; i < 3; i++) {
        if (i === index) {
          next.push({
            name: draft.name.trim(),
            phone: draft.phone.trim(),
            relationship: draft.relationship.trim() || null,
          });
        } else {
          const existing = persistedContacts[i];
          if (existing) next.push(existing);
        }
      }
      saveMutation.mutate(next);
      setOpenIndex(null);
    },
    [drafts, persistedContacts, saveMutation],
  );

  const removeRow = useCallback(
    (index: number) => {
      Alert.alert(
        t('trust_circle.alert_remove_title'),
        t('trust_circle.alert_remove_body'),
        [
        { text: t('trust_circle.alert_cancel'), style: 'cancel' },
        {
          text: t('trust_circle.remove'),
          style: 'destructive',
          onPress: () => {
            const next = persistedContacts.filter((_, i) => i !== index);
            saveMutation.mutate(next);
            setOpenIndex(null);
          },
        },
      ]);
    },
    [persistedContacts, saveMutation],
  );

  const updateDraft = useCallback((index: number, patch: Partial<DraftContact>) => {
    setDrafts((cur) => {
      const next = [...cur] as typeof cur;
      next[index] = { ...next[index]!, ...patch };
      return next;
    });
  }, []);

  if (query.isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }

  const peerOn = Boolean(query.data?.isPeerResponder);
  const shareShiftsOn = Boolean(query.data?.shareShiftsWithCircle);

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing['3xl'],
          paddingHorizontal: spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginBottom: spacing.lg,
          }}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            accessibilityLabel={t('trust_circle.a11y_back')}
            accessibilityRole="button"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="chevron-left" size={20} color={theme.text.primary} />
          </Pressable>
          <Text variant="title" weight="medium" accessibilityRole="header">
            {t('trust_circle.header')}
          </Text>
        </View>

        {/* Explainer */}
        <View
          style={{
            padding: spacing.lg,
            borderRadius: radii.lg,
            backgroundColor: theme.status.infoSubtle,
            borderWidth: 0.5,
            borderColor: theme.status.infoBorder,
            gap: spacing.xs,
            marginBottom: spacing.xl,
          }}
        >
          <Text variant="bodyLarge" weight="medium">
            {t('trust_circle.explainer_title')}
          </Text>
          <Text variant="footnote" tone="secondary">
            {t('trust_circle.explainer_body')}
          </Text>
        </View>

        {/* 3 contact slots */}
        <View style={{ gap: spacing.md }}>
          {[0, 1, 2].map((index) => {
            const persisted = persistedContacts[index];
            const isOpen = openIndex === index;
            return (
              <ContactSlot
                key={index}
                index={index}
                persisted={persisted}
                draft={drafts[index]!}
                isOpen={isOpen}
                saving={saveMutation.isPending}
                onOpen={() => {
                  setOpenIndex(isOpen ? null : index);
                  haptic('selection');
                }}
                onChange={(patch) => updateDraft(index, patch)}
                onSave={() => saveRow(index)}
                onRemove={() => removeRow(index)}
              />
            );
          })}
        </View>

        {/* Peer responder opt-in */}
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('trust_circle.peer_label')}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.lg,
              borderRadius: radii.lg,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              backgroundColor: theme.bg.surface,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyLarge" weight="medium">
                {t('trust_circle.peer_title')}
              </Text>
              <Text variant="footnote" tone="secondary">
                {t('trust_circle.peer_body')}
              </Text>
            </View>
            <Switch
              value={peerOn}
              onValueChange={(v) => peerToggleMutation.mutate(v)}
              accessibilityLabel={t('trust_circle.peer_a11y')}
              trackColor={{
                false: theme.border.default,
                true: theme.brand.hero,
              }}
              thumbColor="#FFFDF7"
            />
          </View>
        </View>

        {/* Share shifts with circle opt-in */}
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('trust_circle.shifts_label')}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.lg,
              borderRadius: radii.lg,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              backgroundColor: theme.bg.surface,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyLarge" weight="medium">
                {t('trust_circle.shifts_title')}
              </Text>
              <Text variant="footnote" tone="secondary">
                {t('trust_circle.shifts_body')}
              </Text>
            </View>
            <Switch
              value={shareShiftsOn}
              onValueChange={(v) => shareShiftsMutation.mutate(v)}
              accessibilityLabel={t('trust_circle.shifts_a11y')}
              trackColor={{
                false: theme.border.default,
                true: theme.brand.hero,
              }}
              thumbColor="#FFFDF7"
            />
          </View>
        </View>

        {saveMutation.isPending && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              justifyContent: 'center',
              marginTop: spacing.lg,
            }}
          >
            <ActivityIndicator size="small" />
            <Text variant="footnote" tone="secondary">
              Saving…
            </Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

// ─── Single contact slot ────────────────────────────────────────────────────

interface ContactSlotProps {
  index: number;
  persisted: TrustContactPayload | undefined;
  draft: DraftContact;
  isOpen: boolean;
  saving: boolean;
  onOpen: () => void;
  onChange: (patch: Partial<DraftContact>) => void;
  onSave: () => void;
  onRemove: () => void;
}

function ContactSlot({
  index,
  persisted,
  draft,
  isOpen,
  saving,
  onOpen,
  onChange,
  onSave,
  onRemove,
}: ContactSlotProps) {
  const { theme } = useTheme();
  const t = useTranslate();
  const hasContact = Boolean(persisted);

  const relationshipPreset: RelationshipPreset = useMemo(() => {
    const r = (draft.relationship ?? '').trim().toLowerCase();
    if (r === 'family' || r === 'friend' || r === 'employer') return r;
    return 'other';
  }, [draft.relationship]);

  return (
    <View
      style={{
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: hasContact ? theme.border.default : theme.border.subtle,
        backgroundColor: theme.bg.surface,
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={
          hasContact
            ? t('trust_circle.a11y_slot_filled', {
                name: persisted!.name,
                relationship: prettyRelationship(persisted!.relationship, t),
              })
            : t('trust_circle.a11y_slot_empty', { n: index + 1 })
        }
        accessibilityState={{ expanded: isOpen }}
        style={({ pressed }) => ({
          padding: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: hasContact ? theme.brand.heroSubtle : theme.bg.muted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 14, color: hasContact ? theme.brand.hero : theme.text.tertiary }}>
            {index + 1}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          {hasContact ? (
            <>
              <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
                {persisted!.name}
              </Text>
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                {prettyRelationship(persisted!.relationship, t)} · {persisted!.phone}
              </Text>
            </>
          ) : (
            <Text variant="bodyLarge" tone="secondary">
              {t('trust_circle.add_contact')}
            </Text>
          )}
        </View>
        <Feather
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.text.secondary}
        />
      </Pressable>

      {/* Edit panel */}
      {isOpen && (
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.lg,
            gap: spacing.md,
            borderTopWidth: 0.5,
            borderTopColor: theme.border.subtle,
            paddingTop: spacing.md,
          }}
        >
          <View>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.0, marginBottom: 6 }}>
              {t('trust_circle.field_name')}
            </Text>
            <TextInput
              value={draft.name}
              onChangeText={(v) => onChange({ name: v })}
              placeholder={t('trust_circle.field_name_ph')}
              placeholderTextColor={theme.text.tertiary}
              autoCapitalize="words"
              style={{
                fontSize: 16,
                color: theme.text.primary,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: radii.md,
                borderWidth: 0.5,
                borderColor: theme.border.default,
                backgroundColor: theme.bg.muted,
              }}
            />
          </View>

          <View>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.0, marginBottom: 6 }}>
              {t('trust_circle.field_phone')}
            </Text>
            <TextInput
              value={draft.phone}
              onChangeText={(v) => onChange({ phone: v })}
              placeholder={t('trust_circle.field_phone_ph')}
              placeholderTextColor={theme.text.tertiary}
              keyboardType="phone-pad"
              style={{
                fontSize: 16,
                color: theme.text.primary,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: radii.md,
                borderWidth: 0.5,
                borderColor: theme.border.default,
                backgroundColor: theme.bg.muted,
              }}
            />
          </View>

          <View>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.0, marginBottom: 6 }}>
              {t('trust_circle.field_relationship')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {(['family', 'friend', 'employer', 'other'] as RelationshipPreset[]).map((preset) => {
                const active = relationshipPreset === preset;
                return (
                  <Pressable
                    key={preset}
                    onPress={() => {
                      if (preset === 'other') {
                        onChange({ relationship: '' });
                      } else {
                        onChange({ relationship: preset });
                      }
                      haptic('selection');
                    }}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.xs,
                      borderRadius: radii.pill,
                      borderWidth: 0.5,
                      borderColor: active ? theme.brand.heroBorder : theme.border.default,
                      backgroundColor: active ? theme.brand.heroSubtle : 'transparent',
                    }}
                  >
                    <Text
                      variant="footnote"
                      weight={active ? 'medium' : 'regular'}
                      style={{ color: active ? theme.brand.hero : theme.text.secondary }}
                    >
                      {prettyRelationship(preset, t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {relationshipPreset === 'other' && (
              <TextInput
                value={draft.relationship}
                onChangeText={(v) => onChange({ relationship: v })}
                placeholder={t('trust_circle.field_relationship_other_ph')}
                placeholderTextColor={theme.text.tertiary}
                style={{
                  marginTop: spacing.sm,
                  fontSize: 14,
                  color: theme.text.primary,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.md,
                  borderRadius: radii.md,
                  borderWidth: 0.5,
                  borderColor: theme.border.default,
                  backgroundColor: theme.bg.muted,
                }}
              />
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
            {hasContact && (
              <Pressable
                onPress={onRemove}
                disabled={saving}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: spacing.md,
                  borderRadius: radii.pill,
                  borderWidth: 0.5,
                  borderColor: theme.status.dangerBorder,
                  alignItems: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text variant="bodyLarge" weight="medium" style={{ color: theme.status.danger }}>
                  {t('trust_circle.remove')}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={onSave}
              disabled={saving}
              style={({ pressed }) => ({
                flex: 2,
                paddingVertical: spacing.md,
                borderRadius: radii.pill,
                backgroundColor: theme.brand.hero,
                alignItems: 'center',
                opacity: saving ? 0.5 : pressed ? 0.85 : 1,
              })}
            >
              <Text variant="bodyLarge" weight="medium" style={{ color: '#FFFDF7' }}>
                {saving
                  ? t('trust_circle.saving')
                  : hasContact
                    ? t('trust_circle.save_changes')
                    : t('trust_circle.save_contact')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function prettyRelationship(raw: string | null | undefined, t: TFn): string {
  if (!raw) return t('trust_circle.rel_other');
  const r = raw.trim().toLowerCase();
  if (r === 'family') return t('trust_circle.rel_family');
  if (r === 'friend') return t('trust_circle.rel_friend');
  if (r === 'employer') return t('trust_circle.rel_employer');
  if (r === 'other') return t('trust_circle.rel_other');
  // Custom free-text relationship — show it as the user typed it.
  return raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1);
}

export function TrustCircleScreen() {
  return (
    <SeekerThemeOverride>
      <TrustCircleInner />
    </SeekerThemeOverride>
  );
}
