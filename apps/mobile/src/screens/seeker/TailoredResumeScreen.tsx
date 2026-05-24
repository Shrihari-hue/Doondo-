/**
 * TailoredResumeScreen — Smart Resume.
 *
 * Shows the worker's resume tailored to one specific job: a job-tuned
 * summary they can edit, the original summary for a before/after, skills
 * re-ordered most-relevant-first, re-worded work blurbs, a course nudge
 * for the skills this job wants that they don't have yet, and a "listen"
 * button that reads the summary aloud.
 *
 * Saving stores the resume against this job — reopening is then instant,
 * and the apply path snapshots it onto the application so the employer
 * sees the job-tuned version.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Speech from 'expo-speech';

import { spacing } from '@doondo/tokens';
import { Screen, Text, Button } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useAuth } from '@/hooks/useAuth';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { meApi } from '@/api/me.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'TailoredResume'>;

/** "kitchen_helper" → "kitchen helper" for display. */
function humanize(slug: string): string {
  return slug.replace(/_/g, ' ').trim();
}

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const { user } = useAuth();

  const { jobId, jobTitle } = route.params;

  const query = useQuery({
    queryKey: ['resume', 'tailor', jobId],
    queryFn: () => meApi.tailorResume(jobId),
    staleTime: 5 * 60_000,
  });
  const resume = query.data?.resume;

  // Editable summary — seeded once from the resume, then owned by the
  // worker. Their agency: the AI drafts, they decide the final words.
  const [editedSummary, setEditedSummary] = useState<string | null>(null);
  useEffect(() => {
    if (resume && editedSummary === null) setEditedSummary(resume.summary);
  }, [resume, editedSummary]);
  const summaryValue = editedSummary ?? resume?.summary ?? '';

  // Listen — read the summary aloud (voice-first; helps low-literacy users).
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    return () => {
      void Speech.stop();
    };
  }, []);
  function toggleListen() {
    haptic('selection');
    if (speaking) {
      void Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(summaryValue, {
      language: 'en-IN',
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      meApi.saveTailoredResume(jobId, {
        summary: summaryValue.trim(),
        pitch: resume?.pitch ?? '',
        highlightedSkills: resume?.highlightedSkills ?? [],
        matchedSkills: resume?.matchedSkills ?? [],
        workBlurbs: resume?.workBlurbs ?? [],
        provider: resume?.provider,
      }),
    onSuccess: () => haptic('success'),
    onError: () => haptic('error'),
  });

  const matched = new Set((resume?.matchedSkills ?? []).map((s) => s.toLowerCase()));
  const currentBio = user?.bio?.trim() ?? '';
  const showBeforeAfter = currentBio.length > 0 && currentBio !== summaryValue.trim();

  return (
    <Screen edges={[]}>
      {/* Header */}
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
          accessibilityLabel={t('smart_resume.back')}
        >
          ←
        </Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text.primary }}>
            {t('smart_resume.title')}
          </Text>
          <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 1 }}>
            {t('smart_resume.for_job', { job: jobTitle ?? resume?.jobTitle ?? '' })}
          </Text>
        </View>
      </View>

      {query.isLoading ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing['3xl'],
          }}
        >
          <StagedLoader
            steps={[
              t('smart_resume.step_reading'),
              t('smart_resume.step_matching'),
              t('smart_resume.step_writing'),
            ]}
          />
        </View>
      ) : query.isError || !resume ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.xl,
          }}
        >
          <Text style={{ fontSize: 14, color: theme.text.secondary, textAlign: 'center' }}>
            {t('smart_resume.error')}
          </Text>
          <Button
            label={t('smart_resume.retry')}
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={() => void query.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: spacing['5xl'],
            gap: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Pitch banner */}
          <View
            style={{
              backgroundColor: theme.brand.heroSubtle,
              borderRadius: 14,
              padding: spacing.lg,
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.brand.hero }}>
              {t('smart_resume.pitch_label')}
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text.primary }}>
              {resume.pitch}
            </Text>
          </View>

          {/* Editable summary */}
          <Section title={t('smart_resume.summary_label')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: theme.text.tertiary,
                }}
              >
                {t('smart_resume.summary_edit_hint')}
              </Text>
              <Text
                onPress={toggleListen}
                accessibilityRole="button"
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: theme.brand.hero,
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                }}
              >
                {speaking ? `■ ${t('smart_resume.stop')}` : `▶ ${t('smart_resume.listen')}`}
              </Text>
            </View>
            <TextInput
              value={summaryValue}
              onChangeText={setEditedSummary}
              multiline
              style={{
                backgroundColor: theme.bg.surface,
                borderRadius: 14,
                borderWidth: 0.5,
                borderColor: theme.border.subtle,
                padding: spacing.lg,
                fontSize: 15,
                lineHeight: 22,
                color: theme.text.primary,
                minHeight: 120,
                textAlignVertical: 'top',
              }}
            />

            {/* Before / after — the worker's current profile summary. */}
            {showBeforeAfter ? (
              <View
                style={{
                  marginTop: spacing.sm,
                  backgroundColor: theme.bg.muted,
                  borderRadius: 12,
                  padding: spacing.md,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: theme.text.tertiary,
                    marginBottom: 3,
                  }}
                >
                  {t('smart_resume.before_label')}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    lineHeight: 19,
                    color: theme.text.tertiary,
                  }}
                >
                  {currentBio}
                </Text>
              </View>
            ) : null}
          </Section>

          {/* Skills ranked for this job */}
          {resume.highlightedSkills.length > 0 ? (
            <Section title={t('smart_resume.skills_label')}>
              <Text
                style={{ fontSize: 12, color: theme.text.tertiary, marginBottom: spacing.sm }}
              >
                {t('smart_resume.skills_hint')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {resume.highlightedSkills.map((skill) => {
                  const isMatch = matched.has(skill.toLowerCase());
                  return (
                    <Chip
                      key={skill}
                      label={humanize(skill)}
                      check={isMatch}
                      tone={isMatch ? 'success' : 'muted'}
                    />
                  );
                })}
              </View>
            </Section>
          ) : null}

          {/* Course nudge — skills this job wants that the worker lacks. */}
          {resume.missingSkills.length > 0 ? (
            <Section title={t('smart_resume.gap_label')}>
              <Text
                style={{ fontSize: 12, color: theme.text.tertiary, marginBottom: spacing.sm }}
              >
                {t('smart_resume.gap_hint')}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: spacing.xs,
                  marginBottom: spacing.sm,
                }}
              >
                {resume.missingSkills.map((skill) => (
                  <Chip key={skill} label={humanize(skill)} tone="warning" />
                ))}
              </View>
              <Button
                label={t('smart_resume.gap_cta')}
                variant="secondary"
                size="sm"
                onPress={() => navigation.navigate('Courses')}
              />
            </Section>
          ) : null}

          {/* Work history, retold for this job */}
          {resume.workBlurbs.length > 0 ? (
            <Section title={t('smart_resume.experience_label')}>
              <View style={{ gap: spacing.sm }}>
                {resume.workBlurbs.map((w, i) => (
                  <View
                    key={`${w.company}-${i}`}
                    style={{
                      backgroundColor: theme.bg.surface,
                      borderRadius: 14,
                      borderWidth: 0.5,
                      borderColor: theme.border.subtle,
                      padding: spacing.lg,
                      gap: 3,
                    }}
                  >
                    <Text
                      style={{ fontSize: 14, fontWeight: '600', color: theme.text.primary }}
                    >
                      {w.role}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
                      {w.company}
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        lineHeight: 20,
                        color: theme.text.secondary,
                        marginTop: 4,
                      }}
                    >
                      {w.blurb}
                    </Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {/* Save */}
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <Button
              label={
                saveMutation.isSuccess
                  ? t('smart_resume.saved_for_job')
                  : t('smart_resume.save_job_cta')
              }
              variant={saveMutation.isSuccess ? 'secondary' : 'primary'}
              disabled={saveMutation.isPending || summaryValue.trim().length === 0}
              onPress={() => saveMutation.mutate()}
            />
            <Text
              style={{ fontSize: 11, color: theme.text.tertiary, textAlign: 'center' }}
            >
              {t('smart_resume.save_job_hint')}
            </Text>
            <Button
              label={t('smart_resume.done')}
              variant="ghost"
              onPress={() => navigation.goBack()}
            />
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  check,
  tone,
}: {
  label: string;
  check?: boolean;
  tone: 'success' | 'muted' | 'warning';
}) {
  const { theme } = useTheme();
  const palette = {
    success: { bg: theme.status.successSubtle, fg: theme.status.success },
    warning: { bg: theme.status.warningSubtle, fg: theme.status.warning },
    muted: { bg: theme.bg.muted, fg: theme.text.secondary },
  }[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: palette.bg,
      }}
    >
      {check ? <Text style={{ fontSize: 11, color: palette.fg }}>✓</Text> : null}
      <Text
        style={{
          fontSize: 13,
          fontWeight: check ? '600' : '400',
          color: palette.fg,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Staged loader — turns the AI wait into a crafted, legible sequence
 * ("Reading the job… → Matching your skills… → Writing your summary…")
 * instead of an anonymous spinner.
 */
function StagedLoader({ steps }: { steps: string[] }) {
  const { theme } = useTheme();
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setActive((a) => Math.min(a + 1, steps.length - 1)),
      1500,
    );
    return () => clearInterval(id);
  }, [steps.length]);

  return (
    <View style={{ gap: 16 }}>
      {steps.map((step, i) => (
        <View
          key={step}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor:
                i < active
                  ? theme.status.successSubtle
                  : i === active
                    ? theme.brand.heroSubtle
                    : theme.bg.muted,
            }}
          >
            {i < active ? (
              <Text style={{ fontSize: 12, color: theme.status.success }}>✓</Text>
            ) : i === active ? (
              <ActivityIndicator size="small" color={theme.brand.hero} />
            ) : (
              <Text style={{ fontSize: 11, color: theme.text.tertiary }}>{i + 1}</Text>
            )}
          </View>
          <Text
            style={{
              fontSize: 14,
              fontWeight: i === active ? '600' : '400',
              color: i <= active ? theme.text.primary : theme.text.tertiary,
            }}
          >
            {step}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function TailoredResumeScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
