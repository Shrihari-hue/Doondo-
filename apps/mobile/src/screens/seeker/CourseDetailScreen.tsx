/**
 * CourseDetailScreen — one course, its lessons, the seeker's progress
 * through it.
 *
 * Each lesson is a tappable row. Tapping opens a modal-style sheet
 * with the lesson body and a "Mark complete" button. Completing the
 * last lesson flips the course to "earned" and surfaces a 🏅 badge on
 * the resume preview.
 */

import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  type PublicCourseDetail,
  type PublicCourseLesson,
  type PublicEnrollment,
} from '@/api/courses.api';
import { ApiError } from '@/api/errors';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'CourseDetail'>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function CourseDetailInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const t = useTranslate();

  const { courseId } = route.params;

  const detail = useQuery({
    queryKey: ['courses', 'detail', courseId],
    queryFn: () => coursesApi.detail(courseId),
    staleTime: 60_000,
  });
  const enrollments = useQuery({
    queryKey: ['enrollments', 'me'],
    queryFn: () => coursesApi.myEnrollments(),
    staleTime: 60_000,
  });

  const [openLesson, setOpenLesson] = useState<PublicCourseLesson | null>(null);

  const enrolment: PublicEnrollment | null =
    enrollments.data?.enrollments.find((e) => e.courseId === courseId) ?? null;
  const completedLessonIds = new Set(enrolment?.completedLessonIds ?? []);
  const isCompleted = Boolean(enrolment?.completedAt);

  const enrollMutation = useMutation({
    mutationFn: () => coursesApi.enroll(courseId),
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['enrollments', 'me'] });
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(
        t('course_detail.couldnt_enroll'),
        err instanceof ApiError ? err.message : t('course_detail.try_again'),
      );
    },
  });

  const completeMutation = useMutation({
    mutationFn: (lessonId: string) => coursesApi.completeLesson(courseId, lessonId),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['enrollments', 'me'] });
      if (data.enrollment.completedAt) {
        haptic('success');
        // Slight delay so the modal can dismiss before the badge alert.
        setTimeout(() => {
          Alert.alert(
            t('course_detail.badge_alert_title'),
            t('course_detail.badge_alert_body'),
          );
        }, 250);
      } else {
        haptic('selection');
      }
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(
        t('course_detail.couldnt_complete'),
        err instanceof ApiError ? err.message : t('course_detail.try_again'),
      );
    },
  });

  if (detail.isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <Screen>
        <EmptyState
          title={t('course_detail.error_title')}
          message={t('course_detail.error_message')}
          cta={{ label: t('course_detail.retry'), onPress: () => void detail.refetch() }}
        />
      </Screen>
    );
  }

  const course: PublicCourseDetail = detail.data.course;
  const completedCount = course.lessons.filter((l) =>
    completedLessonIds.has(l.id),
  ).length;
  const progress = course.lessons.length
    ? completedCount / course.lessons.length
    : 0;

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing['5xl'] }}
        refreshControl={
          <RefreshControl
            refreshing={detail.isRefetching}
            onRefresh={() => void detail.refetch()}
            tintColor={theme.brand.primary}
          />
        }
      >
        <LinearGradient
          colors={[blue[700], blue[600], blue[500]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingTop: insets.top + spacing.md,
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing.xl + spacing.lg,
            borderBottomLeftRadius: radii.xl,
            borderBottomRightRadius: radii.xl,
            gap: spacing.md,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Feather name="arrow-left" size={22} color={theme.text.onBrand} />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: radii.lg,
                backgroundColor: 'rgba(255,255,255,0.18)',
                borderWidth: 0.5,
                borderColor: 'rgba(255,255,255,0.32)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 32 }}>{course.emoji}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '700',
                  color: theme.text.onBrand,
                  letterSpacing: -0.3,
                  lineHeight: 26,
                }}
                numberOfLines={2}
              >
                {course.title}
              </Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
                {t('course_detail.header_meta', {
                  n: course.lessons.length,
                  min: course.totalDurationMinutes,
                  level: course.level,
                })}
              </Text>
              {isCompleted ? (
                <View
                  style={{
                    alignSelf: 'flex-start',
                    marginTop: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: radii.pill,
                    backgroundColor: 'rgba(255, 243, 199, 0.92)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Feather name="award" size={12} color={theme.status.warning} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.status.warning }}>
                    {t('course_detail.badge_earned')}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: 'rgba(255,255,255,0.92)',
            }}
          >
            {course.description}
          </Text>
        </LinearGradient>

        {/* Progress */}
        <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.xs }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                letterSpacing: 1.6,
                color: theme.text.tertiary,
              }}
            >
              {t('course_detail.your_progress')}
            </Text>
            <Text
              style={{ fontSize: 12, fontWeight: '600', color: theme.text.secondary }}
            >
              {completedCount} / {course.lessons.length}
            </Text>
          </View>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: theme.border.subtle,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.round(progress * 100)}%`,
                height: '100%',
                backgroundColor: isCompleted ? theme.success : theme.brand.primary,
              }}
            />
          </View>
          {!enrolment ? (
            <Pressable
              onPress={() => enrollMutation.mutate()}
              disabled={enrollMutation.isPending}
              style={{ marginTop: spacing.sm }}
            >
              {({ pressed }) => (
                <View
                  style={{
                    paddingVertical: 12,
                    borderRadius: radii.pill,
                    alignItems: 'center',
                    backgroundColor: theme.brand.primary,
                    opacity: enrollMutation.isPending ? 0.5 : pressed ? 0.85 : 1,
                  }}
                >
                  <Text style={{ color: theme.text.onBrand, fontSize: 14, fontWeight: '700' }}>
                    {enrollMutation.isPending ? t('course_detail.starting') : t('course_detail.start_course')}
                  </Text>
                </View>
              )}
            </Pressable>
          ) : null}
        </View>

        {/* Lessons */}
        <View
          style={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.xl,
            gap: spacing.sm,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 1.6,
              color: theme.text.tertiary,
            }}
          >
            {t('course_detail.lessons_section')}
          </Text>
          {course.lessons.map((lesson, i) => {
            const done = completedLessonIds.has(lesson.id);
            return (
              <Pressable
                key={lesson.id}
                onPress={() => {
                  haptic('selection');
                  setOpenLesson(lesson);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('course_detail.a11y_open_lesson', { title: lesson.title })}
                style={({ pressed }) => ({
                  backgroundColor: theme.bg.surface,
                  borderRadius: radii.lg,
                  borderWidth: 0.5,
                  borderColor: theme.border.subtle,
                  padding: spacing.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: done ? theme.status.successSubtle : theme.bg.muted,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {done ? (
                    <Feather name="check" size={15} color={theme.status.success} />
                  ) : (
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: theme.text.secondary,
                      }}
                    >
                      {i + 1}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: theme.text.primary,
                    }}
                    numberOfLines={1}
                  >
                    {lesson.title}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
                    {t('course_detail.lesson_min_read', { n: lesson.durationMinutes })}
                  </Text>
                </View>
                <Text style={{ fontSize: 18, color: theme.text.tertiary }}>›</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <LessonModal
        lesson={openLesson}
        completed={openLesson ? completedLessonIds.has(openLesson.id) : false}
        onClose={() => setOpenLesson(null)}
        onComplete={() => {
          if (!openLesson) return;
          completeMutation.mutate(openLesson.id);
          setOpenLesson(null);
        }}
        completing={completeMutation.isPending}
        t={t}
      />
    </Screen>
  );
}

// ─── Lesson modal ───────────────────────────────────────────────────────────

function LessonModal({
  lesson,
  completed,
  onClose,
  onComplete,
  completing,
  t,
}: {
  lesson: PublicCourseLesson | null;
  completed: boolean;
  onClose: () => void;
  onComplete: () => void;
  completing: boolean;
  t: TFn;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={lesson !== null}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <Screen edges={[]}>
        {lesson ? (
          <>
            <View
              style={{
                paddingTop: insets.top + spacing.md,
                paddingHorizontal: spacing.xl,
                paddingBottom: spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                borderBottomWidth: 0.5,
                borderBottomColor: theme.border.subtle,
              }}
            >
              <Pressable onPress={onClose} hitSlop={12}>
                <Text style={{ fontSize: 22, color: theme.text.primary }}>×</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '700',
                    color: theme.text.primary,
                  }}
                  numberOfLines={1}
                >
                  {lesson.title}
                </Text>
                <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
                  {t('course_detail.lesson_min_read', { n: lesson.durationMinutes })}
                </Text>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: spacing.xl,
                paddingTop: spacing.lg,
                paddingBottom: spacing['3xl'],
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  lineHeight: 24,
                  color: theme.text.primary,
                }}
              >
                {lesson.body}
              </Text>
            </ScrollView>

            <View
              style={{
                paddingHorizontal: spacing.xl,
                paddingTop: spacing.sm,
                paddingBottom: insets.bottom + spacing.md,
                borderTopWidth: 0.5,
                borderTopColor: theme.border.subtle,
              }}
            >
              <Pressable
                onPress={onComplete}
                disabled={completed || completing}
                accessibilityRole="button"
                accessibilityLabel={completed ? t('course_detail.a11y_completed') : t('course_detail.a11y_mark_complete')}
              >
                {({ pressed }) => (
                  // Background + shape sit on this static View. With them on
                  // the Pressable style function, RN dropped the fill on some
                  // builds — leaving white text on a white sheet.
                  <View
                    style={{
                      paddingVertical: 14,
                      borderRadius: radii.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: completed ? theme.success : theme.brand.primary,
                      opacity: completed
                        ? 0.7
                        : completing
                          ? 0.5
                          : pressed
                            ? 0.85
                            : 1,
                      shadowColor: completed ? theme.success : theme.brand.primary,
                      shadowOpacity: 0.25,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: 4,
                    }}
                  >
                    <Text style={{ color: theme.text.onBrand, fontSize: 16, fontWeight: '700' }}>
                      {completed
                        ? t('course_detail.lesson_complete_done')
                        : completing
                          ? t('course_detail.lesson_complete_saving')
                          : t('course_detail.lesson_complete_cta')}
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          </>
        ) : null}
      </Screen>
    </Modal>
  );
}

// ─── Export ─────────────────────────────────────────────────────────────────

export function CourseDetailScreen() {
  return (
    <SeekerThemeOverride>
      <CourseDetailInner />
    </SeekerThemeOverride>
  );
}
