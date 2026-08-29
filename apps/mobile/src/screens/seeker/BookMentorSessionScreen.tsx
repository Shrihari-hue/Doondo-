/**
 * BookMentorSessionScreen — pick one of a mentor's open time slots.
 *
 * Reached by tapping "Book a session" on an accepted mentorship request
 * (MentorsScreen). The backend re-checks the accepted relationship on
 * every call, so this screen doesn't need to — it just lists + books.
 */
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import { Screen, Text, Button, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { mentorsApi } from '@/api/mentors.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'BookMentorSession'>;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const { mentorUserId, mentorName } = route.params;
  const [bookingId, setBookingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['mentors', mentorUserId, 'sessions', 'open'],
    queryFn: () => mentorsApi.openSlotsForMentor(mentorUserId),
  });

  const bookMut = useMutation({
    mutationFn: (slotId: string) => mentorsApi.bookSlot(slotId),
    onMutate: (slotId) => setBookingId(slotId),
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['mentors', 'sessions', 'mine'] });
      Alert.alert(t('book_mentor_session.booked_title'), t('book_mentor_session.booked_body'));
      navigation.goBack();
    },
    onError: (err) =>
      Alert.alert(
        t('book_mentor_session.error_title'),
        (err as Error).message ?? t('book_mentor_session.error_default'),
      ),
    onSettled: () => setBookingId(null),
  });

  const slots = query.data?.slots ?? [];

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
        <Text
          onPress={() => navigation.goBack()}
          style={{ fontSize: 22, color: theme.text.primary }}
          accessibilityRole="button"
        >
          ←
        </Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text.primary }}>
            {t('book_mentor_session.title')}
          </Text>
          {mentorName ? (
            <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 1 }}>{mentorName}</Text>
          ) : null}
        </View>
      </View>

      {query.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : query.isError ? (
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl }}
        >
          <Text style={{ fontSize: 14, color: theme.text.secondary, textAlign: 'center' }}>
            {t('book_mentor_session.error_default')}
          </Text>
          <Button label={t('book_mentor_session.retry')} variant="secondary" size="sm" fullWidth={false} onPress={() => void query.refetch()} />
        </View>
      ) : slots.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl }}>
          <EmptyState title={t('book_mentor_session.empty')} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['5xl'], gap: spacing.sm }}>
          {slots.map((slot) => (
            <Pressable
              key={slot.id}
              accessibilityRole="button"
              disabled={bookingId !== null}
              onPress={() => {
                haptic('selection');
                bookMut.mutate(slot.id);
              }}
              style={({ pressed }) => ({
                backgroundColor: theme.bg.surface,
                borderRadius: 14,
                borderWidth: 0.5,
                borderColor: theme.border.subtle,
                padding: spacing.lg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                opacity: pressed || bookingId !== null ? 0.7 : 1,
              })}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text.primary }}>
                  {formatDateTime(slot.scheduledFor)}
                </Text>
                <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
                  {t('book_mentor_session.duration', { minutes: slot.durationMinutes })} ·{' '}
                  {t(`book_mentor_session.mode_${slot.mode}`)}
                </Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.brand.hero }}>
                {bookingId === slot.id ? t('book_mentor_session.booking') : t('book_mentor_session.book_cta')}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

export function BookMentorSessionScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
