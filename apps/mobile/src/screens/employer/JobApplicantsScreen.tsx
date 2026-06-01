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
import { Screen, Text, SkeletonCard, EmptyState, Card, TextField, Button } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { applicationsApi } from '@/api/applications.api';
import { chatApi } from '@/api/chat.api';
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

  const query = useQuery({
    queryKey: ['applicants', 'job', route.params.jobId],
    queryFn: () => applicationsApi.listForJob(route.params.jobId, { limit: 100 }),
  });

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
        </View>

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
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
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
    </Screen>
  );
}
