/**
 * CohortScreen — one course group: members' lesson progress, the invite
 * code to share, and the group's message board.
 */
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, Avatar, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { cohortsApi } from '@/api/cohorts.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'Cohort'>;

export function CohortScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useTranslate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const id = route.params.cohortId;
  const [text, setText] = useState('');

  const cq = useQuery({ queryKey: ['cohort', id], queryFn: () => cohortsApi.get(id) });
  const mq = useQuery({ queryKey: ['cohort', id, 'messages'], queryFn: () => cohortsApi.messages(id), refetchInterval: 20_000 });
  const send = useMutation({
    mutationFn: () => cohortsApi.post(id, text),
    onSuccess: () => { setText(''); void qc.invalidateQueries({ queryKey: ['cohort', id, 'messages'] }); },
    onError: () => Alert.alert(t('cohorts.send_failed')),
  });
  const leave = useMutation({
    mutationFn: () => cohortsApi.leave(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['cohorts'] }); navigation.goBack(); },
  });
  const c = cq.data;

  return (
    <Screen edges={[]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xl, paddingHorizontal: spacing.xl, gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text variant="title" weight="semibold" numberOfLines={1}>{c?.name ?? ''}</Text>
              {c ? <Text variant="footnote" tone="secondary">{c.courseTitle}</Text> : null}
            </View>
          </View>
          {!c ? <LoadingSpinner /> : (
            <>
              <Card>
                <View style={{ gap: spacing.md }}>
                  {c.members.map((m) => (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                      <Avatar name={m.name} photoUrl={m.photoUrl} size={36} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text variant="footnote" weight="medium">{m.name}{m.id === user?.id ? ` (${t('cohorts.you')})` : ''}</Text>
                        <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.bg.muted, overflow: 'hidden' }}>
                          <View style={{ height: 6, width: `${c.totalLessons ? Math.min(100, (m.completedLessons / c.totalLessons) * 100) : 0}%`, backgroundColor: theme.brand.hero }} />
                        </View>
                      </View>
                      <Text variant="caption" tone={m.completed ? 'success' : 'secondary'}>
                        {m.completed ? '✓' : `${m.completedLessons}/${c.totalLessons}`}
                      </Text>
                    </View>
                  ))}
                  {c.members.length < 5 && (
                    <Pressable onPress={() => void Share.share({ message: t('cohorts.share_message', { course: c.courseTitle, code: c.code }) })}
                      style={{ paddingVertical: 10, borderRadius: radii.md, alignItems: 'center', backgroundColor: theme.brand.heroSubtle }}>
                      <Text variant="footnote" weight="semibold" style={{ color: theme.brand.hero }}>{t('cohorts.invite', { code: c.code })}</Text>
                    </Pressable>
                  )}
                </View>
              </Card>

              <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.1 }}>{t('cohorts.board')}</Text>
              {(mq.data ?? []).length === 0 ? (
                <Text variant="footnote" tone="secondary">{t('cohorts.board_empty')}</Text>
              ) : (
                (mq.data ?? []).map((m) => {
                  const mine = m.senderId === user?.id;
                  return (
                    <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: spacing.md, borderRadius: radii.lg,
                      backgroundColor: mine ? theme.brand.heroSubtle : theme.bg.muted }}>
                      {!mine && <Text variant="caption" weight="semibold">{m.senderName}</Text>}
                      <Text variant="body">{m.text}</Text>
                    </View>
                  );
                })
              )}
              <Pressable onPress={() => Alert.alert(t('cohorts.leave'), t('cohorts.leave_confirm'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('cohorts.leave'), style: 'destructive', onPress: () => leave.mutate() },
              ])}>
                <Text variant="footnote" tone="tertiary" style={{ textAlign: 'center', marginTop: spacing.lg }}>{t('cohorts.leave')}</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.md, paddingBottom: insets.bottom + spacing.md, borderTopWidth: 0.5, borderTopColor: theme.border.default, backgroundColor: theme.bg.surface }}>
          <TextInput value={text} onChangeText={setText} placeholder={t('cohorts.message_placeholder')} placeholderTextColor={theme.text.tertiary}
            maxLength={1000} style={{ flex: 1, borderWidth: 1, borderColor: theme.border.default, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 10, color: theme.text.primary }} />
          <Pressable disabled={!text.trim() || send.isPending} onPress={() => send.mutate()}
            style={{ paddingHorizontal: 16, justifyContent: 'center', borderRadius: radii.pill, backgroundColor: text.trim() ? theme.brand.hero : theme.border.default }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{t('cohorts.send')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
