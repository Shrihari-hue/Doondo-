/**
 * NewChatScreen — seeker picks which application to start a chat from.
 *
 * Lists every active application (status != withdrawn), shows the job
 * title + employer name, and on tap calls /conversations/from-application
 * which idempotently returns the conversation id. We then replace this
 * screen with the Conversation thread.
 *
 * Seekers can use this before the employer has shortlisted them — it's
 * the "send the first message yourself" path.
 */

import { FlatList, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Avatar, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi } from '@/api/applications.api';
import { chatApi } from '@/api/chat.api';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { PublicApplication } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function NewChatInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();

  const appsQuery = useQuery({
    queryKey: ['applications', 'me'],
    queryFn: () => applicationsApi.listMine({ limit: 50 }),
    staleTime: 30_000,
  });

  const startChat = useMutation({
    mutationFn: (applicationId: string) => chatApi.ensureFromApplication(applicationId),
    onSuccess: ({ conversationId }) => {
      haptic('selection');
      // Replace ourselves with the conversation thread.
      navigation.replace('Conversation', { conversationId });
    },
    onError: () => {
      haptic('error');
    },
  });

  const eligible = (appsQuery.data?.applications ?? []).filter(
    (a) => a.status !== 'withdrawn',
  );

  return (
    <Screen edges={[]}>
      <View
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
        </Pressable>
        <Text
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: theme.text.primary,
            flex: 1,
          }}
        >
          {t('new_chat.title')}
        </Text>
      </View>

      <Text
        style={{
          fontSize: 13,
          color: theme.text.secondary,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
        }}
      >
        {t('new_chat.hint')}
      </Text>

      {appsQuery.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : appsQuery.isError ? (
        <EmptyState
          title={t('new_chat.error_title')}
          message={t('new_chat.error_message')}
          cta={{ label: t('new_chat.retry_cta'), onPress: () => void appsQuery.refetch() }}
        />
      ) : eligible.length === 0 ? (
        <EmptyState
          glyph="✉"
          title={t('new_chat.empty_title')}
          message={t('new_chat.empty_message')}
          cta={{
            label: t('new_chat.empty_cta'),
            onPress: () => navigation.navigate('SeekerTabs', { screen: 'Jobs' } as never),
          }}
        />
      ) : (
        <FlatList
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing['5xl'],
            gap: spacing.sm,
          }}
          data={eligible}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => (
            <AppRow
              t={t}
              app={item}
              disabled={startChat.isPending}
              onPress={() => startChat.mutate(item.id)}
            />
          )}
        />
      )}
    </Screen>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function AppRow({
  t,
  app,
  disabled,
  onPress,
}: {
  t: TFn;
  app: PublicApplication;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const employerName =
    app.job?.employer?.companyName ?? app.job?.employer?.name ?? t('new_chat.fallback_employer');

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radii.lg,
        backgroundColor: theme.bg.surface,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        opacity: pressed || disabled ? 0.6 : 1,
      })}
    >
      <Avatar
        name={employerName}
        photoUrl={app.job?.employer?.photoUrl ?? null}
        size={48}
        premium={app.job?.employer?.isVerified}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}
          numberOfLines={1}
        >
          {employerName}
        </Text>
        <Text
          style={{ fontSize: 13, color: theme.text.secondary }}
          numberOfLines={1}
        >
          {app.job?.title ?? t('new_chat.fallback_job_application')}
        </Text>
      </View>
      <Text style={{ fontSize: 20, color: theme.text.tertiary }}>›</Text>
    </Pressable>
  );
}

export function NewChatScreen() {
  return (
    <SeekerThemeOverride>
      <NewChatInner />
    </SeekerThemeOverride>
  );
}
