/**
 * CohortChatScreen — group chat for one 5-person cohort. A deliberately
 * simplified sibling of ConversationScreen (chat/ConversationScreen.tsx):
 * text + image only, no voice/video/translation — those are 1:1-chat
 * features this group thread doesn't need for v1.
 */
import { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View, Image } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Avatar, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { pickChatImage } from '@/lib/chatImage';
import { cohortsApi, type PublicCohortMessage } from '@/api/cohorts.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'CohortChat'>;
type Route = RouteProp<AppStackParamList, 'CohortChat'>;

const BLUE = '#2563EB'; // = theme.brand.primary; a module/local-scope named constant, not reachable from theme here

function Bubble({ message, isMine, senderName }: { message: PublicCohortMessage; isMine: boolean; senderName: string }) {
  const { scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const cardBg = isLight ? '#FFFFFF' : '#0D0D0D';
  const cardBorder = isLight ? '#E5E7EB' : '#1E1E1E';
  const fg = isMine ? '#FFFFFF' : isLight ? '#1F2937' : '#F9FAFB';

  if (message.kind === 'system') {
    return (
      <View style={{ alignItems: 'center', marginVertical: spacing.xs }}>
        <Text style={{ fontSize: 11, color: cardBorder === '#1E1E1E' ? '#9CA3AF' : '#6B7280' }}>{message.body}</Text>
      </View>
    );
  }

  return (
    <View style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '82%', marginBottom: spacing.xs }}>
      {!isMine && (
        <Text style={{ fontSize: 11, color: '#6B7280', marginBottom: 2, marginLeft: 4 }}>{senderName}</Text>
      )}
      <View
        style={{
          backgroundColor: message.kind === 'image' ? 'transparent' : isMine ? BLUE : cardBg,
          borderRadius: radii.lg,
          borderWidth: message.kind === 'image' ? 0 : !isMine ? 1 : 0,
          borderColor: cardBorder,
          overflow: 'hidden',
          paddingHorizontal: message.kind === 'image' ? 0 : 12,
          paddingVertical: message.kind === 'image' ? 0 : 8,
        }}
      >
        {message.kind === 'image' && message.attachment ? (
          <Image source={{ uri: message.attachment.dataUrl }} style={{ width: 220, height: 165, backgroundColor: '#00000020' }} resizeMode="cover" />
        ) : (
          <Text style={{ color: fg, fontSize: 15, lineHeight: 21 }}>{message.body}</Text>
        )}
      </View>
    </View>
  );
}

function Inner() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user } = useAuth();
  const { scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const bg = isLight ? '#FFFFFF' : '#0C0A0E';
  const cardBorder = isLight ? '#E5E7EB' : '#1E1E1E';
  const textPrimary = isLight ? '#1F2937' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const t = useTranslate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const cohortId = route.params.cohortId;

  const detailQuery = useQuery({ queryKey: ['cohorts', 'detail', cohortId], queryFn: () => cohortsApi.detail(cohortId) });
  const messagesQuery = useQuery({ queryKey: ['cohorts', 'messages', cohortId], queryFn: () => cohortsApi.listMessages(cohortId) });

  useEffect(() => {
    void cohortsApi.markRead(cohortId).catch(() => undefined);
  }, [cohortId]);

  const sendMut = useMutation({
    mutationFn: (input: Parameters<typeof cohortsApi.sendMessage>[1]) => cohortsApi.sendMessage(cohortId, input),
    onSuccess: () => {
      haptic('selection');
      void queryClient.invalidateQueries({ queryKey: ['cohorts', 'messages', cohortId] });
      void queryClient.invalidateQueries({ queryKey: ['cohorts', 'mine'] });
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(t('cohort_chat.error_title'), (err as Error).message ?? t('cohort_chat.error_default'));
    },
  });

  const cohort = detailQuery.data?.cohort;
  const messages = [...(messagesQuery.data?.messages ?? [])].reverse();
  const nameFor = (senderId: string) => cohort?.members.find((m) => m.userId === senderId)?.name ?? t('cohort_chat.fallback_name');

  function onSend() {
    const trimmed = draft.trim();
    if (!trimmed || sendMut.isPending) return;
    setDraft('');
    sendMut.mutate({ body: trimmed, kind: 'text' });
  }

  async function onAttachImage() {
    try {
      const picked = await pickChatImage({ source: 'library' });
      if (!picked) return;
      sendMut.mutate({ kind: 'image', attachment: picked });
    } catch (err) {
      Alert.alert(t('cohort_chat.photo_error_title'), (err as Error).message ?? t('cohort_chat.error_default'));
    }
  }

  return (
    <Screen edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: cardBorder,
            backgroundColor: bg,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button">
            <Feather name="arrow-left" size={22} color={textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>
              {cohort?.name ?? t('cohort_chat.fallback_name')}
            </Text>
            {cohort && (
              <Text numberOfLines={1} style={{ fontSize: 12, color: textSecondary }}>
                {t('cohort_chat.members_line', { n: cohort.members.filter((m) => m.status === 'joined').length, course: cohort.courseTitle })}
              </Text>
            )}
          </View>
          {cohort && (
            <View style={{ flexDirection: 'row' }}>
              {cohort.members.filter((m) => m.status === 'joined').slice(0, 4).map((m, i) => (
                <View key={m.userId} style={{ marginLeft: i === 0 ? 0 : -10 }}>
                  <Avatar size={26} photoUrl={m.photoUrl} name={m.name} />
                </View>
              ))}
            </View>
          )}
        </View>

        {messagesQuery.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <LoadingSpinner />
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            inverted
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg }}
            renderItem={({ item }) => (
              <Bubble message={item} isMine={item.senderId === user?.id} senderName={nameFor(item.senderId)} />
            )}
          />
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: spacing.xs,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: Platform.OS === 'ios' ? spacing.md : spacing.lg,
            borderTopWidth: 1,
            borderTopColor: cardBorder,
            backgroundColor: bg,
          }}
        >
          <Pressable
            onPress={onAttachImage}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: cardBorder }}
          >
            <Feather name="image" size={18} color={textSecondary} />
          </Pressable>
          <View
            style={{
              flex: 1,
              backgroundColor: isLight ? '#FFFFFF' : '#0D0D0D',
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: cardBorder,
              paddingHorizontal: spacing.md,
              paddingVertical: 6,
              minHeight: 44,
              maxHeight: 130,
            }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t('cohort_chat.composer_placeholder')}
              placeholderTextColor={textSecondary}
              multiline
              style={{ color: textPrimary, fontSize: 15, lineHeight: 20, paddingTop: 6, paddingBottom: 6 }}
            />
          </View>
          <Pressable
            onPress={onSend}
            disabled={sendMut.isPending || draft.trim().length === 0}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: BLUE,
              opacity: draft.trim().length === 0 ? 0.5 : 1,
            }}
          >
            <Feather name="send" size={17} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function CohortChatScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
