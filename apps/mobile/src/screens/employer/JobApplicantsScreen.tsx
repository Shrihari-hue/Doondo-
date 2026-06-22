/**
 * JobApplicantsScreen — modal for applicants of one job.
 *
 * Opened from the PostsScreen card tap. Same ApplicantCard as the
 * cross-job tab; this scoping is just a filter.
 */

import { useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, View, Switch } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, SkeletonCard, EmptyState, Card, TextField, Button, BlurOverlay} from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { applicationsApi } from '@/api/applications.api';
import { jobsApi } from '@/api/jobs.api';
import { chatApi } from '@/api/chat.api';
import { siteBriefingApi } from '@/api/siteBriefing.api';
import { pickChatImage } from '@/lib/chatImage';
import { haptic } from '@/lib/haptics';
import { ApplicantCard } from './ApplicantCard';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'JobApplicants'>;
type Route = RouteProp<AppStackParamList, 'JobApplicants'>;

export function JobApplicantsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { theme } = useTheme();
  const t = useTranslate();

  const [blind, setBlind] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingText, setBriefingText] = useState('');
  const [briefingPhotos, setBriefingPhotos] = useState<string[]>([]);
  const [savingBriefing, setSavingBriefing] = useState(false);

  async function openBriefing() {
    setBriefingOpen(true);
    try {
      const b = await siteBriefingApi.get(route.params.jobId);
      setBriefingText(b.text);
      setBriefingPhotos(b.photoUrls);
    } catch {
      /* none yet */
    }
  }

  async function addBriefingPhoto() {
    if (briefingPhotos.length >= 3) return;
    try {
      const img = await pickChatImage({ source: 'camera' });
      if (img) setBriefingPhotos((prev) => [...prev, img.dataUrl]);
    } catch {
      /* cancelled */
    }
  }

  async function saveBriefing() {
    if (savingBriefing) return;
    setSavingBriefing(true);
    haptic('selection');
    try {
      await siteBriefingApi.save(route.params.jobId, {
        text: briefingText.trim(),
        photoDataUrls: briefingPhotos,
      });
      haptic('success');
      setBriefingOpen(false);
    } catch {
      haptic('error');
    } finally {
      setSavingBriefing(false);
    }
  }

  const query = useQuery({
    queryKey: ['applicants', 'job', route.params.jobId],
    queryFn: () => applicationsApi.listForJob(route.params.jobId, { limit: 100 }),
  });

  const benchmarkQuery = useQuery({
    queryKey: ['wage-benchmark', route.params.jobId],
    queryFn: () => jobsApi.wageBenchmark(route.params.jobId),
    staleTime: 5 * 60_000,
  });
  const benchmark = benchmarkQuery.data?.benchmark;

  const projectQuery = useQuery({
    queryKey: ['project-progress', route.params.jobId],
    queryFn: () => jobsApi.projectProgress(route.params.jobId),
    staleTime: 60_000,
  });
  const project = projectQuery.data;

  const applicants = query.data?.applications ?? [];
  const hasPending = applicants.some((a) => a.status === 'pending');
  const headcount = applicants[0]?.job?.headcount ?? 1;
  const hiredCount = applicants.filter((a) => a.status === 'hired').length;
  const shortlistedCount = applicants.filter((a) => a.status === 'shortlisted').length;

  async function sendBulk() {
    if (sending || !bulkMsg.trim()) return;
    setSending(true);
    haptic('selection');
    try {
      const { sent } = await chatApi.bulkMessage(route.params.jobId, 'shortlisted', bulkMsg.trim());
      haptic('success');
      setComposerOpen(false);
      setBulkMsg('');
      Alert.alert(t('employer.bulk_message.sent_title'), t('employer.bulk_message.sent_body', { n: sent }));
    } catch {
      haptic('error');
      Alert.alert(t('employer.bulk_message.fail'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['3xl'],
          paddingBottom: spacing['4xl'],
          gap: spacing['2xl'],
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.brand.hero}
          />
        }
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="footnote" tone="secondary">
            {t('employer.back')}
          </Text>
        </Pressable>

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('employer.applicants.eyebrow')}
          </Text>
          <Text variant="display" weight="medium" display numberOfLines={2}>
            {route.params.jobTitle ?? t('employer.applicants.per_job_title')}
          </Text>
          {applicants.length > 0 && (
            <Text variant="footnote" tone="secondary">
              {t('employer.applicants.per_job_total', { n: applicants.length })}
            </Text>
          )}
          {headcount > 1 && (
            <Text
              variant="footnote"
              weight="medium"
              tone={hiredCount >= headcount ? 'success' : 'hero'}
            >
              {t('employer.applicants.fill', { hired: hiredCount, headcount })}
            </Text>
          )}
          {shortlistedCount > 0 && (
            <Pressable
              onPress={() => setComposerOpen(true)}
              accessibilityRole="button"
              style={{
                marginTop: spacing.xs,
                alignSelf: 'flex-start',
                paddingHorizontal: spacing.md,
                paddingVertical: 8,
                borderRadius: radii.pill,
                borderWidth: 0.5,
                borderColor: theme.brand.hero,
              }}
            >
              <Text variant="footnote" weight="medium" style={{ color: theme.brand.hero }}>
                {t('employer.bulk_message.cta', { n: shortlistedCount })}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => void openBriefing()}
            accessibilityRole="button"
            style={{
              marginTop: spacing.xs,
              alignSelf: 'flex-start',
              paddingHorizontal: spacing.md,
              paddingVertical: 8,
              borderRadius: radii.pill,
              borderWidth: 0.5,
              borderColor: theme.border.default,
            }}
          >
            <Text variant="footnote" weight="medium" tone="secondary">
              {t('employer.briefing.cta')}
            </Text>
          </Pressable>
        </View>

        {project?.isProject ? (
          <Card>
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text variant="body" weight="medium" style={{ flex: 1 }}>
                  {t('employer.project.title')}
                </Text>
                <Text variant="footnote" weight="medium" tone="hero">
                  {t('employer.project.day_of', {
                    day: project.elapsedDays,
                    total: project.totalDays,
                  })}
                </Text>
              </View>
              {/* Progress bar */}
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
                    width: `${Math.min(100, project.percentElapsed)}%`,
                    height: '100%',
                    backgroundColor: theme.brand.hero,
                  }}
                />
              </View>
              <Text variant="footnote" tone="secondary">
                {t('employer.project.range', {
                  start: project.startDate ?? '',
                  end: project.endDate ?? '',
                })}
                {project.remainingDays > 0
                  ? ` · ${t('employer.project.remaining', { n: project.remainingDays })}`
                  : ` · ${t('employer.project.complete')}`}
              </Text>
              {project.workers.length > 0 && (
                <View style={{ gap: 4, marginTop: spacing.xs }}>
                  {project.workers.map((w) => (
                    <View
                      key={w.workerId}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                    >
                      <Text variant="footnote" style={{ flex: 1 }} numberOfLines={1}>
                        {w.name}
                      </Text>
                      <Text variant="footnote" tone="secondary">
                        {t('employer.project.days_attended', {
                          done: w.daysAttended,
                          total: project.totalDays,
                        })}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </Card>
        ) : null}

        {benchmark?.belowMarket && benchmark.medianPaise ? (
          <Card>
            <View style={{ gap: 2 }}>
              <Text variant="body" weight="medium" tone="warning">
                {t('employer.wage_nudge.title')}
              </Text>
              <Text variant="footnote" tone="secondary">
                {t('employer.wage_nudge.body', {
                  median: `₹${Math.round(benchmark.medianPaise / 100).toLocaleString('en-IN')}`,
                  yours: `₹${Math.round(benchmark.yourPaise / 100).toLocaleString('en-IN')}`,
                })}
              </Text>
            </View>
          </Card>
        ) : null}

        {query.isLoading ? (
          <View style={{ gap: spacing.md }}>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </View>
        ) : query.isError ? (
          <EmptyState
            glyph="✕"
            tone="warning"
            eyebrow={t('employer.applicants.offline_eyebrow')}
            title={t('employer.applicants.offline_title')}
            message={t('employer.applicants.offline_message')}
            tall
          />
        ) : applicants.length === 0 ? (
          <EmptyState
            glyph="◔"
            tone="hero"
            eyebrow={t('employer.applicants.empty_waiting_eyebrow')}
            title={t('employer.applicants.empty_no_applicants_title')}
            message={t('employer.applicants.empty_no_applicants_per_job')}
            tall
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {hasPending && (
              <Card>
                <Pressable
                  onPress={() => setBlind((v) => !v)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: blind }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body" weight="medium">
                      {t('employer.blind_review.toggle_title')}
                    </Text>
                    <Text variant="footnote" tone="secondary">
                      {t('employer.blind_review.toggle_hint')}
                    </Text>
                  </View>
                  <Switch
                    value={blind}
                    onValueChange={setBlind}
                    trackColor={{ true: theme.brand.hero, false: theme.border.strong }}
                  />
                </Pressable>
              </Card>
            )}
            {(() => {
              let maskedSeq = 0;
              return applicants.map((a) => {
                const idx = a.status === 'pending' ? ++maskedSeq : undefined;
                return (
                  <ApplicantCard
                    key={a.id}
                    applicant={a}
                    blind={blind}
                    blindIndex={idx}
                  />
                );
              });
            })()}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={composerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setComposerOpen(false)}
      >
        <Pressable
          onPress={() => setComposerOpen(false)}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: theme.bg.surface,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              padding: spacing.xl,
              gap: spacing.md,
            }}
          >
            <Text variant="bodyLarge" weight="semibold">
              {t('employer.bulk_message.title', { n: shortlistedCount })}
            </Text>
            <TextField
              value={bulkMsg}
              onChangeText={setBulkMsg}
              placeholder={t('employer.bulk_message.placeholder')}
              multiline
              numberOfLines={3}
            />
            <Button
              label={sending ? t('employer.bulk_message.sending') : t('employer.bulk_message.send')}
              onPress={() => void sendBulk()}
              disabled={sending || !bulkMsg.trim()}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={briefingOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setBriefingOpen(false)}
      >
        <Pressable
          onPress={() => setBriefingOpen(false)}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: theme.bg.surface,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              padding: spacing.xl,
              gap: spacing.md,
            }}
          >
            <Text variant="bodyLarge" weight="semibold">
              {t('employer.briefing.title')}
            </Text>
            <Text variant="footnote" tone="tertiary">
              {t('employer.briefing.hint')}
            </Text>
            <TextField
              value={briefingText}
              onChangeText={setBriefingText}
              placeholder={t('employer.briefing.placeholder')}
              multiline
              numberOfLines={3}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                label={t('employer.briefing.add_photo', { n: briefingPhotos.length })}
                variant="secondary"
                onPress={() => void addBriefingPhoto()}
                disabled={briefingPhotos.length >= 3}
              />
              <Button
                label={savingBriefing ? t('employer.briefing.saving') : t('employer.briefing.save')}
                onPress={() => void saveBriefing()}
                disabled={savingBriefing}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
