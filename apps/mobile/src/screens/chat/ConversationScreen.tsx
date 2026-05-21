/**
 * ConversationScreen — premium chat thread.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │  ←   [avatar]  Counterpart name              │  header
 *   │                re: Job title                 │
 *   ├──────────────────────────────────────────────┤
 *   │                                              │
 *   │           [received bubble]                  │  inverted FlatList
 *   │ [sent bubble — coral]                        │
 *   │                                              │
 *   ├──────────────────────────────────────────────┤
 *   │  ▢ Message…                       Send →    │  composer
 *   └──────────────────────────────────────────────┘
 *
 * Bubbles:
 *   - sent     → coral (brand.hero) with #FFFDF7 text, right-aligned
 *   - received → bg.elevated with primary text, left-aligned
 *   - verified counterpart's bubbles get a champagne hairline
 *   - read receipts under sent bubbles ("Read" in champagne when read)
 *
 * Optimistic send: messages appear instantly with id="optimistic-…",
 * replaced by the real message once the API call returns. Failed sends
 * stay in place with a "Tap to retry" affordance.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing, radii, champagne } from '@doondo/tokens';
import { Screen, Text, Avatar, LoadingSpinner, Pill } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useAuth } from '@/hooks/useAuth';
import { chatApi, type SendMessageInput } from '@/api/chat.api';
import { haptic } from '@/lib/haptics';
import { pickChatImage } from '@/lib/chatImage';
import { pickChatVideo } from '@/lib/chatVideo';
import { VoiceRecorder, VOICE_MAX_SECONDS } from '@/lib/chatVoice';
import { Image } from 'react-native';
import { useTranslate } from '@/i18n/useTranslate';
import {
  quickRepliesForRole,
  renderMessageBody,
  type QuickReply,
} from '@/lib/quickReplyCatalog';
import type { MessageAttachment, PublicMessage } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'Conversation'>;
type Route = RouteProp<AppStackParamList, 'Conversation'>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Top-level export wraps in seekerLight palette ONLY when the current
 * user is a seeker. Employers viewing chat keep their warm-dark theme.
 */
export function ConversationScreen() {
  const { user } = useAuth();
  if (user?.role === 'seeker') {
    return (
      <SeekerThemeOverride>
        <ConversationScreenInner />
      </SeekerThemeOverride>
    );
  }
  return <ConversationScreenInner />;
}

function ConversationScreenInner() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const t = useTranslate();
  const [draft, setDraft] = useState('');

  const conversationId = route.params.conversationId;

  const headerQuery = useQuery({
    queryKey: ['chat', 'conversation', conversationId],
    queryFn: () => chatApi.detail(conversationId),
  });

  const messagesQuery = useQuery({
    queryKey: ['chat', 'messages', conversationId],
    queryFn: () => chatApi.listMessages(conversationId, { limit: 50 }),
  });

  // Mark as read whenever this screen has focus + we have unread.
  useEffect(() => {
    void chatApi.markRead(conversationId).catch(() => undefined);
    // Also clear local unread on the list cache.
    queryClient.setQueryData<{ conversations: PublicMessage[] } | undefined>(
      ['chat', 'conversations'],
      (prev) => prev,
    );
  }, [conversationId, queryClient]);

  const sendMutation = useMutation({
    mutationFn: (input: SendMessageInput) => chatApi.sendMessage(conversationId, input),
    onMutate: async (input) => {
      // Optimistic insert. Mirrors the eventual server shape.
      const optimistic: PublicMessage = {
        id: `optimistic-${Date.now()}`,
        conversationId,
        senderId: user?.id ?? 'me',
        kind: input.kind ?? (input.attachment ? 'image' : 'text'),
        body: input.body ?? '',
        attachment: input.attachment ?? null,
        templateKey: input.templateKey ?? null,
        readAt: null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<{ messages: PublicMessage[]; hasMore: boolean }>(
        ['chat', 'messages', conversationId],
        (prev) =>
          prev
            ? { ...prev, messages: [optimistic, ...prev.messages] }
            : { messages: [optimistic], hasMore: false },
      );
      return { optimisticId: optimistic.id };
    },
    onSuccess: ({ message }, _body, ctx) => {
      // Replace optimistic with the real message.
      queryClient.setQueryData<{ messages: PublicMessage[]; hasMore: boolean }>(
        ['chat', 'messages', conversationId],
        (prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === ctx?.optimisticId ? message : m,
                ),
              }
            : prev,
      );
      haptic('selection');
    },
    onError: (_err, _body, ctx) => {
      // Mark the optimistic as failed so the UI can show retry. We
      // overwrite the body to a recognisable shape.
      queryClient.setQueryData<{ messages: PublicMessage[]; hasMore: boolean }>(
        ['chat', 'messages', conversationId],
        (prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === ctx?.optimisticId
                    ? { ...m, id: `failed-${m.id}` }
                    : m,
                ),
              }
            : prev,
      );
      haptic('error');
    },
  });

  const messages = messagesQuery.data?.messages ?? [];
  const counterpart = headerQuery.data?.conversation.counterpart;
  const job = headerQuery.data?.conversation.job;
  const displayName =
    counterpart?.companyName ?? counterpart?.name ?? t('conversation.fallback_name');

  function onSend() {
    const trimmed = draft.trim();
    if (!trimmed || sendMutation.isPending) return;
    setDraft('');
    sendMutation.mutate({ body: trimmed, kind: 'text' });
  }

  /**
   * Send a pre-translated quick reply. The English text rides along as
   * `body` (the fallback); `templateKey` is what lets the recipient's
   * app re-render the message in their own language.
   */
  function sendQuickReply(qr: QuickReply) {
    if (sendMutation.isPending) return;
    haptic('selection');
    setDraft('');
    sendMutation.mutate({ kind: 'text', body: qr.en, templateKey: qr.key });
  }

  /**
   * Paperclip menu — image (camera or gallery) or video.
   */
  function onAttach() {
    haptic('light');
    Alert.alert(t('conversation.attach_alert_title'), t('conversation.attach_alert_body'), [
      { text: t('conversation.attach_camera'), onPress: () => void attachImage('camera') },
      { text: t('conversation.attach_gallery'), onPress: () => void attachImage('library') },
      { text: t('conversation.attach_video'), onPress: () => void attachVideo() },
      { text: t('conversation.attach_cancel'), style: 'cancel' },
    ]);
  }

  async function attachImage(source: 'camera' | 'library') {
    try {
      const picked = await pickChatImage({ source });
      if (!picked) return; // user cancelled
      sendMutation.mutate({
        kind: 'image',
        body: draft.trim() || undefined,
        attachment: picked,
      });
      setDraft('');
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('conversation.photo_error_default');
      Alert.alert(t('conversation.photo_error_title'), message);
      haptic('error');
    }
  }

  async function attachVideo() {
    try {
      const picked = await pickChatVideo();
      if (!picked) return;
      sendMutation.mutate({
        kind: 'video',
        body: draft.trim() || undefined,
        attachment: picked,
      });
      setDraft('');
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('conversation.video_error_default');
      Alert.alert(t('conversation.video_error_title'), message);
      haptic('error');
    }
  }

  // ─── Voice recording (hold-to-record on the mic FAB) ─────────────────────

  const recorderRef = useRef<VoiceRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startVoice() {
    haptic('light');
    if (recording) return;
    try {
      const r = new VoiceRecorder();
      await r.start();
      recorderRef.current = r;
      setRecording(true);
      setRecordSeconds(0);
      // Tick a UI counter + auto-stop at the max duration.
      tickIntervalRef.current = setInterval(() => {
        const s = r.elapsedSeconds();
        setRecordSeconds(s);
        if (s >= VOICE_MAX_SECONDS) {
          void stopVoice(true);
        }
      }, 250);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : t('conversation.voice_record_error_default');
      Alert.alert(t('conversation.voice_record_error_title'), msg);
      haptic('error');
      setRecording(false);
    }
  }

  async function stopVoice(send: boolean) {
    const r = recorderRef.current;
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    setRecording(false);
    setRecordSeconds(0);
    recorderRef.current = null;
    if (!r) return;
    if (!send) {
      await r.cancel();
      haptic('light');
      return;
    }
    try {
      const result = await r.stopAndSend();
      // Ignore ultra-short clips (<1s) — usually accidental.
      if (result.durationSeconds < 1) {
        haptic('light');
        return;
      }
      sendMutation.mutate({
        kind: 'voice',
        attachment: result,
      });
      haptic('selection');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t('conversation.voice_send_error_default');
      Alert.alert(t('conversation.voice_send_error_title'), msg);
      haptic('error');
    }
  }

  // Clean up the ticker on unmount.
  useEffect(() => {
    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      void recorderRef.current?.cancel();
    };
  }, []);

  return (
    <Screen edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.md,
            borderBottomWidth: 0.5,
            borderBottomColor: theme.border.default,
            backgroundColor: theme.bg.canvas,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text variant="bodyLarge" tone="hero">
              ←
            </Text>
          </Pressable>
          <Avatar
            name={displayName}
            photoUrl={counterpart?.photoUrl ?? null}
            size={40}
            premium={counterpart?.isVerified}
          />
          <View style={{ flex: 1, gap: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text
                variant="bodyLarge"
                weight="medium"
                numberOfLines={1}
                style={{ flexShrink: 1 }}
              >
                {displayName}
              </Text>
              {counterpart?.isVerified && (
                <Pill label={t('conversation.verified_pill')} tone="premium" leading="★" />
              )}
            </View>
            {job?.title && (
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {t('conversation.re_prefix', { title: job.title })}
              </Text>
            )}
          </View>
        </View>

        {/* Messages */}
        {messagesQuery.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <LoadingSpinner />
          </View>
        ) : messages.length === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: spacing.xl,
              gap: spacing.xs,
            }}
          >
            <Text variant="bodyLarge" weight="medium">
              {t('conversation.empty_say_hello')}
            </Text>
            <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
              {user?.role === 'employer'
                ? t('conversation.empty_hint_employer')
                : t('conversation.empty_hint_seeker')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            inverted
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: spacing.lg,
              gap: spacing.xs,
            }}
            renderItem={({ item, index }) => {
              const next = messages[index - 1]; // newer (because inverted)
              const sameSenderAsNext = next?.senderId === item.senderId;
              return (
                <MessageBubble
                  message={item}
                  isMine={item.senderId === user?.id}
                  showTail={!sameSenderAsNext}
                  isVerifiedCounterpart={Boolean(counterpart?.isVerified)}
                  t={t}
                />
              );
            }}
          />
        )}

        {/* Quick-reply bar — pre-translated chips. Hidden once the user
            starts typing so it never competes with a real draft. */}
        {draft.trim().length === 0 && (
          <QuickReplyBar
            role={user?.role}
            disabled={sendMutation.isPending}
            onPick={sendQuickReply}
            t={t}
          />
        )}

        {/* Composer */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: spacing.xs,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: Platform.OS === 'ios' ? spacing.md : spacing.lg,
            borderTopWidth: 0.5,
            borderTopColor: theme.border.default,
            backgroundColor: theme.bg.canvas,
          }}
        >
          {/* Attachment icon — image picker (camera or gallery) */}
          <IconCircleButton label="📎" onPress={onAttach} />

          {/* Text input */}
          <View
            style={{
              flex: 1,
              backgroundColor: theme.bg.surface,
              borderRadius: radii.lg,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              paddingHorizontal: spacing.md,
              paddingVertical: 6,
              minHeight: 44,
              maxHeight: 130,
            }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t('conversation.composer_placeholder')}
              placeholderTextColor={theme.text.tertiary}
              multiline
              style={{
                color: theme.text.primary,
                fontSize: 15,
                lineHeight: 20,
                paddingTop: 6,
                paddingBottom: 6,
              }}
            />
          </View>

          {/* Mic OR send — toggles based on whether there's text */}
          {draft.trim().length === 0 ? (
            <Pressable
              onPressIn={() => void startVoice()}
              onPressOut={() => void stopVoice(true)}
              accessibilityRole="button"
              accessibilityLabel={t('conversation.a11y_hold_to_record')}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: recording ? theme.status.danger : theme.brand.hero,
                shadowColor: recording ? theme.status.danger : theme.brand.hero,
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.3,
                shadowRadius: 6,
              }}
            >
              <Text style={{ fontSize: 20, color: '#FFFFFF' }}>
                {recording ? '●' : '🎤'}
              </Text>
            </Pressable>
          ) : (
            <SendButton
              disabled={sendMutation.isPending}
              onPress={onSend}
              sending={sendMutation.isPending}
            />
          )}
        </View>

        {/* Recording banner overlay — shows elapsed + cancel option */}
        {recording && (
          <View
            style={{
              position: 'absolute',
              left: spacing.lg,
              right: spacing.lg,
              bottom: 80,
              backgroundColor: theme.status.danger,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: radii.pill,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 18, lineHeight: 20 }}>●</Text>
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>
                {t('conversation.recording_status', {
                  elapsed: formatSeconds(recordSeconds),
                  max: formatSeconds(VOICE_MAX_SECONDS),
                })}
              </Text>
            </View>
            <Pressable
              onPress={() => void stopVoice(false)}
              hitSlop={8}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t('conversation.recording_cancel')}</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// ─── Composer icon buttons ───────────────────────────────────────────────────

function IconCircleButton({
  label,
  filled,
  onPress,
}: {
  label: string;
  filled?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? theme.brand.hero : 'transparent',
        borderWidth: filled ? 0 : 0.5,
        borderColor: theme.border.default,
      }}
    >
      <Text style={{ fontSize: 20, color: filled ? '#FFFFFF' : theme.text.secondary }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Quick-reply bar ─────────────────────────────────────────────────────────

/**
 * Horizontal strip of pre-translated quick-reply chips above the
 * composer. The chip shows the template in the *sender's* language;
 * tapping it sends the message with its templateKey so the recipient
 * reads it in theirs.
 */
function QuickReplyBar({
  role,
  disabled,
  onPick,
  t,
}: {
  role: string | null | undefined;
  disabled: boolean;
  onPick: (qr: QuickReply) => void;
  t: TFn;
}) {
  const { theme } = useTheme();
  const replies = quickRepliesForRole(role);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{
        maxHeight: 56,
        borderTopWidth: 0.5,
        borderTopColor: theme.border.default,
        backgroundColor: theme.bg.canvas,
      }}
      contentContainerStyle={{
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        gap: spacing.xs,
      }}
    >
      {replies.map((qr) => (
        <Pressable
          key={qr.key}
          onPress={() => onPick(qr)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t(qr.key)}
          style={({ pressed }) => ({
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            borderRadius: radii.pill,
            borderWidth: 0.5,
            borderColor: theme.border.default,
            backgroundColor: theme.bg.surface,
            opacity: pressed || disabled ? 0.5 : 1,
          })}
        >
          <Text variant="footnote" weight="medium" tone="secondary" numberOfLines={1}>
            {t(qr.key)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ─── Bubble ─────────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isMine,
  showTail,
  isVerifiedCounterpart,
  t,
}: {
  message: PublicMessage;
  isMine: boolean;
  showTail: boolean;
  isVerifiedCounterpart: boolean;
  t: TFn;
}) {
  const { theme } = useTheme();
  const failed = message.id.startsWith('failed-');
  const optimistic = message.id.startsWith('optimistic-');

  const bg = isMine ? theme.brand.hero : theme.bg.elevated;
  const fg = isMine ? '#FFFDF7' : theme.text.primary;

  return (
    <View
      style={{
        alignSelf: isMine ? 'flex-end' : 'flex-start',
        maxWidth: '82%',
        marginBottom: showTail ? spacing.xs : 1,
      }}
    >
      <View
        style={{
          backgroundColor:
            failed ? '#5C1414' : message.kind === 'image' ? 'transparent' : bg,
          paddingHorizontal: message.kind === 'image' ? 0 : 12,
          paddingVertical: message.kind === 'image' ? 0 : 8,
          borderRadius: 18,
          // Slight asymmetric corner on the tail side for the "speech" feel.
          borderBottomRightRadius: isMine && showTail ? 4 : 18,
          borderBottomLeftRadius: !isMine && showTail ? 4 : 18,
          borderWidth: !isMine && isVerifiedCounterpart ? 0.5 : 0,
          borderColor: champagne[300],
          opacity: optimistic ? 0.75 : 1,
          overflow: 'hidden',
        }}
      >
        {message.kind === 'image' && message.attachment ? (
          <ImageAttachment
            attachment={message.attachment}
            caption={message.body}
            isMine={isMine}
            captionBg={bg}
            captionFg={fg}
            t={t}
          />
        ) : message.kind === 'voice' && message.attachment ? (
          <VoiceAttachment
            attachment={message.attachment}
            isMine={isMine}
            fg={fg}
            transcript={message.transcript}
          />
        ) : message.kind === 'video' && message.attachment ? (
          <VideoAttachment
            attachment={message.attachment}
            caption={message.body}
            captionBg={bg}
            captionFg={fg}
          />
        ) : (
          <Text style={{ color: fg, fontSize: 15, lineHeight: 21 }}>
            {renderMessageBody(message.body, message.templateKey, t)}
          </Text>
        )}
      </View>
      {/* Read receipt for sent messages */}
      {isMine && !optimistic && !failed && (
        <Text
          variant="caption"
          tone="tertiary"
          style={{
            alignSelf: 'flex-end',
            marginTop: 2,
            marginRight: 6,
            color: message.readAt ? champagne[300] : undefined,
          }}
        >
          {message.readAt ? t('conversation.receipt_read') : t('conversation.receipt_sent')}
        </Text>
      )}
      {failed && (
        <Text
          variant="caption"
          tone="danger"
          style={{ alignSelf: 'flex-end', marginTop: 2, marginRight: 6 }}
        >
          {t('conversation.send_failed')}
        </Text>
      )}
    </View>
  );
}

// ─── Image attachment renderer ───────────────────────────────────────────────

function ImageAttachment({
  attachment,
  caption,
  isMine,
  captionBg,
  captionFg,
  t,
}: {
  attachment: MessageAttachment;
  caption: string;
  isMine: boolean;
  captionBg: string;
  captionFg: string;
  t: TFn;
}) {
  // Reserve a 4:3 layout slot when we don't have dimensions, otherwise
  // use the real aspect ratio so the bubble doesn't jump when the image
  // paints.
  const aspect =
    attachment.width && attachment.height
      ? attachment.width / attachment.height
      : 4 / 3;
  // Clamp to a reasonable bubble width — full max-width 240 looks good
  // on the typical phone without dominating the thread.
  const width = 240;
  const height = Math.round(width / aspect);

  return (
    <View>
      <Image
        source={{ uri: attachment.dataUrl }}
        style={{
          width,
          height,
          backgroundColor: '#00000020',
        }}
        resizeMode="cover"
        accessibilityLabel={caption ? t('conversation.photo_a11y_with_caption', { caption }) : t('conversation.photo_a11y')}
      />
      {caption.length > 0 && (
        <View
          style={{
            backgroundColor: captionBg,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: captionFg, fontSize: 14, lineHeight: 19 }}>
            {caption}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Voice attachment renderer ───────────────────────────────────────────────

function VoiceAttachment({
  attachment,
  isMine,
  fg,
  transcript,
}: {
  attachment: MessageAttachment;
  isMine: boolean;
  fg: string;
  transcript?: string | null;
}) {
  const [player, setPlayer] = useState<unknown>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lazy-load the audio module so it doesn't crash on platforms without it.
  async function ensurePlayer() {
    if (player) return player as { play: () => Promise<void>; pause: () => Promise<void>; release: () => void; duration: number; currentTime: number };
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Audio } = require('expo-audio');
      const inst = await Audio.AudioPlayer.createAsync({ uri: attachment.dataUrl });
      setPlayer(inst);
      return inst;
    } catch {
      return null;
    }
  }

  async function toggle() {
    const p = (await ensurePlayer()) as
      | { play: () => Promise<void>; pause: () => Promise<void>; currentTime: number; duration: number }
      | null;
    if (!p) return;
    if (playing) {
      await p.pause();
      setPlaying(false);
      if (tickRef.current) clearInterval(tickRef.current);
    } else {
      await p.play();
      setPlaying(true);
      tickRef.current = setInterval(() => {
        setElapsed(Math.round((p.currentTime ?? 0)));
        if (p.duration && p.currentTime >= p.duration - 0.1) {
          setPlaying(false);
          setElapsed(0);
          if (tickRef.current) clearInterval(tickRef.current);
        }
      }, 250);
    }
  }

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      try {
        (player as { release?: () => void } | null)?.release?.();
      } catch {
        /* best-effort */
      }
    };
  }, [player]);

  const duration = attachment.durationSeconds ?? 0;
  const shown = playing ? elapsed : duration;

  return (
    <View style={{ gap: 6 }}>
    <Pressable
      onPress={toggle}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 4,
        paddingVertical: 2,
        minWidth: 140,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: isMine ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.08)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 16, color: fg }}>{playing ? '❚❚' : '▶'}</Text>
      </View>
      {/* Simple progress strip — full when paused, animated when playing */}
      <View
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          backgroundColor: isMine ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: duration > 0 ? `${Math.min(100, (elapsed / duration) * 100)}%` : '0%',
            height: '100%',
            backgroundColor: fg,
          }}
        />
      </View>
      <Text style={{ fontSize: 12, color: fg, minWidth: 36, textAlign: 'right' }}>
        {fmt(shown)}
      </Text>
    </Pressable>
      {/* Auto-transcript — appears a few seconds after the note is sent,
          pushed in live via the chat:message_transcribed socket event. */}
      {transcript ? (
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            color: fg,
            opacity: 0.8,
            fontStyle: 'italic',
            paddingHorizontal: 4,
          }}
        >
          {transcript}
        </Text>
      ) : null}
    </View>
  );
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// ─── Video attachment renderer ───────────────────────────────────────────────

function VideoAttachment({
  attachment,
  caption,
  captionBg,
  captionFg,
}: {
  attachment: MessageAttachment;
  caption: string;
  captionBg: string;
  captionFg: string;
}) {
  // We don't auto-play in-bubble — show a thumbnail-ish frame with a big
  // play overlay. Tap opens the system video player (Linking.openURL on
  // the data URL). A full inline expo-video player can replace this if
  // we want autoplay on visible bubbles later.
  const aspect = attachment.width && attachment.height ? attachment.width / attachment.height : 16 / 9;
  const width = 240;
  const height = Math.round(width / aspect);

  return (
    <View>
      <View
        style={{
          width,
          height,
          backgroundColor: '#0F172A',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 36, color: '#FFFFFF' }}>▶</Text>
        <Text
          style={{
            position: 'absolute',
            bottom: 6,
            right: 8,
            color: '#FFFFFF',
            fontSize: 11,
            fontWeight: '600',
            backgroundColor: 'rgba(0,0,0,0.55)',
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
          }}
        >
          {fmt(attachment.durationSeconds ?? 0)}
        </Text>
      </View>
      {caption.length > 0 && (
        <View style={{ backgroundColor: captionBg, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ color: captionFg, fontSize: 14, lineHeight: 19 }}>{caption}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Send button ────────────────────────────────────────────────────────────

function SendButton({
  disabled,
  sending,
  onPress,
}: {
  disabled: boolean;
  sending: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: disabled ? theme.bg.muted : theme.brand.hero,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {sending ? (
        <ActivityIndicator size="small" color="#FFFDF7" />
      ) : (
        <Text style={{ color: '#FFFDF7', fontSize: 18, fontWeight: '600' }}>↑</Text>
      )}
    </Pressable>
  );
}
