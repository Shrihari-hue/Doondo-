/**
 * CoursesScreen — catalogue of short trainings the seeker can take to
 * upskill (and earn a badge that surfaces on their resume).
 *
 * The catalogue is small and curated, so we don't paginate. Sort
 * happens server-side based on the seeker's own skills — courses most
 * relevant to their trades surface first.
 *
 * A seeker's earned badges (completed courses) appear inline as a
 * "Your badges" strip at the top so they can show themselves off
 * before scrolling the rest of the list.
 */

import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import {
  coursesApi,
  type PublicCourseSummary,
  type PublicEnrollment,
} from '@/api/courses.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function CoursesInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();

  const catalogue = useQuery({
    queryKey: ['courses', 'catalogue'],
    queryFn: () => coursesApi.list(),
    staleTime: 60_000,
  });
  const enrollments = useQuery({
    queryKey: ['enrollments', 'me'],
    queryFn: () => coursesApi.myEnrollments(),
    staleTime: 60_000,
  });

  const courses = catalogue.data?.courses ?? [];
  const myEnrollments = enrollments.data?.enrollments ?? [];

  const earned = myEnrollments.filter((e) => e.completedAt);
  const inProgress = myEnrollments.filter((e) => !e.completedAt);

  const open = (course: PublicCourseSummary) => {
    haptic('selection');
    navigation.navigate('CourseDetail', { courseId: course.id });
  };

  return (
    <Screen edges={[]}>
      <LinearGradient
        colors={[blue[700], blue[600], blue[500]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xl,
          borderBottomLeftRadius: radii.xl,
          borderBottomRightRadius: radii.xl,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginBottom: spacing.sm,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Feather name="arrow-left" size={22} color={theme.text.onBrand} />
          </Pressable>
          <Text
            style={{ fontSize: 17, fontWeight: '600', color: theme.text.onBrand, flex: 1 }}
          >
            {t('courses.header_title')}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 13,
            lineHeight: 19,
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          {t('courses.header_blurb')}
        </Text>
      </LinearGradient>

      {catalogue.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : catalogue.isError ? (
        <EmptyState
          title={t('courses.error_title')}
          message={t('courses.error_message')}
          cta={{
            label: t('courses.retry'),
            onPress: () => {
              haptic('selection');
              void catalogue.refetch();
            },
          }}
        />
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: insets.bottom + spacing['5xl'],
            gap: spacing.sm,
          }}
          refreshControl={
            <RefreshControl
              refreshing={catalogue.isRefetching}
              onRefresh={() => void catalogue.refetch()}
              tintColor={theme.brand.primary}
            />
          }
          ListHeaderComponent={
            <BadgeStrip
              courses={courses}
              earned={earned}
              inProgress={inProgress}
              t={t}
            />
          }
          renderItem={({ item }) => {
            const enrolment = myEnrollments.find((e) => e.courseId === item.id);
            return (
              <CourseCard
                course={item}
                enrolment={enrolment ?? null}
                onPress={() => open(item)}
                t={t}
              />
            );
          }}
        />
      )}
    </Screen>
  );
}

// ─── "Your badges" + "In progress" strips ───────────────────────────────────

function BadgeStrip({
  courses,
  earned,
  inProgress,
  t,
}: {
  courses: PublicCourseSummary[];
  earned: PublicEnrollment[];
  inProgress: PublicEnrollment[];
  t: TFn;
}) {
  const { theme } = useTheme();
  if (earned.length === 0 && inProgress.length === 0) {
    return (
      <View style={{ marginBottom: spacing.md }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 1.6,
            color: theme.text.tertiary,
            marginBottom: spacing.xs,
          }}
        >
          {t('courses.all_courses')}
        </Text>
      </View>
    );
  }
  const courseById = new Map(courses.map((c) => [c.id, c]));

  return (
    <View style={{ marginBottom: spacing.md, gap: spacing.lg }}>
      {earned.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 1.6,
              color: theme.text.tertiary,
            }}
          >
            {t('courses.your_badges', { n: earned.length })}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
          >
            {earned.map((e) => {
              const c = courseById.get(e.courseId);
              if (!c) return null;
              return (
                <View
                  key={e.id}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radii.pill,
                    backgroundColor: theme.status.warningSubtle,
                    borderWidth: 0.5,
                    borderColor: theme.status.warningBorder,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Feather name="award" size={13} color={theme.status.warning} />
                  <Text style={{ fontSize: 12 }}>{c.emoji}</Text>
                  <Text
                    style={{ fontSize: 12, fontWeight: '700', color: theme.status.warning }}
                  >
                    {c.title}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {inProgress.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 1.6,
              color: theme.text.tertiary,
            }}
          >
            {t('courses.in_progress', { n: inProgress.length })}
          </Text>
        </View>
      ) : null}

      <View>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 1.6,
            color: theme.text.tertiary,
          }}
        >
          {t('courses.all_courses')}
        </Text>
      </View>
    </View>
  );
}

// ─── Course card ────────────────────────────────────────────────────────────

function CourseCard({
  course,
  enrolment,
  onPress,
  t,
}: {
  course: PublicCourseSummary;
  enrolment: PublicEnrollment | null;
  onPress: () => void;
  t: TFn;
}) {
  const { theme } = useTheme();
  const isCompleted = Boolean(enrolment?.completedAt);
  const progress = enrolment
    ? Math.min(1, enrolment.completedLessonsCount / course.lessonCount)
    : 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('courses.card_a11y', { title: course.title })}
      style={({ pressed }) => ({
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.md,
        gap: spacing.sm,
        opacity: pressed ? 0.85 : 1,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: radii.lg,
            backgroundColor: course.tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 28 }}>{course.emoji}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
            }}
          >
            <Text
              style={{ fontSize: 15, fontWeight: '700', color: theme.text.primary, flexShrink: 1 }}
              numberOfLines={1}
            >
              {course.title}
            </Text>
            {isCompleted ? (
              <Feather name="award" size={13} color={theme.status.warning} />
            ) : null}
          </View>
          <Text
            style={{ fontSize: 12, color: theme.text.secondary, lineHeight: 17 }}
            numberOfLines={2}
          >
            {course.tagline}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              marginTop: 2,
            }}
          >
            <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
              {t('courses.card_lessons_meta', { n: course.lessonCount, min: course.totalDurationMinutes })}
            </Text>
            <Text style={{ fontSize: 11, color: theme.text.tertiary }}>·</Text>
            <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
              {course.level}
            </Text>
          </View>
        </View>
      </View>

      {enrolment && !isCompleted ? (
        <View style={{ gap: 4 }}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.border.subtle,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.round(progress * 100)}%`,
                height: '100%',
                backgroundColor: theme.brand.primary,
              }}
            />
          </View>
          <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
            {t('courses.progress_meta', { done: enrolment.completedLessonsCount, total: course.lessonCount })}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ─── Export ─────────────────────────────────────────────────────────────────

export function CoursesScreen() {
  return (
    <SeekerThemeOverride>
      <CoursesInner />
    </SeekerThemeOverride>
  );
}
