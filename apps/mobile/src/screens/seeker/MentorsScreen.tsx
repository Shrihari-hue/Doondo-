/**
 * MentorsScreen — discover & request mentors in your trade + city.
 *
 * Three modes:
 *   1. Discovery list — open mentors who match the seeker's primary
 *      trade and city. Tap → request mentorship modal.
 *   2. Outgoing requests — pending / accepted / declined you've sent.
 *   3. Become a mentor — quick toggle for experienced workers.
 *
 * The "become a mentor" form is shown inline at the bottom — there's
 * no separate screen because the form is short (one bio textarea).
 */
import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Avatar, EmptyState, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { mentorsApi, type PublicMentor } from '@/api/mentors.api';
import { prettifySkill } from '@/lib/trades';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function Inner() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const t = useTranslate();

  const trade = user?.skills?.[0] ?? '';
  const city = user?.location?.city ?? '';

  const mentorsQ = useQuery({
    queryKey: ['mentors', trade, city],
    queryFn: () => mentorsApi.list(trade, city),
    enabled: Boolean(trade && city),
  });
  const mineQ = useQuery({
    queryKey: ['mentors', 'mine'],
    queryFn: () => mentorsApi.mine(),
    enabled: Boolean(user),
  });

  const [activeRequestMentor, setActiveRequestMentor] = useState<PublicMentor | null>(null);
  const [message, setMessage] = useState('');

  const requestMut = useMutation({
    mutationFn: (input: { mentorUserId: string; message: string }) =>
      mentorsApi.request(input.mentorUserId, input.message),
    onSuccess: () => {
      haptic('success');
      setActiveRequestMentor(null);
      setMessage('');
      void queryClient.invalidateQueries({ queryKey: ['mentors', 'mine'] });
      Alert.alert(t('mentors.sent_title'), t('mentors.sent_body'));
    },
    onError: (err) =>
      Alert.alert(t('mentors.error_title'), (err as Error).message ?? t('mentors.error_default')),
  });

  const mentors = mentorsQ.data?.mentors ?? [];

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: spacing['5xl'],
          gap: spacing.lg,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.xl,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: theme.text.primary }}>
              {t('mentors.title')}
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 2 }}>
              {t('mentors.subtitle', { trade: trade ? prettifySkill(trade) : t('mentors.fallback_trade') })}
            </Text>
          </View>
        </View>

        {!trade || !city ? (
          <View style={{ paddingHorizontal: spacing.xl }}>
            <EmptyState
              glyph="🧭"
              eyebrow={t('mentors.setup_eyebrow')}
              title={t('mentors.setup_title')}
              message={t('mentors.setup_message')}
            />
          </View>
        ) : mentorsQ.isLoading ? (
          <View style={{ alignItems: 'center', padding: spacing.xl }}>
            <LoadingSpinner />
          </View>
        ) : mentors.length === 0 ? (
          <View style={{ paddingHorizontal: spacing.xl }}>
            <EmptyState
              glyph="🔍"
              eyebrow={t('mentors.empty_eyebrow')}
              title={t('mentors.empty_title', { trade: prettifySkill(trade), city })}
              message={t('mentors.empty_message')}
            />
          </View>
        ) : (
          <Section title={t('mentors.list_section', { n: mentors.length })}>
            {mentors.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => {
                  haptic('selection');
                  setActiveRequestMentor(m);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  borderBottomWidth: 0.5,
                  borderBottomColor: theme.border.subtle,
                  opacity: pressed ? 0.7 : 1,
                  flexDirection: 'row',
                  gap: spacing.md,
                  alignItems: 'center',
                })}
              >
                <Avatar size={48} photoUrl={m.photoUrl} name={m.name} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text.primary }}>
                    {m.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
                    {t('mentors.mentor_meta', {
                      trade: prettifySkill(m.trade),
                      city: m.city,
                      active: m.activeMentees,
                      cap: m.monthlyCap,
                    })}
                  </Text>
                  {m.bio ? (
                    <Text
                      numberOfLines={2}
                      style={{ fontSize: 13, color: theme.text.secondary, marginTop: 4 }}
                    >
                      {m.bio}
                    </Text>
                  ) : null}
                </View>
                <Text style={{ color: theme.brand.hero, fontSize: 12, fontWeight: '700' }}>
                  {t('mentors.request_arrow')}
                </Text>
              </Pressable>
            ))}
          </Section>
        )}

        {(mineQ.data?.asMentee.length ?? 0) > 0 && (
          <Section title={t('mentors.requests_section')}>
            {mineQ.data!.asMentee.map((r) => (
              <View
                key={r.id}
                style={{
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  borderBottomWidth: 0.5,
                  borderBottomColor: theme.border.subtle,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text.primary }}>
                  {t('mentors.request_row_title', { trade: prettifySkill(r.trade), city: r.city })}
                </Text>
                <Text style={{ fontSize: 11, color: theme.text.tertiary, marginTop: 2 }}>
                  {r.status === 'pending'
                    ? t('mentors.status_pending')
                    : r.status === 'accepted'
                      ? t('mentors.status_accepted')
                      : r.status === 'declined'
                        ? t('mentors.status_declined')
                        : t('mentors.status_ended')}
                </Text>
              </View>
            ))}
          </Section>
        )}

        {/* Become a mentor — short form. We let any seeker toggle this;
            the backend enforces the actual eligibility on more complete
            data. */}
        <BecomeMentorPanel user={user ?? null} t={t} />
      </ScrollView>

      {/* Request modal */}
      {activeRequestMentor && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: theme.bg.surface,
              padding: spacing.xl,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              gap: spacing.md,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text.primary }}>
              {t('mentors.modal_title', { name: activeRequestMentor.name })}
            </Text>
            <Text style={{ fontSize: 13, color: theme.text.secondary }}>
              {t('mentors.modal_hint')}
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={t('mentors.modal_placeholder')}
              multiline
              numberOfLines={4}
              style={{
                borderWidth: 0.5,
                borderColor: theme.border.default,
                borderRadius: radii.md,
                padding: spacing.md,
                fontSize: 14,
                color: theme.text.primary,
                minHeight: 96,
                textAlignVertical: 'top',
              }}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable
                onPress={() => setActiveRequestMentor(null)}
                style={{
                  flex: 1,
                  paddingVertical: spacing.md,
                  borderRadius: radii.pill,
                  borderWidth: 0.5,
                  borderColor: theme.border.default,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: theme.text.secondary, fontWeight: '600' }}>
                  {t('mentors.modal_cancel')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  requestMut.mutate({
                    mentorUserId: activeRequestMentor.userId,
                    message,
                  })
                }
                disabled={requestMut.isPending}
                style={{
                  flex: 1,
                  paddingVertical: spacing.md,
                  borderRadius: radii.pill,
                  backgroundColor: '#2563EB',
                  alignItems: 'center',
                  shadowColor: '#1E40AF',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 6,
                  elevation: 4,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                  {requestMut.isPending ? t('mentors.modal_sending') : t('mentors.modal_send')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </Screen>
  );
}

function BecomeMentorPanel({
  user,
  t,
}: {
  // `location.city` is nullable on PublicUser but this panel only ever
  // reads it as "what city should I prefill the mentor form with?", so
  // we widen the contract to accept null too. This used to fail the
  // PublicUser → narrow-prop coercion at the call site.
  user: { skills?: string[]; location?: { city?: string | null } | null } | null;
  t: TFn;
}) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [bio, setBio] = useState('');
  const trade = user?.skills?.[0] ?? '';
  const city = user?.location?.city ?? '';

  const becomeMut = useMutation({
    mutationFn: (b: string) => mentorsApi.become({ trade, city, bio: b }),
    onSuccess: () => {
      haptic('success');
      Alert.alert(t('mentors.become_success_title'), t('mentors.become_success_body'));
      void queryClient.invalidateQueries({ queryKey: ['mentors'] });
      setBio('');
    },
    onError: (err) =>
      Alert.alert(t('mentors.become_error_title'), (err as Error).message ?? t('mentors.error_default')),
  });

  if (!trade || !city) return null;

  return (
    <View
      style={{
        marginHorizontal: spacing.xl,
        padding: spacing.lg,
        borderRadius: 16,
        backgroundColor: '#EFF6FF',
        borderWidth: 0.5,
        borderColor: '#BFDBFE',
        gap: spacing.sm,
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E3A8A' }}>
        {t('mentors.become_title')}
      </Text>
      <Text style={{ fontSize: 12, color: '#1E40AF', lineHeight: 18 }}>
        {t('mentors.become_blurb', { trade: prettifySkill(trade), city })}
      </Text>
      <TextInput
        value={bio}
        onChangeText={setBio}
        placeholder={t('mentors.become_placeholder')}
        multiline
        numberOfLines={3}
        style={{
          borderWidth: 0.5,
          borderColor: '#BFDBFE',
          borderRadius: radii.md,
          padding: spacing.sm,
          fontSize: 13,
          color: theme.text.primary,
          minHeight: 64,
          textAlignVertical: 'top',
          backgroundColor: '#FFFFFF',
        }}
      />
      <Pressable
        onPress={() => becomeMut.mutate(bio)}
        disabled={becomeMut.isPending}
        style={{
          paddingVertical: spacing.sm + 2,
          borderRadius: radii.pill,
          backgroundColor: '#2563EB',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
          {becomeMut.isPending ? t('mentors.become_saving') : t('mentors.become_cta')}
        </Text>
      </Pressable>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}>
      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: theme.text.tertiary }}>
        {title}
      </Text>
      <View
        style={{
          backgroundColor: theme.bg.surface,
          borderRadius: 16,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function MentorsScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
