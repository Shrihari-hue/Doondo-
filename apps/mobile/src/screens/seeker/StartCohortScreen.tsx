/**
 * StartCohortScreen — pick a course you're enrolled in + up to 4 matched
 * Find Friends contacts, and start a shared cohort chat. Friends are
 * passed in via navigation params (from FindFriendsScreen) so this
 * screen never has to re-request contacts permission itself.
 */
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Avatar, Button, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { coursesApi } from '@/api/courses.api';
import { cohortsApi } from '@/api/cohorts.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'StartCohort'>;
type Route = RouteProp<AppStackParamList, 'StartCohort'>;

const MAX_INVITES = 4;

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();

  const friends = route.params.preselect ?? [];
  const [courseId, setCourseId] = useState<string | null>(route.params.courseId ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const coursesQuery = useQuery({ queryKey: ['courses', 'list'], queryFn: () => coursesApi.list() });
  const enrollmentsQuery = useQuery({ queryKey: ['courses', 'enrollments'], queryFn: () => coursesApi.myEnrollments() });

  const enrolledIds = new Set((enrollmentsQuery.data?.enrollments ?? []).map((e) => e.courseId));
  const allCourses = coursesQuery.data?.courses ?? [];
  const myCourses = allCourses.filter((c) => enrolledIds.has(c.id));

  function toggle(id: string) {
    haptic('selection');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_INVITES) next.add(id);
      return next;
    });
  }

  const createMut = useMutation({
    mutationFn: () => {
      if (!courseId) throw new Error(t('start_cohort.error_no_course'));
      return cohortsApi.create({ courseId, inviteUserIds: [...selected] });
    },
    onSuccess: ({ cohort }) => {
      haptic('success');
      navigation.replace('CohortChat', { cohortId: cohort.id });
    },
    onError: (err) => Alert.alert(t('start_cohort.error_title'), (err as Error).message ?? t('start_cohort.error_default')),
  });

  const canCreate = Boolean(courseId) && selected.size > 0 && !createMut.isPending;

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
        <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text.primary }}>
          {t('start_cohort.title')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['5xl'], gap: spacing.xl }}>
        <View style={{ gap: spacing.sm }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
            {t('start_cohort.course_section')}
          </Text>
          {enrollmentsQuery.isLoading || coursesQuery.isLoading ? (
            <LoadingSpinner />
          ) : myCourses.length === 0 ? (
            <EmptyState
              icon="book-open"
              title={t('start_cohort.no_courses_title')}
              message={t('start_cohort.no_courses_message')}
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {myCourses.map((c) => {
                const active = courseId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      haptic('selection');
                      setCourseId(c.id);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      padding: spacing.md,
                      borderRadius: radii.lg,
                      borderWidth: active ? 1.5 : 0.5,
                      borderColor: active ? theme.brand.primary : theme.border.subtle,
                      backgroundColor: active ? theme.brand.primarySubtle : theme.bg.surface,
                    }}
                  >
                    <Text style={{ fontSize: 20 }}>{c.emoji}</Text>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: theme.text.primary }}>
                      {c.title}
                    </Text>
                    {active && <Feather name="check" size={16} color={theme.brand.primary} />}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
            {t('start_cohort.friends_section', { n: selected.size, max: MAX_INVITES })}
          </Text>
          {friends.length === 0 ? (
            <EmptyState
              icon="user-plus"
              title={t('start_cohort.no_friends_title')}
              message={t('start_cohort.no_friends_message')}
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {friends.map((f) => {
                const active = selected.has(f.id);
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => toggle(f.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      padding: spacing.md,
                      borderRadius: radii.lg,
                      borderWidth: active ? 1.5 : 0.5,
                      borderColor: active ? theme.brand.primary : theme.border.subtle,
                      backgroundColor: active ? theme.brand.primarySubtle : theme.bg.surface,
                    }}
                  >
                    <Avatar size={32} photoUrl={f.photoUrl} name={f.name} />
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: theme.text.primary }}>
                      {f.name}
                    </Text>
                    {active && <Feather name="check-circle" size={18} color={theme.brand.primary} />}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <Button
          label={createMut.isPending ? t('start_cohort.creating') : t('start_cohort.create_cta')}
          disabled={!canCreate}
          onPress={() => createMut.mutate()}
        />
      </ScrollView>
    </Screen>
  );
}

export function StartCohortScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
