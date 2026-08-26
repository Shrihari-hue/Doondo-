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
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Avatar, LoadingSpinner } from '@/components';
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

const BLUE = '#2563EB';
const RED = '#EF4444';

function NewChatInner() {
  const { scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();

  const bg = isLight ? '#FFFFFF' : '#0C0A0E';
  const cardBg = isLight ? '#FFFFFF' : '#0D0D0D';
  const cardBorder = isLight ? '#E5E7EB' : '#1E1E1E';
  const textPrimary = isLight ? '#1F2937' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';

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
      <View style={{ flex: 1, backgroundColor: bg }}>
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
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="arrow-left" size={22} color={textPrimary} />
          </Pressable>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '800',
              color: textPrimary,
              flex: 1,
            }}
          >
            {t('new_chat.title')}
          </Text>
        </View>

        <Text
          style={{
            fontSize: 13,
            color: textSecondary,
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
          <ChatEmptyState
            icon="wifi-off"
            iconColor={RED}
            title={t('new_chat.error_title')}
            message={t('new_chat.error_message')}
            cta={{ label: t('new_chat.retry_cta'), onPress: () => void appsQuery.refetch() }}
            isLight={isLight}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
          />
        ) : eligible.length === 0 ? (
          <ChatEmptyState
            icon="mail"
            iconColor={BLUE}
            title={t('new_chat.empty_title')}
            message={t('new_chat.empty_message')}
            cta={{
              label: t('new_chat.empty_cta'),
              onPress: () => navigation.navigate('SeekerTabs', { screen: 'Jobs' } as never),
            }}
            isLight={isLight}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
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
                cardBg={cardBg}
                cardBorder={cardBorder}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
              />
            )}
          />
        )}
      </View>
    </Screen>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────
// Circular blue-tinted icon badge + eyebrow-less bold title + gray message +
// blue CTA pill — matches PostsScreen's PostJobEmptyState pattern.

function ChatEmptyState({
  icon,
  iconColor,
  title,
  message,
  cta,
  isLight,
  textPrimary,
  textSecondary,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  iconColor: string;
  title: string;
  message: string;
  cta: { label: string; onPress: () => void };
  isLight: boolean;
  textPrimary: string;
  textSecondary: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        paddingVertical: spacing['3xl'],
        paddingHorizontal: spacing.xl,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          borderWidth: 1,
          borderColor: iconColor + '33',
          backgroundColor: iconColor + '0D',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xs,
        }}
      >
        <Feather name={icon} size={30} color={iconColor} />
      </View>

      <Text style={{ fontSize: 16, fontWeight: '700', color: textPrimary, textAlign: 'center' }}>
        {title}
      </Text>

      <Text style={{ fontSize: 13, color: textSecondary, textAlign: 'center', maxWidth: 280 }}>
        {message}
      </Text>

      <Pressable
        onPress={() => { haptic('selection'); cta.onPress(); }}
        style={({ pressed }) => ({
          marginTop: spacing.sm,
          alignSelf: 'stretch',
          maxWidth: 280,
          backgroundColor: BLUE,
          borderRadius: radii.lg,
          paddingVertical: 13,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
          {cta.label}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function AppRow({
  t,
  app,
  disabled,
  onPress,
  cardBg,
  cardBorder,
  textPrimary,
  textSecondary,
}: {
  t: TFn;
  app: PublicApplication;
  disabled: boolean;
  onPress: () => void;
  cardBg: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
}) {
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
        backgroundColor: cardBg,
        borderWidth: 1,
        borderColor: cardBorder,
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
          style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}
          numberOfLines={1}
        >
          {employerName}
        </Text>
        <Text
          style={{ fontSize: 13, color: textSecondary }}
          numberOfLines={1}
        >
          {app.job?.title ?? t('new_chat.fallback_job_application')}
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color={textSecondary} />
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
