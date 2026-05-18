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
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

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
      Alert.alert("Couldn't save", err instanceof Error ? err.message : 'Try again.');
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
      Alert.alert("Couldn't update", err instanceof Error ? err.message : 'Try again.');
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
        Alert.alert('Add a name', 'Please add a name with at least 2 letters.');
        return;
      }
      if (draft.phone.replace(/[^\d]/g, '').length < 7) {
        Alert.alert('Add a phone', 'Please enter a valid phone number.');
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
      Alert.alert('Remove contact?', "This person won't get an alert if you trigger SOS.", [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
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
          <Text variant="title" weight="medium">
            Trust Circle
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
            Up to 3 people who get an alert when you SOS.
          </Text>
          <Text variant="footnote" tone="secondary">
            If a contact is already on Doondo, they get an instant push. If
            not, your phone opens an SMS draft for them when you trigger
            SOS — so they're notified either way.
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
            BE A PEER RESPONDER
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
                Help nearby workers in trouble
              </Text>
              <Text variant="footnote" tone="secondary">
                When you're on, you may get a push if another worker
                triggers SOS within 5 km of you. We only choose 2
                verified peers per alert, so you won't be flooded.
              </Text>
            </View>
            <Switch
              value={peerOn}
              onValueChange={(v) => peerToggleMutation.mutate(v)}
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
                {prettyRelationship(persisted!.relationship)} · {persisted!.phone}
              </Text>
            </>
          ) : (
            <Text variant="bodyLarge" tone="secondary">
              Add contact
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
              NAME
            </Text>
            <TextInput
              value={draft.name}
              onChangeText={(v) => onChange({ name: v })}
              placeholder="e.g. Priya (sister)"
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
              PHONE
            </Text>
            <TextInput
              value={draft.phone}
              onChangeText={(v) => onChange({ phone: v })}
              placeholder="+91 …"
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
              RELATIONSHIP
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
                      {prettyRelationship(preset)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {relationshipPreset === 'other' && (
              <TextInput
                value={draft.relationship}
                onChangeText={(v) => onChange({ relationship: v })}
                placeholder="e.g. neighbour, colleague"
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
                  Remove
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
                {saving ? 'Saving…' : hasContact ? 'Save changes' : 'Save contact'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function prettyRelationship(raw: string | null | undefined): string {
  if (!raw) return 'Other';
  const r = raw.trim().toLowerCase();
  if (r === 'family') return 'Family';
  if (r === 'friend') return 'Friend';
  if (r === 'employer') return 'Employer';
  return raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1);
}

export function TrustCircleScreen() {
  return (
    <SeekerThemeOverride>
      <TrustCircleInner />
    </SeekerThemeOverride>
  );
}
