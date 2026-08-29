/**
 * CohortsScreen — "My Cohorts". Joined 5-person course groups (tap to
 * open the group chat) + pending invites (accept/decline inline).
 *
 * Entry points: a header button on FindFriendsScreen, and any
 * `cohort_invite` / `cohort_message` push notification deep-link.
 */
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Avatar, Button, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { cohortsApi, type PublicCohort } from '@/api/cohorts.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function MemberStack({ cohort }: { cohort: PublicCohort }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {cohort.members.slice(0, 5).map((m, i) => (
        <View key={m.userId} style={{ marginLeft: i === 0 ? 0 : -10 }}>
          <Avatar size={26} photoUrl={m.photoUrl} name={m.name} />
        </View>
      ))}
    </View>
  );
}

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const query = useQuery({ queryKey: ['cohorts', 'mine'], queryFn: () => cohortsApi.listMine() });
  const cohorts = query.data?.cohorts ?? [];
  const invites = cohorts.filter((c) => c.myStatus === 'invited');
  const joined = cohorts.filter((c) => c.myStatus === 'joined');

  const respondMut = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => cohortsApi.respond(id, accept),
    onMutate: ({ id }) => setRespondingId(id),
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['cohorts', 'mine'] });
    },
    onError: (err) => Alert.alert(t('cohorts.error_title'), (err as Error).message ?? t('cohorts.error_default')),
    onSettled: () => setRespondingId(null),
  });

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
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" hitSlop={12}>
          <Feather name="chevron-left" size={22} color={theme.text.primary} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: '700', color: theme.text.primary }}>
          {t('cohorts.title')}
        </Text>
        <Pressable
          onPress={() => {
            haptic('selection');
            navigation.navigate('StartCohort', {});
          }}
          accessibilityRole="button"
          accessibilityLabel={t('cohorts.new_a11y')}
          hitSlop={10}
        >
          <Feather name="plus-circle" size={22} color={theme.brand.hero} />
        </Pressable>
      </View>

      {query.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['5xl'], gap: spacing.xl }}>
          {invites.length > 0 && (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
                {t('cohorts.invites_section')}
              </Text>
              {invites.map((c) => (
                <View
                  key={c.id}
                  style={{
                    backgroundColor: theme.brand.heroSubtle,
                    borderRadius: radii.lg,
                    borderWidth: 1,
                    borderColor: theme.brand.hero + '33',
                    padding: spacing.lg,
                    gap: spacing.sm,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text.primary }}>{c.name}</Text>
                  <Text style={{ fontSize: 12, color: theme.text.secondary }}>
                    {t('cohorts.invite_body', { course: c.courseTitle })}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                    <Button
                      label={t('cohorts.accept_cta')}
                      size="sm"
                      fullWidth={false}
                      disabled={respondingId === c.id}
                      onPress={() => respondMut.mutate({ id: c.id, accept: true })}
                    />
                    <Button
                      label={t('cohorts.decline_cta')}
                      size="sm"
                      variant="ghost"
                      fullWidth={false}
                      disabled={respondingId === c.id}
                      onPress={() => respondMut.mutate({ id: c.id, accept: false })}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
              {t('cohorts.joined_section')}
            </Text>
            {joined.length === 0 ? (
              <EmptyState
                icon="users"
                title={t('cohorts.empty_title')}
                message={t('cohorts.empty_message')}
              />
            ) : (
              joined.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    haptic('selection');
                    navigation.navigate('CohortChat', { cohortId: c.id });
                  }}
                  style={({ pressed }) => ({
                    backgroundColor: theme.bg.surface,
                    borderRadius: radii.lg,
                    borderWidth: 0.5,
                    borderColor: theme.border.subtle,
                    padding: spacing.lg,
                    gap: 6,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text.primary }}>{c.name}</Text>
                    {c.unread > 0 && (
                      <View
                        style={{
                          minWidth: 20,
                          height: 20,
                          borderRadius: 10,
                          paddingHorizontal: 6,
                          backgroundColor: theme.brand.hero,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>{c.unread}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: theme.text.tertiary }}>{c.courseTitle}</Text>
                  {c.lastMessagePreview && (
                    <Text numberOfLines={1} style={{ fontSize: 13, color: theme.text.secondary }}>
                      {c.lastMessagePreview}
                    </Text>
                  )}
                  <View style={{ marginTop: spacing.xs }}>
                    <MemberStack cohort={c} />
                  </View>
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

export function CohortsScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
