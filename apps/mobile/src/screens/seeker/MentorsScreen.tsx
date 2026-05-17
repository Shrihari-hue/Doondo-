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
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { mentorsApi, type PublicMentor } from '@/api/mentors.api';
import { prettifySkill } from '@/lib/trades';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function Inner() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

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
      Alert.alert('Sent', 'Your mentor will see your request and reach out soon.');
    },
    onError: (err) =>
      Alert.alert('Could not send', (err as Error).message ?? 'Try again later.'),
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
              Trade buddies
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 2 }}>
              Connect with experienced workers in {trade ? prettifySkill(trade) : 'your trade'} near you.
            </Text>
          </View>
        </View>

        {!trade || !city ? (
          <View style={{ paddingHorizontal: spacing.xl }}>
            <EmptyState
              glyph="🧭"
              eyebrow="SET UP FIRST"
              title="Add your trade and city"
              message="To find a mentor, add at least one skill and your city to your profile."
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
              eyebrow="NO MENTORS YET"
              title={`No ${prettifySkill(trade)} mentors in ${city} yet`}
              message="Check back soon — or volunteer to be a mentor yourself."
            />
          </View>
        ) : (
          <Section title={`MENTORS · ${mentors.length}`}>
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
                    {prettifySkill(m.trade)} · {m.city} · {m.activeMentees}/{m.monthlyCap} mentees this month
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
                  Request →
                </Text>
              </Pressable>
            ))}
          </Section>
        )}

        {(mineQ.data?.asMentee.length ?? 0) > 0 && (
          <Section title="YOUR REQUESTS">
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
                  {prettifySkill(r.trade)} mentor · {r.city}
                </Text>
                <Text style={{ fontSize: 11, color: theme.text.tertiary, marginTop: 2 }}>
                  {r.status === 'pending'
                    ? 'Waiting for the mentor to respond.'
                    : r.status === 'accepted'
                      ? 'Accepted — they will reach out to you.'
                      : r.status === 'declined'
                        ? 'Declined.'
                        : 'Ended.'}
                </Text>
              </View>
            ))}
          </Section>
        )}

        {/* Become a mentor — short form. We let any seeker toggle this;
            the backend enforces the actual eligibility on more complete
            data. */}
        <BecomeMentorPanel user={user ?? null} />
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
              Request {activeRequestMentor.name}
            </Text>
            <Text style={{ fontSize: 13, color: theme.text.secondary }}>
              Write a short message — what would you like to learn?
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="I'd love to learn how you handle…"
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
                  Cancel
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
                  {requestMut.isPending ? 'Sending…' : 'Send request'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </Screen>
  );
}

function BecomeMentorPanel({ user }: { user: { skills?: string[]; location?: { city?: string } } | null }) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [bio, setBio] = useState('');
  const trade = user?.skills?.[0] ?? '';
  const city = user?.location?.city ?? '';

  const becomeMut = useMutation({
    mutationFn: (b: string) => mentorsApi.become({ trade, city, bio: b }),
    onSuccess: () => {
      haptic('success');
      Alert.alert('You\'re a mentor', "Workers in your trade can now request mentorship.");
      void queryClient.invalidateQueries({ queryKey: ['mentors'] });
      setBio('');
    },
    onError: (err) =>
      Alert.alert('Could not enable', (err as Error).message ?? 'Try again later.'),
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
        Become a mentor
      </Text>
      <Text style={{ fontSize: 12, color: '#1E40AF', lineHeight: 18 }}>
        Help newer {prettifySkill(trade)}s in {city} get started. Set a short bio
        — workers will request you from this same screen. You can stop anytime.
      </Text>
      <TextInput
        value={bio}
        onChangeText={setBio}
        placeholder="I've been a driver for 7 years and can help with…"
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
          {becomeMut.isPending ? 'Saving…' : 'Make me a mentor'}
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
