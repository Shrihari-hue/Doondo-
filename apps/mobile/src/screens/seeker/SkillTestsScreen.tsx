/**
 * SkillTestsScreen — catalogue + take-test flow.
 *
 * The catalogue is small (3 tests for v1) and curated, so we don't
 * paginate. Each test card shows the title, emoji, lesson count, level
 * pill, and the seeker's status: "Passed ✓", "Try again in Xh"
 * (cooldown after a failed attempt), or "Take test".
 *
 * Tapping into a test opens a sheet with the 5 questions one after
 * the other. On submit, we show the score, a pass/fail badge, and
 * — on a fail — a friendly explanation of when they can retry.
 */

import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { haptic } from '@/lib/haptics';
import {
  skillTestsApi,
  type PublicSkillTest,
  type SkillTestAttempt,
} from '@/api/skillTests.api';
import { ApiError } from '@/api/errors';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function SkillTestsInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const tests = useQuery({
    queryKey: ['skillTests', 'catalogue'],
    queryFn: () => skillTestsApi.list(),
    staleTime: 60_000,
  });
  const attempts = useQuery({
    queryKey: ['skillTests', 'me'],
    queryFn: () => skillTestsApi.myAttempts(),
    staleTime: 60_000,
  });

  const [activeTest, setActiveTest] = useState<PublicSkillTest | null>(null);

  const latestByTestId = useMemo(() => {
    const m = new Map<string, SkillTestAttempt>();
    for (const a of attempts.data?.attempts ?? []) {
      if (!m.has(a.testId)) m.set(a.testId, a);
    }
    return m;
  }, [attempts.data]);

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
          gap: spacing.sm,
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
            Skill tests
          </Text>
        </View>
        <Text
          style={{ fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.85)' }}
        >
          Short 5-question tests per trade. Pass 4 of 5 and earn a
          &ldquo;✓ Tested&rdquo; pill that shows on your resume.
        </Text>
      </LinearGradient>

      {tests.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : tests.isError ? (
        <EmptyState
          title="Couldn't load tests"
          message="Check your connection and try again."
          cta={{ label: 'Retry', onPress: () => void tests.refetch() }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: insets.bottom + spacing['5xl'],
            gap: spacing.sm,
          }}
          refreshControl={
            <RefreshControl
              refreshing={tests.isRefetching}
              onRefresh={() => {
                void tests.refetch();
                void attempts.refetch();
              }}
              tintColor={theme.brand.hero}
            />
          }
        >
          {(tests.data?.tests ?? []).map((t) => (
            <TestCard
              key={t.id}
              test={t}
              attempt={latestByTestId.get(t.id) ?? null}
              onStart={() => {
                haptic('selection');
                setActiveTest(t);
              }}
            />
          ))}
        </ScrollView>
      )}

      <TakeTestModal
        test={activeTest}
        onClose={() => setActiveTest(null)}
      />
    </Screen>
  );
}

// ─── Catalogue card ─────────────────────────────────────────────────────────

function TestCard({
  test,
  attempt,
  onStart,
}: {
  test: PublicSkillTest;
  attempt: SkillTestAttempt | null;
  onStart: () => void;
}) {
  const { theme } = useTheme();
  const passed = attempt?.passed ?? false;
  const cooldownUntilMs = attempt?.createdAt
    ? new Date(attempt.createdAt).getTime() + 24 * 60 * 60 * 1000
    : 0;
  const cooldownLeftMs = passed ? 0 : Math.max(0, cooldownUntilMs - Date.now());
  const cooldownHours = Math.ceil(cooldownLeftMs / 3600_000);
  const blocked = !passed && cooldownLeftMs > 0;

  return (
    <View
      style={{
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: radii.lg,
          backgroundColor: '#EFF6FF',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 28 }}>{test.emoji}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{ fontSize: 15, fontWeight: '700', color: theme.text.primary }}
          numberOfLines={1}
        >
          {test.title}
        </Text>
        <Text
          style={{ fontSize: 12, color: theme.text.secondary }}
          numberOfLines={2}
        >
          {test.tagline}
        </Text>
        <Text style={{ fontSize: 11, color: theme.text.tertiary, marginTop: 2 }}>
          {test.questions.length} questions · pass {test.passingScore}/{test.questions.length} ·{' '}
          {test.durationMinutes} min
        </Text>
      </View>
      {passed ? (
        <View
          style={{
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radii.pill,
            backgroundColor: '#D1FAE5',
            borderWidth: 0.5,
            borderColor: '#86EFAC',
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#065F46' }}>
            ✓ Passed
          </Text>
        </View>
      ) : blocked ? (
        <View
          style={{
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radii.pill,
            backgroundColor: '#FEF3C7',
            borderWidth: 0.5,
            borderColor: '#FDE68A',
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#78350F' }}>
            Try in {cooldownHours}h
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={onStart}
          style={({ pressed }) => ({
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radii.pill,
            backgroundColor: '#2563EB',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
            Take test
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Take-test modal ────────────────────────────────────────────────────────

function TakeTestModal({
  test,
  onClose,
}: {
  test: PublicSkillTest | null;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<SkillTestAttempt | null>(null);

  const submit = useMutation({
    mutationFn: () => {
      if (!test) throw new Error('No test selected');
      return skillTestsApi.submit(test.id, { answers });
    },
    onSuccess: (data) => {
      haptic(data.attempt.passed ? 'success' : 'warning');
      setResult(data.attempt);
      void queryClient.invalidateQueries({ queryKey: ['skillTests', 'me'] });
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(
        "Couldn't submit",
        err instanceof ApiError ? err.message : 'Try again.',
      );
    },
  });

  // Reset state when the modal opens with a new test.
  useMemo(() => {
    if (test) {
      setAnswers(new Array(test.questions.length).fill(-1));
      setResult(null);
    }
  }, [test]);

  if (!test) return null;

  const answeredAll = answers.every((a) => a >= 0);

  return (
    <Modal
      visible={!!test}
      animationType="slide"
      onRequestClose={onClose}
    >
      <Screen edges={[]}>
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
          <Text
            style={{
              fontSize: 16,
              fontWeight: '700',
              color: theme.text.primary,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {test.title}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: spacing['3xl'],
            gap: spacing.lg,
          }}
        >
          {result ? (
            <ResultPanel attempt={result} test={test} />
          ) : (
            test.questions.map((q, qi) => (
              <View key={q.id} style={{ gap: spacing.sm }}>
                <Text
                  style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1.4, color: theme.text.tertiary }}
                >
                  QUESTION {qi + 1} / {test.questions.length}
                </Text>
                <Text
                  style={{ fontSize: 15, lineHeight: 22, color: theme.text.primary }}
                >
                  {q.question}
                </Text>
                <View style={{ gap: spacing.xs }}>
                  {q.options.map((opt, oi) => {
                    const active = answers[qi] === oi;
                    return (
                      <Pressable
                        key={oi}
                        onPress={() => {
                          haptic('selection');
                          setAnswers((cur) => {
                            const next = [...cur];
                            next[qi] = oi;
                            return next;
                          });
                        }}
                        style={({ pressed }) => ({
                          padding: spacing.md,
                          borderRadius: radii.md,
                          borderWidth: 1,
                          borderColor: active ? '#2563EB' : theme.border.default,
                          backgroundColor: active ? '#EFF6FF' : theme.bg.surface,
                          opacity: pressed ? 0.7 : 1,
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          gap: spacing.sm,
                        })}
                      >
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            borderWidth: 1.5,
                            borderColor: active ? '#2563EB' : theme.border.strong,
                            backgroundColor: active ? '#2563EB' : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 2,
                          }}
                        >
                          {active ? (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: '#FFFFFF',
                              }}
                            />
                          ) : null}
                        </View>
                        <Text
                          style={{
                            flex: 1,
                            fontSize: 14,
                            lineHeight: 20,
                            color: theme.text.primary,
                          }}
                        >
                          {opt}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))
          )}
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
          {result ? (
            <Pressable
              onPress={onClose}
              style={({ pressed }) => ({
                paddingVertical: 14,
                borderRadius: radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#2563EB',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
                Done
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => submit.mutate()}
              disabled={!answeredAll || submit.isPending}
              style={({ pressed }) => ({
                paddingVertical: 14,
                borderRadius: radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#2563EB',
                opacity: !answeredAll || submit.isPending ? 0.5 : pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
                {submit.isPending
                  ? 'Grading…'
                  : answeredAll
                    ? 'Submit'
                    : `Answer all ${test.questions.length} to submit`}
              </Text>
            </Pressable>
          )}
        </View>
      </Screen>
    </Modal>
  );
}

function ResultPanel({
  attempt,
  test,
}: {
  attempt: SkillTestAttempt;
  test: PublicSkillTest;
}) {
  const { theme } = useTheme();
  if (attempt.passed) {
    return (
      <View
        style={{
          backgroundColor: '#D1FAE5',
          borderRadius: radii.lg,
          borderWidth: 0.5,
          borderColor: '#86EFAC',
          padding: spacing.xl,
          gap: spacing.sm,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 56 }}>🏅</Text>
        <Text
          style={{ fontSize: 22, fontWeight: '800', color: '#065F46', letterSpacing: -0.3 }}
        >
          Passed
        </Text>
        <Text style={{ fontSize: 14, color: '#047857', textAlign: 'center' }}>
          You scored {attempt.score} / {test.questions.length}. The
          &ldquo;✓ Tested: {test.title}&rdquo; pill now shows on your resume.
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        backgroundColor: '#FEF3C7',
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: '#FDE68A',
        padding: spacing.xl,
        gap: spacing.sm,
        alignItems: 'center',
      }}
    >
      <Text style={{ fontSize: 56 }}>📚</Text>
      <Text
        style={{ fontSize: 22, fontWeight: '800', color: '#78350F', letterSpacing: -0.3 }}
      >
        Not quite
      </Text>
      <Text style={{ fontSize: 14, color: '#92400E', textAlign: 'center' }}>
        You scored {attempt.score} / {test.questions.length}. You need{' '}
        {test.passingScore} to pass.
      </Text>
      <Text style={{ fontSize: 12, color: '#92400E', textAlign: 'center', opacity: 0.85 }}>
        Try again in 24 hours — pace lets you actually study between attempts.
      </Text>
    </View>
  );
}

// ─── Export ────────────────────────────────────────────────────────────────

export function SkillTestsScreen() {
  return (
    <SeekerThemeOverride>
      <SkillTestsInner />
    </SeekerThemeOverride>
  );
}
